/**
 * MANDATE — MILESTONE 13.4: TASK FAILURE, RETRY & RECOVERY MANAGER
 *
 * Implements bounded retry policies, failure classification, and escalation:
 * - Distinguishes transient vs permanent failures.
 * - Enforces maxRetries cap with exponential backoff.
 * - Integrates with Milestone 8 / 9 ExecutionRecoveryService for ambiguous financial states.
 * - Circuit-breaks unsafe conditions to REQUIRES_INTERVENTION.
 */

import { prisma } from "@/lib/db";
import { TaskLifecycleService } from "./taskLifecycle";
import { ObjectiveLifecycleService } from "@/lib/objectives/lifecycleService";
import { ExecutionRecoveryService } from "@/lib/execution/recoveryService";
import { FailureStageType } from "./types";

export interface TaskFailureParams {
  objectiveId: string;
  planId: string;
  stepId: string;
  error: any;
  failureStage: FailureStageType;
  actorId?: string;
  isFinancial?: boolean;
  txHash?: string;
}

export interface TaskRecoveryOutcome {
  action: "RETRY_SCHEDULED" | "FAILED_PERMANENT" | "REQUIRES_INTERVENTION";
  retryCount: number;
  maxRetries: number;
  backoffMs: number;
  reason: string;
}

export class TaskRecoveryManager {
  /**
   * Determine failure classification, retry eligibility, or intervention escalation
   */
  public static async handleTaskFailure(
    params: TaskFailureParams
  ): Promise<TaskRecoveryOutcome> {
    const {
      objectiveId,
      planId,
      stepId,
      error,
      failureStage,
      actorId = "SYSTEM",
      isFinancial = false,
      txHash,
    } = params;

    const errorMsg = String(error?.message || error || "Unknown task error");

    // 1. Fetch Step Definition
    const step = await prisma.objectivePlanStep.findFirst({
      where: { planId, stepId },
    });

    if (!step) {
      throw new Error(`Step "${stepId}" in plan "${planId}" not found.`);
    }

    // 2. Financial Ambiguity Check: Never blindly retry ambiguous financial dispatches!
    if (isFinancial || step.taskType === "PAYMENT") {
      if (failureStage === "AMBIGUOUS_DISPATCH" || txHash) {
        // Escalate to manual recovery
        await TaskLifecycleService.transitionTaskStatus({
          objectiveId,
          planId,
          stepId,
          targetStatus: "REQUIRES_INTERVENTION",
          actorId,
          actorRole: "SYSTEM",
          reason: `Ambiguous financial execution requiring manual reconciliation: ${errorMsg}`,
          errorDetails: errorMsg,
          failureStage,
        });

        await ObjectiveLifecycleService.transitionStatus({
          objectiveId,
          targetStatus: "REQUIRES_INTERVENTION",
          actorId,
          actorRole: "SYSTEM",
          reason: `Task "${stepId}" encountered ambiguous financial execution`,
        });

        return {
          action: "REQUIRES_INTERVENTION",
          retryCount: step.retryCount,
          maxRetries: step.maxRetries,
          backoffMs: 0,
          reason: "Ambiguous financial operation escalated to human intervention",
        };
      }
    }

    // 3. Permanent Non-Retryable Failure Check
    const isPermanent =
      failureStage === "POLICY_DENIED" ||
      failureStage === "VERIFICATION" ||
      errorMsg.includes("UNREGISTERED_TOOL") ||
      errorMsg.includes("UNAUTHORIZED") ||
      errorMsg.includes("AGENT_ACTION_FORBIDDEN");

    if (isPermanent) {
      await TaskLifecycleService.transitionTaskStatus({
        objectiveId,
        planId,
        stepId,
        targetStatus: "FAILED",
        actorId,
        actorRole: "SYSTEM",
        reason: `Permanent non-retryable failure (${failureStage}): ${errorMsg}`,
        errorDetails: errorMsg,
        failureStage,
      });

      return {
        action: "FAILED_PERMANENT",
        retryCount: step.retryCount,
        maxRetries: step.maxRetries,
        backoffMs: 0,
        reason: `Permanent failure: ${errorMsg}`,
      };
    }

    // 4. Bounded Retry Check
    const currentRetries = step.retryCount;
    const maxRetries = step.maxRetries || 3;

    if (currentRetries < maxRetries) {
      // Bounded exponential backoff: 2s, 4s, 8s...
      const backoffMs = Math.min(2000 * Math.pow(2, currentRetries), 30000);

      await TaskLifecycleService.transitionTaskStatus({
        objectiveId,
        planId,
        stepId,
        targetStatus: "RETRY_PENDING",
        actorId,
        actorRole: "SYSTEM",
        reason: `Transient failure (${failureStage}). Scheduled retry ${currentRetries + 1}/${maxRetries} in ${backoffMs}ms: ${errorMsg}`,
        errorDetails: errorMsg,
        failureStage,
      });

      return {
        action: "RETRY_SCHEDULED",
        retryCount: currentRetries + 1,
        maxRetries,
        backoffMs,
        reason: `Retry ${currentRetries + 1} scheduled`,
      };
    } else {
      // Retries exhausted: Escalate to REQUIRES_INTERVENTION or FAILED
      await TaskLifecycleService.transitionTaskStatus({
        objectiveId,
        planId,
        stepId,
        targetStatus: "REQUIRES_INTERVENTION",
        actorId,
        actorRole: "SYSTEM",
        reason: `Max retries (${maxRetries}) exhausted. Escalated to intervention: ${errorMsg}`,
        errorDetails: errorMsg,
        failureStage,
      });

      await ObjectiveLifecycleService.transitionStatus({
        objectiveId,
        targetStatus: "REQUIRES_INTERVENTION",
        actorId,
        actorRole: "SYSTEM",
        reason: `Task "${stepId}" exhausted retries`,
      });

      return {
        action: "REQUIRES_INTERVENTION",
        retryCount: currentRetries,
        maxRetries,
        backoffMs: 0,
        reason: `Max retries exhausted`,
      };
    }
  }
}

