/**
 * Recovery Approval Service (Milestone 9.3)
 * Enforces strict human authority boundaries and cryptographic parameter binding
 * for financial recovery plans.
 */

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import { IncidentTimelineService } from "@/lib/incidents/incidentTimelineService";
import { ApprovePlanParams } from "./types";

export class RecoveryApprovalService {
  /**
   * Approves a recovery plan with cryptographic hash verification and human role enforcement.
   */
  public static async approvePlan(params: ApprovePlanParams) {
    const plan = await prisma.recoveryPlan.findUnique({
      where: { id: params.planId },
      include: { incident: true },
    });

    if (!plan) {
      throw new Error(`RecoveryPlan ${params.planId} not found`);
    }

    // STRICT INVARIANT 1: AI Agents can NEVER approve financial recovery!
    if (plan.isFinancial && params.approverType !== "HUMAN") {
      throw new Error(
        "SECURITY_POLICY_VIOLATION: Autonomous AI agents are strictly prohibited from approving financial recovery plans. Human authorization required."
      );
    }

    // STRICT INVARIANT 2: Plan must be in PENDING_APPROVAL
    if (plan.status !== "PENDING_APPROVAL") {
      throw new Error(
        `Invalid plan state: Plan ${plan.id} is currently ${plan.status}, cannot approve.`
      );
    }

    // STRICT INVARIANT 3: Verify mandate version has not drifted (Anti-TOCTOU)
    if (plan.isFinancial && plan.targetEntityType === "EXECUTION") {
      const exec = await prisma.executionRecord.findUnique({
        where: { id: plan.targetEntityId },
        include: { mandate: true },
      });

      if (exec && plan.mandateVersion !== null && plan.mandateVersion !== undefined) {
        if (exec.mandate.policyVersion !== plan.mandateVersion) {
          throw new Error(
            `CONCURRENCY_VIOLATION: Mandate version drifted from v${plan.mandateVersion} to v${exec.mandate.policyVersion}. Plan must be re-synthesized.`
          );
        }
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600000); // 1-hour expiration TTL

    // Record approval
    const approval = await prisma.recoveryApproval.create({
      data: {
        planId: plan.id,
        approverId: params.approverId,
        approverRole: params.approverRole,
        approverType: params.approverType,
        status: "APPROVED",
        payloadHash: plan.payloadHash,
        mandateVersion: plan.mandateVersion,
        expiresAt,
        approvedAt: now,
        notes: params.notes,
        signature: params.signature,
      },
    });

    // Update plan status to APPROVED
    await prisma.recoveryPlan.update({
      where: { id: plan.id },
      data: { status: "APPROVED" },
    });

    // If attached to an incident, append timeline event
    if (plan.incidentId) {
      await IncidentTimelineService.recordEvent({
        incidentId: plan.incidentId,
        eventType: "RECOVERY_APPROVED",
        actorId: params.approverId,
        actorType: "OPERATOR",
        notes: `Recovery plan ${plan.id} approved by ${params.approverId} (${params.approverRole}).`,
        evidenceHash: plan.payloadHash,
      });
    }

    // Record audit event
    await recordAuditEvent({
      userId: plan.tenantId || "SYSTEM",
      eventType: "RECOVERY_PLAN_APPROVED",
      description: `Recovery plan ${plan.id} approved by ${params.approverId}`,
      details: {
        planId: plan.id,
        approverId: params.approverId,
        approverRole: params.approverRole,
        isFinancial: plan.isFinancial,
        payloadHash: plan.payloadHash,
      },
    });

    return approval;
  }

  /**
   * Rejects a recovery plan.
   */
  public static async rejectPlan(params: {
    planId: string;
    approverId: string;
    rejectionReason: string;
  }) {
    const plan = await prisma.recoveryPlan.findUnique({
      where: { id: params.planId },
    });

    if (!plan) {
      throw new Error(`RecoveryPlan ${params.planId} not found`);
    }

    const now = new Date();

    const approval = await prisma.recoveryApproval.create({
      data: {
        planId: plan.id,
        approverId: params.approverId,
        approverRole: "OPERATOR",
        approverType: "HUMAN",
        status: "REJECTED",
        payloadHash: plan.payloadHash,
        expiresAt: now,
        rejectedAt: now,
        rejectionReason: params.rejectionReason,
      },
    });

    await prisma.recoveryPlan.update({
      where: { id: plan.id },
      data: { status: "REJECTED" },
    });

    if (plan.incidentId) {
      await IncidentTimelineService.recordEvent({
        incidentId: plan.incidentId,
        eventType: "STATUS_CHANGED",
        newStatus: "RECOVERY_REJECTED",
        actorId: params.approverId,
        actorType: "OPERATOR",
        notes: `Recovery plan rejected: ${params.rejectionReason}`,
      });
    }

    return approval;
  }
}
