/**
 * MANDATE — MILESTONE 13.4: TASK EXECUTION LIFECYCLE SERVICE
 *
 * Deterministic server-side state machine for objective task steps with:
 * - 12-state transition table enforcement.
 * - Atomic Compare-And-Swap (CAS) version checks against concurrency race conditions.
 * - Strict assignment ownership & cryptographic lease generation verification.
 * - Agent permission boundary: Agents forbidden from marking tasks COMPLETED without verification.
 * - Dual-dispatch immutable audit logging (ObjectiveTaskEvent + Cryptographic AuditLedger).
 */

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import {
  OrchestrationTaskStatus,
  TaskActorRole,
  VerificationStatus,
  TaskTransitionParams,
  TaskTransitionResult,
  isValidTaskStatusTransition,
} from "./types";

export class TaskLifecycleService {
  /**
   * Transition an ObjectivePlanStep to a new status using atomic version CAS
   */
  public static async transitionTaskStatus(
    params: TaskTransitionParams
  ): Promise<TaskTransitionResult> {
    const {
      objectiveId,
      planId,
      stepId,
      targetStatus,
      actorId,
      actorRole,
      expectedVersion,
      expectedLeaseGeneration,
      expectedLeaseToken,
      reason,
      verificationStatus,
      resultFingerprint,
      output,
      errorDetails,
      failureStage,
      metadata = {},
    } = params;

    // 1. Fetch ObjectivePlanStep
    const step = await prisma.objectivePlanStep.findFirst({
      where: { planId, stepId },
      include: {
        plan: { select: { objectiveId: true, version: true, planHash: true, status: true } },
      },
    });

    if (!step) {
      throw new Error(`TASK_NOT_FOUND: Task "${stepId}" in plan "${planId}" does not exist.`);
    }

    if (step.objectiveId !== objectiveId) {
      throw new Error(
        `OBJECTIVE_MISMATCH: Task "${stepId}" belongs to objective "${step.objectiveId}", not "${objectiveId}".`
      );
    }

    const previousStatus = step.status as OrchestrationTaskStatus;

    // No-op check
    if (previousStatus === targetStatus) {
      return {
        success: true,
        stepId,
        previousStatus,
        newStatus: targetStatus,
        version: step.version,
        transitionedAt: step.updatedAt.toISOString(),
        actorId,
        actorRole,
        reason: "Task already in target status",
      };
    }

    // 2. Validate State Transition Legality
    if (!isValidTaskStatusTransition(previousStatus, targetStatus)) {
      throw new Error(
        `INVALID_TASK_TRANSITION: Cannot transition task "${stepId}" from "${previousStatus}" to "${targetStatus}".`
      );
    }

    // 3. Security Boundary: Agents cannot self-certify completion
    if (targetStatus === "COMPLETED") {
      const isVerified =
        verificationStatus === "SYSTEM_VALIDATED" ||
        verificationStatus === "INDEPENDENTLY_VERIFIED" ||
        step.verificationStatus === "SYSTEM_VALIDATED" ||
        step.verificationStatus === "INDEPENDENTLY_VERIFIED";

      if (actorRole === "AGENT" && !isVerified) {
        throw new Error(
          `UNAUTHORIZED_COMPLETION: Autonomous agents cannot mark task "${stepId}" as COMPLETED without system or independent verification.`
        );
      }
    }

    // 4. Verify Active Assignment & Cryptographic Lease Fencing
    const assignment = await prisma.agentAssignment.findFirst({
      where: { objectiveId, stepId },
    });

    if (assignment) {
      // Lease Token Fencing
      if (expectedLeaseToken && assignment.leaseToken && assignment.leaseToken !== expectedLeaseToken) {
        throw new Error(
          `STALE_LEASE_TOKEN: Assignment lease token mismatch for task "${stepId}". Execution fenced.`
        );
      }

      // Lease Generation Fencing
      if (
        expectedLeaseGeneration !== undefined &&
        assignment.leaseGeneration !== expectedLeaseGeneration
      ) {
        throw new Error(
          `STALE_LEASE_GENERATION: Expected lease generation ${expectedLeaseGeneration}, but current is ${assignment.leaseGeneration}. Execution fenced.`
        );
      }

      // Assignment Ownership Check: If an agent performs the transition, it must be the assigned agent
      if (actorRole === "AGENT" && assignment.agentId !== actorId) {
        throw new Error(
          `UNAUTHORIZED_AGENT_ACTION: Agent "${actorId}" is not assigned to task "${stepId}". Assigned agent is "${assignment.agentId}".`
        );
      }
    }

    // 5. Version Check (Optimistic CAS)
    if (expectedVersion !== undefined && step.version !== expectedVersion) {
      throw new Error(
        `CONCURRENCY_CONFLICT: Task "${stepId}" version mismatch. Expected v${expectedVersion}, found v${step.version}.`
      );
    }

    const nextVersion = step.version + 1;
    const now = new Date();

    // 6. Execute Atomic State Transition via CAS
    const updatedCount = await prisma.objectivePlanStep.updateMany({
      where: {
        id: step.id,
        version: step.version, // CAS guard
      },
      data: {
        status: targetStatus,
        version: nextVersion,
        verificationStatus: verificationStatus || step.verificationStatus,
        resultFingerprint: resultFingerprint || step.resultFingerprint,
        outputJson: output ? JSON.stringify(output) : step.outputJson,
        errorDetails: errorDetails !== undefined ? errorDetails : step.errorDetails,
        failureStage: failureStage || step.failureStage,
        lastTransitionReason: reason,
        startedAt: targetStatus === "RUNNING" && !step.startedAt ? now : step.startedAt,
        completedAt: targetStatus === "COMPLETED" ? now : step.completedAt,
        retryCount:
          targetStatus === "RETRY_PENDING" ? { increment: 1 } : step.retryCount,
      },
    });

    if (updatedCount.count === 0) {
      throw new Error(
        `CONCURRENCY_CONFLICT: Task "${stepId}" was modified concurrently by another worker. Transition aborted.`
      );
    }

    // 7. Persist Task Event Stream
    await prisma.objectiveTaskEvent.create({
      data: {
        objectiveId,
        planId,
        stepId,
        stepRecordId: step.id,
        fromStatus: previousStatus,
        toStatus: targetStatus,
        actorId,
        actorRole,
        reason,
        taskVersion: nextVersion,
        leaseGeneration: assignment?.leaseGeneration || 1,
        metadataJson: JSON.stringify(metadata),
        timestamp: now,
      },
    });

    // 8. Dual-Dispatch to Cryptographic Audit Ledger
    try {
      await recordAuditEvent({
        userId: actorRole === "USER" ? actorId : "SYSTEM",
        eventType: `task.${targetStatus.toLowerCase()}`,
        agentId: actorRole === "AGENT" ? actorId : undefined,
        description: `Task "${stepId}" transitioned from ${previousStatus} to ${targetStatus}: ${reason}`,
        details: {
          objectiveId,
          planId,
          stepId,
          fromStatus: previousStatus,
          toStatus: targetStatus,
          version: nextVersion,
          actorRole,
          actorId,
        },
      });
    } catch (auditErr: any) {
      console.warn(`[TaskLifecycleService] Audit logging warning: ${auditErr.message}`);
    }

    // Milestone 13.6: Durable Objective Checkpoint on Significant Task Lifecycle Events
    if (["COMPLETED", "FAILED", "WAITING_APPROVAL", "REQUIRES_INTERVENTION"].includes(targetStatus)) {
      try {
        const obj = await prisma.objective.findUnique({
          where: { id: objectiveId },
          select: { userId: true },
        });
        if (obj?.userId) {
          const { ObjectiveCheckpointService } = await import("./checkpointService");
          await ObjectiveCheckpointService.createCheckpoint({
            objectiveId,
            userId: obj.userId,
            triggerReason: `TASK_${stepId}_${targetStatus}`,
            actorId,
            actorRole: (actorRole as any) || "SYSTEM",
          });
        }
      } catch (cpErr: any) {
        console.warn(`[TaskLifecycleService] Checkpoint creation warning: ${cpErr.message}`);
      }
    }

    return {
      success: true,
      stepId,
      previousStatus,
      newStatus: targetStatus,
      version: nextVersion,
      transitionedAt: now.toISOString(),
      actorId,
      actorRole,
      reason,
    };
  }
}

