/**
 * Execution Failure Recovery & Reconciliation Service
 * Milestone 8 - Robust Asynchronous Failure & Timeout Handling
 */

import { prisma } from "@/lib/db";
import { verifyNearTransaction } from "@/lib/nearRpc";
import { recordAuditEvent } from "@/lib/auditLedger";
import { settleMandateBudgetAtomic, releaseMandateBudgetAtomic } from "@/lib/objectives/authority";
import { yoctoToNear } from "@/lib/yocto";
import { ExecutionRecord } from "@prisma/client";

export type FailureStage =
  | "BEFORE_SIGNING"
  | "DURING_SIGNING"
  | "AFTER_SIGNING_BEFORE_BROADCAST"
  | "AFTER_BROADCAST_BEFORE_RESPONSE"
  | "AFTER_TX_HASH_BEFORE_CONFIRMATION"
  | "SETTLEMENT_RECONCILIATION";

export interface RecoveryResult {
  executionId: string;
  status: "CONFIRMED" | "FAILED" | "REQUIRES_RECOVERY" | "MANUAL_INTERVENTION_REQUIRED";
  txHash?: string;
  settled: boolean;
  released: boolean;
  notes: string;
}

export class ExecutionRecoveryService {
  /**
   * Classifies an execution failure into a deterministic stage and prescribes safe recovery actions.
   */
  public static classifyFailure(params: {
    stage: FailureStage;
    error: any;
    txHash?: string;
  }): {
    canReleaseReservationImmediately: boolean;
    requiresPolling: boolean;
    requiresManualIntervention: boolean;
    suggestedStatus: "FAILED" | "REQUIRES_RECOVERY" | "CONFIRMING";
    reason: string;
  } {
    const { stage, error, txHash } = params;
    const errorMsg = String(error?.message || error || "").toLowerCase();

    // 1. Errors occurring strictly BEFORE broadcast can be safely released immediately
    if (stage === "BEFORE_SIGNING" || stage === "DURING_SIGNING") {
      return {
        canReleaseReservationImmediately: true,
        requiresPolling: false,
        requiresManualIntervention: false,
        suggestedStatus: "FAILED",
        reason: `Pre-broadcast failure (${stage}): ${errorMsg}`,
      };
    }

    // 2. Ambiguous errors occurring AFTER or DURING broadcast:
    // CRITICAL: NEVER release reservation immediately!
    const isAmbiguousNetworkError =
      errorMsg.includes("timeout") ||
      errorMsg.includes("network") ||
      errorMsg.includes("fetch failed") ||
      errorMsg.includes("abort") ||
      errorMsg.includes("econnreset") ||
      errorMsg.includes("gateway") ||
      !txHash;

    if (stage === "AFTER_BROADCAST_BEFORE_RESPONSE" && isAmbiguousNetworkError) {
      return {
        canReleaseReservationImmediately: false,
        requiresPolling: true,
        requiresManualIntervention: false,
        suggestedStatus: "REQUIRES_RECOVERY",
        reason: "Ambiguous network response after transaction broadcast. Reservation retained pending on-chain lookup.",
      };
    }

    // 3. We have a txHash, awaiting confirmation
    if (txHash) {
      return {
        canReleaseReservationImmediately: false,
        requiresPolling: true,
        requiresManualIntervention: false,
        suggestedStatus: "CONFIRMING",
        reason: `Transaction broadcast with hash ${txHash}. Awaiting block inclusion.`,
      };
    }

    return {
      canReleaseReservationImmediately: false,
      requiresPolling: false,
      requiresManualIntervention: true,
      suggestedStatus: "REQUIRES_RECOVERY",
      reason: `Ambiguous failure at ${stage}. Manual intervention required to protect funds.`,
    };
  }

  /**
   * Recovers an interrupted or timed-out execution by querying the NEAR blockchain.
   * Guarantees:
   * - If on-chain confirmed -> settles budget atomically via CAS.
   * - If on-chain verified failed -> releases reservation atomically via CAS.
   * - If still in-flight / unknown -> leaves reservation intact, increments recoveryAttempts.
   */
  public static async recoverExecution(
    executionId: string,
    options?: { maxAttempts?: number; rpcUrl?: string }
  ): Promise<RecoveryResult> {
    const maxAttempts = options?.maxAttempts || 5;

    const exec = await prisma.executionRecord.findUnique({
      where: { id: executionId },
      include: {
        mandate: { include: { wallet: true } },
      },
    });

    if (!exec) {
      throw new Error(`ExecutionRecord ${executionId} not found`);
    }

    // If already in final state, return current status
    if (exec.status === "CONFIRMED") {
      return {
        executionId,
        status: "CONFIRMED",
        txHash: exec.txHash || undefined,
        settled: true,
        released: false,
        notes: "Execution was already confirmed and settled",
      };
    }

    if (exec.status === "FAILED" && !exec.recoveryStatus) {
      return {
        executionId,
        status: "FAILED",
        settled: false,
        released: true,
        notes: "Execution was already marked failed with reservation released",
      };
    }

    // 1. If we have NO transaction hash and failure was post-broadcast
    if (!exec.txHash) {
      if (exec.recoveryAttempts >= maxAttempts) {
        await prisma.executionRecord.update({
          where: { id: exec.id },
          data: {
            recoveryStatus: "MANUAL_INTERVENTION_REQUIRED",
            status: "REQUIRES_RECOVERY",
            lastPolledAt: new Date(),
          },
        });

        await recordAuditEvent({
          userId: exec.userId,
          eventType: "MANUAL_INTERVENTION_REQUIRED",
          verdict: "ESCALATED",
          description: `Execution ${exec.id} timed out post-broadcast without a txHash. Reservation retained.`,
          mandateId: exec.mandateId,
          details: { executionId: exec.id, attempts: exec.recoveryAttempts },
        });

        return {
          executionId,
          status: "MANUAL_INTERVENTION_REQUIRED",
          settled: false,
          released: false,
          notes: "Max recovery attempts exceeded without txHash. Reservation kept locked to prevent double-spending.",
        };
      }

      // Increment attempt counter and wait for next polling window
      await prisma.executionRecord.update({
        where: { id: exec.id },
        data: {
          recoveryAttempts: exec.recoveryAttempts + 1,
          recoveryStatus: "PENDING_RECOVERY",
          lastPolledAt: new Date(),
        },
      });

      return {
        executionId,
        status: "REQUIRES_RECOVERY",
        settled: false,
        released: false,
        notes: `Awaiting tx lookup (attempt ${exec.recoveryAttempts + 1}/${maxAttempts})`,
      };
    }

    // 2. We have a txHash: query NEAR RPC
    const senderAccountId = exec.mandate.wallet?.nearAccountId || "";
    const verification = await verifyNearTransaction(exec.txHash, senderAccountId, {
      rpcUrl: options?.rpcUrl,
    });

    // A) On-chain SUCCESS -> Atomic settlement via CAS
    if (verification.status === "SUCCESS") {
      const settleResult = await settleMandateBudgetAtomic({
        mandateId: exec.mandateId,
        amountYocto: exec.amountYocto,
        wasReserved: true,
      });

      const now = new Date();
      await prisma.executionRecord.update({
        where: { id: exec.id },
        data: {
          status: "CONFIRMED",
          recoveryStatus: "RECOVERED",
          blockHash: verification.blockHash,
          gasBurnt: verification.gasBurnt ? String(verification.gasBurnt) : null,
          tokensBurnt: verification.tokensBurnt || "0",
          confirmedAt: now,
          reconciledAt: now,
          lastPolledAt: now,
        },
      });

      await recordAuditEvent({
        userId: exec.userId,
        eventType: "EXECUTION_RECOVERED",
        verdict: "SUCCESS",
        description: `Recovered and settled transaction ${exec.txHash} on NEAR testnet: ${yoctoToNear(exec.amountYocto)} NEAR to ${exec.recipient}`,
        mandateId: exec.mandateId,
        txHash: exec.txHash,
        details: {
          executionId: exec.id,
          settleSuccess: settleResult.success,
          blockHash: verification.blockHash,
        },
      });

      return {
        executionId,
        status: "CONFIRMED",
        txHash: exec.txHash,
        settled: true,
        released: false,
        notes: `Successfully recovered and settled on NEAR testnet. Block hash: ${verification.blockHash}`,
      };
    }

    // B) On-chain FAILED -> Atomic reservation release via CAS
    if (verification.status === "FAILED") {
      await releaseMandateBudgetAtomic({
        mandateId: exec.mandateId,
        amountYocto: exec.amountYocto,
      });

      const now = new Date();
      await prisma.executionRecord.update({
        where: { id: exec.id },
        data: {
          status: "FAILED",
          recoveryStatus: "RECOVERED",
          errorReason: verification.error || "On-chain transaction execution failed",
          reconciledAt: now,
          lastPolledAt: now,
        },
      });

      await recordAuditEvent({
        userId: exec.userId,
        eventType: "EXECUTION_FAILED",
        verdict: "FAILED",
        description: `Transaction ${exec.txHash} verified failed on-chain. Reserved budget released back to mandate.`,
        mandateId: exec.mandateId,
        txHash: exec.txHash,
        details: { executionId: exec.id, error: verification.error },
      });

      return {
        executionId,
        status: "FAILED",
        txHash: exec.txHash,
        settled: false,
        released: true,
        notes: `Verified failed on-chain: ${verification.error || "Execution failed"}. Budget reservation released.`,
      };
    }

    // C) Still In-Flight / Timeout: Retain reservation and increment attempt
    const newAttempts = exec.recoveryAttempts + 1;
    const isExceeded = newAttempts >= maxAttempts;
    const nextStatus = isExceeded ? "MANUAL_INTERVENTION_REQUIRED" : "REQUIRES_RECOVERY";

    await prisma.executionRecord.update({
      where: { id: exec.id },
      data: {
        recoveryAttempts: newAttempts,
        recoveryStatus: nextStatus,
        lastPolledAt: new Date(),
      },
    });

    return {
      executionId,
      status: nextStatus,
      txHash: exec.txHash,
      settled: false,
      released: false,
      notes: `Transaction status still unresolved (${verification.status}). Attempt ${newAttempts}/${maxAttempts}. Budget reservation remains safely held.`,
    };
  }
}

