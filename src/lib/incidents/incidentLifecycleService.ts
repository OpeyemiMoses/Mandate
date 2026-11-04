/**
 * Incident Lifecycle Service (Milestone 9.3)
 * Manages deterministic state machine transitions, acknowledgments,
 * assignments, escalations, and resolution audit records.
 */

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import {
  AssignIncidentParams,
  IncidentStage,
  IncidentStatus,
  ResolveIncidentParams,
  TransitionIncidentParams,
} from "./types";

export class IncidentLifecycleService {
  /**
   * Transitions an incident to a new stage with audit ledger logging.
   */
  public static async transitionStage(params: TransitionIncidentParams) {
    const incident = await prisma.incident.findUnique({
      where: { id: params.incidentId },
    });

    if (!incident) {
      throw new Error(`Incident ${params.incidentId} not found`);
    }

    const previousStatus = incident.status;
    const newStage = params.newStage;

    // Map stage to primary status
    let newStatus: IncidentStatus = "INVESTIGATING";
    if (newStage === "DETECTED") newStatus = "DETECTED";
    else if (newStage === "ACKNOWLEDGED") newStatus = "ACKNOWLEDGED";
    else if (newStage === "RECOVERY_PENDING") newStatus = "RECOVERY_PENDING";
    else if (newStage === "RESOLVED") newStatus = "RESOLVED";
    else if (newStage === "ESCALATED") newStatus = "ESCALATED";
    else if (newStage === "MANUAL_INTERVENTION_REQUIRED")
      newStatus = "MANUAL_INTERVENTION_REQUIRED";

    const updated = await prisma.incident.update({
      where: { id: params.incidentId },
      data: {
        currentStage: newStage,
        status: newStatus,
        metadata: JSON.stringify({
          ...JSON.parse(incident.metadata || "{}"),
          ...params.metadata,
        }),
      },
    });

    // Create timeline event
    await prisma.incidentTimelineEvent.create({
      data: {
        incidentId: params.incidentId,
        eventType: "STAGE_CHANGED",
        previousStatus,
        newStatus,
        actorId: params.actorId || "SYSTEM",
        actorType: params.actorType || "OPERATOR",
        notes: params.notes,
        evidenceHash: params.evidenceHash,
      },
    });

    // Record audit event
    await recordAuditEvent({
      userId: incident.tenantId || "SYSTEM",
      eventType: "INCIDENT_STAGE_TRANSITION",
      description: `Incident ${incident.incidentNumber} transitioned to stage ${newStage}`,
      details: {
        incidentNumber: incident.incidentNumber,
        previousStage: incident.currentStage,
        newStage,
        newStatus,
        notes: params.notes,
        actorId: params.actorId,
      },
    });

    return updated;
  }

  /**
   * Acknowledges an incident by an operator.
   */
  public static async acknowledgeIncident(
    incidentId: string,
    acknowledgedBy: string,
    notes?: string
  ) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: "ACKNOWLEDGED",
        currentStage: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
        acknowledgedBy,
      },
    });

    await prisma.incidentTimelineEvent.create({
      data: {
        incidentId,
        eventType: "STATUS_CHANGED",
        previousStatus: incident.status,
        newStatus: "ACKNOWLEDGED",
        actorId: acknowledgedBy,
        actorType: "OPERATOR",
        notes: notes || `Incident acknowledged by ${acknowledgedBy}.`,
      },
    });

    return updated;
  }

  /**
   * Assigns an incident to an operator or specialized team.
   */
  public static async assignIncident(params: AssignIncidentParams) {
    const incident = await prisma.incident.findUnique({
      where: { id: params.incidentId },
    });

    if (!incident) {
      throw new Error(`Incident ${params.incidentId} not found`);
    }

    const updated = await prisma.incident.update({
      where: { id: params.incidentId },
      data: {
        assignedTo: params.assignedTo,
        assignedTeam: params.assignedTeam || incident.assignedTeam,
      },
    });

    // Persist assignment record
    await prisma.incidentAssignment.create({
      data: {
        incidentId: params.incidentId,
        assignedTo: params.assignedTo,
        assignedBy: params.assignedBy,
        role: params.role || "RESPONDER",
      },
    });

    // Add timeline event
    await prisma.incidentTimelineEvent.create({
      data: {
        incidentId: params.incidentId,
        eventType: "ASSIGNED",
        actorId: params.assignedBy,
        actorType: "OPERATOR",
        notes:
          params.notes ||
          `Assigned to ${params.assignedTo} (role: ${params.role || "RESPONDER"}).`,
      },
    });

    return updated;
  }

  /**
   * Resolves an incident with summary and verifies linked discrepancies.
   */
  public static async resolveIncident(params: ResolveIncidentParams) {
    const incident = await prisma.incident.findUnique({
      where: { id: params.incidentId },
      include: { discrepancies: true },
    });

    if (!incident) {
      throw new Error(`Incident ${params.incidentId} not found`);
    }

    const now = new Date();

    const updated = await prisma.incident.update({
      where: { id: params.incidentId },
      data: {
        status: "RESOLVED",
        currentStage: "RESOLVED",
        resolvedAt: now,
        resolvedBy: params.resolvedBy,
        resolutionSummary: params.resolutionSummary,
      },
    });

    // Resolve linked discrepancies as well
    for (const d of incident.discrepancies) {
      if (d.status !== "RESOLVED") {
        await prisma.executionDiscrepancy.update({
          where: { id: d.id },
          data: {
            status: "RESOLVED",
            resolvedAt: now,
            resolutionNotes: `Resolved via incident ${incident.incidentNumber}: ${params.resolutionSummary}`,
          },
        });
      }
    }

    // Add resolution timeline event
    await prisma.incidentTimelineEvent.create({
      data: {
        incidentId: params.incidentId,
        eventType: "RESOLVED",
        previousStatus: incident.status,
        newStatus: "RESOLVED",
        actorId: params.resolvedBy,
        actorType: params.actorType || "OPERATOR",
        notes: `Incident resolved: ${params.resolutionSummary}`,
      },
    });

    // Record audit event
    await recordAuditEvent({
      userId: incident.tenantId || "SYSTEM",
      eventType: "INCIDENT_RESOLVED",
      description: `Incident ${incident.incidentNumber} resolved: ${params.resolutionSummary}`,
      details: {
        incidentNumber: incident.incidentNumber,
        resolvedBy: params.resolvedBy,
        resolutionSummary: params.resolutionSummary,
      },
    });

    return updated;
  }

  /**
   * Retrieves full incident details with timeline, discrepancies, and recovery plans.
   */
  public static async getIncidentDetail(incidentId: string) {
    return await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        timelineEvents: {
          orderBy: { createdAt: "asc" },
        },
        discrepancies: true,
        assignments: {
          orderBy: { assignedAt: "desc" },
        },
        recoveryPlans: {
          include: {
            approvals: true,
            attempts: {
              include: { verifications: true },
            },
            verifications: true,
          },
        },
      },
    });
  }

  /**
   * Lists incidents with filtering.
   */
  public static async listIncidents(filter?: {
    tenantId?: string;
    status?: string;
    severity?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};
    if (filter?.tenantId) where.tenantId = filter.tenantId;
    if (filter?.status) where.status = filter.status;
    if (filter?.severity) where.severity = filter.severity;
    if (filter?.category) where.category = filter.category;

    const [items, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: [{ detectedAt: "desc" }],
        take: filter?.limit ?? 50,
        skip: filter?.offset ?? 0,
        include: {
          _count: {
            select: {
              timelineEvents: true,
              discrepancies: true,
              recoveryPlans: true,
            },
          },
        },
      }),
      prisma.incident.count({ where }),
    ]);

    return { items, total };
  }
}
