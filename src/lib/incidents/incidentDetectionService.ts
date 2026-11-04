/**
 * Incident Detection Service (Milestone 9.3)
 * Analyzes operational discrepancies and automatically opens or updates persistent incidents.
 */

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import {
  CreateIncidentParams,
  IncidentCategory,
  IncidentSeverity,
} from "./types";

export class IncidentDetectionService {
  /**
   * Generates a sequential, readable incident number (e.g. INC-2026-0001).
   */
  public static async generateIncidentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.incident.count();
    const sequence = String(count + 1).padStart(4, "0");
    return `INC-${year}-${sequence}`;
  }

  /**
   * Generates a stable deduplication key for incidents to prevent flapping.
   */
  public static generateDeduplicationKey(
    category: IncidentCategory,
    targetEntityType?: string,
    targetEntityId?: string
  ): string {
    const entityKey = targetEntityType && targetEntityId
      ? `:${targetEntityType.toUpperCase()}:${targetEntityId}`
      : "";
    return `INCIDENT:${category.toUpperCase()}${entityKey}`;
  }

  /**
   * Detects or updates an incident based on an observed execution discrepancy.
   */
  public static async detectFromDiscrepancy(discrepancyId: string) {
    const discrepancy = await prisma.executionDiscrepancy.findUnique({
      where: { id: discrepancyId },
    });

    if (!discrepancy) {
      throw new Error(`Discrepancy ${discrepancyId} not found`);
    }

    // Map discrepancy category to incident category
    let category: IncidentCategory = "SYSTEM_DEGRADATION";
    if (discrepancy.category === "FINANCIAL_AMBIGUITY") {
      category = "FINANCIAL_AMBIGUITY";
    } else if (discrepancy.category === "PROVIDER_UNAVAILABLE" || discrepancy.category === "RPC_TIMEOUT") {
      category = "PROVIDER_OUTAGE";
    } else if (discrepancy.category === "STALE_WORKER" || discrepancy.category === "ORPHANED_JOB") {
      category = "WORKER_STARVATION";
    }

    const dedupKey = this.generateDeduplicationKey(
      category,
      discrepancy.entityType,
      discrepancy.entityId
    );

    // Check if an existing open incident matches this deduplication key
    const existing = await prisma.incident.findFirst({
      where: {
        deduplicationKey: dedupKey,
        status: {
          in: [
            "DETECTED",
            "ACKNOWLEDGED",
            "INVESTIGATING",
            "RECOVERY_PENDING",
            "ESCALATED",
            "MANUAL_INTERVENTION_REQUIRED",
          ],
        },
      },
    });

    if (existing) {
      // Link discrepancy to existing incident
      await prisma.executionDiscrepancy.update({
        where: { id: discrepancy.id },
        data: { incidentId: existing.id },
      });

      // Severity escalation: if incoming discrepancy is SEV-1 and existing was SEV-2/3, escalate
      const severityRank = { "SEV-1": 1, "SEV-2": 2, "SEV-3": 3, "SEV-4": 4 };
      const currentRank = severityRank[existing.severity as IncidentSeverity] || 4;
      const incomingRank = severityRank[discrepancy.severity as IncidentSeverity] || 4;

      if (incomingRank < currentRank) {
        const updated = await prisma.incident.update({
          where: { id: existing.id },
          data: {
            severity: discrepancy.severity,
            status: "ESCALATED",
            currentStage: "ESCALATED",
          },
        });

        await prisma.incidentTimelineEvent.create({
          data: {
            incidentId: existing.id,
            eventType: "ESCALATED",
            previousStatus: existing.status,
            newStatus: "ESCALATED",
            actorId: "SYSTEM",
            actorType: "SYSTEM",
            notes: `Auto-escalated severity from ${existing.severity} to ${discrepancy.severity} due to incoming discrepancy ${discrepancy.id}.`,
          },
        });

        return updated;
      }

      return existing;
    }

    // Create fresh incident
    const incidentNumber = await this.generateIncidentNumber();
    const incident = await this.createIncident({
      tenantId: discrepancy.tenantId || undefined,
      title: `${discrepancy.category}: ${discrepancy.entityType} ${discrepancy.entityId}`,
      description: `Automated detection: Internal state '${discrepancy.internalState}' vs external '${discrepancy.externalState || "NONE"}'. Recommended action: ${discrepancy.recommendedResponse}.`,
      category,
      severity: (discrepancy.severity as IncidentSeverity) || "SEV-2",
      source: "RECONCILIATION",
      targetEntityType: discrepancy.entityType,
      targetEntityId: discrepancy.entityId,
      deduplicationKey: dedupKey,
      metadata: {
        discrepancyId: discrepancy.id,
        initialInternalState: discrepancy.internalState,
        initialExternalState: discrepancy.externalState,
      },
    });

    // Link discrepancy to newly created incident
    await prisma.executionDiscrepancy.update({
      where: { id: discrepancy.id },
      data: { incidentId: incident.id },
    });

    return incident;
  }

  /**
   * Creates a new incident with initial timeline event and audit ledger record.
   */
  public static async createIncident(params: CreateIncidentParams) {
    const incidentNumber = await this.generateIncidentNumber();
    const dedupKey =
      params.deduplicationKey ||
      (params.targetEntityType && params.targetEntityId
        ? this.generateDeduplicationKey(
            params.category,
            params.targetEntityType,
            params.targetEntityId
          )
        : `INCIDENT:${params.category.toUpperCase()}:${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);

    const incident = await prisma.incident.create({
      data: {
        tenantId: params.tenantId,
        incidentNumber,
        title: params.title,
        description: params.description,
        category: params.category,
        severity: params.severity,
        status: "DETECTED",
        currentStage: "DETECTED",
        source: params.source || "RECONCILIATION",
        targetEntityType: params.targetEntityType,
        targetEntityId: params.targetEntityId,
        deduplicationKey: dedupKey,
        assignedTeam: params.assignedTeam || (params.category === "FINANCIAL_AMBIGUITY" ? "finance" : "infrastructure"),
        assignedTo: params.assignedTo,
        metadata: JSON.stringify(params.metadata || {}),
      },
    });

    // Append initial timeline event
    await prisma.incidentTimelineEvent.create({
      data: {
        incidentId: incident.id,
        eventType: "CREATED",
        previousStatus: null,
        newStatus: "DETECTED",
        actorId: params.actorId || "SYSTEM",
        actorType: params.actorType || "SYSTEM",
        notes: `Incident ${incident.incidentNumber} created with severity ${incident.severity}.`,
        evidenceHash: params.evidenceHash,
      },
    });

    // Audit log
    await recordAuditEvent({
      userId: params.tenantId || "SYSTEM",
      eventType: "INCIDENT_CREATED",
      description: `Incident ${incident.incidentNumber} created with severity ${incident.severity}.`,
      details: {
        incidentNumber: incident.incidentNumber,
        severity: incident.severity,
        category: incident.category,
        title: incident.title,
      },
    });

    return incident;
  }
}
