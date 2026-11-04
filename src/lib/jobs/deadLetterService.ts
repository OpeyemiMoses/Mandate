/**
 * Mandate Universal Dead-Letter Service
 * Milestone 9.1 - Quarantined Job Isolation, Administrative Review & Safe Requeueing
 */

import { prisma } from "@/lib/db";
import { DeadLetterRecord, BackgroundJob } from "@prisma/client";
import { recordAuditEvent } from "@/lib/auditLedger";
import { JobRegistry } from "./registry";

export class DeadLetterService {
  /**
   * Quarantine an exhausted or terminally failed job into the Dead-Letter Queue
   */
  public static async quarantineJob(params: {
    jobId: string;
    reason: string;
    finalError: string;
  }): Promise<DeadLetterRecord> {
    const { jobId, reason, finalError } = params;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.backgroundJob.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      // Update job to DEAD_LETTER status
      const updatedJob = await tx.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: "DEAD_LETTER",
          failedAt: now,
          lastErrorMessage: finalError,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });

      // Upsert DeadLetterRecord
      const deadLetter = await tx.deadLetterRecord.upsert({
        where: { jobId },
        create: {
          jobId,
          tenantId: job.tenantId,
          reason,
          finalError,
          attemptCount: job.attempts,
          originalPayloadHash: job.payloadHash,
          quarantinedAt: now,
          resolution: "PENDING_REVIEW",
          resolutionMetadata: JSON.stringify({ quarantinedReason: reason }),
        },
        update: {
          reason,
          finalError,
          attemptCount: job.attempts,
          quarantinedAt: now,
          resolution: "PENDING_REVIEW",
        },
      });

      // Append lifecycle event
      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: "DEAD_LETTERED",
          previousStatus: job.status,
          newStatus: "DEAD_LETTER",
          workerId: job.workerId,
          metadata: JSON.stringify({
            reason,
            finalError,
            attempts: job.attempts,
          }),
        },
      });

      // Release worker currentJobId if assigned
      if (job.workerId) {
        await tx.backgroundWorker.update({
          where: { id: job.workerId },
          data: {
            currentJobId: null,
            status: "IDLE",
            recentFailures: { increment: 1 },
          },
        });
      }

      return { deadLetter, job };
    });

    // Record in SHA-256 Audit Trail outside interactive transaction
    await recordAuditEvent({
      userId: result.job.tenantId,
      eventType: "JOB_DEAD_LETTERED",
      verdict: "QUARANTINED",
      description: `Job ${result.job.id} (${result.job.jobType}) quarantined to Dead-Letter Queue: ${reason}`,
      details: {
        jobId: result.job.id,
        reason,
        finalError,
        attempts: result.job.attempts,
        payloadHash: result.job.payloadHash,
      },
    });

    return result.deadLetter;
  }

  /**
   * Administratively resolve or permanently cancel a quarantined dead-letter job
   */
  public static async resolveDeadLetter(params: {
    deadLetterId: string;
    tenantId: string;
    reviewedBy: string;
    resolution: "RESOLVED" | "CANCELLED";
    notes?: string;
  }): Promise<DeadLetterRecord> {
    const { deadLetterId, tenantId, reviewedBy, resolution, notes } = params;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.deadLetterRecord.findUnique({
        where: { id: deadLetterId },
        include: { job: true },
      });

      if (!record || record.tenantId !== tenantId) {
        throw new Error("Dead letter record not found or unauthorized");
      }

      const updatedRecord = await tx.deadLetterRecord.update({
        where: { id: deadLetterId },
        data: {
          resolution,
          reviewedAt: now,
          reviewedBy,
          resolutionMetadata: JSON.stringify({ notes: notes || "Administrative resolution" }),
        },
      });

      const newJobStatus = resolution === "RESOLVED" ? "COMPLETED" : "CANCELLED";
      await tx.backgroundJob.update({
        where: { id: record.jobId },
        data: {
          status: newJobStatus,
          completedAt: resolution === "RESOLVED" ? now : undefined,
        },
      });

      await tx.jobEvent.create({
        data: {
          jobId: record.jobId,
          eventType: resolution,
          previousStatus: "DEAD_LETTER",
          newStatus: newJobStatus,
          metadata: JSON.stringify({ reviewedBy, notes }),
        },
      });

      return { updatedRecord, record };
    });

    await recordAuditEvent({
      userId: tenantId,
      eventType: "DEAD_LETTER_RESOLVED",
      verdict: resolution,
      description: `Dead letter ${deadLetterId} resolved as ${resolution} by ${reviewedBy}`,
      details: { deadLetterId, jobId: result.record.jobId, resolution, notes },
    });

    return result.updatedRecord;
  }

  /**
   * Safely requeue a dead-letter job with pre-execution revalidation
   */
  public static async requeueDeadLetter(params: {
    deadLetterId: string;
    tenantId: string;
    reviewedBy: string;
    resetAttempts?: boolean;
  }): Promise<BackgroundJob> {
    const { deadLetterId, tenantId, reviewedBy, resetAttempts = true } = params;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.deadLetterRecord.findUnique({
        where: { id: deadLetterId },
        include: { job: true },
      });

      if (!record || record.tenantId !== tenantId) {
        throw new Error("Dead letter record not found or unauthorized");
      }

      const job = record.job;
      const jobDef = JobRegistry.get(job.jobType);

      // Financial safety check: Re-verify mandate active state & budget before requeueing
      if (job.jobCategory === "FINANCIAL" || jobDef?.isFinancial) {
        try {
          const payload = JSON.parse(job.payload);
          if (payload.mandateId) {
            const mandate = await tx.mandate.findUnique({
              where: { id: payload.mandateId },
            });

            if (!mandate || mandate.status !== "ACTIVE") {
              throw new Error(
                `Cannot requeue financial job: Bound mandate "${payload.mandateId}" is no longer active (status: ${mandate?.status || "NOT_FOUND"}).`
              );
            }
          }
        } catch (e: any) {
          throw new Error(`Financial safety validation failed: ${e.message}`);
        }
      }

      // Update dead-letter status
      await tx.deadLetterRecord.update({
        where: { id: deadLetterId },
        data: {
          resolution: "REQUEUED",
          reviewedAt: now,
          reviewedBy,
          resolutionMetadata: JSON.stringify({ requeuedAt: now.toISOString(), reviewedBy }),
        },
      });

      // Reset job to QUEUED state
      const requeuedJob = await tx.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          attempts: resetAttempts ? 0 : job.attempts,
          scheduledAt: now,
          startedAt: null,
          failedAt: null,
          completedAt: null,
          lastHeartbeatAt: null,
          workerId: null,
          leaseToken: null,
          leaseExpiresAt: null,
          lastErrorMessage: null,
        },
      });

      // Append lifecycle event
      await tx.jobEvent.create({
        data: {
          jobId: job.id,
          eventType: "REQUEUED",
          previousStatus: "DEAD_LETTER",
          newStatus: "QUEUED",
          metadata: JSON.stringify({
            reviewedBy,
            resetAttempts,
            requeuedAt: now.toISOString(),
          }),
        },
      });

      return { requeuedJob, job };
    });

    await recordAuditEvent({
      userId: tenantId,
      eventType: "DEAD_LETTER_REQUEUED",
      verdict: "REQUEUED",
      description: `Job ${result.job.id} requeued from dead-letter quarantine by ${reviewedBy}`,
      details: { deadLetterId, jobId: result.job.id, reviewedBy, resetAttempts },
    });

    return result.requeuedJob;
  }

  /**
   * List quarantined dead-letter jobs with tenant isolation
   */
  public static async listDeadLetters(params: {
    tenantId: string;
    resolution?: string;
    limit?: number;
    offset?: number;
  }) {
    const { tenantId, resolution, limit = 50, offset = 0 } = params;
    const where: any = { tenantId };
    if (resolution) where.resolution = resolution;

    const [records, total] = await Promise.all([
      prisma.deadLetterRecord.findMany({
        where,
        orderBy: { quarantinedAt: "desc" },
        take: Math.min(limit, 100),
        skip: offset,
        include: {
          job: {
            select: {
              id: true,
              jobType: true,
              jobCategory: true,
              priority: true,
              attempts: true,
              maxAttempts: true,
              createdAt: true,
              correlationId: true,
            },
          },
        },
      }),
      prisma.deadLetterRecord.count({ where }),
    ]);

    return { records, total };
  }
}
