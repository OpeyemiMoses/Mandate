/**
 * Mandate Universal Metrics Engine & Database Aggregator
 * Milestone 9.2 - OpenTelemetry Metrics API & Real Operational Telemetry
 */

import { metrics as otelMetrics } from "@opentelemetry/api";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  InMemoryMetricExporter,
} from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { prisma } from "@/lib/db";
import {
  QueueMetrics,
  WorkerFleetMetrics,
  AgentMetrics,
  ToolMetrics,
  FinancialExecutionMetrics,
  ObservabilityOverview,
} from "./types";
import { getExporterStatus } from "./tracing";
import { evaluateWorkerCapacity } from "./capacity";

// OpenTelemetry Metrics Provider Initialization
const memoryMetricExporter = new InMemoryMetricExporter(0); // 0 = Cumulative
const metricReader = new PeriodicExportingMetricReader({
  exporter: memoryMetricExporter,
  exportIntervalMillis: Number(process.env.MANDATE_METRICS_INTERVAL_MS || 30000),
});

let meterProviderInitialized = false;

export function initializeMetrics(): void {
  if (meterProviderInitialized) return;

  try {
    const serviceName = process.env.OTEL_SERVICE_NAME || "mandate-runtime";
    const resource = resourceFromAttributes({
      "service.name": serviceName,
      "service.version": "1.0.0",
    });

    const meterProvider = new MeterProvider({
      resource,
      readers: [metricReader],
    });

    otelMetrics.setGlobalMeterProvider(meterProvider);
    meterProviderInitialized = true;
  } catch (err: any) {
    console.warn("OpenTelemetry metrics initialization warning:", err?.message);
  }
}

initializeMetrics();

// Define Standard OpenTelemetry Instruments
const meter = otelMetrics.getMeter("mandate-meter", "1.0.0");

export function recordMetric(
  name: string,
  value: number,
  unit?: string,
  attributes?: Record<string, any>
): void {
  try {
    if (unit === "ms") {
      meter.createHistogram(name).record(value, attributes);
    } else {
      meter.createCounter(name).add(value, attributes);
    }
  } catch {
    // Non-blocking observability metric
  }
}

export const jobSubmissionCounter = meter.createCounter("mandate.jobs.submitted", {
  description: "Total background jobs submitted to the durable queue",
});

export const jobCompletionCounter = meter.createCounter("mandate.jobs.completed", {
  description: "Total background jobs successfully processed by workers",
});

export const jobFailureCounter = meter.createCounter("mandate.jobs.failed", {
  description: "Total background jobs that failed during execution",
});

export const jobProcessingDurationHistogram = meter.createHistogram(
  "mandate.jobs.processing_duration_ms",
  {
    description: "Background job execution duration in milliseconds",
    unit: "ms",
  }
);

export const financialExecutionCounter = meter.createCounter(
  "mandate.financial.executions",
  {
    description: "Financial execution attempts classified by operational verdict",
  }
);

export const toolInvocationCounter = meter.createCounter(
  "mandate.tool.invocations",
  {
    description: "Tool invocations by tool name and status",
  }
);

export const agentExecutionCounter = meter.createCounter(
  "mandate.agent.executions",
  {
    description: "Agent execution runs by status",
  }
);

// =============================================================================
// REAL DATABASE METRICS AGGREGATION (Zero Fabricated Metrics)
// =============================================================================

/**
 * Fetch real queue metrics directly from persisted BackgroundJob records
 */
export async function getQueueMetrics(
  timeWindowHours: number = 24,
  tenantId?: string
): Promise<QueueMetrics> {
  const cutoff = new Date(Date.now() - timeWindowHours * 3600 * 1000);
  const baseWhere = {
    ...(tenantId ? { tenantId } : {}),
    createdAt: { gte: cutoff },
  };

  // Group by status
  const statusCounts = await prisma.backgroundJob.groupBy({
    by: ["status"],
    where: baseWhere,
    _count: { id: true },
  });

  const counts: Record<string, number> = {};
  for (const s of statusCounts) {
    counts[s.status] = s._count.id;
  }

  const totalSubmitted = Object.values(counts).reduce((a, b) => a + b, 0);
  const currentlyQueued = counts["QUEUED"] || 0;
  const currentlyRunning = counts["RUNNING"] || 0;
  const scheduled = counts["SCHEDULED"] || 0;
  const awaitingRetry = counts["RETRY_WAIT"] || 0;
  const completed = counts["COMPLETED"] || 0;
  const failed = counts["FAILED"] || 0;
  const deadLettered = counts["DEAD_LETTER"] || 0;
  const requiresRecovery = counts["REQUIRES_RECOVERY"] || 0;

  // Real duration and wait-time statistics from JobAttempt
  const attempts = await prisma.jobAttempt.findMany({
    where: {
      startedAt: { gte: cutoff },
      ...(tenantId ? { job: { tenantId } } : {}),
      durationMs: { not: null },
    },
    select: {
      durationMs: true,
      startedAt: true,
      job: { select: { scheduledAt: true } },
    },
    take: 500,
  });

  let averageProcessingDurationMs = 0;
  let averageWaitTimeMs = 0;

  if (attempts.length > 0) {
    const totalDuration = attempts.reduce(
      (sum, a) => sum + (a.durationMs || 0),
      0
    );
    averageProcessingDurationMs = Math.round(totalDuration / attempts.length);

    const totalWait = attempts.reduce((sum, a) => {
      const wait = a.startedAt.getTime() - a.job.scheduledAt.getTime();
      return sum + Math.max(0, wait);
    }, 0);
    averageWaitTimeMs = Math.round(totalWait / attempts.length);
  }

  const finishedTotal = completed + failed + deadLettered;
  const successRate =
    finishedTotal > 0 ? Number(((completed / finishedTotal) * 100).toFixed(1)) : 0;
  const failureRate =
    finishedTotal > 0 ? Number((((failed + deadLettered) / finishedTotal) * 100).toFixed(1)) : 0;

  return {
    totalSubmitted,
    currentlyQueued,
    currentlyRunning,
    scheduled,
    awaitingRetry,
    completed,
    failed,
    deadLettered,
    requiresRecovery,
    averageWaitTimeMs,
    averageProcessingDurationMs,
    successRate,
    failureRate,
  };
}

/**
 * Fetch real worker fleet metrics and health status
 */
export async function getWorkerFleetMetrics(): Promise<WorkerFleetMetrics> {
  const workers = await prisma.backgroundWorker.findMany({
    where: { status: { not: "STOPPED" } },
    orderBy: { startedAt: "desc" },
  });

  const now = Date.now();
  const HEARTBEAT_STALE_THRESHOLD_MS = 30000; // 30 seconds

  let totalRegistered = workers.length;
  let activeWorkers = 0;
  let idleWorkers = 0;
  let busyWorkers = 0;
  let unhealthyWorkers = 0;
  let drainingWorkers = 0;
  let totalSlots = 0;
  let availableSlots = 0;

  const formattedWorkers = workers.map((w) => {
    const heartbeatAgeMs = now - w.lastHeartbeatAt.getTime();
    const heartbeatAgeSeconds = Math.max(0, Math.round(heartbeatAgeMs / 1000));
    const isHealthy =
      w.status !== "UNHEALTHY" && heartbeatAgeMs <= HEARTBEAT_STALE_THRESHOLD_MS;

    const maxConcurrency = w.maxConcurrency || 1;
    const activeSlots = w.activeSlots || (w.currentJobId ? 1 : 0);
    const workerAvailableSlots = isHealthy
      ? Math.max(0, maxConcurrency - activeSlots)
      : 0;

    totalSlots += maxConcurrency;
    availableSlots += workerAvailableSlots;

    if (!isHealthy) {
      unhealthyWorkers++;
    } else if (w.status === "DRAINING") {
      drainingWorkers++;
    } else if (activeSlots > 0 || w.status === "BUSY") {
      busyWorkers++;
      activeWorkers++;
    } else {
      idleWorkers++;
      activeWorkers++;
    }

    return {
      id: w.id,
      workerName: w.workerName,
      instanceId: w.instanceId,
      status: !isHealthy && w.status !== "DRAINING" ? "UNHEALTHY" : w.status,
      currentJobId: w.currentJobId,
      jobsProcessed: w.jobsProcessed,
      recentFailures: w.recentFailures,
      maxConcurrency,
      activeSlots,
      lastHeartbeatAt: w.lastHeartbeatAt.toISOString(),
      heartbeatAgeSeconds,
      isHealthy,
    };
  });

  const utilizationRate =
    totalSlots > 0
      ? Number((((totalSlots - availableSlots) / totalSlots) * 100).toFixed(1))
      : 0;

  return {
    totalRegistered,
    activeWorkers,
    idleWorkers,
    busyWorkers,
    unhealthyWorkers,
    drainingWorkers,
    totalSlots,
    availableSlots,
    utilizationRate,
    workers: formattedWorkers,
  };
}

/**
 * Fetch real agent execution metrics from AgentExecution table
 */
export async function getAgentMetrics(
  timeWindowHours: number = 24
): Promise<AgentMetrics> {
  const cutoff = new Date(Date.now() - timeWindowHours * 3600 * 1000);

  const executions = await prisma.agentExecution.findMany({
    where: { createdAt: { gte: cutoff } },
    select: { status: true, startedAt: true, completedAt: true },
  });

  const byStatus: Record<string, number> = {};
  let totalDurationMs = 0;
  let durationCount = 0;

  for (const ex of executions) {
    byStatus[ex.status] = (byStatus[ex.status] || 0) + 1;
    if (ex.completedAt && ex.startedAt) {
      const dur = ex.completedAt.getTime() - ex.startedAt.getTime();
      if (dur > 0) {
        totalDurationMs += dur;
        durationCount++;
      }
    }
  }

  const totalExecutions = executions.length;
  const successfulExecutions = byStatus["COMPLETED"] || byStatus["SUCCESS"] || 0;
  const failedExecutions = byStatus["FAILED"] || byStatus["ERROR"] || 0;
  const runningExecutions = byStatus["RUNNING"] || 0;

  const successRate =
    totalExecutions > 0
      ? Number(((successfulExecutions / totalExecutions) * 100).toFixed(1))
      : 0;

  const averageDurationMs =
    durationCount > 0 ? Math.round(totalDurationMs / durationCount) : 0;

  return {
    totalExecutions,
    successfulExecutions,
    failedExecutions,
    runningExecutions,
    successRate,
    averageDurationMs,
    byStatus,
  };
}

/**
 * Fetch real tool invocation metrics from ToolInvocation table
 */
export async function getToolMetrics(
  timeWindowHours: number = 24
): Promise<ToolMetrics> {
  const cutoff = new Date(Date.now() - timeWindowHours * 3600 * 1000);

  const invocations = await prisma.toolInvocation.findMany({
    where: { createdAt: { gte: cutoff } },
    select: {
      toolId: true,
      status: true,
      durationMs: true,
    },
  });

  const byTool: Record<string, { count: number; successes: number; failures: number }> =
    {};
  let totalDurationMs = 0;
  let durationCount = 0;
  let successfulInvocations = 0;
  let failedInvocations = 0;

  for (const inv of invocations) {
    if (!byTool[inv.toolId]) {
      byTool[inv.toolId] = { count: 0, successes: 0, failures: 0 };
    }
    byTool[inv.toolId].count++;

    if (inv.status === "SUCCESS") {
      byTool[inv.toolId].successes++;
      successfulInvocations++;
    } else if (inv.status === "FAILED") {
      byTool[inv.toolId].failures++;
      failedInvocations++;
    }

    if (inv.durationMs) {
      totalDurationMs += inv.durationMs;
      durationCount++;
    }
  }

  const totalInvocations = invocations.length;
  const successRate =
    totalInvocations > 0
      ? Number(((successfulInvocations / totalInvocations) * 100).toFixed(1))
      : 0;
  const averageDurationMs =
    durationCount > 0 ? Math.round(totalDurationMs / durationCount) : 0;

  return {
    totalInvocations,
    successfulInvocations,
    failedInvocations,
    successRate,
    averageDurationMs,
    byTool,
  };
}

/**
 * Fetch real financial execution metrics from ExecutionRecord table
 * STRICT BOUNDARY: Never exposes wallet addresses, private keys, or secret envelopes
 */
export async function getFinancialExecutionMetrics(
  timeWindowHours: number = 24
): Promise<FinancialExecutionMetrics> {
  const cutoff = new Date(Date.now() - timeWindowHours * 3600 * 1000);

  const records = await prisma.executionRecord.findMany({
    where: { createdAt: { gte: cutoff } },
    select: {
      status: true,
      recoveryStatus: true,
      confirmedAt: true,
      createdAt: true,
    },
  });

  let totalRequests = records.length;
  let authorizedAttempts = 0;
  let confirmedSettlements = 0;
  let failedExecutions = 0;
  let requiresRecovery = 0;
  let policyDenials = 0;
  let approvalRequiredCount = 0;
  let ambiguousBroadcastCount = 0;
  let totalSettlementDurationMs = 0;
  let settlementCount = 0;

  for (const r of records) {
    if (r.status === "AUTHORIZED" || r.status === "CONFIRMED") {
      authorizedAttempts++;
    }
    if (r.status === "CONFIRMED" || r.confirmedAt) {
      confirmedSettlements++;
      if (r.confirmedAt && r.createdAt) {
        const d = r.confirmedAt.getTime() - r.createdAt.getTime();
        if (d > 0) {
          totalSettlementDurationMs += d;
          settlementCount++;
        }
      }
    }
    if (r.status === "FAILED") {
      failedExecutions++;
    }
    if (r.status === "REQUIRES_RECOVERY" || r.recoveryStatus) {
      requiresRecovery++;
    }
    if (r.status === "POLICY_DENIED") {
      policyDenials++;
    }
    if (r.status === "APPROVAL_REQUIRED") {
      approvalRequiredCount++;
    }
    if (r.status === "BROADCAST_TIMEOUT_AMBIGUOUS") {
      ambiguousBroadcastCount++;
    }
  }

  const averageSettlementDurationMs =
    settlementCount > 0
      ? Math.round(totalSettlementDurationMs / settlementCount)
      : 0;

  return {
    totalRequests,
    authorizedAttempts,
    confirmedSettlements,
    failedExecutions,
    requiresRecovery,
    policyDenials,
    approvalRequiredCount,
    ambiguousBroadcastCount,
    averageSettlementDurationMs,
  };
}

/**
 * Generate comprehensive operational telemetry overview
 */
export async function getOverviewTelemetry(
  tenantId?: string
): Promise<ObservabilityOverview> {
  const [queue, workers, agents, tools, financial, capacity, openAlertsCount] =
    await Promise.all([
      getQueueMetrics(24, tenantId),
      getWorkerFleetMetrics(),
      getAgentMetrics(24),
      getToolMetrics(24),
      getFinancialExecutionMetrics(24),
      evaluateWorkerCapacity(),
      prisma.operationalAlert.count({
        where: {
          status: "OPEN",
          ...(tenantId ? { tenantId } : {}),
        },
      }),
    ]);

  let systemStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" = "HEALTHY";

  if (
    workers.unhealthyWorkers > 0 ||
    queue.failureRate > 20 ||
    financial.requiresRecovery > 0
  ) {
    systemStatus = "DEGRADED";
  }

  if (
    (workers.activeWorkers === 0 && queue.currentlyQueued > 0) ||
    financial.requiresRecovery > 5 ||
    openAlertsCount > 5
  ) {
    systemStatus = "CRITICAL";
  }

  return {
    systemStatus,
    queue,
    workers,
    agents,
    tools,
    financial,
    capacity,
    openAlertsCount,
    exporter: getExporterStatus(),
    timestamp: new Date().toISOString(),
  };
}
