/**
 * Mandate Universal Job Queue Service
 * Milestone 9.1 - Persistent Job Ingestion, Idempotency, and Lifecycle Tracking
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { BackgroundJob } from "@prisma/client";
import { SubmitJobInput, JobFilters, JobStatus } from "./types";
import { JobRegistry } from "./registry";
import { canonicalize, recordAuditEvent } from "@/lib/auditLedger";
import {
  generateW3CTraceParent,
  withSpan,
  jobSubmissionCounter,
} from "@/lib/observability";
import { BackpressureService } from "@/lib/resilience/backpressureService";

export class JobQueueService {
  /**
   * Compute deterministic canonical SHA-256 payload hash
   */
  public static computePayloadHash(payload: Record<string, any>): string {
    const canonicalString = JSON.stringify(canonicalize(payload));
    return crypto.createHash("sha256").update(canonicalString, "utf8").digest("hex");
  }

  /**
   * Durably persist a new background job before acknowledging submission
   */
  public static async submitJob(input: SubmitJobInput): Promise<BackgroundJob> {
    const {
      tenantId,
      jobType,
      payload,
      priority = 0,
      scheduledAt,
      idempotencyKey,
      correlationId,
      parentJobId,
      maxAttempts,
    } = input;

    // 1. Validate Tenant Ownership
    const tenant = await prisma.user.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new Error(`Tenant not found or unauthorized: ${tenantId}`);
    }

    // 2. Validate Job Type against Explicit Registry
    const jobDef = JobRegistry.get(jobType);
    if (!jobDef) {
      throw new Error(
        `Unrecognized job type "${jobType}". Execution of unregistered job types is prohibited.`
      );
    }

    // 3. Validate Payload against Schema
    const validation = jobDef.schema(payload);
    if (!validation.valid) {
      throw new Error(`Job payload validation failed: ${validation.error || "Invalid payload"}`);
    }

    // 4. Compute Canonical Payload Hash
    const payloadHash = this.computePayloadHash(payload);

    // 5. Enforce Idempotency
    if (idempotencyKey) {
      const existingJob = await prisma.backgroundJob.findFirst({
        where: { tenantId, idempotencyKey },
      });

      if (existingJob) {
        if (existingJob.payloadHash === payloadHash) {
          // Idempotent duplicate: return existing job without re-executing
          return existingJob;
        } else {
          throw new Error(
            `Idempotency key "${idempotencyKey}" was previously used with a different payload. Parameter drift rejected.`
          );
        }
      }
    }

    // 5b. Backpressure & Queue Saturation Protection (Milestone 9.4)
    await BackpressureService.assertAdmission({
      tenantId,
      jobType,
      priority,
    });

    // 6. Determine Initial Status & Trace Context
    const now = new Date();
    const effectiveScheduledAt = scheduledAt && scheduledAt > now ? scheduledAt : now;
    const initialStatus: JobStatus = scheduledAt && scheduledAt > now ? "SCHEDULED" : "QUEUED";
    const effectiveMaxAttempts = maxAttempts && maxAttempts > 0 ? maxAttempts : jobDef.retryPolicy.maxAttempts;
    const activeTraceParent = input.traceParent || generateW3CTraceParent();
    const activeTraceState = input.traceState || null;

    // 7. Persist Job and Append Lifecycle Event Transactionally
    const job = await prisma.$transaction(async (tx) => {
      const createdJob = await tx.backgroundJob.create({
        data: {
          tenantId,
          jobType,
          jobCategory: jobDef.category,
          payload: JSON.stringify(payload),
          payloadHash,
          status: initialStatus,
          priority,
          attempts: 0,
          maxAttempts: effectiveMaxAttempts,
          scheduledAt: effectiveScheduledAt,
          correlationId: correlationId || `corr_${crypto.randomBytes(12).toString("hex")}`,
          parentJobId: parentJobId || null,
          idempotencyKey: idempotencyKey || null,
          traceParent: activeTraceParent,
          traceState: activeTraceState,
        },
      });

      await tx.jobEvent.create({
        data: {
          jobId: createdJob.id,
          eventType: initialStatus,
          previousStatus: null,
          newStatus: initialStatus,
          metadata: JSON.stringify({
            priority,
            scheduledAt: effectiveScheduledAt.toISOString(),
            correlationId: createdJob.correlationId,
          }),
        },
      });

      return createdJob;
    });

    // 8. Record in Tamper-Resistant SHA-256 Audit Ledger
    await recordAuditEvent({
      userId: tenantId,
      eventType: "JOB_SUBMITTED",
      verdict: "ACCEPTED",
      description: `Background job ${job.id} (${jobType}) submitted with status ${initialStatus}`,
      details: {
        jobId: job.id,
        jobType,
        priority,
        payloadHash,
        idempotencyKey: idempotencyKey || null,
        scheduledAt: effectiveScheduledAt.toISOString(),
      },
    });

    // 9. Record OpenTelemetry Metrics & Submission Span
    try {
      jobSubmissionCounter.add(1, { jobType });
      withSpan(
        "job.submit",
        async (span) => {
          span.setAttributes({
            "mandate.job_id": job.id,
            "mandate.job_type": jobType,
            "mandate.tenant_id": tenantId,
            "mandate.priority": priority,
            "mandate.status": initialStatus,
            "mandate.correlation_id": job.correlationId,
          });
        },
        { parentTraceParent: activeTraceParent }
      ).catch(() => {});
    } catch {
      // Telemetry failure cannot disrupt job submission
    }

    return job;
  }

  /**
   * Cancel an eligible background job
   */
  public static async cancelJob(
    jobId: string,
    tenantId: string,
    reason?: string
  ): Promise<BackgroundJob> {
    return await prisma.$transaction(async (tx) => {
      const job = await tx.backgroundJob.findFirst({
        where: { id: jobId, tenantId },
      });

      if (!job) {
        throw new Error(`Job not found or unauthorized: ${jobId}`);
      }

      const cancellableStatuses: JobStatus[] = ["QUEUED", "SCHEDULED", "RETRY_WAIT"];
      if (!cancellableStatuses.includes(job.status as JobStatus)) {
        throw new Error(
          `Cannot cancel job in "${job.status}" status. Only QUEUED, SCHEDULED, or RETRY_WAIT jobs may be cancelled.`
        );
      }

      const updatedJob = await tx.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: "CANCELLED",
          lastErrorMessage: reason || "Cancelled by tenant",
        },
      });

      await tx.jobEvent.create({
        data: {
          jobId,
          eventType: "CANCELLED",
          previousStatus: job.status,
          newStatus: "CANCELLED",
          metadata: JSON.stringify({ reason: reason || "Cancelled by tenant" }),
        },
      });

      return updatedJob;
    });
  }

  /**
   * Fetch single job with full attempt and event details, enforcing tenant isolation
   */
  public static async getJob(jobId: string, tenantId: string) {
    return await prisma.backgroundJob.findFirst({
      where: { id: jobId, tenantId },
      include: {
        attemptsList: { orderBy: { attemptNumber: "asc" } },
        eventsList: { orderBy: { createdAt: "asc" } },
        deadLetterRecord: true,
        worker: {
          select: { id: true, workerName: true, instanceId: true, status: true },
        },
      },
    });
  }

  /**
   * List jobs with pagination, filtering, and tenant isolation
   */
  public static async listJobs(filters: JobFilters) {
    const { tenantId, status, jobType, priority, limit = 50, offset = 0, search } = filters;
    const where: any = { tenantId };

    if (status) where.status = status;
    if (jobType) where.jobType = jobType;
    if (priority !== undefined) where.priority = priority;

    if (search) {
      where.OR = [
        { id: { contains: search } },
        { jobType: { contains: search } },
        { correlationId: { contains: search } },
      ];
    }

    const [jobs, total] = await Promise.all([
      prisma.backgroundJob.findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: Math.min(limit, 100),
        skip: offset,
        include: {
          worker: { select: { id: true, workerName: true, instanceId: true } },
          deadLetterRecord: { select: { id: true, reason: true, quarantinedAt: true } },
        },
      }),
      prisma.backgroundJob.count({ where }),
    ]);

    return { jobs, total };
  }

  /**
   * Count jobs by status for a tenant
   */
  public static async getQueueMetrics(tenantId: string) {
    const counts = await prisma.backgroundJob.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { status: true },
    });

    const metrics: Record<string, number> = {
      QUEUED: 0,
      SCHEDULED: 0,
      CLAIMED: 0,
      RUNNING: 0,
      RETRY_WAIT: 0,
      COMPLETED: 0,
      FAILED: 0,
      DEAD_LETTER: 0,
      CANCELLED: 0,
      REQUIRES_RECOVERY: 0,
    };

    for (const item of counts) {
      metrics[item.status] = item._count.status;
    }

    return metrics;
  }
}

