import { prisma } from "@/lib/db";
import { yoctoToNear, isValidYoctoString } from "@/lib/yocto";
import { recordAuditEvent } from "@/lib/auditLedger";
import { settleMandateBudgetAtomic, refundMandateBudgetAtomic } from "@/lib/objectives/authority";

export interface MandateFinancialBreakdown {
  mandateId: string;
  name: string;
  totalBudgetYocto: string;
  confirmedSpentYocto: string;
  activeReservedYocto: string;
  pendingTransactionsYocto: string;
  availableAuthorizedYocto: string;
  hasDiscrepancy: boolean;
  discrepancyDetails?: string;
}

export interface WalletFinancialBreakdown {
  walletId: string;
  nearAccountId: string;
  storedBalanceYocto: string;
  onChainBalanceYocto: string;
  totalIncomingYocto: string;
  totalOutgoingYocto: string;
  totalWithdrawnYocto: string;
  totalFeesYocto: string;
  activeReservedYocto: string;
  eligibleWithdrawalYocto: string;
  discrepancyYocto: string;
  discrepancyStatus: "BALANCED" | "DISCREPANCY_DETECTED" | "PENDING_RECONCILIATION";
  isBalanced: boolean;
}

/**
 * Compute the precise financial accounting breakdown for a mandate.
 * Strictly calculates:
 * Available Authorized = Total Budget - Confirmed Spent - Active Reserved
 */
export async function getMandateFinancialBreakdown(
  mandateId: string,
  userId: string
): Promise<MandateFinancialBreakdown | null> {
  const mandate = await prisma.mandate.findFirst({
    where: { id: mandateId, userId },
    include: {
      transactions: {
        where: { status: { in: ["SUBMITTED", "CONFIRMING", "RECONCILIATION_REQUIRED"] } },
      },
    },
  });

  if (!mandate) return null;

  const totalBudget = BigInt(mandate.totalBudgetYocto);
  const spent = BigInt(mandate.spentYocto || "0");
  const reserved = BigInt(mandate.reservedYocto || "0");

  let pendingSum = BigInt(0);
  for (const tx of mandate.transactions) {
    if (isValidYoctoString(tx.amountYocto)) {
      pendingSum += BigInt(tx.amountYocto);
    }
  }

  // Available = Total Budget - Spent - Reserved
  const committed = spent + reserved;
  const available = totalBudget >= committed ? totalBudget - committed : BigInt(0);

  const hasDiscrepancy = committed > totalBudget;
  let discrepancyDetails: string | undefined;
  if (hasDiscrepancy) {
    discrepancyDetails = `Overcommitted budget: Confirmed spent (${yoctoToNear(spent.toString(), 4)} NEAR) + Reserved (${yoctoToNear(reserved.toString(), 4)} NEAR) exceeds Total Budget (${yoctoToNear(totalBudget.toString(), 4)} NEAR)`;
  }

  return {
    mandateId: mandate.id,
    name: mandate.name,
    totalBudgetYocto: mandate.totalBudgetYocto,
    confirmedSpentYocto: mandate.spentYocto,
    activeReservedYocto: mandate.reservedYocto,
    pendingTransactionsYocto: pendingSum.toString(),
    availableAuthorizedYocto: available.toString(),
    hasDiscrepancy,
    discrepancyDetails,
  };
}

/**
 * Atomically confirms a transaction upon verified NEAR blockchain execution.
 * - Idempotency guard: Checks if already CONFIRMED to prevent double-spending or double-counting.
 * - Updates TransactionRecord: status="CONFIRMED", blockHash, gasBurnt, tokensBurnt, reconciledAt.
 * - Updates Task: status="COMPLETED".
 * - Updates Mandate: releases reservation if applicable, sets spentYocto accurately.
 * - Updates Wallet: reduces stored balance by confirmed amount.
 * - Records chained audit events: TRANSACTION_CONFIRMED.
 */
export async function confirmTransactionAtomically(params: {
  txId: string;
  blockHash?: string;
  blockHeight?: number;
  gasBurnt?: number;
  tokensBurnt?: string;
  userId: string;
}) {
  const { txId, blockHash, blockHeight, gasBurnt, tokensBurnt, userId } = params;

  const tx = await prisma.transactionRecord.findUnique({
    where: { id: txId },
    include: {
      mandate: { include: { wallet: true } },
      task: { include: { approval: true } },
    },
  });

  if (!tx) {
    throw new Error(`Transaction ${txId} not found`);
  }

  // Idempotency & Duplicate confirmation protection
  if (tx.status === "CONFIRMED") {
    return { alreadyConfirmed: true, tx };
  }

  const amount = BigInt(tx.amountYocto);
  const mandate = tx.mandate;
  const task = tx.task;
  const wallet = mandate.wallet;

  // Calculate and settle mandate budget atomically using CAS
  const wasApprovalGated = task?.approval && task.approval.status === "APPROVED";
  const settleResult = await settleMandateBudgetAtomic({
    mandateId: mandate.id,
    amountYocto: tx.amountYocto,
    wasReserved: Boolean(wasApprovalGated),
  });

  if (!settleResult.success) {
    throw new Error(`Failed to atomically settle mandate budget: ${settleResult.reason}`);
  }

  // Update wallet stored balance
  const currentWalletBalance = BigInt(wallet.balanceYocto || "0");
  const nextWalletBalance = currentWalletBalance >= amount ? currentWalletBalance - amount : BigInt(0);

  const now = new Date();

  // Execute atomic DB updates for transaction record and wallet
  const operations: any[] = [
    prisma.transactionRecord.update({
      where: { id: tx.id },
      data: {
        status: "CONFIRMED",
        blockHash: blockHash || null,
        blockHeight: blockHeight || null,
        gasBurnt: gasBurnt ? String(gasBurnt) : null,
        tokensBurnt: tokensBurnt || "0",
        confirmedAt: now,
        reconciledAt: now,
        reconciliationNotes: `Confirmed via NEAR RPC. Block hash: ${blockHash || "N/A"}`,
      },
    }),
    prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balanceYocto: nextWalletBalance.toString(),
      },
    }),
  ];

  if (task) {
    operations.push(
      prisma.task.update({
        where: { id: task.id },
        data: { status: "COMPLETED" },
      })
    );
  }

  if (tx.executionId) {
    operations.push(
      prisma.agentExecution.update({
        where: { id: tx.executionId },
        data: { status: "COMPLETED", completedAt: now },
      })
    );
  }

  const [updatedTx] = await prisma.$transaction(operations);

  // Record audit events in hash chain
  await recordAuditEvent({
    userId,
    eventType: "TRANSACTION_CONFIRMED",
    verdict: "SUCCESS",
    description: `Transaction confirmed on NEAR testnet: ${yoctoToNear(tx.amountYocto, 3)} NEAR to ${tx.recipient}`,
    details: {
      txId: tx.id,
      txHash: tx.txHash,
      recipient: tx.recipient,
      amountYocto: tx.amountYocto,
      amountNear: yoctoToNear(tx.amountYocto),
      blockHash,
      blockHeight,
      gasBurnt,
      tokensBurnt,
    },
    mandateId: mandate.id,
    taskId: task?.id || undefined,
    txHash: tx.txHash || undefined,
  });

  return { alreadyConfirmed: false, tx: updatedTx };
}

/**
 * Atomically marks a transaction as FAILED upon verified failure.
 * - Safely releases budget reservation.
 * - Does NOT increment spent budget.
 * - Updates TransactionRecord: status="FAILED", error, reconciledAt.
 * - Updates Task: status="FAILED".
 * - Records audit events: TRANSACTION_FAILED, RESERVATION_RELEASED.
 */
export async function failTransactionAtomically(params: {
  txId: string;
  errorReason: string;
  userId: string;
}) {
  const { txId, errorReason, userId } = params;

  const tx = await prisma.transactionRecord.findUnique({
    where: { id: txId },
    include: {
      mandate: true,
      task: { include: { approval: true } },
    },
  });

  if (!tx) {
    throw new Error(`Transaction ${txId} not found`);
  }

  // If already failed, no-op
  if (tx.status === "FAILED") {
    return { alreadyFailed: true, tx };
  }

  const mandate = tx.mandate;
  const previousReserved = BigInt(mandate.reservedYocto || "0");

  // Atomically refund/release reserved budget using CAS optimistic concurrency
  const refundResult = await refundMandateBudgetAtomic({
    mandateId: mandate.id,
    amountYocto: tx.amountYocto,
    refundFromReserved: true,
  });

  if (!refundResult.success) {
    throw new Error(`Failed to atomically refund mandate budget: ${refundResult.reason}`);
  }

  const now = new Date();

  const operations: any[] = [
    prisma.transactionRecord.update({
      where: { id: tx.id },
      data: {
        status: "FAILED",
        error: errorReason,
        reconciledAt: now,
        reconciliationNotes: `Verified on-chain failure: ${errorReason}`,
      },
    }),
  ];

  if (tx.taskId) {
    operations.push(
      prisma.task.update({
        where: { id: tx.taskId },
        data: { status: "FAILED" },
      })
    );
  }

  if (tx.executionId) {
    operations.push(
      prisma.agentExecution.update({
        where: { id: tx.executionId },
        data: {
          status: "FAILED",
          errorDetails: errorReason,
          completedAt: now,
        },
      })
    );
  }

  const [updatedTx] = await prisma.$transaction(operations);

  // Log TRANSACTION_FAILED
  await recordAuditEvent({
    userId,
    eventType: "TRANSACTION_FAILED",
    verdict: "FAILED",
    reasonCode: errorReason,
    description: `Transaction failed on NEAR testnet: ${errorReason}`,
    details: {
      txId: tx.id,
      txHash: tx.txHash,
      recipient: tx.recipient,
      amountYocto: tx.amountYocto,
      errorReason,
    },
    mandateId: mandate.id,
    taskId: tx.taskId || undefined,
    txHash: tx.txHash || undefined,
  });

  // Log RESERVATION_RELEASED
  if (previousReserved > BigInt(0)) {
    await recordAuditEvent({
      userId,
      eventType: "RESERVATION_RELEASED",
      verdict: "SUCCESS",
      description: `Released ${yoctoToNear(tx.amountYocto, 3)} NEAR budget reservation following transaction failure`,
      details: {
        txId: tx.id,
        mandateId: mandate.id,
        releasedAmountYocto: tx.amountYocto,
        previousReservedYocto: previousReserved.toString(),
        newReservedYocto: refundResult.newReservedYocto || "0",
      },
      mandateId: mandate.id,
      taskId: tx.taskId || undefined,
    });
  }

  return { alreadyFailed: false, tx: updatedTx };
}

/**
 * Updates a transaction whose outcome remains unknown or unverified.
 * CRITICAL RULE: Never release budget reservations while outcome is unknown.
 * - Increments retryCount and updates lastCheckedAt.
 * - If retries exceed limit, marks status as RECONCILIATION_REQUIRED.
 * - Records audit event: TRANSACTION_CONFIRMATION_CHECKED.
 */
export async function keepPendingOrFlagAtomically(params: {
  txId: string;
  reason: string;
  userId: string;
  maxRetries?: number;
}) {
  const { txId, reason, userId, maxRetries = 5 } = params;

  const tx = await prisma.transactionRecord.findUnique({
    where: { id: txId },
  });

  if (!tx) throw new Error(`Transaction ${txId} not found`);

  const nextRetryCount = tx.retryCount + 1;
  const isFlagged = nextRetryCount >= maxRetries;
  const nextStatus = isFlagged ? "RECONCILIATION_REQUIRED" : "CONFIRMING";

  const updatedTx = await prisma.transactionRecord.update({
    where: { id: tx.id },
    data: {
      status: nextStatus,
      retryCount: nextRetryCount,
      lastCheckedAt: new Date(),
      reconciliationNotes: `Attempt ${nextRetryCount}: ${reason}`,
    },
  });

  if (isFlagged && tx.taskId) {
    await prisma.task.update({
      where: { id: tx.taskId },
      data: { status: "RECONCILIATION_REQUIRED" },
    });
  }

  await recordAuditEvent({
    userId,
    eventType: "TRANSACTION_CONFIRMATION_CHECKED",
    verdict: isFlagged ? "RECONCILIATION_REQUIRED" : "PENDING",
    reasonCode: isFlagged ? "MAX_RETRIES_EXCEEDED" : "AWAITING_FINALITY",
    description: `Transaction status checked (Attempt ${nextRetryCount}): ${reason}`,
    details: {
      txId: tx.id,
      txHash: tx.txHash,
      retryCount: nextRetryCount,
      status: nextStatus,
      reason,
    },
    mandateId: tx.mandateId,
    taskId: tx.taskId,
    txHash: tx.txHash || undefined,
  });

  return updatedTx;
}

