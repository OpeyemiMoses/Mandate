/**
 * MANDATE — Deterministic Intent Lifecycle State Machine
 * Milestone 15.3b.1: Intents Settlement Evidence, Accounting & Persistence Closure
 *
 * Enforces valid state transitions, persistent audit trails, and strict failure-state invariants:
 * PROPOSED -> QUOTE_PENDING -> QUOTE_VERIFIED -> AWAITING_APPROVAL -> AUTHORIZED ->
 * BUDGET_RESERVED -> WRAP_PENDING -> WRAP_BROADCAST -> WRAP_CONFIRMED ->
 * DEPOSIT_PENDING -> DEPOSIT_BROADCAST -> DEPOSIT_CONFIRMED -> PROCESSING ->
 * SETTLEMENT_PENDING -> SETTLED | REFUND_PENDING -> REFUNDED | REQUIRES_RECOVERY | FAILED | EXPIRED
 *
 * Critical Failure & Accounting Invariants:
 * 1. Ambiguous outcomes RETAIN budget reservations in REQUIRES_RECOVERY or PENDING states.
 * 2. Terminal states (SETTLED, REFUNDED, FAILED, EXPIRED) CANNOT be reached while unresolved funds remain.
 * 3. Confirmed wrap success converts native NEAR to wNEAR. If downstream steps fail, funds are in wNEAR;
 *    cannot transition to FAILED with native budget release until unwrap or restitution is confirmed on-chain.
 * 4. Settle ONLY upon verified on-chain destination settlement.
 * 5. Release ONLY upon verified on-chain refund to custody wallet.
 */

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import { settleMandateBudgetAtomic, releaseMandateBudgetAtomic } from "@/lib/objectives/authority";
import { IntentLifecycleState } from "./types";

export const PERMITTED_INTENT_TRANSITIONS: Record<IntentLifecycleState, readonly IntentLifecycleState[]> = {
  PROPOSED: ["QUOTE_PENDING", "FAILED"],
  QUOTE_PENDING: ["QUOTE_VERIFIED", "EXPIRED", "FAILED"],
  QUOTE_VERIFIED: ["AWAITING_APPROVAL", "AUTHORIZED", "EXPIRED", "FAILED"],
  AWAITING_APPROVAL: ["AUTHORIZED", "EXPIRED", "FAILED"],
  AUTHORIZED: ["BUDGET_RESERVED", "FAILED"],
  BUDGET_RESERVED: ["WRAP_PENDING", "FAILED"],
  WRAP_PENDING: ["WRAP_BROADCAST", "REQUIRES_RECOVERY", "FAILED"],
  WRAP_BROADCAST: ["WRAP_CONFIRMED", "REQUIRES_RECOVERY", "FAILED"],
  WRAP_CONFIRMED: ["DEPOSIT_PENDING", "REQUIRES_RECOVERY"],
  DEPOSIT_PENDING: ["DEPOSIT_BROADCAST", "REQUIRES_RECOVERY"],
  DEPOSIT_BROADCAST: ["DEPOSIT_CONFIRMED", "REQUIRES_RECOVERY"],
  DEPOSIT_CONFIRMED: ["PROCESSING", "SETTLEMENT_PENDING", "REQUIRES_RECOVERY"],
  PROCESSING: ["SETTLEMENT_PENDING", "REFUND_PENDING", "REQUIRES_RECOVERY"],
  SETTLEMENT_PENDING: ["SETTLED", "REFUND_PENDING", "REQUIRES_RECOVERY"],
  SETTLED: [], // Terminal success
  REFUND_PENDING: ["REFUNDED", "REQUIRES_RECOVERY"],
  REFUNDED: [], // Terminal refund
  REQUIRES_RECOVERY: ["SETTLED", "REFUNDED", "FAILED", "WRAP_CONFIRMED", "DEPOSIT_CONFIRMED"],
  FAILED: [], // Terminal failure
  EXPIRED: [], // Terminal expiry
};

export class IntentStateMachine {
  /**
   * Asserts whether a transition from currentState to targetState is valid.
   */
  public static assertValidTransition(
    currentState: IntentLifecycleState,
    targetState: IntentLifecycleState
  ): void {
    const allowed = PERMITTED_INTENT_TRANSITIONS[currentState] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(
        `INVALID_STATE_TRANSITION: Cannot transition IntentOperation from "${currentState}" to "${targetState}". Permitted transitions: [${allowed.join(", ")}].`
      );
    }
  }

  /**
   * Transitions an IntentOperation to a new lifecycle state, enforcing
   * valid state rules, atomic budget preservation, and durable audit events.
   */
  public static async transition(params: {
    intentId: string;
    targetState: IntentLifecycleState;
    txHash?: string;
    errorMessage?: string;
    metadata?: Record<string, any>;
    verifiedOnChain?: boolean;
    settlementEvidence?: string;
    refundEvidence?: string;
    recoveryState?: string;
  }): Promise<{ success: boolean; state: IntentLifecycleState; error?: string }> {
    const {
      intentId,
      targetState,
      txHash,
      errorMessage,
      metadata,
      verifiedOnChain = false,
      settlementEvidence,
      refundEvidence,
      recoveryState,
    } = params;

    // 1. Immediate Fail-Closed Guardrails for Terminal Transitions
    if (targetState === "SETTLED" && !verifiedOnChain) {
      throw new Error(
        "UNVERIFIED_SETTLEMENT_BLOCKED: Cannot transition to SETTLED without independent on-chain receipt verification."
      );
    }

    if (targetState === "REFUNDED" && !verifiedOnChain) {
      throw new Error(
        "UNVERIFIED_REFUND_BLOCKED: Cannot transition to REFUNDED without independent on-chain verification of refund receipt."
      );
    }

    const op = await prisma.intentOperation.findUnique({
      where: { id: intentId },
      include: { mandate: true },
    });

    if (!op) {
      throw new Error(`IntentOperation "${intentId}" not found.`);
    }

    const currentState = op.status as IntentLifecycleState;

    // 2. Validate transition legality
    this.assertValidTransition(currentState, targetState);

    // 3. Prevent reaching FAILED if wrap succeeded and wNEAR is held in custody wallet
    if (targetState === "FAILED") {
      if (op.wrapStatus === "SUCCESS" || currentState === "WRAP_CONFIRMED" || currentState === "DEPOSIT_BROADCAST") {
        throw new Error(
          "CANNOT_TERMINATE_WITH_UNRESOLVED_FUNDS: Native NEAR was successfully wrapped into wNEAR. Cannot transition to FAILED with native budget release while wNEAR remains in custody wallet. Must route through REQUIRES_RECOVERY."
        );
      }
    }

    // 4. Prevent reaching EXPIRED if funds have already moved
    if (targetState === "EXPIRED") {
      if (
        currentState !== "QUOTE_PENDING" &&
        currentState !== "QUOTE_VERIFIED" &&
        currentState !== "AWAITING_APPROVAL"
      ) {
        throw new Error(
          `CANNOT_EXPIRE_ACTIVE_OPERATION: Cannot expire operation from state "${currentState}". Funds or reservations may be active.`
        );
      }
    }

    // 5. Atomic Accounting Actions
    if (targetState === "SETTLED") {
      // Settle reserved budget atomically
      await settleMandateBudgetAtomic({
        mandateId: op.mandateId,
        amountYocto: op.reservedAmountYocto,
        wasReserved: true,
      });
    } else if (targetState === "REFUNDED") {
      // Release reserved budget atomically back to available budget
      await releaseMandateBudgetAtomic({
        mandateId: op.mandateId,
        amountYocto: op.reservedAmountYocto,
      });
    } else if (
      targetState === "FAILED" &&
      (currentState === "BUDGET_RESERVED" || currentState === "WRAP_PENDING" || (currentState === "WRAP_BROADCAST" && op.wrapStatus === "FAILED"))
    ) {
      // If failed prior to on-chain broadcast, or wrap confirmed failed on-chain before funds moved, safely release reservation
      await releaseMandateBudgetAtomic({
        mandateId: op.mandateId,
        amountYocto: op.reservedAmountYocto,
      });
    }

    // 6. Persist State Transition & Evidence
    const now = new Date();
    const isTerminal =
      targetState === "SETTLED" || targetState === "REFUNDED" || targetState === "FAILED" || targetState === "EXPIRED";

    await prisma.intentOperation.update({
      where: { id: intentId },
      data: {
        status: targetState,
        updatedAt: now,
        completedAt: isTerminal ? now : undefined,
        reconciledAt: targetState === "SETTLED" || targetState === "REFUNDED" ? now : op.reconciledAt,
        errorMessage: errorMessage || op.errorMessage,
        ...(targetState === "WRAP_CONFIRMED" && txHash ? { wrapTxHash: txHash, wrapStatus: "SUCCESS" } : {}),
        ...(targetState === "DEPOSIT_CONFIRMED" && txHash ? { depositTxHash: txHash, depositStatus: "SUCCESS" } : {}),
        ...(targetState === "SETTLED" && txHash ? { destinationTxHash: txHash } : {}),
        ...(settlementEvidence ? { settlementEvidence } : {}),
        ...(targetState === "REFUNDED" && txHash ? { refundTxHash: txHash } : {}),
        ...(refundEvidence ? { refundEvidence } : {}),
        ...(targetState === "REQUIRES_RECOVERY" ? { recoveryStatus: "PENDING_RECOVERY" } : {}),
        ...(recoveryState ? { recoveryState } : {}),
        ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
      },
    });

    // 7. Record Immutable Audit Log
    await recordAuditEvent({
      userId: op.userId,
      mandateId: op.mandateId,
      eventType: `INTENT_STATE_${targetState}`,
      verdict: targetState === "FAILED" ? "DENIED" : "ALLOWED",
      description: `IntentOperation ${intentId} transitioned from ${currentState} to ${targetState}`,
      details: {
        intentId,
        fromState: currentState,
        toState: targetState,
        txHash,
        verifiedOnChain,
        errorMessage,
        recoveryState,
      },
    });

    return { success: true, state: targetState };
  }
}
