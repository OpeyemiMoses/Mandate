/**
 * Execution Discrepancy Service (Milestone 9.3)
 * Manages persistent, deduplicated operational and financial discrepancies.
 */

import { prisma } from "@/lib/db";
import {
  DiscrepancyCategory,
  DiscrepancyStatus,
  EvaluatedFinding,
  ReconciliationSeverity,
} from "./types";

export class DiscrepancyService {
  /**
   * Generates a stable deduplication key for a discrepancy.
   */
  static generateDeduplicationKey(
    entityType: string,
    entityId: string,
    category: DiscrepancyCategory | string
  ): string {
    return `${entityType.toUpperCase()}:${entityId}:${category.toUpperCase()}`;
  }

  /**
   * Records or updates a discrepancy from an evaluated finding.
   */
  static async recordDiscrepancyFromFinding(
    finding: EvaluatedFinding,
    tenantId?: string
  ) {
    // Map classification to discrepancy category
    let category: DiscrepancyCategory = "STATE_DESYNC";
    if (finding.classification === "AMBIGUOUS") {
      category = "FINANCIAL_AMBIGUITY";
    } else if (finding.classification === "UNAVAILABLE") {
      category = "PROVIDER_UNAVAILABLE";
    } else if (finding.entityType === "JOB") {
      category = finding.details.includes("lease") ? "LEASE_EXPIRED" : "ORPHANED_JOB";
    } else if (finding.entityType === "WORKER") {
      category = "STALE_WORKER";
    }

    const dedupKey = this.generateDeduplicationKey(
      finding.entityType,
      finding.entityId,
      category
    );

    const now = new Date();

    const existing = await prisma.executionDiscrepancy.findUnique({
      where: { deduplicationKey: dedupKey },
    });

    if (existing) {
      // If discrepancy exists and is still OPEN or ACKNOWLEDGED, bump observation timestamp
      if (existing.status === "OPEN" || existing.status === "ACKNOWLEDGED") {
        return await prisma.executionDiscrepancy.update({
          where: { id: existing.id },
          data: {
            lastObservedAt: now,
            severity: finding.severity,
            internalState: finding.internalState,
            externalState: finding.externalState,
            recommendedResponse: finding.recommendedResponse,
            metadata: JSON.stringify({
              ...JSON.parse(existing.metadata || "{}"),
              lastFindingDetails: finding.details,
              observationCount:
                (JSON.parse(existing.metadata || "{}").observationCount || 1) + 1,
            }),
          },
        });
      }

      // If previously RESOLVED or IGNORED but now re-observed, reopen as OPEN
      return await prisma.executionDiscrepancy.update({
        where: { id: existing.id },
        data: {
          status: "OPEN",
          severity: finding.severity,
          internalState: finding.internalState,
          externalState: finding.externalState,
          recommendedResponse: finding.recommendedResponse,
          lastObservedAt: now,
          resolvedAt: null,
          resolutionNotes: null,
          metadata: JSON.stringify({
            ...JSON.parse(existing.metadata || "{}"),
            reopenedAt: now.toISOString(),
            reopenReason: finding.details,
          }),
        },
      });
    }

    // Create fresh discrepancy
    return await prisma.executionDiscrepancy.create({
      data: {
        tenantId,
        entityType: finding.entityType,
        entityId: finding.entityId,
        category,
        severity: finding.severity,
        status: "OPEN",
        deduplicationKey: dedupKey,
        internalState: finding.internalState,
        externalState: finding.externalState,
        recommendedResponse: finding.recommendedResponse,
        firstDetectedAt: now,
        lastObservedAt: now,
        metadata: JSON.stringify({
          initialFindingDetails: finding.details,
          observationCount: 1,
          ...finding.metadata,
        }),
      },
    });
  }

  /**
   * Resolves an active discrepancy.
   */
  static async resolveDiscrepancy(
    id: string,
    resolutionNotes: string,
    resolvedBy: string = "SYSTEM"
  ) {
    const existing = await prisma.executionDiscrepancy.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`ExecutionDiscrepancy with id ${id} not found`);
    }

    return await prisma.executionDiscrepancy.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolutionNotes: `[Resolved by ${resolvedBy}]: ${resolutionNotes}`,
      },
    });
  }

  /**
   * Lists discrepancies with flexible filtering.
   */
  static async listDiscrepancies(filter?: {
    tenantId?: string;
    status?: DiscrepancyStatus;
    severity?: ReconciliationSeverity;
    entityType?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};
    if (filter?.tenantId) where.tenantId = filter.tenantId;
    if (filter?.status) where.status = filter.status;
    if (filter?.severity) where.severity = filter.severity;
    if (filter?.entityType) where.entityType = filter.entityType;

    const [items, total] = await Promise.all([
      prisma.executionDiscrepancy.findMany({
        where,
        orderBy: [{ lastObservedAt: "desc" }],
        take: filter?.limit ?? 50,
        skip: filter?.offset ?? 0,
        include: {
          incident: {
            select: {
              id: true,
              incidentNumber: true,
              title: true,
              status: true,
              severity: true,
            },
          },
        },
      }),
      prisma.executionDiscrepancy.count({ where }),
    ]);

    return { items, total };
  }
}

