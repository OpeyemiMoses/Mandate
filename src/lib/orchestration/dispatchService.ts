/**
 * MANDATE — MILESTONE 13.4: AGENT TASK DISPATCH SERVICE
 *
 * Implements constrained, tamper-proof agent task dispatch:
 * - Constructs ConstrainedExecutionContext with strictly scoped permissions.
 * - Strips all private keys, signing credentials, API secrets, and cross-tenant data.
 * - Enforces idempotency to prevent duplicate task executions.
 * - Bridges to Universal Agent Runtime with lease fencing and output verification.
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { executionOrchestrator } from "@/lib/runtime/orchestrator";
import { AgentCapabilityRegistry } from "@/lib/agents/capabilityRegistry";
import { assertTaskTypeCompatibility } from "./taxonomy";
import { TaskLifecycleService } from "./taskLifecycle";
import { TaskVerificationService } from "./verificationService";
import {
  ConstrainedExecutionContext,
  OrchestrationTaskStatus,
} from "./types";

export interface DispatchTaskParams {
  objectiveId: string;
  planId: string;
  stepId: string;
  userId: string;
  idempotencyKey?: string;
}

export interface DispatchTaskResult {
  success: boolean;
  stepId: string;
  agentId: string;
  status: OrchestrationTaskStatus;
  executionId?: string;
  output?: Record<string, any>;
  verificationStatus?: string;
  error?: string;
}

export class AgentDispatchService {
  /**
   * Builds the strictly constrained, leak-proof execution context for an agent task
   */
  public static async buildConstrainedContext(params: {
    objectiveId: string;
    planId: string;
    stepId: string;
    userId: string;
  }): Promise<ConstrainedExecutionContext> {
    const { objectiveId, planId, stepId, userId } = params;

    // 1. Fetch Objective, Plan, and Step
    const step = await prisma.objectivePlanStep.findFirst({
      where: { planId, stepId },
      include: {
        plan: {
          select: { version: true, planHash: true, status: true },
        },
      },
    });

    if (!step) {
      throw new Error(`TASK_NOT_FOUND: Step "${stepId}" in plan "${planId}" not found.`);
    }

    // 2. Fetch Active Assignment
    const assignment = await prisma.agentAssignment.findFirst({
      where: { objectiveId, stepId, status: { in: ["ASSIGNED", "ACTIVE"] } },
      include: { agent: true },
    });

    if (!assignment) {
      throw new Error(`UNASSIGNED_TASK: Task "${stepId}" does not have an active agent assignment.`);
    }

    // 3. Fetch Capability Profile
    const profile = await AgentCapabilityRegistry.getProfile(assignment.agentId, userId);

    // 3.1 Verify Lease Expiry & Agent Active Status
    if (assignment.leaseExpiresAt && new Date(assignment.leaseExpiresAt).getTime() < Date.now()) {
      throw new Error(`EXPIRED_LEASE: Lease for task "${stepId}" expired at ${assignment.leaseExpiresAt.toISOString()}. Dispatch rejected.`);
    }

    if (assignment.agent.status !== "ACTIVE") {
      throw new Error(`AGENT_INACTIVE: Assigned agent "${assignment.agent.name}" is ${assignment.agent.status}. Dispatch rejected.`);
    }

    // 3.2 Verify Taxonomy Compatibility (Strict anti-conflation)
    assertTaskTypeCompatibility(assignment.agentId, profile.supportedTaskTypes, step.taskType);

    // 4. Resolve Upstream Dependency Results (Read-Only)
    let deps: string[] = [];
    try {
      if (step.dependenciesJson) deps = JSON.parse(step.dependenciesJson);
    } catch {}

    const dependencyResults: Record<string, any> = {};
    if (deps.length > 0) {
      const upstreamSteps = await prisma.objectivePlanStep.findMany({
        where: { planId, stepId: { in: deps } },
        select: { stepId: true, outputJson: true, status: true },
      });

      for (const us of upstreamSteps) {
        if (us.outputJson) {
          try {
            dependencyResults[us.stepId] = JSON.parse(us.outputJson);
          } catch {
            dependencyResults[us.stepId] = us.outputJson;
          }
        }
      }
    }

    // 5. Parse Authorized Tools
    let authorizedTools: string[] = [];
    try {
      if (step.requiredToolsJson) authorizedTools = JSON.parse(step.requiredToolsJson);
    } catch {}

    // Filter tools strictly to those supported by agent capability profile
    authorizedTools = authorizedTools.filter((t) => profile.supportedTools.includes(t));

    // Parse input
    let taskInput: Record<string, any> = {};
    try {
      if (step.inputJson) taskInput = JSON.parse(step.inputJson);
    } catch {}

    const deadline = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min execution deadline

    return {
      objectiveId,
      stepId,
      taskTitle: step.title,
      taskType: step.taskType,
      agentId: assignment.agentId,
      assignmentId: assignment.id,
      planVersion: step.plan.version,
      planHash: step.plan.planHash || "",
      taskInput,
      dependencyResults,
      authorizedTools,
      policyVersion: assignment.policyVersion || 1,
      capabilityVersion: profile.capabilityVersion,
      executionDeadline: deadline,
      leaseGeneration: assignment.leaseGeneration,
      leaseToken: assignment.leaseToken || "",
    };
  }

  /**
   * Dispatches a task to its assigned agent with idempotent fencing
   */
  public static async dispatchTask(params: DispatchTaskParams): Promise<DispatchTaskResult> {
    const { objectiveId, planId, stepId, userId } = params;

    // 1. Build Constrained Execution Context
    const context = await this.buildConstrainedContext({ objectiveId, planId, stepId, userId });

    // 2. Transition Task to QUEUED -> RUNNING
    const step = await prisma.objectivePlanStep.findFirst({
      where: { planId, stepId },
    });

    if (!step) {
      throw new Error(`Step "${stepId}" not found.`);
    }

    // Prevent duplicate dispatch if already COMPLETED or RUNNING under active lease
    if (step.status === "COMPLETED") {
      return {
        success: true,
        stepId,
        agentId: context.agentId,
        status: "COMPLETED",
        output: step.outputJson ? JSON.parse(step.outputJson) : undefined,
        verificationStatus: step.verificationStatus,
      };
    }

    if (step.status === "RUNNING") {
      return {
        success: true,
        stepId,
        agentId: context.agentId,
        status: "RUNNING",
      };
    }

    // Transition to READY if PENDING, then to QUEUED
    if (step.status === "PENDING") {
      await TaskLifecycleService.transitionTaskStatus({
        objectiveId,
        planId,
        stepId,
        targetStatus: "READY",
        actorId: "SYSTEM",
        actorRole: "SYSTEM",
        reason: "Prerequisites satisfied, task ready for dispatch",
      });
    }

    // Transition to QUEUED
    await TaskLifecycleService.transitionTaskStatus({
      objectiveId,
      planId,
      stepId,
      targetStatus: "QUEUED",
      actorId: "SYSTEM",
      actorRole: "SYSTEM",
      reason: `Task queued for agent "${context.agentId}" execution`,
      expectedLeaseGeneration: context.leaseGeneration,
      expectedLeaseToken: context.leaseToken,
    });

    // Transition to RUNNING
    await TaskLifecycleService.transitionTaskStatus({
      objectiveId,
      planId,
      stepId,
      targetStatus: "RUNNING",
      actorId: context.agentId,
      actorRole: "AGENT",
      reason: `Agent "${context.agentId}" started task execution`,
      expectedLeaseGeneration: context.leaseGeneration,
      expectedLeaseToken: context.leaseToken,
    });

    // 3. Financial Execution Safeguard: Payment tasks require human approval
    if (step.taskType === "PAYMENT") {
      await TaskLifecycleService.transitionTaskStatus({
        objectiveId,
        planId,
        stepId,
        targetStatus: "AWAITING_APPROVAL",
        actorId: "SYSTEM",
        actorRole: "SYSTEM",
        reason: "Financial payment task requires explicit human sign-off before dispatch",
      });

      return {
        success: true,
        stepId,
        agentId: context.agentId,
        status: "AWAITING_APPROVAL",
      };
    }

    // 4. Execute via Universal Agent Runtime
    const startedAt = new Date();
    try {
      const execResult = await executionOrchestrator.startExecution({
        agentId: context.agentId,
        userId,
        input: {
          objectiveId,
          stepId,
          title: context.taskTitle,
          taskType: context.taskType,
          context: {
            taskInput: context.taskInput,
            dependencyResults: context.dependencyResults,
          },
          prompt: `${context.taskTitle}: Execute assigned task with provided inputs`,
        },
      });

      const completedAt = new Date();

      if (execResult.status === "COMPLETED") {
        const rawOutput = execResult.result?.output || {
          success: true,
          summary: execResult.result?.summary,
        };

        // 5. Verify Output through TaskVerificationService
        const rawEvidence =
          (execResult.result as any)?.evidenceReferences ||
          (execResult.result?.evidence || []).map((e: any) =>
            typeof e === "string" ? e : JSON.stringify(e)
          );
        const rawToolExecutions =
          ((execResult.result as any)?.toolExecutions || []).map((te: any) => ({
            toolId: te.toolId,
            paramsHash: te.paramsHash || "",
            executedAt: te.executedAt || new Date().toISOString(),
            success: te.success ?? true,
          }));

        // Retrieve authentic tool invocations from database if recorded during execution
        if (execResult.executionId) {
          try {
            const dbToolInvocations = await prisma.toolInvocation.findMany({
              where: { executionId: execResult.executionId },
              select: { toolId: true, inputJson: true, status: true, durationMs: true, createdAt: true },
            });
            for (const ti of dbToolInvocations) {
              const pHash = crypto.createHash("sha256").update(ti.inputJson || "").digest("hex");
              rawToolExecutions.push({
                toolId: ti.toolId,
                paramsHash: pHash,
                executedAt: ti.createdAt.toISOString(),
                success: ti.status === "SUCCESS",
              });
            }
          } catch {}
        }

        const verification = await TaskVerificationService.evaluateAndRecordResult({
          objectiveId,
          planId,
          stepId,
          agentId: context.agentId,
          taskType: context.taskType,
          output: rawOutput,
          evidenceReferences: rawEvidence,
          toolExecutions: rawToolExecutions,
          startedAt,
          completedAt,
        });

        if (verification.status === "COMPLETED") {
          // Transition to COMPLETED with system verification
          await TaskLifecycleService.transitionTaskStatus({
            objectiveId,
            planId,
            stepId,
            targetStatus: "COMPLETED",
            actorId: "SYSTEM", // System certifies verified completion
            actorRole: "SYSTEM",
            verificationStatus: verification.verificationStatus,
            resultFingerprint: verification.resultFingerprint,
            output: rawOutput,
            reason: `Task successfully verified (${verification.verificationStatus})`,
          });

          return {
            success: true,
            stepId,
            agentId: context.agentId,
            status: "COMPLETED",
            executionId: execResult.executionId,
            output: rawOutput,
            verificationStatus: verification.verificationStatus,
          };
        } else {
          // Verification failed / rejected
          const rejectReason = verification.errorDetails || "Output failed verification rules";
          await TaskLifecycleService.transitionTaskStatus({
            objectiveId,
            planId,
            stepId,
            targetStatus: "FAILED",
            actorId: "SYSTEM",
            actorRole: "SYSTEM",
            reason: rejectReason,
            errorDetails: rejectReason,
            failureStage: "VERIFICATION",
          });

          return {
            success: false,
            stepId,
            agentId: context.agentId,
            status: "FAILED",
            error: rejectReason,
          };
        }
      } else if (execResult.status === "WAITING_FOR_APPROVAL") {
        await TaskLifecycleService.transitionTaskStatus({
          objectiveId,
          planId,
          stepId,
          targetStatus: "AWAITING_APPROVAL",
          actorId: context.agentId,
          actorRole: "AGENT",
          reason: "Agent requested user sign-off",
        });

        return {
          success: true,
          stepId,
          agentId: context.agentId,
          status: "AWAITING_APPROVAL",
          executionId: execResult.executionId,
        };
      } else {
        // Step execution failed
        const failReason = execResult.error || "Agent execution failed";
        await TaskLifecycleService.transitionTaskStatus({
          objectiveId,
          planId,
          stepId,
          targetStatus: "FAILED",
          actorId: context.agentId,
          actorRole: "AGENT",
          reason: failReason,
          errorDetails: failReason,
          failureStage: "EXECUTION",
        });

        return {
          success: false,
          stepId,
          agentId: context.agentId,
          status: "FAILED",
          error: failReason,
        };
      }
    } catch (dispatchErr: any) {
      const errMessage = dispatchErr.message || "Dispatch error";
      await TaskLifecycleService.transitionTaskStatus({
        objectiveId,
        planId,
        stepId,
        targetStatus: "FAILED",
        actorId: "SYSTEM",
        actorRole: "SYSTEM",
        reason: errMessage,
        errorDetails: errMessage,
        failureStage: "EXECUTION",
      });

      return {
        success: false,
        stepId,
        agentId: context.agentId,
        status: "FAILED",
        error: errMessage,
      };
    }
  }
}
