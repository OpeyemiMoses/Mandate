import crypto from "crypto";
import { prisma } from "@/lib/db";
import { AgentCapabilityValidator } from "./capabilityValidator";
import { TaskAssignmentEngine } from "./assignmentEngine";
import { TaskType } from "@/lib/objectives/types";
import { recordAuditEvent } from "@/lib/auditLedger";

export interface RequestDelegationParams {
  objectiveId: string;
  stepId: string;
  sourceAgentId: string;
  destinationAgentId: string;
  userId: string;
  reason: string;
  expectedPlanHash?: string;
}

export interface DelegationResult {
  success: boolean;
  handoffId: string;
  handoff?: any;
  previousAssignmentId?: string;
  newAssignment?: any;
  objectiveId: string;
  stepId: string;
  sourceAgentId: string;
  destinationAgentId: string;
  status: "ACCEPTED" | "COMPLETED" | "REJECTED";
  validationError?: string;
  auditLogId?: string;
}

/**
 * Governed Agent Delegation Manager
 * Implements safe, policy-checked task delegation between specialist agents.
 * Strictly enforces that delegation transfers task responsibility only — never wallet
 * ownership, signing credentials, or expanded spending authority.
 */
export class GovernedDelegationManager {
  /**
   * Request and execute a governed task delegation
   */
  public static async requestDelegation(params: RequestDelegationParams): Promise<DelegationResult> {
    const {
      objectiveId,
      stepId,
      sourceAgentId,
      destinationAgentId,
      userId,
      reason,
      expectedPlanHash,
    } = params;

    // Rule 9: Self-Delegation Forbidden
    if (sourceAgentId === destinationAgentId) {
      throw new Error(`SELF_DELEGATION_PROHIBITED: Agent "${sourceAgentId}" cannot delegate a task to itself.`);
    }

    if (!reason || reason.trim().length === 0) {
      throw new Error("A valid delegation rationale is strictly required.");
    }

    // 1. Fetch Objective & Approved Plan
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

    const plan = objective.plans[0];
    if (!plan) {
      throw new Error(`No plan found for objective "${objectiveId}".`);
    }

    const step = plan.steps[0];
    if (!step) {
      throw new Error(`Task step "${stepId}" not found in Plan v${plan.version}.`);
    }

    // Rule 6: Verify Plan Hash Binding
    if (expectedPlanHash && plan.planHash && plan.planHash !== expectedPlanHash) {
      throw new Error(
        `PLAN_HASH_MISMATCH: Approved plan fingerprint mismatch during delegation attempt.`
      );
    }

    // 2. Fetch Source and Destination Agents with Tenant Isolation
    const [sourceAgent, destAgent] = await Promise.all([
      prisma.agent.findFirst({ where: { id: sourceAgentId, userId } }),
      prisma.agent.findFirst({ where: { id: destinationAgentId, userId } }),
    ]);

    if (!sourceAgent) {
      throw new Error(`Source agent "${sourceAgentId}" not found or unauthorized.`);
    }
    if (!destAgent) {
      throw new Error(`Destination agent "${destinationAgentId}" not found or unauthorized.`);
    }

    // Rule 3: Verify source agent currently holds active assignment for this task step
    const currentAssignment = await prisma.agentAssignment.findFirst({
      where: {
        objectiveId,
        stepId,
        agentId: sourceAgentId,
        status: { in: ["ASSIGNED", "CLAIMED", "EXECUTING", "ACTIVE"] },
      },
    });

    if (!currentAssignment) {
      throw new Error(
        `UNAUTHORIZED_DELEGATION: Source agent "${sourceAgentId}" does not hold active lease for task "${stepId}".`
      );
    }

    // Rule 10: Cyclic Delegation Prevention
    // Check if destAgent previously delegated this exact task to sourceAgent
    const priorHandoffs = await prisma.agentHandoff.findMany({
      where: {
        objectiveId,
        stepId,
        sourceAgentId: destinationAgentId,
        destinationAgentId: sourceAgentId,
        status: { in: ["ACCEPTED", "COMPLETED"] },
      },
    });

    if (priorHandoffs.length > 0) {
      const err = `CYCLIC_DELEGATION_REJECTED: Cyclic task delegation detected between "${sourceAgentId}" and "${destinationAgentId}" for step "${stepId}".`;
      // Record rejected handoff (Rule 8)
      await prisma.agentHandoff.create({
        data: {
          objectiveId,
          stepId,
          sourceAgentId,
          destinationAgentId,
          planVersion: plan.version,
          planHash: plan.planHash || "",
          reason,
          status: "REJECTED",
          validationError: err,
        },
      });
      throw new Error(err);
    }

    // 3. Rule 4: Destination Agent Must Independently Pass 11-Point Capability Validation
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

    const destEligibility = await AgentCapabilityValidator.evaluateEligibility({
      agentId: destinationAgentId,
      userId,
      objectiveId,
      task: taskReq,
      mandateId: objective.mandateId,
    });

    if (!destEligibility.isEligible) {
      const err = `DELEGATION_TARGET_INELIGIBLE: Destination agent "${destAgent.name}" lacks required capabilities for task: ${destEligibility.reasons.join("; ")}`;
      // Record rejected handoff (Rule 8)
      await prisma.agentHandoff.create({
        data: {
          objectiveId,
          stepId,
          sourceAgentId,
          destinationAgentId,
          planVersion: plan.version,
          planHash: plan.planHash || "",
          reason,
          status: "REJECTED",
          validationError: err,
        },
      });
      throw new Error(err);
    }

    // 4. Create ACCEPTED Governed Handoff Record
    const handoff = await prisma.agentHandoff.create({
      data: {
        objectiveId,
        stepId,
        sourceAgentId,
        destinationAgentId,
        planVersion: plan.version,
        planHash: plan.planHash || "",
        reason,
        delegationType: "TASK_RESPONSIBILITY",
        status: "ACCEPTED",
        acceptedAt: new Date(),
        structuredPayload: JSON.stringify({
          taskType: step.taskType,
          delegatedAt: new Date().toISOString(),
          reason,
        }),
      },
    });

    // 5. Update Task Assignment to Destination Agent with Trail
    const newAssignment = await TaskAssignmentEngine.reassignTask({
      objectiveId,
      stepId,
      newAgentId: destinationAgentId,
      userId,
      reason: `Delegated from ${sourceAgent.name}: ${reason}`,
      expectedPlanHash: plan.planHash || undefined,
    });

    // 6. Record Immutable Audit Event
    await recordAuditEvent({
      userId,
      eventType: "agent.task_delegated",
      agentId: destinationAgentId,
      description: `Task "${stepId}" successfully delegated from "${sourceAgent.name}" to "${destAgent.name}"`,
      details: {
        objectiveId,
        stepId,
        sourceAgentId,
        destinationAgentId,
        reason,
        planVersion: plan.version,
      },
    });

    return {
      success: true,
      handoffId: handoff.id,
      handoff: { ...handoff, status: "COMPLETED" },
      newAssignment,
      objectiveId,
      stepId,
      sourceAgentId,
      destinationAgentId,
      status: "COMPLETED",
    };
  }

  /**
   * Retrieve delegation history for an objective task
   */
  public static async getDelegationHistory(
    objectiveId: string,
    stepId: string,
    userId: string
  ): Promise<any[]> {
    const objective = await prisma.objective.findFirst({
      where: { id: objectiveId, userId },
    });

    if (!objective) {
      throw new Error(`Objective "${objectiveId}" not found or unauthorized.`);
    }

    return await prisma.agentHandoff.findMany({
      where: { objectiveId, stepId },
      include: {
        sourceAgent: { select: { id: true, name: true, type: true } },
        destinationAgent: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieve all delegation handoff history for an entire objective
   */
  public static async getObjectiveHandoffs(
    objectiveId: string,
    userId: string
  ): Promise<any[]> {
    const objective = await prisma.objective.findFirst({
      where: { id: objectiveId, userId },
    });

    if (!objective) {
      throw new Error(`Objective "${objectiveId}" not found or unauthorized.`);
    }

    return await prisma.agentHandoff.findMany({
      where: { objectiveId },
      include: {
        sourceAgent: { select: { id: true, name: true, type: true } },
        destinationAgent: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
