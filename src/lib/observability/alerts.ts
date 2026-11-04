/**
 * Mandate Operational Alerting & Deduplication Engine
 * Milestone 9.2 - Operational Alerts, Deduplication, Lifecycle & Audit
 */

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import {
  OperationalAlertInput,
  AlertStatus,
  AlertSeverity,
} from "./types";

/**
 * Create or Deduplicate an Operational Alert
 */
export async function createOrUpdateAlert(input: OperationalAlertInput) {
  const now = new Date();

  // 1. Check for existing open or acknowledged alert with matching deduplicationKey
  const existingAlert = await prisma.operationalAlert.findFirst({
    where: {
      deduplicationKey: input.deduplicationKey,
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
    },
  });

  if (existingAlert) {
    // Update existing alert with latest observed metrics (prevent alert spam)
    return await prisma.operationalAlert.update({
      where: { id: existingAlert.id },
      data: {
        lastDetectedAt: now,
        observedValue: input.observedValue,
        description: input.description,
        metadata: JSON.stringify(input.metadata || {}),
      },
    });
  }

  // 2. Create new alert record
  const newAlert = await prisma.operationalAlert.create({
    data: {
      tenantId: input.tenantId,
      alertType: input.alertType,
      severity: input.severity,
      title: input.title,
      description: input.description,
      observedValue: input.observedValue,
      threshold: input.threshold,
      unit: input.unit || "count",
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      status: "OPEN",
      deduplicationKey: input.deduplicationKey,
      firstDetectedAt: now,
      lastDetectedAt: now,
      metadata: JSON.stringify(input.metadata || {}),
    },
  });

  // 3. Emit tamper-evident audit record for high-severity alerts
  if (input.severity === "CRITICAL" || input.severity === "ERROR") {
    await recordAuditEvent({
      userId: input.tenantId || "system",
      eventType: "OPERATIONAL_ALERT_TRIGGERED",
      verdict: "DENIED",
      description: `[${input.severity}] ${input.title}: ${input.description}`,
      details: {
        alertId: newAlert.id,
        alertType: input.alertType,
        deduplicationKey: input.deduplicationKey,
        observedValue: input.observedValue,
        threshold: input.threshold,
      },
    });
  }

  return newAlert;
}

/**
 * Acknowledge an Open Alert (Requires User Auth & Audited)
 */
export async function acknowledgeAlert(
  alertId: string,
  userId: string,
  notes?: string
) {
  const alert = await prisma.operationalAlert.findUnique({
    where: { id: alertId },
  });

  if (!alert) {
    throw new Error(`Alert with ID "${alertId}" not found`);
  }

  if (alert.status !== "OPEN") {
    return alert; // Already acknowledged or resolved
  }

  const updated = await prisma.operationalAlert.update({
    where: { id: alertId },
    data: {
      status: "ACKNOWLEDGED",
      acknowledgedAt: new Date(),
      acknowledgedBy: userId,
      resolutionNotes: notes,
    },
  });

  await recordAuditEvent({
    userId,
    eventType: "OPERATIONAL_ALERT_ACKNOWLEDGED",
    verdict: "SUCCESS",
    description: `Alert "${alert.title}" acknowledged by user ${userId}`,
    details: { alertId, previousStatus: "OPEN", newStatus: "ACKNOWLEDGED", notes },
  });

  return updated;
}

/**
 * Resolve an Alert (Requires User Auth & Audited)
 */
export async function resolveAlert(
  alertId: string,
  userId: string,
  notes?: string
) {
  const alert = await prisma.operationalAlert.findUnique({
    where: { id: alertId },
  });

  if (!alert) {
    throw new Error(`Alert with ID "${alertId}" not found`);
  }

  const updated = await prisma.operationalAlert.update({
    where: { id: alertId },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedBy: userId,
      resolutionNotes: notes,
    },
  });

  await recordAuditEvent({
    userId,
    eventType: "OPERATIONAL_ALERT_RESOLVED",
    verdict: "SUCCESS",
    description: `Alert "${alert.title}" resolved by user ${userId}`,
    details: { alertId, previousStatus: alert.status, newStatus: "RESOLVED", notes },
  });

  return updated;
}

/**
 * Scan database operational state and evaluate alert conditions
 */
export async function evaluateOperationalAlerts(): Promise<number> {
  const now = new Date();
  let triggeredCount = 0;

  // 1. Check for stale workers (>30 seconds heartbeat)
  const HEARTBEAT_STALE_THRESHOLD_MS = 30000;
  const staleCutoff = new Date(now.getTime() - HEARTBEAT_STALE_THRESHOLD_MS);
  const staleWorkers = await prisma.backgroundWorker.findMany({
    where: {
      status: { not: "STOPPED" },
      lastHeartbeatAt: { lt: staleCutoff },
    },
  });

  for (const w of staleWorkers) {
    const ageSec = Math.round((now.getTime() - w.lastHeartbeatAt.getTime()) / 1000);
    await createOrUpdateAlert({
      alertType: "WORKER_STALE",
      severity: "WARNING",
      title: `Worker Instance Stale: ${w.workerName}`,
      description: `Worker ${w.workerName} (${w.instanceId}) has not sent a heartbeat in ${ageSec}s (threshold: 30s).`,
      observedValue: ageSec,
      threshold: 30,
      unit: "seconds",
      resourceType: "WORKER",
      resourceId: w.id,
      deduplicationKey: `WORKER_STALE:${w.id}`,
      metadata: { instanceId: w.instanceId, lastHeartbeatAt: w.lastHeartbeatAt },
    });
    triggeredCount++;
  }

  // 2. Check for Queue Backlog (> 10 pending jobs)
  const QUEUE_BACKLOG_THRESHOLD = 10;
  const queuedCount = await prisma.backgroundJob.count({
    where: { status: "QUEUED" },
  });

  if (queuedCount >= QUEUE_BACKLOG_THRESHOLD) {
    await createOrUpdateAlert({
      alertType: "QUEUE_BACKLOG",
      severity: queuedCount >= 50 ? "CRITICAL" : "WARNING",
      title: "Queue Backlog Threshold Exceeded",
      description: `Persistent queue backlog currently has ${queuedCount} pending jobs waiting for worker slots (threshold: ${QUEUE_BACKLOG_THRESHOLD}).`,
      observedValue: queuedCount,
      threshold: QUEUE_BACKLOG_THRESHOLD,
      unit: "jobs",
      resourceType: "QUEUE",
      deduplicationKey: "QUEUE_BACKLOG:global",
    });
    triggeredCount++;
  }

  // 3. Check for Financial Executions Requiring Recovery
  const recoveryRecords = await prisma.executionRecord.findMany({
    where: {
      status: { in: ["REQUIRES_RECOVERY", "BROADCAST_TIMEOUT_AMBIGUOUS"] },
    },
    take: 10,
  });

  for (const rec of recoveryRecords) {
    await createOrUpdateAlert({
      tenantId: rec.userId,
      alertType: "RECOVERY_REQUIRED",
      severity: "CRITICAL",
      title: `Financial Execution Requires Recovery: ${rec.id}`,
      description: `Execution ${rec.id} entered ambiguous post-broadcast state and requires administrative reconciliation.`,
      observedValue: 1,
      threshold: 0,
      unit: "count",
      resourceType: "EXECUTION",
      resourceId: rec.id,
      deduplicationKey: `RECOVERY_REQUIRED:${rec.id}`,
      metadata: {
        mandateId: rec.mandateId,
        idempotencyKey: rec.idempotencyKey,
      },
    });
    triggeredCount++;
  }

  // 4. Check for Dead-Letter Records Pending Review
  const pendingDeadLetters = await prisma.deadLetterRecord.count({
    where: { resolution: "PENDING_REVIEW" },
  });

  if (pendingDeadLetters > 0) {
    await createOrUpdateAlert({
      alertType: "DEAD_LETTER_GROWTH",
      severity: pendingDeadLetters >= 5 ? "ERROR" : "WARNING",
      title: "Quarantined Dead-Letter Backlog",
      description: `${pendingDeadLetters} quarantined job(s) pending administrative review in dead-letter queue.`,
      observedValue: pendingDeadLetters,
      threshold: 0,
      unit: "jobs",
      resourceType: "DEAD_LETTER",
      deduplicationKey: "DEAD_LETTER_GROWTH:global",
    });
    triggeredCount++;
  }

  return triggeredCount;
}

/**
 * List Operational Alerts with filtering
 */
export async function listOperationalAlerts(options: {
  tenantId?: string;
  status?: AlertStatus;
  severity?: AlertSeverity;
  limit?: number;
} = {}) {
  const where: any = {};
  if (options.tenantId) where.tenantId = options.tenantId;
  if (options.status) where.status = options.status;
  if (options.severity) where.severity = options.severity;

  return await prisma.operationalAlert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options.limit || 50,
  });
}
