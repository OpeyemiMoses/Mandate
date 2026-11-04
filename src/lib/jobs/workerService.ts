/**
 * Mandate Universal Job Worker Service
 * Milestone 9.1 - Worker Process Lifecycle, Execution Loop & Graceful Shutdown
 */

import os from "os";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { BackgroundWorker, BackgroundJob } from "@prisma/client";
import { JobClaimService } from "./claimService";
import { JobRegistry } from "./registry";
import { JobRetryService } from "./retryService";
import { DeadLetterService } from "./deadLetterService";
import { recordAuditEvent } from "@/lib/auditLedger";
import {
  withSpan,
  jobCompletionCounter,
  jobFailureCounter,
  jobProcessingDurationHistogram,
} from "@/lib/observability";

export interface WorkerOptions {
  workerName?: string;
  workerType?: string;
  capabilities?: string[];
  instanceId?: string;
  pollIntervalMs?: number;
  leaseTtlSeconds?: number;
  maxConcurrency?: number;
}

export class JobWorkerService {
  private workerRecord: BackgroundWorker | null = null;
  private isRunning: boolean = false;
  private isDraining: boolean = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pollTimeout: NodeJS.Timeout | null = null;
  private activeAbortController: AbortController | null = null;

  constructor(private options: WorkerOptions = {}) {}

  /**
   * Register worker in database and return persistent record
   */
  public async registerWorker(): Promise<BackgroundWorker> {
    const hostname = os.hostname();
    const pid = process.pid;
    const instanceId =
      this.options.instanceId ||
      `inst_${hostname}_${pid}_${crypto.randomBytes(6).toString("hex")}`;
    const workerName = this.options.workerName || `worker_${hostname}_${pid}`;
    const capabilities = this.options.capabilities || ["*"];

    const worker = await prisma.backgroundWorker.upsert({
      where: { instanceId },
      create: {
        workerName,
        workerType: this.options.workerType || "STANDARD",
        instanceId,
        status: "STARTING",
        capabilities: JSON.stringify(capabilities),
        maxConcurrency: this.options.maxConcurrency || 1,
        activeSlots: 0,
        pollIntervalMs: this.options.pollIntervalMs || 1000,
        lastHeartbeatAt: new Date(),
        startedAt: new Date(),
      },
      update: {
        workerName,
        status: "STARTING",
        capabilities: JSON.stringify(capabilities),
        maxConcurrency: this.options.maxConcurrency || 1,
        activeSlots: 0,
        pollIntervalMs: this.options.pollIntervalMs || 1000,
        lastHeartbeatAt: new Date(),
        stoppedAt: null,
      },
    });

    this.workerRecord = worker;
    return worker;
  }

  /**
   * Start worker processing loop
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;

    if (!this.workerRecord) {
      await this.registerWorker();
    }

    this.isRunning = true;
    this.isDraining = false;

    // Transition worker to IDLE
    await prisma.backgroundWorker.update({
      where: { id: this.workerRecord!.id },
      data: { status: "IDLE", lastHeartbeatAt: new Date() },
    });

    // Start background heartbeat publisher (every 10s)
    this.startHeartbeatPublisher();

    // Start polling loop
    this.pollLoop();
  }

  /**
   * Publish periodic heartbeats to maintain active worker status
   */
  private startHeartbeatPublisher(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    this.heartbeatTimer = setInterval(async () => {
      if (!this.workerRecord) return;
      try {
        await prisma.backgroundWorker.update({
          where: { id: this.workerRecord.id },
          data: { lastHeartbeatAt: new Date() },
        });
      } catch {
        // Silently ignore transient DB hiccups during heartbeat
      }
    }, 10000);
  }

  /**
   * Main job processing and claim polling loop
   */
  private async pollLoop(): Promise<void> {
    if (!this.isRunning || this.isDraining) return;

    const capabilities: string[] = JSON.parse(this.workerRecord?.capabilities || "[\"*\"]");
    const leaseTtlSeconds = this.options.leaseTtlSeconds ?? 30;
    const pollIntervalMs = this.options.pollIntervalMs ?? 1000;

    try {
      // 1. Attempt to claim next eligible job
      const claimResult = await JobClaimService.claimNextJob({
        workerId: this.workerRecord!.id,
        workerCapabilities: capabilities,
        leaseTtlSeconds,
      });

      if (claimResult.claimed && claimResult.job && claimResult.leaseToken) {
        // 2. Process claimed job
        await this.processJob(claimResult.job, claimResult.leaseToken, claimResult.attemptNumber || 1, claimResult.leaseGeneration);
      }
    } catch {
      // Ignore polling errors to prevent worker crash
    }

    // Schedule next polling cycle if still running
    if (this.isRunning && !this.isDraining) {
      this.pollTimeout = setTimeout(() => this.pollLoop(), pollIntervalMs);
    }
  }

  /**
   * Safely execute a claimed job within fail-closed boundaries and lease renewals
   */
  public async processJob(
    job: BackgroundJob,
    leaseToken: string,
    attemptNumber: number,
    leaseGeneration?: number
  ): Promise<void> {
    const startTime = Date.now();
    this.activeAbortController = new AbortController();
    const activeGeneration = leaseGeneration ?? job.leaseGeneration ?? 1;

    // 0. Payload integrity check (prevent tampering in database)
    const directHash = crypto.createHash("sha256").update(job.payload).digest("hex");
    let canonicalHash: string | null = null;
    try {
      const parsed = JSON.parse(job.payload);
      const { canonicalize } = await import("@/lib/auditLedger");
      canonicalHash = crypto.createHash("sha256").update(JSON.stringify(canonicalize(parsed)), "utf8").digest("hex");
    } catch {}

    if (job.payloadHash !== directHash && job.payloadHash !== canonicalHash) {
      await recordAuditEvent({
        userId: job.tenantId,
        eventType: "JOB_PAYLOAD_TAMPERING_DETECTED",
        verdict: "DENIED",
        description: `Job ${job.id} payload hash mismatch. Expected ${directHash}, found ${job.payloadHash}`,
        details: { jobId: job.id, payloadHash: job.payloadHash, expectedHash: directHash },
      });
      throw new Error(`PAYLOAD_TAMPERED: Job payload hash mismatch for job ${job.id}`);
    }

    // 1. Update job to RUNNING status with CAS fencing check and mark worker active slot
    const runningUpdate = await prisma.backgroundJob.updateMany({
      where: {
        id: job.id,
        workerId: this.workerRecord!.id,
        leaseToken: leaseToken,
        leaseGeneration: activeGeneration,
        status: "CLAIMED",
        leaseExpiresAt: { gt: new Date() },
      },
      data: { status: "RUNNING" },
    });

    if (runningUpdate.count === 0) {
      throw new Error(
        `STALE_LEASE_REJECTED: Worker ${this.workerRecord!.id} lost lease before transitioning job ${job.id} to RUNNING`
      );
    }

    await prisma.jobEvent.create({
      data: {
        jobId: job.id,
        eventType: "STARTED",
        previousStatus: "CLAIMED",
        newStatus: "RUNNING",
        workerId: this.workerRecord!.id,
        metadata: JSON.stringify({ attemptNumber, leaseToken, leaseGeneration: activeGeneration }),
      },
    });

    await prisma.backgroundWorker.update({
      where: { id: this.workerRecord!.id },
      data: { activeSlots: 1, currentJobId: job.id, status: "BUSY" },
    });

    // 2. Start automatic lease renewal timer while processing
    const leaseRenewalInterval = setInterval(async () => {
      try {
        await JobClaimService.renewLease({
          jobId: job.id,
          workerId: this.workerRecord!.id,
          leaseToken,
          leaseGeneration: activeGeneration,
          ttlSeconds: this.options.leaseTtlSeconds ?? 30,
        });
      } catch {
        // Lease renewal failure
      }
    }, 10000);

    let executionError: any = null;
    let executionResult: any = null;

    try {
      await withSpan(
        "job.execute",
        async (span) => {
          span.setAttributes({
            "mandate.job_id": job.id,
            "mandate.job_type": job.jobType,
            "mandate.worker_id": this.workerRecord!.id,
            "mandate.correlation_id": job.correlationId,
            "mandate.attempt_number": attemptNumber,
          });

          // 3. Resolve Job Definition
          const jobDef = JobRegistry.get(job.jobType);
          if (!jobDef) {
            throw new Error(
              `Unregistered job type "${job.jobType}". Execution is prohibited by policy.`
            );
          }

          // Pre-execution ownership fencing check
          const isOwner = await JobClaimService.isLeaseValid({
            jobId: job.id,
            workerId: this.workerRecord!.id,
            leaseToken,
          });
          if (!isOwner) {
            throw new Error(
              `STALE_LEASE_REJECTED: Worker ${this.workerRecord!.id} lost lease before handler execution`
            );
          }

          // 4. Parse validated payload
          const payload = JSON.parse(job.payload);

          // 5. Execute Handler with ownership fencing verification helpers
          executionResult = await jobDef.handler({
            job,
            payload,
            workerId: this.workerRecord!.id,
            leaseToken,
            leaseGeneration: activeGeneration,
            correlationId: job.correlationId,
            signal: this.activeAbortController!.signal,
            heartbeat: async () => {
              const res = await JobClaimService.renewLease({
                jobId: job.id,
                workerId: this.workerRecord!.id,
                leaseToken,
                leaseGeneration: activeGeneration,
              });
              return res.renewed;
            },
            verifyOwnership: async () => {
              const current = await prisma.backgroundJob.findUnique({
                where: { id: job.id },
                select: { workerId: true, leaseToken: true, leaseGeneration: true, leaseExpiresAt: true },
              });
              return (
                current?.workerId === this.workerRecord!.id &&
                current?.leaseToken === leaseToken &&
                current?.leaseGeneration === activeGeneration &&
                current?.leaseExpiresAt !== null &&
                current!.leaseExpiresAt! > new Date()
              );
            },
          });

          if (!executionResult.success) {
            throw new Error(executionResult.error || "Handler reported non-success");
          }
        },
        {
          parentTraceParent: job.traceParent,
          attributes: {
            "mandate.job_id": job.id,
            "mandate.job_type": job.jobType,
            "mandate.worker_id": this.workerRecord!.id,
            "mandate.correlation_id": job.correlationId,
            "mandate.attempt_number": attemptNumber,
          },
        }
      );
    } catch (err: any) {
      executionError = err;
    } finally {
      clearInterval(leaseRenewalInterval);
      this.activeAbortController = null;
    }

    const durationMs = Date.now() - startTime;
    const now = new Date();

    // 6. Handle Completion or Failure
    if (!executionError && executionResult?.success) {
      // SUCCESS: Mark COMPLETED with atomic CAS fencing check
      let staleRejected = false;
      await prisma.$transaction(async (tx) => {
        const updateRes = await tx.backgroundJob.updateMany({
          where: {
            id: job.id,
            workerId: this.workerRecord!.id,
            leaseToken: leaseToken,
            leaseGeneration: activeGeneration,
            status: "RUNNING",
            leaseExpiresAt: { gt: now },
          },
          data: {
            status: "COMPLETED",
            completedAt: now,
            leaseToken: null,
            leaseExpiresAt: null,
          },
        });

        if (updateRes.count === 0) {
          staleRejected = true;
          // Stale worker completion rejected! Another worker or recovery reclaimed this job!
          await tx.jobEvent.create({
            data: {
              jobId: job.id,
              eventType: "STALE_COMPLETION_REJECTED",
              previousStatus: "RUNNING",
              newStatus: "RUNNING",
              workerId: this.workerRecord!.id,
              metadata: JSON.stringify({
                reason: "STALE_LEASE_REJECTED: Worker lost lease before job completion commit",
                attemptNumber,
                staleWorkerId: this.workerRecord!.id,
              }),
            },
          });
          return;
        }

        // Update JobAttempt record
        const attempt = await tx.jobAttempt.findFirst({
          where: { jobId: job.id, attemptNumber },
          orderBy: { startedAt: "desc" },
        });

        if (attempt) {
          await tx.jobAttempt.update({
            where: { id: attempt.id },
            data: {
              outcome: "SUCCESS",
              finishedAt: now,
              durationMs,
            },
          });
        }

        // Append COMPLETED event
        await tx.jobEvent.create({
          data: {
            jobId: job.id,
            eventType: "COMPLETED",
            previousStatus: "RUNNING",
            newStatus: "COMPLETED",
            workerId: this.workerRecord!.id,
            metadata: JSON.stringify({
              durationMs,
              txHash: executionResult?.txHash,
            }),
          },
        });

        // Update worker stats
        await tx.backgroundWorker.update({
          where: { id: this.workerRecord!.id },
          data: {
            currentJobId: null,
            status: "IDLE",
            activeSlots: 0,
            jobsProcessed: { increment: 1 },
          },
        });
      });

      if (staleRejected) {
        await recordAuditEvent({
          userId: job.tenantId,
          eventType: "STALE_WORKER_COMPLETION_REJECTED",
          verdict: "DENIED",
          description: `Stale worker ${this.workerRecord!.id} attempted completion of job ${job.id} without valid lease`,
          details: { jobId: job.id, workerId: this.workerRecord!.id, attemptNumber },
        });
        throw new Error(`STALE_LEASE_REJECTED: Worker ${this.workerRecord!.id} lost lease for job ${job.id}`);
      }

      // Record OpenTelemetry Metrics
      try {
        jobCompletionCounter.add(1, { jobType: job.jobType });
        jobProcessingDurationHistogram.record(durationMs, {
          jobType: job.jobType,
          status: "SUCCESS",
        });
      } catch {
        // Telemetry failure cannot disrupt job completion
      }

      await recordAuditEvent({
        userId: job.tenantId,
        eventType: "JOB_COMPLETED",
        verdict: "SUCCESS",
        description: `Job ${job.id} (${job.jobType}) completed successfully in ${durationMs}ms`,
        details: { jobId: job.id, attemptNumber, durationMs, txHash: executionResult?.txHash },
      });
    } else {
      // If error is STALE_LEASE_REJECTED, the worker does NOT own the job anymore and cannot mutate it
      if (executionError?.message?.includes("STALE_LEASE_REJECTED")) {
        await prisma.backgroundWorker.update({
          where: { id: this.workerRecord!.id },
          data: {
            currentJobId: null,
            status: "IDLE",
            activeSlots: 0,
            recentFailures: { increment: 1 },
          },
        });
        await recordAuditEvent({
          userId: job.tenantId,
          eventType: "STALE_WORKER_COMPLETION_REJECTED",
          verdict: "DENIED",
          description: `Stale worker ${this.workerRecord!.id} lease rejected for job ${job.id}: ${executionError.message}`,
          details: { jobId: job.id, workerId: this.workerRecord!.id, attemptNumber },
        });
        throw executionError;
      }

      // FAILURE HANDLING
      const jobDef = JobRegistry.get(job.jobType);
      const failureClassification = JobRetryService.classifyFailure(executionError, jobDef);

      await prisma.$transaction(async (tx) => {
        // Record Attempt outcome
        const attempt = await tx.jobAttempt.findFirst({
          where: { jobId: job.id, attemptNumber },
          orderBy: { startedAt: "desc" },
        });

        if (attempt) {
          await tx.jobAttempt.update({
            where: { id: attempt.id },
            data: {
              outcome: failureClassification.isRetryable ? "RETRYABLE_ERROR" : "FAILED",
              errorCode: failureClassification.errorCode,
              errorMessage: failureClassification.errorMessage,
              finishedAt: now,
              durationMs,
            },
          });
        }

        // Release worker currentJobId and slot
        await tx.backgroundWorker.update({
          where: { id: this.workerRecord!.id },
          data: {
            currentJobId: null,
            status: "IDLE",
            activeSlots: 0,
            recentFailures: { increment: 1 },
          },
        });
      });

      // Record OpenTelemetry Failure Metrics
      try {
        jobFailureCounter.add(1, {
          jobType: job.jobType,
          errorCode: failureClassification.errorCode || "ERROR",
        });
        jobProcessingDurationHistogram.record(durationMs, {
          jobType: job.jobType,
          status: "FAILED",
        });
      } catch {
        // Telemetry failure cannot disrupt job failure handling
      }

      // Special Case: Ambiguous post-broadcast timeout requiring recovery
      if (executionResult?.requiresRecovery) {
        await prisma.$transaction(async (tx) => {
          const casRes = await tx.backgroundJob.updateMany({
            where: {
              id: job.id,
              workerId: this.workerRecord!.id,
              leaseToken: leaseToken,
            },
            data: {
              status: "REQUIRES_RECOVERY",
              lastErrorCode: "AMBIGUOUS_BROADCAST_TIMEOUT",
              lastErrorMessage: executionResult.error,
              leaseToken: null,
              leaseExpiresAt: null,
            },
          });

          if (casRes.count > 0) {
            await tx.jobEvent.create({
              data: {
                jobId: job.id,
                eventType: "REQUIRES_RECOVERY",
                previousStatus: "RUNNING",
                newStatus: "REQUIRES_RECOVERY",
                workerId: this.workerRecord!.id,
                metadata: JSON.stringify({ error: executionResult.error }),
              },
            });
          }
        });
        return;
      }

      // Check if eligible for retry
      const canRetry = failureClassification.isRetryable && attemptNumber < job.maxAttempts;

      if (canRetry) {
        const backoffMs = JobRetryService.calculateBackoff(
          attemptNumber + 1,
          jobDef?.retryPolicy
        );
        const nextScheduledAt = new Date(now.getTime() + backoffMs);

        let scheduled = false;
        await prisma.$transaction(async (tx) => {
          const casRes = await tx.backgroundJob.updateMany({
            where: {
              id: job.id,
              workerId: this.workerRecord!.id,
              leaseToken: leaseToken,
            },
            data: {
              status: "RETRY_WAIT",
              scheduledAt: nextScheduledAt,
              lastErrorCode: failureClassification.errorCode,
              lastErrorMessage: failureClassification.errorMessage,
              leaseToken: null,
              leaseExpiresAt: null,
            },
          });

          if (casRes.count > 0) {
            scheduled = true;
            await tx.jobEvent.create({
              data: {
                jobId: job.id,
                eventType: "RETRY_WAIT",
                previousStatus: "RUNNING",
                newStatus: "RETRY_WAIT",
                workerId: this.workerRecord!.id,
                metadata: JSON.stringify({
                  attemptNumber,
                  nextScheduledAt: nextScheduledAt.toISOString(),
                  backoffMs,
                  error: failureClassification.errorMessage,
                }),
              },
            });
          }
        });

        if (scheduled) {
          await recordAuditEvent({
            userId: job.tenantId,
            eventType: "JOB_RETRY_SCHEDULED",
            verdict: "RETRY",
            description: `Job ${job.id} retry scheduled for ${nextScheduledAt.toISOString()}`,
            details: { jobId: job.id, attemptNumber, backoffMs },
          });
        }
      } else {
        // Exceeded max attempts or non-retryable fatal error: Quarantine to Dead Letter
        await DeadLetterService.quarantineJob({
          jobId: job.id,
          reason: failureClassification.isRetryable
            ? "MAX_ATTEMPTS_EXCEEDED"
            : failureClassification.errorCode,
          finalError: failureClassification.errorMessage,
        });
      }
    }
  }

  /**
   * Graceful draining: stop claiming new jobs, allow current job to finish
   */
  public async drain(): Promise<void> {
    this.isDraining = true;
    if (this.workerRecord) {
      await prisma.backgroundWorker.update({
        where: { id: this.workerRecord.id },
        data: { status: "DRAINING" },
      });
    }
  }

  /**
   * Stop worker completely
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    this.isDraining = true;

    if (this.pollTimeout) clearTimeout(this.pollTimeout);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }

    if (this.workerRecord) {
      await prisma.backgroundWorker.update({
        where: { id: this.workerRecord.id },
        data: {
          status: "STOPPED",
          stoppedAt: new Date(),
          currentJobId: null,
        },
      });
    }
  }

  public getWorkerRecord(): BackgroundWorker | null {
    return this.workerRecord;
  }
}

