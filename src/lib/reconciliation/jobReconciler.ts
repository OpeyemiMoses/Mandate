/**
 * Job Reconciler (Milestone 9.3)
 * Reconciles BackgroundJobs, detecting expired leases, orphaned assignments,
 * stuck processing, and dead letter inconsistencies.
 */

import { prisma } from "@/lib/db";
import {
  EvaluatedFinding,
  EvidencePayload,
  ReconciliationClassification,
  ReconciliationSeverity,
} from "./types";

export class JobReconciler {
  /**
   * Evaluates a single BackgroundJob for lease expiry or orphaned state.
   */
  public static async reconcileJob(jobId: string): Promise<EvaluatedFinding | null> {
    const job = await prisma.backgroundJob.findUnique({
      where: { id: jobId },
      include: {
        worker: true,
      },
    });

    if (!job) return null;

    const now = new Date();
    const evidence: EvidencePayload[] = [];
    let classification: ReconciliationClassification = "MATCHED";
    let severity: ReconciliationSeverity = "INFO";
    let externalState: string | null = job.worker ? `WORKER_${job.worker.status}` : "NO_WORKER";
    let details = `Job ${job.id} is healthy (${job.status}).`;
    let recommendedResponse = "RECONCILE_ONLY";

    const isFinancial = job.jobCategory === "FINANCIAL";

    // 1. Check for expired leases on claimed/running jobs
    if (job.status === "CLAIMED" || job.status === "RUNNING") {
      const isLeaseExpired = job.leaseExpiresAt ? job.leaseExpiresAt < now : false;
      const isWorkerStale = job.worker
        ? now.getTime() - job.worker.lastHeartbeatAt.getTime() > 30000
        : true;

      evidence.push({
        sourceProvider: "worker_heartbeat",
        observedState: job.worker?.status || "UNKNOWN",
        confidence: 1.0,
        data: {
          jobId: job.id,
          workerId: job.workerId,
          leaseExpiresAt: job.leaseExpiresAt?.toISOString(),
          workerLastHeartbeat: job.worker?.lastHeartbeatAt.toISOString(),
          isLeaseExpired,
          isWorkerStale,
        },
        observedAt: now.toISOString(),
      });

      if (isLeaseExpired || isWorkerStale) {
        classification = "STATE_MISMATCH";
        severity = isFinancial ? "SEV-1" : "SEV-3";
        externalState = isWorkerStale ? "WORKER_HEARTBEAT_STALE" : "LEASE_EXPIRED";
        details = `Job ${job.id} (${job.jobType}) has an expired lease or stale worker heartbeat.`;
        recommendedResponse = isFinancial
          ? "MANUAL_FINANCIAL_REVIEW"
          : "RECLAIM_EXPIRED_WORKER_LEASE";
      }
    } else if (job.status === "REQUIRES_RECOVERY") {
      classification = "STATE_MISMATCH";
      severity = isFinancial ? "SEV-1" : "SEV-2";
      externalState = "NEEDS_MANUAL_RECOVERY";
      details = `Job ${job.id} is explicitly flagged REQUIRES_RECOVERY.`;
      recommendedResponse = isFinancial
        ? "MANUAL_FINANCIAL_REVIEW"
        : "RESUME_SAFE_JOB";
    }

    return {
      entityType: "JOB",
      entityId: job.id,
      internalState: job.status,
      externalState,
      classification,
      severity,
      details,
      recommendedResponse,
      evidence,
      metadata: {
        jobType: job.jobType,
        jobCategory: job.jobCategory,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        tenantId: job.tenantId,
      },
    };
  }

  /**
   * Reconciles all active or potentially stalled jobs across the platform.
   */
  public static async reconcileAllActiveJobs(options?: {
    tenantId?: string;
    jobIds?: string[];
  }): Promise<EvaluatedFinding[]> {
    const where: any = {};
    if (options?.tenantId) where.tenantId = options.tenantId;

    if (options?.jobIds && options.jobIds.length > 0) {
      where.id = { in: options.jobIds };
    } else {
      where.status = {
        in: ["CLAIMED", "RUNNING", "REQUIRES_RECOVERY"],
      };
    }

    const jobs = await prisma.backgroundJob.findMany({
      where,
      take: 100,
      orderBy: { scheduledAt: "asc" },
    });

    const findings: EvaluatedFinding[] = [];
    for (const job of jobs) {
      const finding = await this.reconcileJob(job.id);
      if (finding) findings.push(finding);
    }

    return findings;
  }
}

