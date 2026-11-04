/**
 * Incident Timeline Service (Milestone 9.3)
 * Provides append-only timeline event recording and cryptographic evidence binding.
 */

import { prisma } from "@/lib/db";
import { IncidentActorType, IncidentEventType } from "./types";

export class IncidentTimelineService {
  /**
   * Appends an event to the incident timeline.
   */
  public static async recordEvent(params: {
    incidentId: string;
    eventType: IncidentEventType;
    previousStatus?: string | null;
    newStatus?: string | null;
    actorId?: string;
    actorType?: IncidentActorType;
    notes: string;
    evidenceHash?: string;
    metadata?: Record<string, any>;
  }) {
    return await prisma.incidentTimelineEvent.create({
      data: {
        incidentId: params.incidentId,
        eventType: params.eventType,
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        actorId: params.actorId || "SYSTEM",
        actorType: params.actorType || "SYSTEM",
        notes: params.notes,
        evidenceHash: params.evidenceHash,
        metadata: JSON.stringify(params.metadata || {}),
      },
    });
  }

  /**
   * Adds an operator comment or investigation note to the incident timeline.
   */
  public static async addComment(params: {
    incidentId: string;
    actorId: string;
    actorType?: IncidentActorType;
    comment: string;
    evidenceHash?: string;
  }) {
    return await this.recordEvent({
      incidentId: params.incidentId,
      eventType: "COMMENT",
      actorId: params.actorId,
      actorType: params.actorType || "OPERATOR",
      notes: params.comment,
      evidenceHash: params.evidenceHash,
    });
  }

  /**
   * Retrieves the full chronological timeline for an incident.
   */
  public static async getTimeline(incidentId: string) {
    return await prisma.incidentTimelineEvent.findMany({
      where: { incidentId },
      orderBy: { createdAt: "asc" },
    });
  }
}

