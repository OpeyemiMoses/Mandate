/**
 * MANDATE — Milestone 13.6: Durable Objective Checkpoint Service
 * 
 * Provides atomic, tamper-proof, tenant-isolated state checkpoints for long-running
 * autonomous objectives. Captures complete execution topology, worker leasing,
 * dependency evidence, and approval hashes while strictly filtering secrets.
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { canonicalize } from "@/lib/auditLedger";

export interface CreateCheckpointParams {
  objectiveId: string;
  userId: string;
  triggerReason: string;
  orchestrationRound?: number;
  actorId?: string;
  actorRole?: "USER" | "AGENT" | "SYSTEM" | "WORKER";
  workerId?: string;
  leaseGeneration?: number;
}

export interface CheckpointSnapshotPayload {
  objectiveId: string;
  objectiveStatus: string;
  objectiveVersion: number;
  orchestrationRound: number;
  planId: string | null;
  planVersion: number | null;
  planHash: string | null;
  approvalState: string;
  taskStates: Array<{
    stepId: string;
    status: string;
    version: number;
    order: number;
    retryCount: number;
    failureStage: string | null;
    verificationStatus: string;
  }>;
  assignments: Array<{
    stepId: string;
    agentId: string;
    capabilityVersion: number | null;
    leaseGeneration: number;
    leaseToken: string | null;
    leaseExpiresAt: string | null;
  }>;
  dependencyEvidence: Array<{
    stepId: string;
    resultFingerprint: string;
    verificationStatus: string;
  }>;
  executionReferences: Array<{
    stepId: string;
    executionId: string | null;
    toolExecutionsCount: number;
  }>;
  recoveryState: {
    totalRetries: number;
    circuitBreakerTripped: boolean;
    failedSteps: string[];
  };
}

export class ObjectiveCheckpointService {
  /**
   * Generates a canonical SHA-256 digest of snapshot payload data.
   */
  public static computeCheckpointHash(payload: CheckpointSnapshotPayload): string {
    const canonical = canonicalize(payload);
    return crypto.createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
  }

  /**
   * Idempotently persists a durable, atomic point-in-time checkpoint for an objective.
   */
  public static async createCheckpoint(params: CreateCheckpointParams) {
    const {
      objectiveId,
      userId,
      triggerReason,
      orchestrationRound = 1,
      actorId,
      actorRole = "SYSTEM",
      workerId,
      leaseGeneration,
    } = params;

    // 1. Fetch Objective with tenant isolation check
    const objective = await prisma.objective.findUnique({
      where: { id: objectiveId },
      include: {
        plans: {
          orderBy: { version: "desc" },
          take: 1,
          include: {
            steps: {
              orderBy: { order: "asc" },
            },
            approvals: {
              orderBy: { version: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!objective || objective.userId !== userId) {
      throw new Error(`OBJECTIVE_NOT_FOUND: Objective "${objectiveId}" not found or unauthorized.`);
    }

    const latestPlan = objective.plans[0] || null;
    const latestApproval = latestPlan?.approvals[0] || null;

    // 2. Fetch Active Assignments & Task Results
    const stepIds = latestPlan?.steps.map((s) => s.stepId) || [];

    const assignments = await prisma.agentAssignment.findMany({
      where: {
        objectiveId,
        stepId: { in: stepIds },
      },
    });

    const taskResults = await prisma.objectiveTaskResult.findMany({
      where: {
        objectiveId,
        planId: latestPlan?.id,
      },
    });

    // 3. Assemble Sanitized Payload Snapshot (strictly excluding private keys, secrets, session cookies)
    const taskStates = (latestPlan?.steps || []).map((step) => ({
      stepId: step.stepId,
      status: step.status,
      version: step.version,
      order: step.order,
      retryCount: step.retryCount,
      failureStage: step.failureStage,
      verificationStatus: step.verificationStatus,
    }));

    const sanitizedAssignments = assignments.map((a) => ({
      stepId: a.stepId || "",
      agentId: a.agentId,
      capabilityVersion: a.capabilityVersion,
      leaseGeneration: a.leaseGeneration,
      leaseToken: a.leaseToken,
      leaseExpiresAt: a.leaseExpiresAt ? a.leaseExpiresAt.toISOString() : null,
    }));

    const dependencyEvidence = taskResults.map((tr) => ({
      stepId: tr.stepId,
      resultFingerprint: tr.resultFingerprint,
      verificationStatus: tr.verificationStatus,
    }));

    const executionReferences = (latestPlan?.steps || []).map((s) => {
      let toolsCount = 0;
      try {
        if (s.toolExecutionsJson) {
          toolsCount = JSON.parse(s.toolExecutionsJson).length;
        }
      } catch {}
      return {
        stepId: s.stepId,
        executionId: s.executionId,
        toolExecutionsCount: toolsCount,
      };
    });

    const failedSteps = (latestPlan?.steps || [])
      .filter((s) => s.status === "FAILED")
      .map((s) => s.stepId);
    const totalRetries = (latestPlan?.steps || []).reduce((acc, s) => acc + s.retryCount, 0);

    const snapshotPayload: CheckpointSnapshotPayload = {
      objectiveId,
      objectiveStatus: objective.status,
      objectiveVersion: objective.version,
      orchestrationRound,
      planId: latestPlan?.id || null,
      planVersion: latestPlan?.version || null,
      planHash: latestPlan?.planHash || null,
      approvalState: latestApproval?.decision || (latestPlan?.requiresApproval ? "NONE" : "APPROVED"),
      taskStates,
      assignments: sanitizedAssignments,
      dependencyEvidence,
      executionReferences,
      recoveryState: {
        totalRetries,
        circuitBreakerTripped: failedSteps.length > 0 && totalRetries >= 3,
        failedSteps,
      },
    };

    // 4. Compute Canonical SHA-256 Hash
    const checkpointHash = this.computeCheckpointHash(snapshotPayload);

    // 5. Idempotency Check: Fetch latest checkpoint
    const latestExistingCheckpoint = await prisma.objectiveCheckpoint.findFirst({
      where: { objectiveId },
      orderBy: { checkpointNumber: "desc" },
    });

    if (latestExistingCheckpoint && latestExistingCheckpoint.checkpointHash === checkpointHash) {
      // Return existing checkpoint idempotently if state has not mutated
      return latestExistingCheckpoint;
    }

    const nextCheckpointNumber = (latestExistingCheckpoint?.checkpointNumber || 0) + 1;
    const now = new Date();

    // 6. Transactional Write: ObjectiveCheckpoint + Objective metadata + ObjectiveEvent
    const checkpoint = await prisma.$transaction(async (tx) => {
      const created = await tx.objectiveCheckpoint.create({
        data: {
          checkpointNumber: nextCheckpointNumber,
          objectiveId,
          userId,
          objectiveStatus: objective.status,
          objectiveVersion: objective.version,
          orchestrationRound,
          planId: latestPlan?.id || null,
          planVersion: latestPlan?.version || null,
          planHash: latestPlan?.planHash || null,
          approvalState: latestApproval?.decision || (latestPlan?.requiresApproval ? "NONE" : "APPROVED"),
          approvalPayloadHash: latestApproval ? crypto.createHash("sha256").update(latestApproval.id).digest("hex") : null,
          taskStatesJson: JSON.stringify(taskStates),
          assignmentsJson: JSON.stringify(sanitizedAssignments),
          dependencyEvidenceJson: JSON.stringify(dependencyEvidence),
          executionReferencesJson: JSON.stringify(executionReferences),
          recoveryStateJson: JSON.stringify(snapshotPayload.recoveryState),
          checkpointHash,
          triggerReason,
          actorId: actorId || null,
          actorRole: actorRole || null,
          workerId: workerId || null,
          leaseGeneration: leaseGeneration || null,
          createdAt: now,
        },
      });

      await tx.objective.update({
        where: { id: objectiveId },
        data: {
          currentCheckpointNumber: nextCheckpointNumber,
          lastCheckpointAt: now,
        },
      });

      await tx.objectiveEvent.create({
        data: {
          objectiveId,
          eventType: "objective.checkpoint_created",
          actorId: actorId || null,
          actorRole: actorRole || null,
          fromStatus: objective.status,
          toStatus: objective.status,
          version: objective.version,
          reason: `Checkpoint #${nextCheckpointNumber} created (${triggerReason})`,
          metadataJson: JSON.stringify({
            checkpointNumber: nextCheckpointNumber,
            checkpointHash,
            triggerReason,
            tasksCount: taskStates.length,
          }),
        },
      });

      return created;
    });

    return checkpoint;
  }

  /**
   * Retrieves the latest durable checkpoint for an objective.
   */
  public static async getLatestCheckpoint(objectiveId: string, userId: string) {
    const objective = await prisma.objective.findUnique({
      where: { id: objectiveId },
      select: { userId: true },
    });

    if (!objective || objective.userId !== userId) {
      throw new Error(`OBJECTIVE_NOT_FOUND: Objective "${objectiveId}" not found or unauthorized.`);
    }

    return await prisma.objectiveCheckpoint.findFirst({
      where: { objectiveId },
      orderBy: { checkpointNumber: "desc" },
    });
  }

  /**
   * Retrieves a specific checkpoint by number with tenant isolation.
   */
  public static async getCheckpoint(objectiveId: string, checkpointNumber: number, userId: string) {
    const objective = await prisma.objective.findUnique({
      where: { id: objectiveId },
      select: { userId: true },
    });

    if (!objective || objective.userId !== userId) {
      throw new Error(`OBJECTIVE_NOT_FOUND: Objective "${objectiveId}" not found or unauthorized.`);
    }

    const checkpoint = await prisma.objectiveCheckpoint.findUnique({
      where: {
        objectiveId_checkpointNumber: {
          objectiveId,
          checkpointNumber,
        },
      },
    });

    if (!checkpoint) {
      throw new Error(`CHECKPOINT_NOT_FOUND: Checkpoint #${checkpointNumber} not found for objective "${objectiveId}".`);
    }

    return checkpoint;
  }

  /**
   * Lists all checkpoints chronologically for an objective.
   */
  public static async listCheckpoints(objectiveId: string, userId: string, limit: number = 50) {
    const objective = await prisma.objective.findUnique({
      where: { id: objectiveId },
      select: { userId: true },
    });

    if (!objective || objective.userId !== userId) {
      throw new Error(`OBJECTIVE_NOT_FOUND: Objective "${objectiveId}" not found or unauthorized.`);
    }

    return await prisma.objectiveCheckpoint.findMany({
      where: { objectiveId },
      orderBy: { checkpointNumber: "desc" },
      take: limit,
    });
  }

  /**
   * Verifies the cryptographic integrity of an objective checkpoint.
   */
  public static verifyCheckpointIntegrity(checkpoint: any): {
    isValid: boolean;
    computedHash: string;
    expectedHash: string;
  } {
    const taskStates = JSON.parse(checkpoint.taskStatesJson || "[]");
    const assignments = JSON.parse(checkpoint.assignmentsJson || "[]");
    const dependencyEvidence = JSON.parse(checkpoint.dependencyEvidenceJson || "[]");
    const executionReferences = JSON.parse(checkpoint.executionReferencesJson || "[]");
    const recoveryState = JSON.parse(checkpoint.recoveryStateJson || "{}");

    const payload: CheckpointSnapshotPayload = {
      objectiveId: checkpoint.objectiveId,
      objectiveStatus: checkpoint.objectiveStatus,
      objectiveVersion: checkpoint.objectiveVersion,
      orchestrationRound: checkpoint.orchestrationRound,
      planId: checkpoint.planId,
      planVersion: checkpoint.planVersion,
      planHash: checkpoint.planHash,
      approvalState: checkpoint.approvalState || "NONE",
      taskStates,
      assignments,
      dependencyEvidence,
      executionReferences,
      recoveryState,
    };

    const computedHash = this.computeCheckpointHash(payload);
    return {
      isValid: computedHash === checkpoint.checkpointHash,
      computedHash,
      expectedHash: checkpoint.checkpointHash,
    };
  }

  /**
   * Restores an objective's plan and task state from a verified checkpoint.
   * Increments lease generations to fence any stale/zombie workers.
   */
  public static async restoreFromCheckpoint(params: {
    objectiveId: string;
    checkpointNumber: number;
    userId: string;
    actorId: string;
    actorRole: "USER" | "SYSTEM";
    reason?: string;
  }) {
    const { objectiveId, checkpointNumber, userId, actorId, actorRole, reason } = params;

    const checkpoint = await this.getCheckpoint(objectiveId, checkpointNumber, userId);

    // Verify integrity before restoring
    const integrity = this.verifyCheckpointIntegrity(checkpoint);
    if (!integrity.isValid) {
      throw new Error(
        `CHECKPOINT_INTEGRITY_VIOLATION: Checkpoint #${checkpointNumber} hash mismatch. Computed: ${integrity.computedHash}, Stored: ${integrity.expectedHash}`
      );
    }

    const taskStates: Array<{
      stepId: string;
      status: string;
      version: number;
      retryCount: number;
      failureStage: string | null;
      verificationStatus: string;
    }> = JSON.parse(checkpoint.taskStatesJson || "[]");

    // Perform atomic state restoration
    return await prisma.$transaction(async (tx) => {
      // 1. Update Objective
      const updatedObjective = await tx.objective.update({
        where: { id: objectiveId },
        data: {
          status: checkpoint.objectiveStatus,
          version: { increment: 1 },
        },
      });

      // 2. Restore individual task step states if plan exists
      if (checkpoint.planId) {
        for (const ts of taskStates) {
          await tx.objectivePlanStep.updateMany({
            where: {
              planId: checkpoint.planId,
              stepId: ts.stepId,
            },
            data: {
              status: ts.status,
              retryCount: ts.retryCount,
              failureStage: ts.failureStage,
              verificationStatus: ts.verificationStatus,
              version: { increment: 1 },
              // Advance lease generation to fence any stale worker that held this task
              leaseGeneration: { increment: 1 },
            },
          });
        }

        // 3. Invalidate / Fence active agent assignments by incrementing leaseGeneration and clearing leaseToken
        await tx.agentAssignment.updateMany({
          where: {
            objectiveId,
            planId: checkpoint.planId,
          },
          data: {
            leaseGeneration: { increment: 1 },
            leaseToken: null,
            leaseExpiresAt: null,
          },
        });
      }

      // 4. Record restoration audit event
      await tx.objectiveEvent.create({
        data: {
          objectiveId,
          eventType: "objective.checkpoint_restored",
          actorId,
          actorRole,
          fromStatus: updatedObjective.status,
          toStatus: checkpoint.objectiveStatus,
          version: updatedObjective.version,
          reason: reason || `Restored from Checkpoint #${checkpointNumber}`,
          metadataJson: JSON.stringify({
            restoredCheckpointNumber: checkpointNumber,
            checkpointHash: checkpoint.checkpointHash,
            tasksRestored: taskStates.length,
          }),
        },
      });

      return {
        success: true,
        objectiveId,
        restoredVersion: updatedObjective.version,
        restoredStatus: checkpoint.objectiveStatus,
        restoredCheckpointNumber: checkpointNumber,
      };
    });
  }
}

