/**
 * Recovery Planner Service (Milestone 9.3)
 * Synthesizes deterministic recovery plans bound to cryptographic hashes and mandate versions.
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { IncidentTimelineService } from "@/lib/incidents/incidentTimelineService";
import { PlanGenerationParams, RecoveryPlanStatus, RecoveryStrategy } from "./types";

export class RecoveryPlanner {
  /**
   * Generates a deterministic SHA-256 hash of the recovery action payload.
   */
  public static computePayloadHash(payload: Record<string, any>): string {
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  }

  /**
   * Plans a safe recovery workflow for a target entity.
   */
  public static async planRecovery(params: PlanGenerationParams) {
    let isFinancial = params.isFinancial ?? false;
    let strategy: RecoveryStrategy = params.strategy ?? "RECONCILE_ONLY";
    let mandateVersion = params.mandateVersion;
    let tenantId = params.tenantId;

    const actionPayload: Record<string, any> = {
      targetEntityType: params.targetEntityType,
      targetEntityId: params.targetEntityId,
      timestamp: new Date().toISOString(),
      ...params.actionPayload,
    };

    // 1. Inspect Execution target
    if (params.targetEntityType === "EXECUTION") {
      isFinancial = true;
      const exec = await prisma.executionRecord.findUnique({
        where: { id: params.targetEntityId },
        include: { mandate: true },
      });

      if (exec) {
        tenantId = tenantId || exec.userId;
        mandateVersion = mandateVersion ?? exec.mandateVersion ?? exec.mandate.policyVersion;
        actionPayload.amountYocto = exec.amountYocto;
        actionPayload.recipient = exec.recipient;
        actionPayload.txHash = exec.txHash;
        actionPayload.currentStatus = exec.status;

        if (exec.status === "CONFIRMING" || exec.status === "BROADCAST") {
          strategy = "EXECUTION_STATUS_CHECK";
        } else if (exec.recoveryStatus === "MANUAL_INTERVENTION_REQUIRED" || !exec.txHash) {
          strategy = "MANUAL_FINANCIAL_REVIEW";
        } else {
          strategy = "EXECUTION_STATUS_CHECK";
        }
      }
    } else if (params.targetEntityType === "JOB") {
      const job = await prisma.backgroundJob.findUnique({
        where: { id: params.targetEntityId },
      });

      if (job) {
        tenantId = tenantId || job.tenantId;
        if (job.jobCategory === "FINANCIAL") {
          isFinancial = true;
          strategy = "MANUAL_FINANCIAL_REVIEW";
        } else {
          isFinancial = false;
          strategy = job.status === "REQUIRES_RECOVERY" ? "RESUME_SAFE_JOB" : "RECLAIM_EXPIRED_WORKER_LEASE";
        }
        actionPayload.jobType = job.jobType;
        actionPayload.jobCategory = job.jobCategory;
        actionPayload.attempts = job.attempts;
      }
    } else if (params.targetEntityType === "WORKER") {
      isFinancial = false;
      strategy = "RECLAIM_EXPIRED_WORKER_LEASE";
    } else if (params.targetEntityType === "PROVIDER") {
      isFinancial = false;
      strategy = "RECONNECT_PROVIDER";
    }

    // Safety Invariant: Financial recovery ALWAYS requires human approval!
    const requiresApproval = isFinancial;
    const initialStatus: RecoveryPlanStatus = requiresApproval
      ? "PENDING_APPROVAL"
      : "APPROVED";

    actionPayload.strategy = strategy;
    actionPayload.requiresApproval = requiresApproval;

    const payloadHash = this.computePayloadHash(actionPayload);

    const plan = await prisma.recoveryPlan.create({
      data: {
        incidentId: params.incidentId,
        tenantId,
        targetEntityType: params.targetEntityType,
        targetEntityId: params.targetEntityId,
        strategy,
        status: initialStatus,
        isFinancial,
        actionPayloadJson: JSON.stringify(actionPayload),
        payloadHash,
        requiresApproval,
        mandateVersion,
        createdBy: params.createdBy || "SYSTEM_PLANNER",
      },
    });

    // If linked to an incident, update incident stage and timeline
    if (params.incidentId) {
      await prisma.incident.update({
        where: { id: params.incidentId },
        data: { currentStage: "RECOVERY_PENDING", status: "RECOVERY_PENDING" },
      });

      await IncidentTimelineService.recordEvent({
        incidentId: params.incidentId,
        eventType: "RECOVERY_PLANNED",
        actorId: params.createdBy || "SYSTEM_PLANNER",
        actorType: "SYSTEM",
        notes: `Generated recovery plan (${strategy}) - requiresApproval: ${requiresApproval}, isFinancial: ${isFinancial}.`,
        evidenceHash: payloadHash,
      });
    }

    return plan;
  }
}
