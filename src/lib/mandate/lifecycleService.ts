/**
 * Centralized Mandate Lifecycle Management Service
 * Milestone 12 - Complete Mandate Spending Lifecycle & Invariant Enforcement
 */

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import { yoctoToNear, isValidYoctoString } from "@/lib/yocto";
import { releaseMandateBudgetAtomic } from "@/lib/objectives/authority";
import {
  MandateLifecycleStatus,
  MandateTransitionParams,
  MandateUpdateConfigParams,
  MandateLifecycleTransitionResult,
} from "./types";

export class MandateLifecycleService {
  /**
   * Allowed state transition graph.
   * Maps current status -> list of permitted target statuses.
   */
  private static readonly VALID_TRANSITIONS: Record<MandateLifecycleStatus, MandateLifecycleStatus[]> = {
    DRAFT: ["ACTIVE", "REVOKED"],
    ACTIVE: ["PAUSED", "EXPIRED", "BUDGET_EXHAUSTED", "REVOKED", "COMPLETED"],
    PAUSED: ["ACTIVE", "EXPIRED", "REVOKED", "COMPLETED"],
    EXPIRED: ["ACTIVE", "REVOKED"], // Can only return to ACTIVE if explicitly extended by owner
    BUDGET_EXHAUSTED: ["ACTIVE", "REVOKED", "COMPLETED"], // Can return to ACTIVE if budget increased by owner
    REVOKED: [], // Terminal state
    COMPLETED: [], // Terminal state
  };

  /**
   * Asserts whether a mandate can legally perform financial operations.
   * Fails closed with deterministic reasons.
   */
  public static assertCanExecute(mandate: {
    id: string;
    name: string;
    status: string;
    expiresAt: Date;
    totalBudgetYocto: string;
    spentYocto: string;
    reservedYocto: string;
  }): void {
    const status = mandate.status as MandateLifecycleStatus;

    switch (status) {
      case "DRAFT":
        throw new Error(
          `Mandate "${mandate.name}" (${mandate.id}) is in DRAFT state and has not been activated by its owner.`
        );
      case "PAUSED":
        throw new Error(
          `Mandate "${mandate.name}" (${mandate.id}) is PAUSED. Spending execution is suspended.`
        );
      case "EXPIRED":
        throw new Error(
          `Mandate "${mandate.name}" (${mandate.id}) has EXPIRED on ${mandate.expiresAt.toISOString()}.`
        );
      case "BUDGET_EXHAUSTED":
        throw new Error(
          `Mandate "${mandate.name}" (${mandate.id}) has EXHAUSTED its authorized budget (${yoctoToNear(mandate.totalBudgetYocto)} NEAR spent).`
        );
      case "REVOKED":
        throw new Error(
          `Mandate "${mandate.name}" (${mandate.id}) was permanently REVOKED by its owner.`
        );
      case "COMPLETED":
        throw new Error(
          `Mandate "${mandate.name}" (${mandate.id}) is COMPLETED and closed.`
        );
      case "ACTIVE":
        break; // Permitted
      default:
        throw new Error(
          `Mandate "${mandate.name}" (${mandate.id}) has unknown status "${status}". Halting execution.`
        );
    }

    // Time-based expiration check
    if (new Date() >= new Date(mandate.expiresAt)) {
      throw new Error(
        `Mandate "${mandate.name}" (${mandate.id}) expired at ${mandate.expiresAt.toISOString()}. Execution prohibited.`
      );
    }

    // Budget exhaustion check
    const total = BigInt(mandate.totalBudgetYocto);
    const spent = BigInt(mandate.spentYocto || "0");
    const reserved = BigInt(mandate.reservedYocto || "0");
    if (spent >= total && reserved === BigInt(0)) {
      throw new Error(
        `Mandate "${mandate.name}" (${mandate.id}) budget exhausted: total ${yoctoToNear(mandate.totalBudgetYocto)} NEAR, spent ${yoctoToNear(mandate.spentYocto)} NEAR.`
      );
    }
  }

  /**
   * Evaluates and updates dynamic time/budget lifecycle transitions (e.g. EXPIRED or BUDGET_EXHAUSTED).
   */
  public static async evaluateAndSyncStatus(mandateId: string): Promise<MandateLifecycleStatus> {
    const mandate = await prisma.mandate.findUnique({
      where: { id: mandateId },
    });

    if (!mandate) {
      throw new Error(`Mandate ${mandateId} not found`);
    }

    const currentStatus = mandate.status as MandateLifecycleStatus;
    if (currentStatus !== "ACTIVE" && currentStatus !== "PAUSED") {
      return currentStatus;
    }

    const now = new Date();
    // 1. Expiration check
    if (now >= new Date(mandate.expiresAt)) {
      await this.transitionStatus({
        mandateId,
        targetStatus: "EXPIRED",
        actorUserId: mandate.userId,
        reason: `Mandate expiration timestamp reached (${mandate.expiresAt.toISOString()})`,
        isSystemTriggered: true,
      });
      return "EXPIRED";
    }

    // 2. Budget exhaustion check
    const total = BigInt(mandate.totalBudgetYocto);
    const spent = BigInt(mandate.spentYocto || "0");
    const reserved = BigInt(mandate.reservedYocto || "0");
    if (spent >= total && reserved === BigInt(0) && currentStatus === "ACTIVE") {
      await this.transitionStatus({
        mandateId,
        targetStatus: "BUDGET_EXHAUSTED",
        actorUserId: mandate.userId,
        reason: `Full authorized budget of ${yoctoToNear(mandate.totalBudgetYocto)} NEAR confirmed spent`,
        isSystemTriggered: true,
      });
      return "BUDGET_EXHAUSTED";
    }

    return currentStatus;
  }

  /**
   * Internal deterministic status transition engine.
   */
  private static async transitionStatus(params: {
    mandateId: string;
    targetStatus: MandateLifecycleStatus;
    actorUserId: string;
    reason: string;
    isSystemTriggered?: boolean;
    metadata?: Record<string, any>;
  }): Promise<MandateLifecycleTransitionResult> {
    const { mandateId, targetStatus, actorUserId, reason, isSystemTriggered = false, metadata = {} } = params;

    const result = await prisma.$transaction(async (tx) => {
      const mandate = await tx.mandate.findUnique({
        where: { id: mandateId },
        include: { agent: true, wallet: true },
      });

      if (!mandate) {
        throw new Error(`Mandate ${mandateId} not found`);
      }

      if (!isSystemTriggered && mandate.userId !== actorUserId) {
        throw new Error(`Unauthorized: User ${actorUserId} does not own mandate ${mandateId}`);
      }

      const currentStatus = mandate.status as MandateLifecycleStatus;
      if (currentStatus === targetStatus) {
        return {
          success: true,
          previousStatus: currentStatus,
          newStatus: targetStatus,
          mandateId,
          policyVersion: mandate.policyVersion,
          reason: "Status already in target state",
          shouldAudit: false,
          userId: mandate.userId,
          mandateName: mandate.name,
          agentId: mandate.agentId,
          walletAddress: mandate.wallet?.nearAccountId,
        };
      }

      // Check transition validity
      const allowed = this.VALID_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(targetStatus)) {
        throw new Error(
          `Illegal lifecycle transition: Cannot move mandate from ${currentStatus} to ${targetStatus}`
        );
      }

      // If transitioning to REVOKED or COMPLETED, release any remaining uncommitted reserved budget
      const currentReserved = BigInt(mandate.reservedYocto || "0");
      let nextReservedYocto = mandate.reservedYocto;
      if ((targetStatus === "REVOKED" || targetStatus === "COMPLETED") && currentReserved > BigInt(0)) {
        nextReservedYocto = "0";
      }

      const nextVersion = (mandate.policyVersion || 1) + 1;

      const updated = await tx.mandate.update({
        where: { id: mandateId },
        data: {
          status: targetStatus,
          reservedYocto: nextReservedYocto,
          policyVersion: nextVersion,
        },
      });

      return {
        success: true,
        previousStatus: currentStatus,
        newStatus: targetStatus,
        mandateId,
        policyVersion: nextVersion,
        shouldAudit: true,
        userId: mandate.userId,
        mandateName: mandate.name,
        agentId: mandate.agentId,
        walletAddress: mandate.wallet?.nearAccountId,
        currentReserved,
        nextReservedYocto,
      };
    });

    if (result.shouldAudit) {
      // Record immutable cryptographic audit log event post-transaction
      await recordAuditEvent({
        userId: result.userId,
        eventType: `MANDATE_STATUS_${targetStatus}`,
        verdict: "SUCCESS",
        description: `Mandate "${result.mandateName}" transitioned from ${result.previousStatus} to ${targetStatus}. Reason: ${reason}`,
        mandateId,
        agentId: result.agentId,
        agentWalletAddress: result.walletAddress,
        details: {
          previousStatus: result.previousStatus,
          newStatus: targetStatus,
          policyVersion: result.policyVersion,
          reason,
          actorUserId,
          isSystemTriggered,
          releasedReservedYocto:
            result.currentReserved && result.currentReserved > BigInt(0) && result.nextReservedYocto === "0"
              ? result.currentReserved.toString()
              : "0",
          ...metadata,
        },
      });
    }

    return {
      success: true,
      previousStatus: result.previousStatus,
      newStatus: targetStatus,
      mandateId,
      policyVersion: result.policyVersion,
    };
  }

  /**
   * Activates a DRAFT, PAUSED, or RENEWED mandate.
   */
  public static async activateMandate(params: MandateTransitionParams): Promise<MandateLifecycleTransitionResult> {
    const mandate = await prisma.mandate.findUnique({
      where: { id: params.mandateId },
      include: { wallet: true, agent: true },
    });

    if (!mandate) throw new Error("Mandate not found");
    if (mandate.userId !== params.actorUserId) throw new Error("Unauthorized");

    // Validate that custody wallet is configured
    if (!mandate.wallet || !mandate.wallet.nearAccountId) {
      throw new Error("Cannot activate mandate without an active dedicated custody wallet");
    }

    // Validate that expiration is in future
    if (new Date() >= new Date(mandate.expiresAt)) {
      throw new Error(`Cannot activate expired mandate (expiresAt: ${mandate.expiresAt.toISOString()})`);
    }

    // Validate budget
    const total = BigInt(mandate.totalBudgetYocto);
    const spent = BigInt(mandate.spentYocto || "0");
    if (spent >= total) {
      throw new Error("Cannot activate mandate with exhausted budget");
    }

    return await this.transitionStatus({
      mandateId: params.mandateId,
      targetStatus: "ACTIVE",
      actorUserId: params.actorUserId,
      reason: params.reason || "Owner activated mandate for autonomous spending",
      metadata: params.metadata,
    });
  }

  /**
   * Pauses an ACTIVE mandate. Suspends all financial execution immediately.
   */
  public static async pauseMandate(params: MandateTransitionParams): Promise<MandateLifecycleTransitionResult> {
    return await this.transitionStatus({
      mandateId: params.mandateId,
      targetStatus: "PAUSED",
      actorUserId: params.actorUserId,
      reason: params.reason || "Owner paused mandate execution",
      metadata: params.metadata,
    });
  }

  /**
   * Resumes a PAUSED mandate back to ACTIVE.
   */
  public static async resumeMandate(params: MandateTransitionParams): Promise<MandateLifecycleTransitionResult> {
    const mandate = await prisma.mandate.findUnique({
      where: { id: params.mandateId },
    });
    if (!mandate) throw new Error("Mandate not found");

    if (new Date() >= new Date(mandate.expiresAt)) {
      throw new Error(`Cannot resume expired mandate. Please extend expiration first.`);
    }

    return await this.transitionStatus({
      mandateId: params.mandateId,
      targetStatus: "ACTIVE",
      actorUserId: params.actorUserId,
      reason: params.reason || "Owner resumed mandate execution",
      metadata: params.metadata,
    });
  }

  /**
   * Revokes a mandate permanently. Terminal.
   */
  public static async revokeMandate(params: MandateTransitionParams): Promise<MandateLifecycleTransitionResult> {
    return await this.transitionStatus({
      mandateId: params.mandateId,
      targetStatus: "REVOKED",
      actorUserId: params.actorUserId,
      reason: params.reason || "Owner permanently revoked mandate",
      metadata: params.metadata,
    });
  }

  /**
   * Marks a mandate as COMPLETED. Terminal.
   */
  public static async completeMandate(params: MandateTransitionParams): Promise<MandateLifecycleTransitionResult> {
    return await this.transitionStatus({
      mandateId: params.mandateId,
      targetStatus: "COMPLETED",
      actorUserId: params.actorUserId,
      reason: params.reason || "Mandate objective completed",
      metadata: params.metadata,
    });
  }

  /**
   * Updates mandate configuration parameters safely.
   * Increments policyVersion to strictly invalidate any previously signed authorization envelopes.
   */
  public static async updateConfig(params: MandateUpdateConfigParams): Promise<{
    success: boolean;
    mandateId: string;
    newPolicyVersion: number;
    status: MandateLifecycleStatus;
  }> {
    const {
      mandateId,
      actorUserId,
      name,
      description,
      totalBudgetYocto,
      perTxLimitYocto,
      approvalThresholdYocto,
      allowedRecipients,
      expiresAt,
      reason = "Owner updated mandate parameters",
    } = params;

    const result = await prisma.$transaction(async (tx) => {
      const mandate = await tx.mandate.findUnique({
        where: { id: mandateId },
      });

      if (!mandate) throw new Error("Mandate not found");
      if (mandate.userId !== actorUserId) throw new Error("Unauthorized");

      if (mandate.status === "REVOKED" || mandate.status === "COMPLETED") {
        throw new Error(`Cannot modify ${mandate.status} mandate`);
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;

      if (totalBudgetYocto) {
        if (!isValidYoctoString(totalBudgetYocto)) throw new Error("Invalid totalBudgetYocto");
        const newTotal = BigInt(totalBudgetYocto);
        const currentSpent = BigInt(mandate.spentYocto || "0");
        if (newTotal < currentSpent) {
          throw new Error(
            `New total budget (${yoctoToNear(totalBudgetYocto)} NEAR) cannot be less than confirmed spent (${yoctoToNear(mandate.spentYocto)} NEAR)`
          );
        }
        updateData.totalBudgetYocto = totalBudgetYocto;

        // If previously budget exhausted and we increase budget, reactivate if unexpired
        if (mandate.status === "BUDGET_EXHAUSTED" && newTotal > currentSpent) {
          if (new Date() < new Date(mandate.expiresAt)) {
            updateData.status = "ACTIVE";
          }
        }
      }

      if (perTxLimitYocto) {
        if (!isValidYoctoString(perTxLimitYocto)) throw new Error("Invalid perTxLimitYocto");
        updateData.perTxLimitYocto = perTxLimitYocto;
      }

      if (approvalThresholdYocto) {
        if (!isValidYoctoString(approvalThresholdYocto)) throw new Error("Invalid approvalThresholdYocto");
        updateData.approvalThresholdYocto = approvalThresholdYocto;
      }

      if (allowedRecipients) {
        updateData.allowedRecipientsJson = JSON.stringify(allowedRecipients);
      }

      if (expiresAt) {
        updateData.expiresAt = new Date(expiresAt);
        // If previously expired and extended into future, reactivate
        if (mandate.status === "EXPIRED" && new Date(expiresAt) > new Date()) {
          const total = BigInt(updateData.totalBudgetYocto || mandate.totalBudgetYocto);
          const spent = BigInt(mandate.spentYocto || "0");
          if (total > spent) {
            updateData.status = "ACTIVE";
          }
        }
      }

      // Crucial: Increment policyVersion to invalidate stale envelopes & approvals
      const nextVersion = (mandate.policyVersion || 1) + 1;
      updateData.policyVersion = nextVersion;

      const updated = await tx.mandate.update({
        where: { id: mandateId },
        data: updateData,
      });

      return {
        success: true,
        mandateId: updated.id,
        mandateName: updated.name,
        newPolicyVersion: nextVersion,
        previousVersion: mandate.policyVersion,
        updateData,
        status: updated.status as MandateLifecycleStatus,
      };
    });

    await recordAuditEvent({
      userId: actorUserId,
      eventType: "MANDATE_CONFIG_UPDATED",
      verdict: "SUCCESS",
      description: `Updated configuration for mandate "${result.mandateName}". Incremented policyVersion to ${result.newPolicyVersion}`,
      mandateId: result.mandateId,
      details: {
        updates: result.updateData,
        previousVersion: result.previousVersion,
        newVersion: result.newPolicyVersion,
        reason,
      },
    });

    return {
      success: true,
      mandateId: result.mandateId,
      newPolicyVersion: result.newPolicyVersion,
      status: result.status,
    };
  }
}
