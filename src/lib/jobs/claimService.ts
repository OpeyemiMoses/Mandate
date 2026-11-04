/**
 * Mandate Universal Job Claim Service
 * Milestone 9.1 - Atomic Database-Backed Job Claiming & Exclusivity
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { BackgroundJob } from "@prisma/client";
import { ClaimJobResult } from "./types";
import { OperationalControlService } from "@/lib/operations/operationalControlService";

export class JobClaimService {
  /**
   * Atomically claim the next highest priority eligible job matching worker capabilities
   */
  public static async claimNextJob(params: {
    workerId: string;
    workerCapabilities: string[];
    leaseTtlSeconds?: number;
  }): Promise<ClaimJobResult> {
    const { workerId, workerCapabilities, leaseTtlSeconds = 30 } = params;

    // OPERATIONAL CONTROL PLANE CHECK (Milestone 9.4)
    const opMode = await OperationalControlService.getCurrentMode();
    if (opMode === "MAINTENANCE_MODE" || opMode === "SECURITY_LOCKDOWN") {
      return { claimed: false, reason: "OPERATIONAL_CONTROL_PAUSED" };
    }

    const now = new Date();
    const newLeaseToken = crypto.randomBytes(16).toString("hex");
    const leaseExpiresAt = new Date(now.getTime() + leaseTtlSeconds * 1000);

    return await prisma.$transaction(async (tx) => {
      // 1. Verify worker is active and not stopped or draining
      const worker = await tx.backgroundWorker.findUnique({
        where: { id: workerId },
      });

      if (!worker) {
        return { claimed: false, reason: "WORKER_NOT_FOUND" };
      }

      if (worker.status === "DRAINING" || worker.status === "STOPPED") {
        return { claimed: false, reason: "WORKER_DRAINING_OR_STOPPED" };
      }

      // 2. Build capability & operational query
      const capabilityFilter: any = {};
      if (!workerCapabilities.includes("*")) {
        capabilityFilter.jobType = { in: workerCapabilities };
      }
      if (opMode === "FINANCIAL_EXECUTION_PAUSED") {
        capabilityFilter.jobCategory = { not: "FINANCIAL" };
      }

      // 3. Find candidate jobs that are eligible for claiming
      // Status in [QUEUED, SCHEDULED, RETRY_WAIT]
      // scheduledAt <= now
      // Not locked by an active unexpired lease
      const candidates = await tx.backgroundJob.findMany({
        where: {
          status: { in: ["QUEUED", "SCHEDULED", "RETRY_WAIT", "CLAIMED", "RUNNING"] },
          scheduledAt: { lte: now },
          ...capabilityFilter,
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: now } },
          ],
        },
        orderBy: [
          { priority: "desc" },
          { scheduledAt: "asc" },
          { createdAt: "asc" },
        ],
        take: 1,
      });

      if (candidates.length === 0) {
        return { claimed: false, reason: "NO_ELIGIBLE_JOBS" };
      }

      const job = candidates[0];

      // 4. Double-check max attempts boundary
      if (job.attempts >= job.maxAttempts) {
        return { claimed: false, reason: "MAX_ATTEMPTS_EXCEEDED" };
      }

      const nextAttemptNumber = job.attempts + 1;
      const currentGeneration = job.leaseGeneration ?? 0;
      const nextGeneration = currentGeneration + 1;

      // 5. Atomic CAS Claim Transition: update job with exclusive lease, monotonic generation, and worker assignment
      // Ensures that if another worker concurrently claimed this row or generation shifted, count will be 0
      const updateResult = await tx.backgroundJob.updateMany({
        where: {
          id: job.id,
          leaseGeneration: currentGeneration,
          status: { in: ["QUEUED", "SCHEDULED", "RETRY_WAIT", "CLAIMED", "RUNNING"] },
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: now } },
          ],
        },
        data: {
          status: "CLAIMED",
          workerId,
          leaseToken: newLeaseToken,
          leaseGeneration: nextGeneration,
          leaseExpiresAt,
          attempts: nextAttemptNumber,
          startedAt: now,
          lastHeartbeatAt: now,
        },
      });

      if (updateResult.count === 0) {
        return { claimed: false, reason: "CONCURRENT_CLAIM_CONFLICT" };
      }

      const updatedJob = await tx.backgroundJob.findUnique({
        where: { id: job.id },
      });

      // 6. Create JobAttempt Record
      await tx.jobAttempt.create({
        data: {
          jobId: job.id,
          workerId,
          attemptNumber: nextAttemptNumber,
          startedAt: now,
          outcome: "RUNNING",
          correlationId: job.correlationId,
        },
      });

      // 7. Append Claimed Lifecycle Event
      await tx.jobEvent.create({
        data: {
          jobId: job.id,
          eventType: "CLAIMED",
          previousStatus: job.status,
          newStatus: "CLAIMED",
          workerId,
          metadata: JSON.stringify({
            attemptNumber: nextAttemptNumber,
            leaseToken: newLeaseToken,
            leaseExpiresAt: leaseExpiresAt.toISOString(),
          }),
        },
      });

      // 8. Update Worker status to BUSY
      await tx.backgroundWorker.update({
        where: { id: workerId },
        data: {
          status: "BUSY",
          currentJobId: job.id,
          lastHeartbeatAt: now,
        },
      });

      return {
        claimed: true,
        job: updatedJob,
        leaseToken: newLeaseToken,
        leaseGeneration: nextGeneration,
        leaseExpiresAt,
        attemptNumber: nextAttemptNumber,
      };
    });
  }

  /**
   * Renew an active lease while processing a long-running job
   */
  public static async renewLease(params: {
    jobId: string;
    workerId: string;
    leaseToken: string;
    leaseGeneration?: number;
    ttlSeconds?: number;
  }): Promise<{ renewed: boolean; leaseExpiresAt?: Date; error?: string }> {
    const { jobId, workerId, leaseToken, leaseGeneration, ttlSeconds = 30 } = params;
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    return await prisma.$transaction(async (tx) => {
      const job = await tx.backgroundJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return { renewed: false, error: "JOB_NOT_FOUND" };
      }

      // Monotonic generation check: must match active lease generation
      if (leaseGeneration !== undefined && job.leaseGeneration !== leaseGeneration) {
        return {
          renewed: false,
          error: `STALE_LEASE_GENERATION: Expected generation ${leaseGeneration}, found ${job.leaseGeneration}`,
        };
      }

      // Concurrency check: worker must match and token must match
      if (job.workerId !== workerId || job.leaseToken !== leaseToken) {
        return {
          renewed: false,
          error: "LEASE_LOST_OR_REASSIGNED: Current worker does not hold valid lease token",
        };
      }

      if (job.status !== "CLAIMED" && job.status !== "RUNNING") {
        return {
          renewed: false,
          error: `JOB_NOT_ACTIVE: Job is in "${job.status}" status, cannot renew lease`,
        };
      }

      await tx.backgroundJob.update({
        where: { id: jobId },
        data: {
          leaseExpiresAt: newExpiresAt,
          lastHeartbeatAt: now,
        },
      });

      await tx.backgroundWorker.update({
        where: { id: workerId },
        data: { lastHeartbeatAt: now },
      });

      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: "HEARTBEAT",
          previousStatus: job.status,
          newStatus: job.status,
          workerId,
          metadata: JSON.stringify({
            leaseExpiresAt: newExpiresAt.toISOString(),
          }),
        },
      });

      return { renewed: true, leaseExpiresAt: newExpiresAt };
    });
  }

  /**
   * Verify if a worker currently holds an unexpired lease for a job (fencing check)
   */
  public static async isLeaseValid(params: {
    jobId: string;
    workerId: string;
    leaseToken: string;
  }): Promise<boolean> {
    const { jobId, workerId, leaseToken } = params;
    const now = new Date();
    const job = await prisma.backgroundJob.findFirst({
      where: {
        id: jobId,
        workerId,
        leaseToken,
        status: { in: ["CLAIMED", "RUNNING"] },
        leaseExpiresAt: { gt: now },
      },
      select: { id: true },
    });
    return !!job;
  }

  /**
   * Safely release lease upon job completion or relinquishment
   */
  public static async releaseLease(params: {
    jobId: string;
    workerId: string;
    leaseToken: string;
    leaseGeneration?: number;
  }): Promise<boolean> {
    const { jobId, workerId, leaseToken, leaseGeneration } = params;

    return await prisma.$transaction(async (tx) => {
      const job = await tx.backgroundJob.findUnique({
        where: { id: jobId },
      });

      if (!job || job.workerId !== workerId || job.leaseToken !== leaseToken) {
        return false;
      }

      if (leaseGeneration !== undefined && job.leaseGeneration !== leaseGeneration) {
        return false;
      }

      await tx.backgroundJob.update({
        where: { id: jobId },
        data: {
          leaseExpiresAt: null,
          leaseToken: null,
        },
      });

      return true;
    });
  }
}
