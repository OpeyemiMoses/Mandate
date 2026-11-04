import crypto from "crypto";
import { prisma } from "@/lib/db";
import { AgentCapabilityValidator, EligibilityResult } from "./capabilityValidator";
import { AgentCapabilityRegistry } from "./capabilityRegistry";
import { TaskType } from "@/lib/objectives/types";
import { recordAuditEvent } from "@/lib/auditLedger";

export interface AssignTaskParams {
  objectiveId: string;
  stepId: string;
  userId: string;
  agentId?: string; // If omitted, engine selects best eligible agent via deterministic ranking
  expectedPlanHash?: string;
  expectedPlanVersion?: number;
  expectedObjectiveVersion?: number;
  reason?: string;
}

export interface ReassignTaskParams {
  objectiveId: string;
  stepId: string;
  newAgentId: string;
  userId: string;
  reason: string;
  expectedPlanHash?: string;
}

export interface AssignmentResult {
  success: boolean;
  assignmentId: string;
  objectiveId: string;
  stepId: string;
  agentId: string;
  agentName: string;
  agentType: string;
  planVersion: number;
  planHash: string;
  capabilityVersion: number;
  policyVersion: number;
  leaseToken?: string;
  leaseExpiresAt?: Date;
  status: string;
  rankingScore?: number;
  reassignedFromAgentId?: string | null;
  reassignmentReason?: string | null;
  assignedAt: Date;
}

/**
 * Deterministic Task Assignment Engine
 * Binds approved DAG plan tasks to eligible agents using transparent,
 * load-aware deterministic ranking rules and strict cryptographic plan hash integrity.
 */
export class TaskAssignmentEngine {
  /**
   * Deterministically assign a task to an eligible agent
   */
  public static async assignTask(params: AssignTaskParams): Promise<AssignmentResult> {
    const {
      objectiveId,
      stepId,
      userId,
      agentId,
      expectedPlanHash,
      expectedPlanVersion,
      expectedObjectiveVersion,
      reason,
    } = params;

    // 1. Fetch Objective and Latest/Approved Plan
    const objective = await prisma.objective.findFirst({
      where: { id: objectiveId, userId },
      include: {
        plans: {
          orderBy: { version: "desc" },
          take: 1,
          include: {
            steps: { where: { stepId } },
          },
        },
      },
    });

    if (!objective) {
      throw new Error(`Objective "${objectiveId}" not found or unauthorized for user "${userId}".`);
    }

    // Disallow assignment if objective is in terminal state
    if (objective.status === "COMPLETED" || objective.status === "FAILED" || objective.status === "CANCELLED") {
      throw new Error(
        `ASSIGNMENT_FORBIDDEN: Cannot assign tasks on an objective in terminal status "${objective.status}".`
      );
    }

    if (expectedObjectiveVersion !== undefined && objective.version !== expectedObjectiveVersion) {
      throw new Error(
        `STALE_OBJECTIVE_VERSION: Expected objective v${expectedObjectiveVersion}, but current is v${objective.version}.`
      );
    }

    const plan = objective.plans[0];
    if (!plan) {
      throw new Error(`No plan found for objective "${objectiveId}".`);
    }

    const step = plan.steps[0];
    if (!step) {
      throw new Error(`Task step "${stepId}" not found in Plan v${plan.version}.`);
    }

    // 2. Plan Integrity & Anti-Tamper Verification (Phase 5)
    if (expectedPlanVersion !== undefined && plan.version !== expectedPlanVersion) {
      throw new Error(
        `PLAN_VERSION_MISMATCH: Assignment requested for Plan v${expectedPlanVersion}, but current plan is v${plan.version}. Re-evaluation required.`
      );
    }

    if (expectedPlanHash && plan.planHash && plan.planHash !== expectedPlanHash) {
      throw new Error(
        `PLAN_TAMPER_DETECTED: Plan hash "${expectedPlanHash}" does not match approved plan fingerprint "${plan.planHash}". Assignment rejected.`
      );
    }

    // Parse step requirements
    let reqTools: string[] = [];
    let reqCaps: string[] = [];
    try {
      if (step.requiredToolsJson) reqTools = JSON.parse(step.requiredToolsJson);
    } catch {}
    try {
      if (step.requiredCapabilitiesJson) reqCaps = JSON.parse(step.requiredCapabilitiesJson);
    } catch {}

    const taskReq = {
      taskId: step.id,
      stepId: step.stepId,
      title: step.title,
      taskType: (step.taskType || "EXECUTION") as TaskType,
      requiredCapabilities: reqCaps,
      requiredTools: reqTools,
      riskClassification: (step.riskClassification || "LOW") as any,
      estimatedCostNear: step.estimatedCostNear || undefined,
      estimatedCostYocto: step.estimatedCostYocto || undefined,
      financialRequired: Boolean(step.estimatedCostYocto && BigInt(step.estimatedCostYocto) > BigInt(0)),
    };

    // 3. Candidate Discovery & Deterministic Ranking
    let targetAgentId = agentId;

    if (!targetAgentId) {
      // Find all user's active agents
      const userAgents = await prisma.agent.findMany({
        where: { userId, status: "ACTIVE" },
      });

      if (userAgents.length === 0) {
        throw new Error("No active agents found for user. Please provision an agent first.");
      }

      // Evaluate eligibility for all agents
      const candidates: Array<{
        agent: any;
        eligibility: EligibilityResult;
        activeLoad: number;
        score: number;
      }> = [];

      for (const ag of userAgents) {
        const eligibility = await AgentCapabilityValidator.evaluateEligibility({
          agentId: ag.id,
          userId,
          objectiveId,
          task: taskReq,
          mandateId: objective.mandateId,
        });

        if (eligibility.isEligible) {
          // Count active assignments for load balancing
          const activeCount = await prisma.agentAssignment.count({
            where: { agentId: ag.id, status: { in: ["ASSIGNED", "ACTIVE"] } },
          });

          // Deterministic scoring formula:
          // Base 1000 - (activeLoad * 50) + (agentTypeMatch * 200) + (capabilityVersion * 10)
          let score = 1000 - activeCount * 50;
          if (step.agentType && ag.type === step.agentType) {
            score += 200;
          }
          score += eligibility.capabilityVersion * 10;

          candidates.push({
            agent: ag,
            eligibility,
            activeLoad: activeCount,
            score,
          });
        }
      }

      if (candidates.length === 0) {
        throw new Error(
          `NO_ELIGIBLE_AGENT: No active agent satisfies all 11 capability criteria for task "${step.stepId}" (${step.title}).`
        );
      }

      // Deterministic Sort:
      // 1. Highest score descending
      // 2. Lowest active load ascending
      // 3. Deterministic alphanumeric agent.id ascending
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.activeLoad !== b.activeLoad) return a.activeLoad - b.activeLoad;
        return a.agent.id.localeCompare(b.agent.id);
      });

      targetAgentId = candidates[0].agent.id;
    } else {
      // Specific agent requested -> Validate eligibility strictly
      const eligibility = await AgentCapabilityValidator.evaluateEligibility({
        agentId: targetAgentId,
        userId,
        objectiveId,
        task: taskReq,
        mandateId: objective.mandateId,
      });

      if (!eligibility.isEligible) {
        throw new Error(
          `INELIGIBLE_AGENT: Requested agent "${targetAgentId}" is not eligible for task "${step.stepId}": ${eligibility.reasons.join("; ")}`
        );
      }
    }

    if (!targetAgentId) {
      throw new Error("Target agent could not be determined for assignment.");
    }

    // 4. Fetch Selected Agent Profile & Policy Version
    const targetProfile = await AgentCapabilityRegistry.getProfile(targetAgentId, userId);
    const targetAgent = await prisma.agent.findUnique({ where: { id: targetAgentId } });

    // 5. Atomic Assignment Claim & Lease Generation (Phase 7)
    const now = new Date();
    const leaseToken = `lease_${crypto.randomBytes(16).toString("hex")}`;
    const leaseExpiresAt = new Date(now.getTime() + 3600 * 1000); // 1 hour default lease

    // Check existing assignment for this step
    const existingAssignment = await prisma.agentAssignment.findFirst({
      where: { objectiveId, stepId },
    });

    let assignment: any;
    if (existingAssignment) {
      assignment = await prisma.agentAssignment.update({
        where: { id: existingAssignment.id },
        data: {
          agentId: targetAgentId,
          objectiveVersion: objective.version,
          planId: plan.id,
          planVersion: plan.version,
          planHash: plan.planHash || "",
          capabilityVersion: targetProfile.capabilityVersion,
          policyVersion: 1,
          leaseToken,
          leaseExpiresAt,
          leaseGeneration: { increment: 1 },
          status: "ASSIGNED",
          assignedCapabilitiesJson: JSON.stringify(targetProfile.supportedTaskTypes),
          reassignedFromAgentId: existingAssignment.agentId !== targetAgentId ? existingAssignment.agentId : null,
          reassignmentReason: reason || null,
          assignedAt: now,
          releasedAt: null,
        },
      });
    } else {
      assignment = await prisma.agentAssignment.create({
        data: {
          objectiveId,
          stepId,
          agentId: targetAgentId,
          objectiveVersion: objective.version,
          planId: plan.id,
          planVersion: plan.version,
          planHash: plan.planHash || "",
          capabilityVersion: targetProfile.capabilityVersion,
          policyVersion: 1,
          leaseToken,
          leaseExpiresAt,
          leaseGeneration: 1,
          status: "ASSIGNED",
          assignedCapabilitiesJson: JSON.stringify(targetProfile.supportedTaskTypes),
          assignedAt: now,
        },
      });
    }

    // Update ObjectivePlanStep assigned agent
    await prisma.objectivePlanStep.update({
      where: { id: step.id },
      data: { assignedAgentId: targetAgentId },
    });

    // 6. Record Audit Event
    await recordAuditEvent({
      userId,
      eventType: "task.agent_assigned",
      agentId: targetAgentId,
      description: `Task "${step.stepId}" assigned to agent "${targetAgent?.name}" (${targetAgent?.type}) under Plan v${plan.version}`,
      details: {
        objectiveId,
        stepId,
        agentId: targetAgentId,
        planVersion: plan.version,
        planHash: plan.planHash,
        capabilityVersion: targetProfile.capabilityVersion,
      },
    });

    return {
      success: true,
      assignmentId: assignment.id,
      objectiveId,
      stepId,
      agentId: targetAgentId,
      agentName: targetAgent?.name || "Agent",
      agentType: targetAgent?.type || "specialist",
      planVersion: plan.version,
      planHash: plan.planHash || "",
      capabilityVersion: targetProfile.capabilityVersion,
      policyVersion: 1,
      leaseToken: assignment.leaseToken,
      leaseExpiresAt: assignment.leaseExpiresAt,
      status: "ASSIGNED",
      reassignedFromAgentId: assignment.reassignedFromAgentId,
      reassignmentReason: assignment.reassignmentReason,
      assignedAt: now,
    };
  }

  /**
   * Reassign an existing task assignment to a new eligible agent
   */
  public static async reassignTask(params: ReassignTaskParams): Promise<AssignmentResult> {
    const { objectiveId, stepId, newAgentId, userId, reason, expectedPlanHash } = params;

    if (!reason || reason.trim().length === 0) {
      throw new Error("A valid reassignment reason is strictly required for governed task transfer.");
    }

    return await this.assignTask({
      objectiveId,
      stepId,
      userId,
      agentId: newAgentId,
      expectedPlanHash,
      reason,
    });
  }

  /**
   * Release assignment upon completion or cancellation
   */
  public static async releaseAssignment(params: {
    objectiveId: string;
    stepId: string;
    userId: string;
    status?: "RELEASED" | "FAILED";
    reason?: string;
  }): Promise<boolean> {
    const { objectiveId, stepId, userId, status = "RELEASED", reason } = params;

    const assignment = await prisma.agentAssignment.findFirst({
      where: { objectiveId, stepId },
    });

    if (!assignment) {
      return false;
    }

    await prisma.agentAssignment.update({
      where: { id: assignment.id },
      data: {
        status,
        releasedAt: new Date(),
        reassignmentReason: reason || null,
      },
    });

    await recordAuditEvent({
      userId,
      eventType: "task.assignment_released",
      description: `Task assignment "${stepId}" released with status "${status}"`,
      details: { objectiveId, stepId, status, reason },
    });

    return true;
  }

  /**
   * Batch assign all steps in an objective's approved plan to eligible agents
   */
  public static async assignObjectivePlan(
    objectiveId: string,
    userId: string,
    preferredAgentId?: string
  ): Promise<{ success: boolean; assignments: AssignmentResult[] }> {
    const objective = await prisma.objective.findFirst({
      where: { id: objectiveId, userId },
      include: {
        plans: {
          orderBy: { version: "desc" },
          take: 1,
          include: { steps: { orderBy: { order: "asc" } } },
        },
      },
    });

    if (!objective || !objective.plans[0]) {
      throw new Error(`Objective "${objectiveId}" or approved plan not found.`);
    }

    const plan = objective.plans[0];
    const assignments: AssignmentResult[] = [];

    for (const step of plan.steps) {
      try {
        const res = await this.assignTask({
          objectiveId,
          stepId: step.stepId,
          userId,
          agentId: preferredAgentId,
        });
        assignments.push(res);
      } catch (err: any) {
        console.warn(`[TaskAssignmentEngine] Step "${step.stepId}" assignment skipped:`, err.message);
      }
    }

    return {
      success: true,
      assignments,
    };
  }

  /**
   * List all current assignments for an objective
   */
  public static async listAssignmentsForObjective(
    objectiveId: string,
    userId: string
  ): Promise<any[]> {
    const objective = await prisma.objective.findFirst({
      where: { id: objectiveId, userId },
    });

    if (!objective) {
      throw new Error(`Objective "${objectiveId}" not found or unauthorized.`);
    }

    const assignments = await prisma.agentAssignment.findMany({
      where: { objectiveId },
      include: {
        agent: {
          select: { id: true, name: true, type: true, status: true, colorVariant: true },
        },
      },
      orderBy: { assignedAt: "desc" },
    });

    return assignments;
  }

  /**
   * List tasks currently assigned to an agent
   */
  public static async listTasksForAgent(agentId: string, userId: string): Promise<any[]> {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
    });

    if (!agent) {
      throw new Error(`Agent "${agentId}" not found or unauthorized.`);
    }

    return await prisma.agentAssignment.findMany({
      where: { agentId, status: { in: ["ASSIGNED", "ACTIVE"] } },
      orderBy: { assignedAt: "desc" },
    });
  }

  public static async getAgentAssignments(agentId: string, userId: string): Promise<any[]> {
    return await this.listTasksForAgent(agentId, userId);
  }

  public static async getObjectiveAssignments(objectiveId: string, userId: string): Promise<any[]> {
    return await this.listAssignmentsForObjective(objectiveId, userId);
  }
}
