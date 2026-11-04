/**
 * Central Reconciliation Orchestrator (Milestone 9.3)
 * Coordinates platform-wide reconciliation runs across executions,
 * background jobs, workers, and external providers with concurrency safety.
 */

import { prisma } from "@/lib/db";
import { recordMetric } from "@/lib/observability";
import {
  EvaluatedFinding,
  ReconciliationRunOptions,
  ReconciliationRunResult,
  ReconciliationRunType,
} from "./types";
import { ExecutionReconciler } from "./executionReconciler";
import { JobReconciler } from "./jobReconciler";
import { WorkerReconciler } from "./workerReconciler";
import { ProviderReconciler } from "./providerReconciler";
import { EvidenceService } from "./evidenceService";
import { DiscrepancyService } from "./discrepancyService";

// In-memory run lock to prevent overlapping runs within the same instance
let isRunInProgress = false;

export class ReconciliationService {
  /**
   * Executes a full or targeted reconciliation sweep.
   */
  public static async executeRun(
    options?: ReconciliationRunOptions
  ): Promise<ReconciliationRunResult> {
    const runType: ReconciliationRunType = options?.runType || "FULL";
    const startTime = Date.now();

    // Prevent concurrent runs
    if (isRunInProgress && !options?.dryRun) {
      throw new Error(
        "A reconciliation run is already in progress. Please wait for it to complete."
      );
    }

    isRunInProgress = true;

    // Create DB run record
    let runRecord: any = null;
    if (!options?.dryRun) {
      runRecord = await prisma.reconciliationRun.create({
        data: {
          tenantId: options?.tenantId,
          runType,
          status: "RUNNING",
          targetScope: options?.targetScope || (options?.entityIds ? options.entityIds.join(",") : undefined),
          metadata: JSON.stringify({
            options: {
              targetScope: options?.targetScope,
              entityCount: options?.entityIds?.length || 0,
            },
          }),
        },
      });
    }

    const allFindings: EvaluatedFinding[] = [];
    let status: "COMPLETED" | "FAILED" | "PARTIAL" = "COMPLETED";
    let runError: string | undefined;

    try {
      // 1. Reconcile Executions
      if (runType === "FULL" || runType === "TARGETED_EXECUTION") {
        const execFindings = await ExecutionReconciler.reconcileAllInFlight({
          tenantId: options?.tenantId,
          executionIds: options?.entityIds,
          rpcUrl: options?.rpcUrl,
          timeoutMs: options?.timeoutMs,
        });
        allFindings.push(...execFindings);
      }

      // 2. Reconcile Jobs
      if (runType === "FULL" || runType === "TARGETED_JOB") {
        const jobFindings = await JobReconciler.reconcileAllActiveJobs({
          tenantId: options?.tenantId,
          jobIds: options?.entityIds,
        });
        allFindings.push(...jobFindings);
      }

      // 3. Reconcile Workers
      if (runType === "FULL" || runType === "TARGETED_WORKER") {
        const workerFindings = await WorkerReconciler.reconcileAllWorkers();
        allFindings.push(...workerFindings);
      }

      // 4. Reconcile Providers
      if (runType === "FULL" || runType === "TARGETED_PROVIDER") {
        const providerFindings = await ProviderReconciler.reconcileAllProviders();
        allFindings.push(...providerFindings);
      }

      // Calculate counts
      let matchedCount = 0;
      let mismatchCount = 0;
      let ambiguousCount = 0;

      for (const finding of allFindings) {
        if (finding.classification === "MATCHED") {
          matchedCount++;
        } else if (finding.classification === "AMBIGUOUS") {
          ambiguousCount++;
        } else if (
          finding.classification === "STATE_MISMATCH" ||
          finding.classification === "INTERNAL_ONLY" ||
          finding.classification === "EXTERNAL_ONLY" ||
          finding.classification === "UNAVAILABLE"
        ) {
          mismatchCount++;
        }
      }

      // Persist findings and evidence if not dryRun
      if (runRecord && !options?.dryRun) {
        for (const finding of allFindings) {
          // If finding indicates a mismatch or ambiguity, persist or update Discrepancy
          let discrepancyId: string | undefined;
          if (
            finding.classification === "STATE_MISMATCH" ||
            finding.classification === "AMBIGUOUS" ||
            finding.classification === "UNAVAILABLE"
          ) {
            const discrepancy = await DiscrepancyService.recordDiscrepancyFromFinding(
              finding,
              options?.tenantId
            );
            discrepancyId = discrepancy.id;
          }

          // Create Finding record
          const dbFinding = await prisma.reconciliationFinding.create({
            data: {
              runId: runRecord.id,
              entityType: finding.entityType,
              entityId: finding.entityId,
              internalState: finding.internalState,
              externalState: finding.externalState,
              classification: finding.classification,
              severity: finding.severity,
              details: finding.details,
              discrepancyId,
            },
          });

          // Save associated evidence
          for (const ev of finding.evidence) {
            await EvidenceService.recordEvidence({
              runId: runRecord.id,
              findingId: dbFinding.id,
              entityType: finding.entityType,
              entityId: finding.entityId,
              sourceProvider: ev.sourceProvider,
              observedState: ev.observedState,
              confidence: ev.confidence,
              rawPayload: ev.data,
            });
          }
        }

        // Update run completion status
        await prisma.reconciliationRun.update({
          where: { id: runRecord.id },
          data: {
            status: "COMPLETED",
            totalEvaluated: allFindings.length,
            matchedCount,
            mismatchCount,
            ambiguousCount,
            findingsCount: allFindings.length,
            completedAt: new Date(),
          },
        });
      }

      const durationMs = Date.now() - startTime;

      // Telemetry: record metric
      try {
        recordMetric("mandate.reconciliation.duration_ms", durationMs, "ms", {
          run_type: runType,
          status: "COMPLETED",
        });
        recordMetric("mandate.reconciliation.mismatches", mismatchCount, "count", {
          run_type: runType,
        });
      } catch {
        // Observability non-blocking
      }

      return {
        runId: runRecord?.id || "dry-run",
        runType,
        status: "COMPLETED",
        totalEvaluated: allFindings.length,
        matchedCount,
        mismatchCount,
        ambiguousCount,
        findingsCount: allFindings.length,
        findings: allFindings,
        durationMs,
      };
    } catch (err: any) {
      status = "FAILED";
      runError = err.message;

      if (runRecord && !options?.dryRun) {
        await prisma.reconciliationRun.update({
          where: { id: runRecord.id },
          data: {
            status: "FAILED",
            errorDetails: err.message,
            completedAt: new Date(),
          },
        });
      }

      return {
        runId: runRecord?.id || "failed-run",
        runType,
        status: "FAILED",
        totalEvaluated: allFindings.length,
        matchedCount: 0,
        mismatchCount: 0,
        ambiguousCount: 0,
        findingsCount: 0,
        findings: [],
        durationMs: Date.now() - startTime,
        error: err.message,
      };
    } finally {
      isRunInProgress = false;
    }
  }

  /**
   * Retrieves summary history of past reconciliation runs.
   */
  public static async getRunHistory(limit: number = 20) {
    return await prisma.reconciliationRun.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
      include: {
        _count: {
          select: { findings: true, evidences: true },
        },
      },
    });
  }

  /**
   * Retrieves detail for a specific reconciliation run.
   */
  public static async getRunDetail(runId: string) {
    return await prisma.reconciliationRun.findUnique({
      where: { id: runId },
      include: {
        findings: {
          include: {
            evidences: true,
          },
        },
      },
    });
  }
}

