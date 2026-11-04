/**
 * Worker Reconciler (Milestone 9.3)
 * Inspects worker instances and detects stale heartbeats, crashes, or unreleased slots.
 */

import { prisma } from "@/lib/db";
import {
  EvaluatedFinding,
  EvidencePayload,
  ReconciliationClassification,
  ReconciliationSeverity,
} from "./types";

export class WorkerReconciler {
  /**
   * Evaluates a single worker instance for heartbeat freshness.
   */
  public static async reconcileWorker(workerId: string): Promise<EvaluatedFinding | null> {
    const worker = await prisma.backgroundWorker.findUnique({
      where: { id: workerId },
      include: {
        claimedJobs: {
          where: {
            status: { in: ["CLAIMED", "RUNNING"] },
          },
        },
      },
    });

    if (!worker) return null;

    const now = new Date();
    const ageMs = now.getTime() - worker.lastHeartbeatAt.getTime();
    const isStale = ageMs > 30000; // 30s heartbeat timeout

    const evidence: EvidencePayload[] = [
      {
        sourceProvider: "worker_heartbeat",
        observedState: worker.status,
        confidence: 1.0,
        data: {
          workerId: worker.id,
          instanceId: worker.instanceId,
          lastHeartbeatAt: worker.lastHeartbeatAt.toISOString(),
          ageMs,
          activeSlots: worker.activeSlots,
          claimedJobCount: worker.claimedJobs.length,
        },
        observedAt: now.toISOString(),
      },
    ];

    let classification: ReconciliationClassification = "MATCHED";
    let severity: ReconciliationSeverity = "INFO";
    let externalState: string | null = "ONLINE";
    let details = `Worker ${worker.workerName} (${worker.instanceId}) heartbeat is fresh (${Math.round(ageMs / 1000)}s ago).`;
    let recommendedResponse = "RECONCILE_ONLY";

    if (isStale && worker.status !== "STOPPED") {
      classification = "STATE_MISMATCH";
      severity = worker.claimedJobs.length > 0 ? "SEV-2" : "SEV-3";
      externalState = "DEAD_OR_UNREACHABLE";
      details = `Worker ${worker.workerName} (${worker.instanceId}) has not sent a heartbeat in ${Math.round(ageMs / 1000)}s while holding ${worker.claimedJobs.length} active jobs.`;
      recommendedResponse = "RECLAIM_EXPIRED_WORKER_LEASE";
    }

    return {
      entityType: "WORKER",
      entityId: worker.id,
      internalState: worker.status,
      externalState,
      classification,
      severity,
      details,
      recommendedResponse,
      evidence,
      metadata: {
        workerName: worker.workerName,
        instanceId: worker.instanceId,
        claimedJobs: worker.claimedJobs.map((j) => j.id),
      },
    };
  }

  /**
   * Reconciles all registered worker instances.
   */
  public static async reconcileAllWorkers(): Promise<EvaluatedFinding[]> {
    const workers = await prisma.backgroundWorker.findMany({
      where: {
        status: { in: ["STARTING", "IDLE", "BUSY", "UNHEALTHY", "DRAINING"] },
      },
    });

    const findings: EvaluatedFinding[] = [];
    for (const worker of workers) {
      const finding = await this.reconcileWorker(worker.id);
      if (finding) findings.push(finding);
    }

    return findings;
  }
}

