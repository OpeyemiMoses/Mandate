import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";

export interface EmitCoordinationEventParams {
  runId: string;
  objectiveId: string;
  userId: string;
  eventType: string;
  taskId?: string | null;
  agentId?: string | null;
  mandateId?: string | null;
  metadata?: Record<string, any>;
  recordInAuditChain?: boolean;
}

/**
 * Unified Coordination Event Service
 * Records fine-grained lifecycle events for the coordination run and
 * links critical events directly into the immutable SHA-256 audit ledger.
 */
export async function emitCoordinationEvent(
  params: EmitCoordinationEventParams
): Promise<{ id: string; auditLogId?: string | null }> {
  const {
    runId,
    objectiveId,
    userId,
    eventType,
    taskId,
    agentId,
    mandateId,
    metadata = {},
    recordInAuditChain = true,
  } = params;

  let auditLogId: string | null = null;

  // 1. Link to cryptographic SHA-256 audit chain if requested
  if (recordInAuditChain && userId) {
    try {
      const auditLog = await recordAuditEvent({
        userId,
        eventType: `COORDINATION_${eventType.toUpperCase().replace(/\./g, "_")}`,
        verdict: "SUCCESS",
        description: `Coordination event: ${eventType} in run ${runId}`,
        details: {
          runId,
          objectiveId,
          taskId,
          agentId,
          ...metadata,
        },
        agentId: agentId || null,
        mandateId: mandateId || null,
      });
      auditLogId = auditLog.id;
    } catch (err: any) {
      console.error(`[CoordinationEvent] Failed to record in audit chain: ${err?.message}`);
    }
  }

  // 2. Persist CoordinationEvent
  const event = await prisma.coordinationEvent.create({
    data: {
      runId,
      objectiveId,
      taskId: taskId || null,
      agentId: agentId || null,
      eventType,
      metadataJson: JSON.stringify(metadata),
      auditLogId,
    },
  });

  return { id: event.id, auditLogId };
}

