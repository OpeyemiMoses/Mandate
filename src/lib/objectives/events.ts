import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";

export interface EmitObjectiveEventParams {
  objectiveId: string;
  userId: string;
  eventType: string;
  metadata?: Record<string, unknown>;
  mandateId?: string;
  stepId?: string;
}

const AUDITED_OBJECTIVE_EVENTS = new Set([
  "objective.created",
  "objective.plan_generated",
  "objective.plan_approved",
  "objective.plan_rejected",
  "objective.execution_started",
  "objective.step_completed",
  "objective.step_blocked",
  "objective.paused",
  "objective.resumed",
  "objective.completed",
  "objective.failed",
  "objective.cancelled",
]);

/**
 * Emits a structured event for an objective.
 * Persists the event in the ObjectiveEvent table and dual-dispatches
 * to Mandate's cryptographic SHA-256 audit ledger hash chain for critical events.
 */
export async function emitObjectiveEvent(params: EmitObjectiveEventParams) {
  const { objectiveId, userId, eventType, metadata = {}, mandateId, stepId } = params;

  let auditLogId: string | null = null;

  // 1. Dual-dispatch to tamper-evident audit ledger if in audited list
  if (AUDITED_OBJECTIVE_EVENTS.has(eventType)) {
    try {
      const verdict = eventType.includes("failed") || eventType.includes("blocked") || eventType.includes("rejected")
        ? "BLOCKED"
        : "SUCCESS";

      const auditRecord = await recordAuditEvent({
        userId,
        eventType: eventType.replace(".", "_").toUpperCase(),
        verdict,
        description: `Objective lifecycle event: ${eventType} (Objective: ${objectiveId}${stepId ? `, Step: ${stepId}` : ""})`,
        details: {
          objectiveId,
          stepId,
          eventType,
          ...metadata,
        },
        mandateId: mandateId || undefined,
      });

      if (auditRecord && auditRecord.id) {
        auditLogId = auditRecord.id;
      }
    } catch (auditErr) {
      console.warn("Audit ledger recording warning for objective event:", auditErr);
    }
  }

  // 2. Persist in ObjectiveEvent table
  const eventRecord = await prisma.objectiveEvent.create({
    data: {
      objectiveId,
      eventType,
      metadataJson: JSON.stringify(metadata),
      auditLogId,
      timestamp: new Date(),
    },
  });

  return eventRecord;
}

