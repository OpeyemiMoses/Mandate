/**
 * Objective Lifecycle Service (Milestone 13.1)
 * 
 * Provides deterministic, server-side objective state machine transitions with:
 * - Strict transition table enforcement across 11 lifecycle states.
 * - Atomic Compare-And-Swap (CAS) version checks to prevent concurrent state corruption.
 * - Strict tenant isolation & ownership verification (masked with 404).
 * - Agent permission boundaries (agents cannot override user-controlled actions).
 * - Mandate binding validation (verifies linked mandate remains ACTIVE, unexpired, and within budget).
 * - Dual-dispatch immutable audit logging (ObjectiveEvent + Cryptographic SHA-256 AuditLedger).
 */

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import {
  ObjectiveStatus,
  ActorRole,
  ObjectiveTransitionParams,
  ObjectiveTransitionResult,
  isValidObjectiveStatusTransition,
  VALID_OBJECTIVE_TRANSITIONS,
} from "./types";
import { assertObjectiveMandateValid } from "./authority";
import { SuccessCriteriaEngine } from "@/lib/orchestration/successCriteriaEngine";

// User-only transitions that AI agents are forbidden from executing
const USER_ONLY_TRANSITIONS = new Set<string>([
  "DRAFT->ACTIVE",
  "DRAFT->CANCELLED",
  "ACTIVE->CANCELLED",
  "PLANNING->CANCELLED",
  "AWAITING_APPROVAL->READY",
  "AWAITING_APPROVAL->RUNNING",
  "AWAITING_APPROVAL->CANCELLED",
  "READY->CANCELLED",
  "RUNNING->CANCELLED",
  "PAUSED->ACTIVE",
  "PAUSED->CANCELLED",
  "REQUIRES_INTERVENTION->CANCELLED",
  "REQUIRES_INTERVENTION->RUNNING",
]);

export class ObjectiveLifecycleService {
  /**
   * Transitions an objective to a target status using atomic version-checked updates.
   */
  public static async transitionStatus(
    params: ObjectiveTransitionParams
  ): Promise<ObjectiveTransitionResult> {
    const {
      objectiveId,
      targetStatus,
      actorId,
      actorRole,
      isAgent = false,
      reason = "Objective lifecycle transition",
      expectedVersion,
      metadata = {},
    } = params;

    // 1. Fetch objective
    const existing = await prisma.objective.findUnique({
      where: { id: objectiveId },
      include: { mandate: true },
    });

    if (!existing) {
      throw new Error(`OBJECTIVE_NOT_FOUND: Objective "${objectiveId}" does not exist.`);
    }

    const previousStatus = existing.status as ObjectiveStatus;

    // No-op check
    if (previousStatus === targetStatus) {
      return {
        success: true,
        objectiveId,
        previousStatus,
        newStatus: targetStatus,
        version: existing.version,
        transitionedAt: existing.updatedAt.toISOString(),
        actorId,
        actorRole,
        reason: "Objective already in target status",
      };
    }

    // 2. Tenant isolation check for USER actors
    if (actorRole === "USER" && actorId && existing.userId !== actorId) {
      // Mask cross-tenant unauthorized access as NOT_FOUND
      throw new Error(`OBJECTIVE_NOT_FOUND: Objective "${objectiveId}" not found or unauthorized.`);
    }

    // 3. Agent boundary enforcement
    const transitionKey = `${previousStatus}->${targetStatus}`;
    if (isAgent || actorRole === "AGENT") {
      if (USER_ONLY_TRANSITIONS.has(transitionKey)) {
        throw new Error(
          `AGENT_ACTION_FORBIDDEN: Agents are prohibited from executing "${transitionKey}" transition. User authorization required.`
        );
      }
      if (targetStatus === "CANCELLED") {
        throw new Error("AGENT_ACTION_FORBIDDEN: Agents cannot cancel user objectives.");
      }
    }

    // 4. Validate permitted transition rules
    if (!isValidObjectiveStatusTransition(previousStatus, targetStatus)) {
      const allowed = VALID_OBJECTIVE_TRANSITIONS[previousStatus] || [];
      throw new Error(
        `INVALID_TRANSITION: Cannot transition objective from "${previousStatus}" to "${targetStatus}". Permitted transitions: [${allowed.join(", ")}]`
      );
    }

    // 5. Version check for optimistic concurrency
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new Error(
        `CONCURRENCY_CONFLICT: Objective version mismatch. Expected version ${expectedVersion}, but current is ${existing.version}. Update rejected.`
      );
    }

    // 6. Mandate Authority Validation (when activating or executing)
    if (targetStatus === "ACTIVE" || targetStatus === "RUNNING") {
      if (existing.mandateId) {
        let constraints = {};
        try {
          if (existing.constraintsJson) constraints = JSON.parse(existing.constraintsJson);
        } catch {}

        await assertObjectiveMandateValid({
          userId: existing.userId,
          mandateId: existing.mandateId,
          constraints,
        });
      }
    }

    // 6.5 Objective Success Criteria Validation (Milestone 13.5)
    // Invariant: Objective cannot transition to COMPLETED unless all mandatory success criteria are met.
    if (targetStatus === "COMPLETED" && !params.skipCriteriaValidation) {
      const hasPlanOrCriteria =
        (await prisma.objectivePlan.count({ where: { objectiveId } })) > 0 ||
        (await prisma.objectiveSuccessCriteria.count({ where: { objectiveId } })) > 0;

      if (hasPlanOrCriteria) {
        await SuccessCriteriaEngine.assertObjectiveCanComplete(objectiveId);
      }
    }

    const currentVersion = existing.version;
    const now = new Date();

    // 7. Atomic CAS update transaction
    const updateResult = await prisma.$transaction(async (tx) => {
      // Determine field updates based on state
      const updateData: any = {
        status: targetStatus,
        version: currentVersion + 1,
      };

      if (targetStatus === "ACTIVE" && !existing.startedAt) {
        updateData.startedAt = now;
      }
      if (targetStatus === "PLANNING") {
        updateData.planningStatus = "PLANNING";
      }
      if (targetStatus === "READY") {
        updateData.planningStatus = "PLANNED";
      }
      if (targetStatus === "RUNNING") {
        updateData.executionStatus = "RUNNING";
      }
      if (targetStatus === "AWAITING_APPROVAL") {
        updateData.executionStatus = "AWAITING_APPROVAL";
      }
      if (targetStatus === "PAUSED") {
        updateData.executionStatus = "PAUSED";
      }
      if (targetStatus === "COMPLETED") {
        updateData.executionStatus = "COMPLETED";
        updateData.completedAt = now;
        updateData.progressPercent = 100;
      }
      if (targetStatus === "FAILED") {
        updateData.executionStatus = "FAILED";
        updateData.failureReason = reason;
      }
      if (targetStatus === "CANCELLED") {
        updateData.executionStatus = "CANCELLED";
      }

      // Execute CAS update
      const updated = await tx.objective.updateMany({
        where: {
          id: objectiveId,
          version: currentVersion,
        },
        data: updateData,
      });

      if (updated.count === 0) {
        throw new Error(
          `CONCURRENCY_CONFLICT: Concurrent update detected on objective "${objectiveId}". State was modified by another operation.`
        );
      }

      // Record ObjectiveEvent inside transaction
      const event = await tx.objectiveEvent.create({
        data: {
          objectiveId,
          eventType: `objective.${targetStatus.toLowerCase()}`,
          actorId,
          actorRole,
          fromStatus: previousStatus,
          toStatus: targetStatus,
          reason,
          version: currentVersion + 1,
          metadataJson: JSON.stringify(metadata),
        },
      });

      return {
        newVersion: currentVersion + 1,
        eventId: event.id,
      };
    });

    // 8. Dual-dispatch to tamper-evident audit ledger (outside interactive tx to avoid DB lock)
    try {
      await recordAuditEvent({
        userId: existing.userId,
        eventType: `OBJECTIVE_${targetStatus}`,
        verdict: targetStatus === "FAILED" ? "BLOCKED" : "SUCCESS",
        description: `Objective "${existing.title}" transitioned from ${previousStatus} to ${targetStatus} by ${actorRole}:${actorId}. Reason: ${reason}`,
        details: {
          objectiveId,
          title: existing.title,
          previousStatus,
          newStatus: targetStatus,
          version: updateResult.newVersion,
          actorId,
          actorRole,
          reason,
          mandateId: existing.mandateId,
          ...metadata,
        },
        mandateId: existing.mandateId || undefined,
      });
    } catch (auditErr) {
      console.warn("Failed to record audit event for objective transition:", auditErr);
    }

    // Milestone 13.6: Durable Objective Checkpoint on Lifecycle Transition
    try {
      const { ObjectiveCheckpointService } = await import("@/lib/orchestration/checkpointService");
      await ObjectiveCheckpointService.createCheckpoint({
        objectiveId,
        userId: existing.userId,
        triggerReason: `LIFECYCLE_${previousStatus}_TO_${targetStatus}`,
        actorId,
        actorRole: (actorRole as any) || "SYSTEM",
      });
    } catch (checkpointErr) {
      console.warn("Failed to create durable objective checkpoint:", checkpointErr);
    }

    return {
      success: true,
      objectiveId,
      previousStatus,
      newStatus: targetStatus,
      version: updateResult.newVersion,
      transitionedAt: now.toISOString(),
      actorId,
      actorRole,
      reason,
    };
  }

  /**
   * Helper: Activates an objective in DRAFT state.
   */
  public static async activateObjective(params: {
    objectiveId: string;
    actorUserId: string;
    reason?: string;
    expectedVersion?: number;
  }) {
    return await this.transitionStatus({
      objectiveId: params.objectiveId,
      targetStatus: "ACTIVE",
      actorId: params.actorUserId,
      actorRole: "USER",
      isAgent: false,
      reason: params.reason || "Owner activated objective",
      expectedVersion: params.expectedVersion,
    });
  }

  /**
   * Helper: Pauses an active, planning, ready, or running objective.
   */
  public static async pauseObjective(params: {
    objectiveId: string;
    actorId: string;
    actorRole: ActorRole;
    isAgent?: boolean;
    reason?: string;
    expectedVersion?: number;
  }) {
    return await this.transitionStatus({
      objectiveId: params.objectiveId,
      targetStatus: "PAUSED",
      actorId: params.actorId,
      actorRole: params.actorRole,
      isAgent: params.isAgent,
      reason: params.reason || "Objective execution paused",
      expectedVersion: params.expectedVersion,
    });
  }

  /**
   * Helper: Resumes a PAUSED objective back to workflow.
   */
  public static async resumeObjective(params: {
    objectiveId: string;
    actorId: string;
    actorRole: ActorRole;
    targetStatus?: ObjectiveStatus;
    reason?: string;
    expectedVersion?: number;
  }) {
    // Default resume target is ACTIVE if not specified
    const targetStatus = params.targetStatus || "ACTIVE";
    return await this.transitionStatus({
      objectiveId: params.objectiveId,
      targetStatus,
      actorId: params.actorId,
      actorRole: params.actorRole,
      isAgent: false,
      reason: params.reason || "Objective execution resumed",
      expectedVersion: params.expectedVersion,
    });
  }

  /**
   * Helper: Cancels an objective. Only permitted for USER or OPERATOR.
   */
  public static async cancelObjective(params: {
    objectiveId: string;
    actorId: string;
    actorRole: ActorRole;
    reason?: string;
    expectedVersion?: number;
  }) {
    return await this.transitionStatus({
      objectiveId: params.objectiveId,
      targetStatus: "CANCELLED",
      actorId: params.actorId,
      actorRole: params.actorRole,
      isAgent: false,
      reason: params.reason || "Objective cancelled by user/operator",
      expectedVersion: params.expectedVersion,
    });
  }

  /**
   * Helper: Retrieves an objective with object-level tenant authorization.
   * Throws OBJECTIVE_NOT_FOUND (masked 404) if unauthorized.
   */
  public static async getObjectiveForUser(objectiveId: string, userId: string) {
    const objective = await prisma.objective.findFirst({
      where: { id: objectiveId, userId },
      include: {
        mandate: {
          select: {
            id: true,
            name: true,
            totalBudgetYocto: true,
            spentYocto: true,
            reservedYocto: true,
            perTxLimitYocto: true,
            approvalThresholdYocto: true,
            allowedRecipientsJson: true,
            status: true,
            expiresAt: true,
          },
        },
        plans: {
          orderBy: { version: "desc" },
          take: 1,
          include: {
            steps: { orderBy: { order: "asc" } },
            approvals: { orderBy: { createdAt: "desc" } },
          },
        },
        criteria: { orderBy: { createdAt: "asc" } },
        events: { orderBy: { timestamp: "desc" }, take: 25 },
      },
    });

    if (!objective) {
      throw new Error(`OBJECTIVE_NOT_FOUND: Objective "${objectiveId}" not found or unauthorized.`);
    }

    return objective;
  }
}

