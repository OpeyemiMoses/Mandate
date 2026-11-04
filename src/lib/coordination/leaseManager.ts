import crypto from "crypto";
import { prisma } from "@/lib/db";
import { emitCoordinationEvent } from "./events";

export interface AcquireLeaseResult {
  acquired: boolean;
  leaseToken?: string;
  expiresAt?: Date;
  recovered?: boolean;
  reason?: string;
  heldBy?: string;
}

export interface LeaseHeartbeatResult {
  renewed: boolean;
  expiresAt?: Date;
  error?: string;
}

/**
 * Database-Backed Distributed Lease Manager
 * Enforces strict worker exclusivity across multiple application instances,
 * prevents concurrent double-execution of tasks, and safely recovers abandoned leases.
 */
export class TaskLeaseManager {
  /**
   * Atomically acquire or recover an exclusive database-backed task lease
   */
  public static async acquireLease(params: {
    taskId: string;
    runId: string;
    workerId: string;
    userId: string;
    ttlSeconds?: number;
  }): Promise<AcquireLeaseResult> {
    const { taskId, runId, workerId, userId, ttlSeconds = 30 } = params;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const newLeaseToken = crypto.randomBytes(16).toString("hex");

    return await prisma.$transaction(async (tx) => {
      // 1. Fetch task and existing lease
      const task = await tx.coordinationTask.findUnique({
        where: { id: taskId },
        include: { lease: true, run: true },
      });

      if (!task || task.runId !== runId) {
        return { acquired: false, reason: "TASK_NOT_FOUND" };
      }

      if (task.run.userId !== userId) {
        return { acquired: false, reason: "UNAUTHORIZED" };
      }

      const existingLease = task.lease;

      // Case A: No prior lease exists
      if (!existingLease) {
        await tx.taskLease.create({
          data: {
            taskId,
            runId,
            workerId,
            leaseToken: newLeaseToken,
            acquiredAt: now,
            expiresAt,
            heartbeatCount: 0,
            isReleased: false,
          },
        });

        return { acquired: true, leaseToken: newLeaseToken, expiresAt, recovered: false };
      }

      // Case B: Existing lease is expired or released -> Reclaim/Recover
      const isExpired = existingLease.expiresAt.getTime() < now.getTime();
      if (existingLease.isReleased || isExpired) {
        await tx.taskLease.update({
          where: { taskId },
          data: {
            workerId,
            leaseToken: newLeaseToken,
            acquiredAt: now,
            expiresAt,
            heartbeatCount: 0,
            isReleased: false,
          },
        });

        return {
          acquired: true,
          leaseToken: newLeaseToken,
          expiresAt,
          recovered: isExpired,
        };
      }

      // Case C: Same worker extending lease
      if (existingLease.workerId === workerId) {
        await tx.taskLease.update({
          where: { taskId },
          data: {
            expiresAt,
            heartbeatCount: { increment: 1 },
          },
        });

        return {
          acquired: true,
          leaseToken: existingLease.leaseToken,
          expiresAt,
          recovered: false,
        };
      }

      // Case D: Conflict - actively held by another live worker
      return {
        acquired: false,
        reason: "LEASE_CONFLICT",
        heldBy: existingLease.workerId,
        expiresAt: existingLease.expiresAt,
      };
    });
  }

  /**
   * Heartbeat to extend lease TTL while task execution progresses
   */
  public static async heartbeatLease(params: {
    taskId: string;
    workerId: string;
    leaseToken: string;
    ttlSeconds?: number;
  }): Promise<LeaseHeartbeatResult> {
    const { taskId, workerId, leaseToken, ttlSeconds = 30 } = params;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const updated = await prisma.taskLease.updateMany({
      where: {
        taskId,
        workerId,
        leaseToken,
        isReleased: false,
      },
      data: {
        expiresAt,
        heartbeatCount: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      return { renewed: false, error: "Lease lost or expired" };
    }

    return { renewed: true, expiresAt };
  }

  /**
   * Release task lease upon task completion, failure, or cancellation
   */
  public static async releaseLease(params: {
    taskId: string;
    workerId: string;
    leaseToken: string;
  }): Promise<boolean> {
    const { taskId, workerId, leaseToken } = params;

    const updated = await prisma.taskLease.updateMany({
      where: {
        taskId,
        workerId,
        leaseToken,
      },
      data: {
        isReleased: true,
      },
    });

    return updated.count > 0;
  }

  /**
   * Scan and recover tasks whose leases expired due to worker crashes or node timeouts
   */
  public static async recoverAbandonedLeases(runId: string, userId: string): Promise<number> {
    const now = new Date();

    const expiredLeases = await prisma.taskLease.findMany({
      where: {
        runId,
        isReleased: false,
        expiresAt: { lt: now },
        task: {
          run: { userId },
          status: { in: ["RUNNING", "ASSIGNED"] },
        },
      },
      include: { task: true },
    });

    let recoveredCount = 0;

    for (const lease of expiredLeases) {
      const task = lease.task;

      // Invalidate the abandoned lease
      await prisma.taskLease.update({
        where: { id: lease.id },
        data: { isReleased: true },
      });

      const nextRetries = task.retryCount + 1;
      const willRetry = nextRetries <= task.maxRetries;

      await prisma.coordinationTask.update({
        where: { id: task.id },
        data: {
          status: willRetry ? "READY" : "FAILED",
          retryCount: nextRetries,
          errorDetails: `Recovered abandoned lease from worker "${lease.workerId}" (expired at ${lease.expiresAt.toISOString()})`,
        },
      });

      await emitCoordinationEvent({
        runId,
        objectiveId: task.runId,
        userId,
        taskId: task.id,
        agentId: task.assignedAgentId,
        eventType: "coordination.lease_recovered",
        metadata: {
          abandonedWorker: lease.workerId,
          expiredAt: lease.expiresAt.toISOString(),
          willRetry,
          retryCount: nextRetries,
        },
        recordInAuditChain: true,
      });

      recoveredCount++;
    }

    return recoveredCount;
  }
}
