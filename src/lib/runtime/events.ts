import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import { RuntimeEventPayload } from "./types";

/**
 * Universal Agent Runtime - Event Service
 * Persists runtime events and integrates major lifecycle milestones with the cryptographic audit ledger.
 */

export interface EmitEventParams {
  executionId: string;
  agentId: string;
  userId: string;
  eventType: string;
  metadata?: Record<string, unknown>;
  mandateId?: string;
  taskId?: string;
}

export async function emitRuntimeEvent(
  params: EmitEventParams
): Promise<RuntimeEventPayload> {
  const { executionId, agentId, userId, eventType, metadata = {}, mandateId, taskId } = params;

  let eventRecordId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  let persistedTimestamp = new Date();

  try {
    // Only persist to ExecutionEvent table if executionId matches an existing AgentExecution row (FK constraint)
    const exec = executionId
      ? await prisma.agentExecution.findUnique({
          where: { id: executionId },
          select: { id: true },
        })
      : null;

    if (exec) {
      const eventRecord = await prisma.executionEvent.create({
        data: {
          executionId: exec.id,
          agentId,
          userId,
          eventType,
          metadataJson: JSON.stringify(metadata),
          timestamp: persistedTimestamp,
        },
      });
      eventRecordId = eventRecord.id;
      persistedTimestamp = eventRecord.timestamp;
    }
  } catch (dbErr) {
    console.warn(`ExecutionEvent persistence skipped for "${eventType}":`, dbErr);
  }

  // Dual-dispatch major lifecycle events to the immutable hash-chain audit ledger
  const AUDITED_LIFECYCLE_EVENTS = new Set([
    "execution.created",
    "execution.started",
    "execution.approval_required",
    "execution.completed",
    "execution.failed",
    "execution.cancelled",
    "execution.paused",
    "execution.resumed",
  ]);

  if (AUDITED_LIFECYCLE_EVENTS.has(eventType)) {
    try {
      const verdict =
        eventType === "execution.completed"
          ? "SUCCESS"
          : eventType === "execution.failed"
          ? "FAILED"
          : eventType === "execution.approval_required"
          ? "REQUIRES_APPROVAL"
          : "ALLOWED";

      await recordAuditEvent({
        userId,
        eventType: eventType.replace(".", "_").toUpperCase(),
        verdict,
        description: `Runtime execution event: ${eventType} (ID: ${executionId})`,
        details: {
          executionId,
          agentId,
          eventType,
          ...metadata,
        },
        agentId,
        mandateId: mandateId || undefined,
        taskId: taskId || undefined,
      });
    } catch (auditErr) {
      console.warn("Audit log recording warning for runtime event:", auditErr);
    }
  }

  return {
    id: eventRecordId,
    executionId,
    agentId,
    userId,
    eventType,
    timestamp: persistedTimestamp.toISOString(),
    metadata,
  };
}

export async function getExecutionEvents(
  executionId: string,
  userId: string
): Promise<RuntimeEventPayload[]> {
  const events = await prisma.executionEvent.findMany({
    where: {
      executionId,
      userId,
    },
    orderBy: { timestamp: "asc" },
  });

  return events.map((e) => {
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(e.metadataJson || "{}");
    } catch {}

    return {
      id: e.id,
      executionId: e.executionId,
      agentId: e.agentId,
      userId: e.userId,
      eventType: e.eventType,
      timestamp: e.timestamp.toISOString(),
      metadata,
    };
  });
}

