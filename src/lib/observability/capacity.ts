/**
 * Mandate Worker Capacity Management & Scaling Recommendation Engine
 * Milestone 9.2 - Capacity Calculation & Advisory Scaling Guidance
 *
 * NOTE: Mandate provides deterministic ADVISORY scaling recommendations based on real
 * queue pressure and worker utilization. A recommendation is NOT an executed cloud
 * infrastructure provisioning action.
 */

import { prisma } from "@/lib/db";
import {
  CapacityEvaluation,
  ScalingEvidence,
  ScalingRecommendationType,
} from "./types";

/**
 * Evaluate real queue pressure, active capacity, and produce an advisory scaling recommendation
 */
export async function evaluateWorkerCapacity(
  persistSnapshot: boolean = false
): Promise<CapacityEvaluation> {
  const now = new Date();
  const HEARTBEAT_STALE_THRESHOLD_MS = 30000;

  // 1. Fetch eligible queued jobs
  const eligibleQueuedJobs = await prisma.backgroundJob.count({
    where: {
      status: { in: ["QUEUED", "SCHEDULED", "RETRY_WAIT"] },
      scheduledAt: { lte: now },
    },
  });

  // 2. Fetch all registered workers
  const workers = await prisma.backgroundWorker.findMany({
    where: { status: { not: "STOPPED" } },
  });

  let totalWorkers = workers.length;
  let activeWorkers = 0;
  let idleWorkers = 0;
  let busyWorkers = 0;
  let unhealthyWorkers = 0;
  let totalSlots = 0;
  let availableSlots = 0;
  let recentFailureCount = 0;

  for (const w of workers) {
    const heartbeatAge = now.getTime() - w.lastHeartbeatAt.getTime();
    const isHealthy =
      w.status !== "UNHEALTHY" && heartbeatAge <= HEARTBEAT_STALE_THRESHOLD_MS;

    const maxConcurrency = w.maxConcurrency || 1;
    const activeSlots = w.activeSlots || (w.currentJobId ? 1 : 0);
    const workerAvailableSlots = isHealthy
      ? Math.max(0, maxConcurrency - activeSlots)
      : 0;

    totalSlots += maxConcurrency;
    availableSlots += workerAvailableSlots;
    recentFailureCount += w.recentFailures || 0;

    if (!isHealthy) {
      unhealthyWorkers++;
    } else if (w.status === "BUSY" || activeSlots > 0) {
      busyWorkers++;
      activeWorkers++;
    } else {
      idleWorkers++;
      activeWorkers++;
    }
  }

  // Ensure totalSlots is at least 1 for safe math
  const effectiveTotalSlots = Math.max(1, totalSlots);
  const queuePressure = Number(
    (eligibleQueuedJobs / Math.max(1, availableSlots)).toFixed(2)
  );

  // 3. Query average wait time from recent attempts
  const recentAttempts = await prisma.jobAttempt.findMany({
    take: 50,
    orderBy: { startedAt: "desc" },
    select: {
      startedAt: true,
      job: { select: { scheduledAt: true } },
    },
  });

  let averageWaitTimeMs = 0;
  if (recentAttempts.length > 0) {
    const totalWait = recentAttempts.reduce((acc, a) => {
      return (
        acc + Math.max(0, a.startedAt.getTime() - a.job.scheduledAt.getTime())
      );
    }, 0);
    averageWaitTimeMs = Math.round(totalWait / recentAttempts.length);
  }

  const evidence: ScalingEvidence = {
    eligibleQueuedJobs,
    activeWorkers,
    unhealthyWorkers,
    totalCapacitySlots: totalSlots,
    availableSlots,
    queuePressure,
    averageWaitTimeMs,
    recentFailureCount,
  };

  // 4. Determine Scaling Recommendation
  let recommendation: ScalingRecommendationType = "NO_CHANGE";
  let reason = "Worker capacity is healthy and aligned with queue demands.";
  let recommendedWorkers = totalWorkers;
  let recommendedSlots = totalSlots;

  if (unhealthyWorkers > 0) {
    recommendation = "INVESTIGATE_UNHEALTHY_WORKERS";
    reason = `${unhealthyWorkers} worker instance(s) have stale heartbeats (>30s) or marked UNHEALTHY. Investigate worker instances before provisioning.`;
    recommendedWorkers = totalWorkers;
    recommendedSlots = totalSlots;
  } else if (activeWorkers === 0 && eligibleQueuedJobs > 0) {
    recommendation = "INCREASE_CAPACITY";
    reason = `Queue has ${eligibleQueuedJobs} pending job(s) but zero active workers are online. Provision at least 1 worker instance immediately.`;
    recommendedWorkers = Math.max(1, Math.ceil(eligibleQueuedJobs / 2));
    recommendedSlots = recommendedWorkers * 2;
  } else if (queuePressure >= 2.0 || (availableSlots === 0 && eligibleQueuedJobs > 0)) {
    recommendation = "INCREASE_CAPACITY";
    const neededSlots = Math.ceil(eligibleQueuedJobs / 1.5);
    const additionalSlotsNeeded = Math.max(1, neededSlots - availableSlots);
    const slotsPerWorker = Math.max(1, Math.round(totalSlots / Math.max(1, totalWorkers)));
    const additionalWorkersNeeded = Math.ceil(additionalSlotsNeeded / slotsPerWorker);

    recommendedWorkers = totalWorkers + additionalWorkersNeeded;
    recommendedSlots = totalSlots + additionalSlotsNeeded;
    reason = `Queue pressure is high (${queuePressure}x). ${eligibleQueuedJobs} jobs waiting against ${availableSlots} available slots. Recommended expansion: +${additionalWorkersNeeded} worker(s).`;
  } else if (eligibleQueuedJobs === 0 && idleWorkers >= 4 && activeWorkers >= 4) {
    recommendation = "REDUCE_CAPACITY";
    const excessWorkers = Math.floor(idleWorkers / 2);
    recommendedWorkers = Math.max(1, totalWorkers - excessWorkers);
    recommendedSlots = Math.max(1, Math.round(totalSlots * (recommendedWorkers / totalWorkers)));
    reason = `Queue is empty with ${idleWorkers} idle workers. Fleet can safely scale down by ${excessWorkers} worker(s) to optimize host resources.`;
  }

  const evaluation: CapacityEvaluation = {
    recommendation,
    currentWorkers: totalWorkers,
    recommendedWorkers,
    currentSlots: totalSlots,
    recommendedSlots,
    queuePressure,
    reason,
    evidence,
    isAdvisoryOnly: true,
    evaluatedAt: now.toISOString(),
  };

  // 5. Persist Snapshot if requested
  if (persistSnapshot) {
    try {
      await prisma.workerCapacitySnapshot.create({
        data: {
          totalWorkers,
          activeWorkers,
          idleWorkers,
          busyWorkers,
          unhealthyWorkers,
          queuedJobs: eligibleQueuedJobs,
          availableSlots,
          totalSlots: effectiveTotalSlots,
          queuePressure,
          recommendation,
          reason,
          evidence: JSON.stringify(evidence),
          isAdvisoryOnly: true,
          recordedAt: now,
        },
      });
    } catch {
      // Non-critical persistence failure
    }
  }

  return evaluation;
}

