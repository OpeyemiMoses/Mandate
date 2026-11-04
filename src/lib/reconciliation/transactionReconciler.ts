import { prisma } from "@/lib/db";
import { verifyNearTransaction, getNearAccountState } from "@/lib/nearRpc";
import { recordAuditEvent, runWithUserLock } from "@/lib/auditLedger";
import {
  confirmTransactionAtomically,
  failTransactionAtomically,
  keepPendingOrFlagAtomically,
  WalletFinancialBreakdown,
} from "@/lib/financialAccounting";
import { yoctoToNear, isValidYoctoString } from "@/lib/yocto";

export interface ReconciliationReport {
  checkedCount: number;
  confirmedCount: number;
  failedCount: number;
  pendingCount: number;
  flaggedCount: number;
}

export interface ReconcileSingleResult {
  txId: string;
  status: "CONFIRMED" | "FAILED" | "CONFIRMING" | "RECONCILIATION_REQUIRED";
  wasAlreadyFinal: boolean;
  blockHash?: string;
  error?: string;
  reconciliationNotes?: string;
}

// In-memory mutex set to prevent concurrent worker execution on the same transaction ID
const activeReconciliationLocks = new Set<string>();

/**
 * Reconcile a single transaction against live blockchain state.
 * Fully protects against concurrent workers, double-confirmations, and early reservation releases.
 */
export async function reconcileSingleTransaction(
  txId: string,
  userId?: string,
  options?: { rpcUrl?: string; timeoutMs?: number }
): Promise<ReconcileSingleResult> {
  if (activeReconciliationLocks.has(txId)) {
    // Concurrent worker already processing this transaction
    const existing = await prisma.transactionRecord.findUnique({ where: { id: txId } });
    return {
      txId,
      status: (existing?.status as any) || "CONFIRMING",
      wasAlreadyFinal: existing?.status === "CONFIRMED" || existing?.status === "FAILED",
      reconciliationNotes: "Skipped concurrent reconciliation lock",
    };
  }

  activeReconciliationLocks.add(txId);
  try {
    const tx = await prisma.transactionRecord.findUnique({
      where: { id: txId },
      include: {
        mandate: { include: { wallet: true } },
        task: true,
      },
    });

    if (!tx) {
      throw new Error(`Transaction ${txId} not found`);
    }

    if (userId && tx.mandate.userId !== userId) {
      throw new Error("Unauthorized: Cross-user transaction reconciliation rejected");
    }

    // 1. Idempotency Check: If already in a terminal state, return immediately without re-accounting
    if (tx.status === "CONFIRMED") {
      return {
        txId,
        status: "CONFIRMED",
        wasAlreadyFinal: true,
        blockHash: tx.blockHash || undefined,
        reconciliationNotes: "Transaction already confirmed and settled",
      };
    }

    if (tx.status === "FAILED") {
      return {
        txId,
        status: "FAILED",
        wasAlreadyFinal: true,
        error: tx.error || undefined,
        reconciliationNotes: "Transaction already marked failed",
      };
    }

    // 2. Missing txHash handling (e.g. backend crashed before receiving OutLayer response)
    if (!tx.txHash) {
      // Mark as RECONCILIATION_REQUIRED since we cannot query RPC without a hash
      const updated = await keepPendingOrFlagAtomically({
        txId: tx.id,
        reason: "Missing on-chain transaction hash; manual verification required",
        userId: tx.mandate.userId,
        maxRetries: 1,
      });

      return {
        txId,
        status: "RECONCILIATION_REQUIRED",
        wasAlreadyFinal: false,
        reconciliationNotes: "Missing transaction reference hash",
      };
    }

    const senderAccountId = tx.mandate?.wallet?.nearAccountId || "";
    const verification = await verifyNearTransaction(tx.txHash, senderAccountId, options);

    // 3. Handle Verified SUCCESS
    if (verification.status === "SUCCESS") {
      const confirmResult = await confirmTransactionAtomically({
        txId: tx.id,
        blockHash: verification.blockHash,
        gasBurnt: verification.gasBurnt,
        tokensBurnt: verification.tokensBurnt,
        userId: tx.mandate.userId,
      });

      return {
        txId: tx.id,
        status: "CONFIRMED",
        wasAlreadyFinal: confirmResult.alreadyConfirmed,
        blockHash: verification.blockHash,
      };
    }

    // 4. Handle Verified On-Chain Failure
    if (verification.status === "FAILED") {
      const failResult = await failTransactionAtomically({
        txId: tx.id,
        errorReason: verification.error || "Execution failed on NEAR network",
        userId: tx.mandate.userId,
      });

      return {
        txId: tx.id,
        status: "FAILED",
        wasAlreadyFinal: failResult.alreadyFailed,
        error: verification.error,
      };
    }

    // 5. Handle In-Flight / Timeout / Network Error (Outcome Unknown)
    // CRITICAL: Must remain unresolved. NEVER release reservations!
    const note =
      verification.status === "TIMEOUT"
        ? "RPC query timed out; awaiting subsequent polling cycle"
        : verification.status === "NETWORK_ERROR"
        ? `RPC connection error: ${verification.error}`
        : "Transaction awaiting block inclusion on NEAR network";

    const updated = await keepPendingOrFlagAtomically({
      txId: tx.id,
      reason: note,
      userId: tx.mandate.userId,
      maxRetries: 5,
    });

    return {
      txId: tx.id,
      status: updated.status as any,
      wasAlreadyFinal: false,
      reconciliationNotes: note,
    };
  } finally {
    activeReconciliationLocks.delete(txId);
  }
}

/**
 * Reconcile all pending and submitted transactions across the system or for a specific user.
 * Recovers pending transactions after backend restarts, RPC timeouts, or network interruptions.
 */
export async function reconcileTransactions(
  userId?: string,
  options?: { rpcUrl?: string; timeoutMs?: number }
): Promise<ReconciliationReport> {
  const userFilter = userId ? { mandate: { userId } } : {};

  // Scan all pending, submitted, confirming, or flagged transactions
  const pendingTxs = await prisma.transactionRecord.findMany({
    where: {
      status: { in: ["SUBMITTED", "CONFIRMING", "RECONCILIATION_REQUIRED", "PENDING"] },
      ...userFilter,
    },
    include: {
      mandate: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let confirmedCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  let flaggedCount = 0;

  for (const tx of pendingTxs) {
    try {
      const result = await reconcileSingleTransaction(tx.id, userId, options);

      if (result.status === "CONFIRMED") {
        confirmedCount++;
      } else if (result.status === "FAILED") {
        failedCount++;
      } else if (result.status === "RECONCILIATION_REQUIRED") {
        flaggedCount++;
      } else {
        pendingCount++;
      }
    } catch (err: any) {
      console.error(`Error reconciling tx ${tx.id}:`, err);
      pendingCount++;
    }
  }

  // Record RECONCILIATION_COMPLETED audit event
  if (userId && pendingTxs.length > 0) {
    await recordAuditEvent({
      userId,
      eventType: "RECONCILIATION_COMPLETED",
      verdict: "SUCCESS",
      description: `Completed reconciliation batch: ${confirmedCount} confirmed, ${failedCount} failed, ${pendingCount} pending, ${flaggedCount} flagged`,
      details: {
        checkedCount: pendingTxs.length,
        confirmedCount,
        failedCount,
        pendingCount,
        flaggedCount,
      },
    });
  }

  return {
    checkedCount: pendingTxs.length,
    confirmedCount,
    failedCount,
    pendingCount,
    flaggedCount,
  };
}

/**
 * On-chain wallet balance verification and reconciliation.
 * Compares stored internal balance with live NEAR RPC state:
 * Expected = Total Funding - Total Confirmed Outgoing - Total Withdrawn - Total Fees
 * Detects discrepancies and flags them without silently overwriting financial history.
 */
export async function verifyAndReconcileWalletBalance(
  walletId: string,
  userId: string
): Promise<WalletFinancialBreakdown> {
  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, agent: { userId } },
    include: {
      agent: true,
      fundingRecords: { where: { status: "CONFIRMED" } },
      withdrawalRecords: { where: { status: "CONFIRMED" } },
      mandates: {
        include: {
          transactions: { where: { status: "CONFIRMED" } },
        },
      },
    },
  });

  if (!wallet) {
    throw new Error(`Wallet ${walletId} not found or access unauthorized`);
  }

  // 1. Query live balance from NEAR RPC
  const accountState = await getNearAccountState(wallet.nearAccountId);
  const onChainBalanceYocto = accountState ? accountState.amountYocto : wallet.balanceYocto;

  // 2. Sum confirmed incoming funding
  let totalIncoming = BigInt(0);
  for (const f of wallet.fundingRecords) {
    if (isValidYoctoString(f.amountYocto)) {
      totalIncoming += BigInt(f.amountYocto);
    }
  }

  // 3. Sum confirmed outgoing payments and network fees
  let totalOutgoing = BigInt(0);
  let totalFees = BigInt(0);
  let activeReserved = BigInt(0);

  for (const m of wallet.mandates) {
    if (isValidYoctoString(m.reservedYocto)) {
      activeReserved += BigInt(m.reservedYocto);
    }
    for (const tx of m.transactions) {
      if (isValidYoctoString(tx.amountYocto)) {
        totalOutgoing += BigInt(tx.amountYocto);
      }
      if (tx.tokensBurnt && isValidYoctoString(tx.tokensBurnt)) {
        totalFees += BigInt(tx.tokensBurnt);
      }
    }
  }

  // 4. Sum confirmed withdrawals
  let totalWithdrawn = BigInt(0);
  for (const w of wallet.withdrawalRecords) {
    if (isValidYoctoString(w.amountYocto)) {
      totalWithdrawn += BigInt(w.amountYocto);
    }
  }

  // 5. Compute Expected Balance
  const totalDebits = totalOutgoing + totalWithdrawn + totalFees;
  const expectedBalance =
    totalIncoming >= totalDebits ? totalIncoming - totalDebits : BigInt(0);

  const actualBalance = BigInt(onChainBalanceYocto);
  const discrepancy = actualBalance - expectedBalance;
  const hasDiscrepancy = discrepancy !== BigInt(0);

  // 6. Calculate eligible withdrawals: onChainBalance - activeReserved
  const eligibleWithdrawal =
    actualBalance >= activeReserved ? actualBalance - activeReserved : BigInt(0);

  const status: "BALANCED" | "DISCREPANCY_DETECTED" = hasDiscrepancy
    ? "DISCREPANCY_DETECTED"
    : "BALANCED";

  const now = new Date();

  // 7. Update wallet record without silently destroying history
  await prisma.wallet.update({
    where: { id: wallet.id },
    data: {
      onChainBalanceYocto,
      discrepancyYocto: discrepancy.toString(),
      discrepancyStatus: status,
      lastReconciledAt: now,
    },
  });

  // 8. Record Audit Events
  if (hasDiscrepancy) {
    await recordAuditEvent({
      userId,
      eventType: "FINANCIAL_DISCREPANCY_DETECTED",
      verdict: "DISCREPANCY_DETECTED",
      description: `Balance discrepancy detected on wallet ${wallet.nearAccountId}: Difference of ${yoctoToNear(discrepancy.toString(), 6)} NEAR`,
      details: {
        walletId: wallet.id,
        nearAccountId: wallet.nearAccountId,
        storedBalanceYocto: wallet.balanceYocto,
        onChainBalanceYocto,
        expectedBalanceYocto: expectedBalance.toString(),
        discrepancyYocto: discrepancy.toString(),
        totalIncomingYocto: totalIncoming.toString(),
        totalOutgoingYocto: totalOutgoing.toString(),
        totalWithdrawnYocto: totalWithdrawn.toString(),
        totalFeesYocto: totalFees.toString(),
      },
      agentId: wallet.agentId,
      agentWalletAddress: wallet.nearAccountId,
    });
  } else {
    await recordAuditEvent({
      userId,
      eventType: "WALLET_BALANCE_RECONCILED",
      verdict: "SUCCESS",
      description: `Wallet balance verified against NEAR RPC: ${yoctoToNear(onChainBalanceYocto, 4)} NEAR`,
      details: {
        walletId: wallet.id,
        nearAccountId: wallet.nearAccountId,
        onChainBalanceYocto,
        totalIncomingYocto: totalIncoming.toString(),
        totalOutgoingYocto: totalOutgoing.toString(),
        activeReservedYocto: activeReserved.toString(),
      },
      agentId: wallet.agentId,
      agentWalletAddress: wallet.nearAccountId,
    });
  }

  return {
    walletId: wallet.id,
    nearAccountId: wallet.nearAccountId,
    storedBalanceYocto: wallet.balanceYocto,
    onChainBalanceYocto,
    totalIncomingYocto: totalIncoming.toString(),
    totalOutgoingYocto: totalOutgoing.toString(),
    totalWithdrawnYocto: totalWithdrawn.toString(),
    totalFeesYocto: totalFees.toString(),
    activeReservedYocto: activeReserved.toString(),
    eligibleWithdrawalYocto: eligibleWithdrawal.toString(),
    discrepancyYocto: discrepancy.toString(),
    discrepancyStatus: status,
    isBalanced: !hasDiscrepancy,
  };
}
