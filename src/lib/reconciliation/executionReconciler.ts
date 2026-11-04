/**
 * Execution Reconciler (Milestone 9.3)
 * Reconciles ExecutionRecords against authoritative on-chain state (NEAR RPC)
 * with strict financial safety invariants.
 */

import { prisma } from "@/lib/db";
import { verifyNearTransaction } from "@/lib/nearRpc";
import {
  EvaluatedFinding,
  EvidencePayload,
  ReconciliationClassification,
  ReconciliationSeverity,
} from "./types";

export interface ExecutionReconcilerOptions {
  executionIds?: string[];
  tenantId?: string;
  rpcUrl?: string;
  timeoutMs?: number;
  includeFinal?: boolean; // If true, also inspects CONFIRMED and FAILED executions to detect drift
}

export class ExecutionReconciler {
  /**
   * Evaluates a single ExecutionRecord against live external state.
   */
  public static async reconcileExecution(
    executionId: string,
    options?: { rpcUrl?: string; timeoutMs?: number }
  ): Promise<EvaluatedFinding | null> {
    const exec = await prisma.executionRecord.findUnique({
      where: { id: executionId },
      include: {
        mandate: {
          include: {
            wallet: true,
          },
        },
      },
    });

    if (!exec) return null;

    const senderAccountId =
      exec.mandate.wallet?.nearAccountId || "mandate.testnet";
    const txHash = exec.txHash;
    const internalState = exec.status;

    const evidence: EvidencePayload[] = [];
    let classification: ReconciliationClassification = "MATCHED";
    let severity: ReconciliationSeverity = "INFO";
    let externalState: string | null = null;
    let details = "";
    let recommendedResponse = "RECONCILE_ONLY";

    // 1. If no txHash is present
    if (!txHash) {
      if (
        internalState === "BROADCAST" ||
        internalState === "CONFIRMING" ||
        internalState === "REQUIRES_RECOVERY" ||
        exec.recoveryStatus === "MANUAL_INTERVENTION_REQUIRED"
      ) {
        classification = "AMBIGUOUS";
        severity = "SEV-1";
        externalState = "UNKNOWN_NO_TX_HASH";
        details = `Execution ${exec.id} is post-broadcast (${internalState}) but lacks on-chain txHash. Budget reservation held.`;
        recommendedResponse = "MANUAL_FINANCIAL_REVIEW";

        evidence.push({
          sourceProvider: "local_db",
          observedState: "MISSING_TX_HASH_POST_BROADCAST",
          confidence: 1.0,
          data: {
            executionId: exec.id,
            status: exec.status,
            amountYocto: exec.amountYocto,
            recipient: exec.recipient,
            createdAt: exec.expiresAt.toISOString(),
          },
          observedAt: new Date().toISOString(),
        });
      } else {
        classification = "INTERNAL_ONLY";
        severity = "INFO";
        externalState = null;
        details = `Execution ${exec.id} is in pre-broadcast stage (${internalState}).`;
        recommendedResponse = "RECONCILE_ONLY";
      }

      return {
        entityType: "EXECUTION",
        entityId: exec.id,
        internalState,
        externalState,
        classification,
        severity,
        details,
        recommendedResponse,
        evidence,
        metadata: {
          amountYocto: exec.amountYocto,
          recipient: exec.recipient,
          mandateId: exec.mandateId,
          userId: exec.userId,
        },
      };
    }

    // 2. Query NEAR RPC for transaction status
    try {
      const nearStatus = await verifyNearTransaction(txHash, senderAccountId, {
        rpcUrl: options?.rpcUrl,
        timeoutMs: options?.timeoutMs || 8000,
      });

      externalState = nearStatus.status;

      evidence.push({
        sourceProvider: "near_rpc",
        observedState: nearStatus.status,
        confidence: nearStatus.status === "SUCCESS" || nearStatus.status === "FAILED" ? 1.0 : 0.7,
        data: {
          txHash,
          blockHash: nearStatus.blockHash,
          blockHeight: nearStatus.blockHeight,
          gasBurnt: nearStatus.gasBurnt,
          tokensBurnt: nearStatus.tokensBurnt,
          error: nearStatus.error,
          isTerminal: nearStatus.isTerminal,
        },
        observedAt: new Date().toISOString(),
      });

      if (nearStatus.status === "SUCCESS") {
        if (internalState === "CONFIRMED") {
          classification = "MATCHED";
          severity = "INFO";
          details = `Execution ${exec.id} is confirmed on-chain and in local database.`;
          recommendedResponse = "RECONCILE_ONLY";
        } else if (
          internalState === "CONFIRMING" ||
          internalState === "BROADCAST" ||
          internalState === "REQUIRES_RECOVERY"
        ) {
          classification = "STATE_MISMATCH";
          severity = "SEV-2";
          details = `Execution ${exec.id} succeeded on-chain (block ${nearStatus.blockHeight}) but is currently ${internalState} in DB.`;
          recommendedResponse = "EXECUTION_STATUS_CHECK";
        } else if (internalState === "FAILED") {
          classification = "STATE_MISMATCH";
          severity = "SEV-1";
          details = `CRITICAL: Execution ${exec.id} succeeded on-chain but is marked FAILED in DB! Immediate audit required.`;
          recommendedResponse = "MANUAL_FINANCIAL_REVIEW";
        }
      } else if (nearStatus.status === "FAILED") {
        if (internalState === "FAILED") {
          classification = "MATCHED";
          severity = "INFO";
          details = `Execution ${exec.id} is verified failed both on-chain and in database.`;
          recommendedResponse = "RECONCILE_ONLY";
        } else if (internalState === "CONFIRMED") {
          classification = "STATE_MISMATCH";
          severity = "SEV-1";
          details = `CRITICAL: Execution ${exec.id} failed on-chain (${nearStatus.error}) but is marked CONFIRMED in DB!`;
          recommendedResponse = "MANUAL_FINANCIAL_REVIEW";
        } else {
          classification = "STATE_MISMATCH";
          severity = "SEV-2";
          details = `Execution ${exec.id} failed on-chain (${nearStatus.error || "ExecutionError"}) and reservation can now be safely released.`;
          recommendedResponse = "EXECUTION_STATUS_CHECK";
        }
      } else if (nearStatus.status === "PENDING") {
        // Evaluate propagation age
        const ageMs = Date.now() - new Date(exec.expiresAt.getTime() - 300000).getTime(); // approx create time
        if (ageMs > 45000) {
          classification = "AMBIGUOUS";
          severity = "SEV-1";
          details = `Execution ${exec.id} remains PENDING on-chain after ${Math.round(ageMs / 1000)}s. Budget reservation must stay locked.`;
          recommendedResponse = "MANUAL_FINANCIAL_REVIEW";
        } else {
          classification = "PENDING_CONFIRMATION";
          severity = "INFO";
          details = `Execution ${exec.id} is propagating normally in mempool.`;
          recommendedResponse = "RECONCILE_ONLY";
        }
      } else {
        // TIMEOUT or NETWORK_ERROR
        classification = "AMBIGUOUS";
        severity = "SEV-1";
        details = `RPC check timed out or errored for tx ${txHash}. Budget reservation must NOT be released.`;
        recommendedResponse = "EXECUTION_STATUS_CHECK";
      }
    } catch (err: any) {
      classification = "UNAVAILABLE";
      severity = "SEV-2";
      externalState = "RPC_ERROR";
      details = `Failed to query NEAR RPC for tx ${txHash}: ${err.message}`;
      recommendedResponse = "EXECUTION_STATUS_CHECK";

      evidence.push({
        sourceProvider: "near_rpc",
        observedState: "UNAVAILABLE",
        confidence: 0.2,
        data: { error: err.message, txHash },
        observedAt: new Date().toISOString(),
      });
    }

    return {
      entityType: "EXECUTION",
      entityId: exec.id,
      internalState,
      externalState,
      classification,
      severity,
      details,
      recommendedResponse,
      evidence,
      metadata: {
        txHash,
        amountYocto: exec.amountYocto,
        recipient: exec.recipient,
        mandateId: exec.mandateId,
        userId: exec.userId,
      },
    };
  }

  /**
   * Reconciles all pending or in-flight executions.
   */
  public static async reconcileAllInFlight(
    options?: ExecutionReconcilerOptions
  ): Promise<EvaluatedFinding[]> {
    const where: any = {};
    if (options?.tenantId) where.userId = options.tenantId;

    if (options?.executionIds && options.executionIds.length > 0) {
      where.id = { in: options.executionIds };
    } else if (!options?.includeFinal) {
      where.status = {
        in: [
          "BROADCAST",
          "CONFIRMING",
          "REQUIRES_RECOVERY",
          "PENDING_RECOVERY",
        ],
      };
    }

    const executions = await prisma.executionRecord.findMany({
      where,
      take: 100,
      orderBy: { expiresAt: "desc" },
    });

    const findings: EvaluatedFinding[] = [];
    for (const exec of executions) {
      const finding = await this.reconcileExecution(exec.id, options);
      if (finding) findings.push(finding);
    }

    return findings;
  }
}

