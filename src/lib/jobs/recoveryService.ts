/**
 * Mandate Universal Job Recovery Service
 * Milestone 9.1 - Crash Recovery, Abandoned Lease Detection & Financial Reconciliation
 */

import { prisma } from "@/lib/db";
import { BackgroundJob } from "@prisma/client";
import { JobRegistry } from "./registry";
import { DeadLetterService } from "./deadLetterService";
import { ExecutionRecoveryService } from "@/lib/execution/recoveryService";
import { recordAuditEvent } from "@/lib/auditLedger";

export class JobRecoveryService {
  /**
   * Scans for expired/abandoned worker leases and safely recovers eligible jobs
   */
  public static async recoverAbandonedLeases(options?: {
    thresholdSeconds?: number;
  }): Promise<{ recoveredCount: number; jobs: BackgroundJob[] }> {
    const now = new Date();
    const thresholdSeconds = options?.thresholdSeconds ?? 0;
    const cutoffTime = new Date(now.getTime() - thresholdSeconds * 1000);

    // 1. Identify active jobs with expired leases
    const expiredJobs = await prisma.backgroundJob.findMany({
      where: {
        status: { in: ["CLAIMED", "RUNNING"] },
        leaseExpiresAt: { lte: cutoffTime },
      },
      include: {
        worker: true,
      },
    });

    const recovered: BackgroundJob[] = [];

    for (const job of expiredJobs) {
      const jobDef = JobRegistry.get(job.jobType);
      const isFinancial = job.jobCategory === "FINANCIAL" || jobDef?.isFinancial || false;

      // Check if associated worker is dead
      if (job.workerId && job.worker) {
        const workerHeartbeatAge = now.getTime() - job.worker.lastHeartbeatAt.getTime();
        if (workerHeartbeatAge > 45000) {
          // Worker hasn't heartbeated in 45s: mark UNHEALTHY
          await prisma.backgroundWorker.update({
            where: { id: job.workerId },
            data: { status: "UNHEALTHY", currentJobId: null },
          });
        }
      }

      // Handle Financial Jobs with special care (GOLDEN RULE)
      if (isFinancial) {
        // Look up corresponding ExecutionRecord if an idempotency key was used
        let execRecord = null;
        if (job.idempotencyKey) {
          execRecord = await prisma.executionRecord.findFirst({
            where: { idempotencyKey: job.idempotencyKey },
          });
        }

        if (execRecord && (execRecord.status === "REQUIRES_RECOVERY" || execRecord.status === "CONFIRMING" || execRecord.status === "BROADCAST")) {
          // Ambiguous financial execution: DO NOT RETRY OR RELEASE RESERVATION!
          const updated = await prisma.$transaction(async (tx) => {
            const j = await tx.backgroundJob.update({
              where: { id: job.id },
              data: {
                status: "REQUIRES_RECOVERY",
                leaseToken: null,
                leaseExpiresAt: null,
                lastErrorMessage: "Ambiguous on-chain broadcast timeout. Budget held pending RPC reconciliation.",
              },
            });

            await tx.jobEvent.create({
              data: {
                jobId: job.id,
                eventType: "REQUIRES_RECOVERY",
                previousStatus: job.status,
                newStatus: "REQUIRES_RECOVERY",
                metadata: JSON.stringify({
                  executionRecordId: execRecord?.id,
                  status: execRecord?.status,
                  reason: "Ambiguous post-broadcast timeout",
                }),
              },
            });

            return j;
          });

          // Attempt recovery via M8 ExecutionRecoveryService
          try {
            await ExecutionRecoveryService.recoverExecution(execRecord.id);
          } catch {
            // Ignore background polling errors
          }

          recovered.push(updated);
          continue;
        }
      }

      // Non-financial or clean failure recovery
      if (job.attempts >= job.maxAttempts) {
        // Exhausted attempts: Quarantine to Dead Letter
        await DeadLetterService.quarantineJob({
          jobId: job.id,
          reason: "MAX_ATTEMPTS_EXCEEDED_DURING_ABANDONED_LEASE",
          finalError: `Worker lease expired and max attempts (${job.maxAttempts}) reached.`,
        });
      } else {
        // Reset to RETRY_WAIT / QUEUED for clean retry
        const updated = await prisma.$transaction(async (tx) => {
          const j = await tx.backgroundJob.update({
            where: { id: job.id },
            data: {
              status: "RETRY_WAIT",
              leaseToken: null,
              leaseExpiresAt: null,
              workerId: null,
              scheduledAt: new Date(now.getTime() + 5000), // Retry in 5s
              lastErrorMessage: "Recovered from abandoned/expired worker lease",
            },
          });

          await tx.jobEvent.create({
            data: {
              jobId: job.id,
              eventType: "RECOVERED",
              previousStatus: job.status,
              newStatus: "RETRY_WAIT",
              metadata: JSON.stringify({
                recoveredFromWorkerId: job.workerId,
                attemptNumber: job.attempts,
              }),
            },
          });

          return j;
        });

        await recordAuditEvent({
          userId: job.tenantId,
          eventType: "JOB_RECOVERED",
          verdict: "RECOVERED",
          description: `Job ${job.id} recovered from expired worker lease`,
          details: { jobId: job.id, previousWorkerId: job.workerId },
        });

        recovered.push(updated);
      }
    }

    return { recoveredCount: recovered.length, jobs: recovered };
  }

  /**
   * Reconcile a job trapped in REQUIRES_RECOVERY status
   */
  public static async reconcileRecoveryJob(jobId: string, tenantId: string) {
    const job = await prisma.backgroundJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new Error(`Job not found or unauthorized: ${jobId}`);
    }

    if (job.status !== "REQUIRES_RECOVERY") {
      throw new Error(`Job ${jobId} is not in REQUIRES_RECOVERY status (status: ${job.status})`);
    }

    if (!job.idempotencyKey) {
      throw new Error("Cannot reconcile job without idempotencyKey");
    }

    const execRecord = await prisma.executionRecord.findFirst({
      where: { idempotencyKey: job.idempotencyKey },
    });

    if (!execRecord) {
      throw new Error("No corresponding ExecutionRecord found to reconcile");
    }

    const report = await ExecutionRecoveryService.recoverExecution(execRecord.id);

    if (report.status === "CONFIRMED") {
      await prisma.$transaction(async (tx) => {
        await tx.backgroundJob.update({
          where: { id: jobId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });

        await tx.jobEvent.create({
          data: {
            jobId,
            eventType: "COMPLETED",
            previousStatus: "REQUIRES_RECOVERY",
            newStatus: "COMPLETED",
            metadata: JSON.stringify({ reconciledTxHash: report.txHash }),
          },
        });
      });
    } else if (report.status === "FAILED") {
      await DeadLetterService.quarantineJob({
        jobId,
        reason: "ON_CHAIN_EXECUTION_FAILED",
        finalError: report.notes,
      });
    }

    return report;
  }
}

