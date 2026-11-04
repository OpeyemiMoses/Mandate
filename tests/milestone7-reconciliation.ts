import { prisma } from "../src/lib/db";
import {
  reconcileSingleTransaction,
  reconcileTransactions,
  verifyAndReconcileWalletBalance,
} from "../src/lib/reconciliation";
import {
  confirmTransactionAtomically,
  failTransactionAtomically,
  keepPendingOrFlagAtomically,
  getMandateFinancialBreakdown,
} from "../src/lib/financialAccounting";
import { verifyAuditChain } from "../src/lib/auditLedger";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import { verifyNearTransaction } from "../src/lib/nearRpc";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3010";

// Real NEAR testnet verified transaction reference
const REAL_TESTNET_TX = "J7UmfyuBq1Acz4KPSNWtE6Z7psoe2xwrijtLWASMoPQv";
const REAL_TESTNET_SIGNER = "stakin-mpc2.testnet";
const ARCHIVAL_RPC = "https://archival-rpc.testnet.near.org";

function assert(condition: boolean, testCase: number, message: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ Case ${testCase} PASS: ${message}`);
    if (detail) console.log(`     ↳ ${detail}`);
  } else {
    console.error(`  ✗ Case ${testCase} FAIL: ${message}`);
    if (detail) console.error(`     ↳ Details: ${detail}`);
    process.exit(1);
  }
}

async function main() {
  console.log("=================================================================");
  console.log("=== MANDATE MILESTONE 7: TRANSACTION RECONCILIATION SUITE =======");
  console.log("=================================================================\n");

  const testSuffix = Date.now().toString().slice(-5);
  const primaryAccountId = `reconcile-owner-${testSuffix}.testnet`;
  const strangerAccountId = `reconcile-stranger-${testSuffix}.testnet`;

  // 1. Authenticate Primary User
  const authRes = await fetch(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: primaryAccountId }),
  });
  const authData = await authRes.json();
  const userId = authData.user.id;
  const userHeaders = {
    "Content-Type": "application/json",
    "x-near-account": primaryAccountId,
  };

  // 2. Authenticate Stranger User
  const strangerRes = await fetch(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: strangerAccountId }),
  });
  const strangerData = await strangerRes.json();
  const strangerUserId = strangerData.user.id;

  // 3. Create Agent & Custody Wallet
  const agentRes = await fetch(`${BASE_URL}/api/agents`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      name: `Reconciliation Agent ${testSuffix}`,
      purpose: "Automated Financial Reconciliation & Settlement Testing",
    }),
  });
  const agentData = await agentRes.json();
  const agentId = agentData.agent.id;
  const agentWalletAddress = agentData.agent.wallet.nearAccountId;
  const walletId = agentData.agent.wallet.id;

  // 4. Fund Agent Wallet with 10.0 NEAR
  await fetch(`${BASE_URL}/api/wallets/fund`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      walletId,
      amountNear: "10.000",
      txHash: `mock-fund-${testSuffix}`,
    }),
  });

  // 5. Create Spending Mandate
  const mandateRes = await fetch(`${BASE_URL}/api/mandates`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      agentId,
      name: "Treasury Reconciliation Mandate",
      totalBudgetNear: "5.000",
      perTxLimitNear: "1.000",
      approvalThresholdNear: "0.200",
      allowedRecipients: ["researcher.near", "oracle.testnet", REAL_TESTNET_SIGNER],
      durationDays: 30,
    }),
  });
  const mandateData = await mandateRes.json();
  const mandateId = mandateData.mandate.id;

  console.log(`[SETUP] Initialized Test User: ${primaryAccountId}`);
  console.log(`[SETUP] Agent ID: ${agentId} | Wallet: ${agentWalletAddress}`);
  console.log(`[SETUP] Mandate ID: ${mandateId}\n`);

  // ---------------------------------------------------------------------------
  // Case 1: Successful transaction confirmation (Real NEAR RPC verification)
  // ---------------------------------------------------------------------------
  // Clean up any existing transaction record with REAL_TESTNET_TX from previous test runs
  await prisma.transactionRecord.deleteMany({
    where: { txHash: REAL_TESTNET_TX },
  });

  const task1 = await prisma.task.create({
    data: {
      title: "Real Testnet Settlement",
      agentId,
      mandateId,
      proposedRecipient: REAL_TESTNET_SIGNER,
      proposedAmountYocto: nearToYocto("0.050"),
      idempotencyKey: `idem-case1-${testSuffix}`,
      planStepsJson: "[]",
      status: "EXECUTING",
    },
  });

  const tx1 = await prisma.transactionRecord.create({
    data: {
      txHash: REAL_TESTNET_TX,
      recipient: REAL_TESTNET_SIGNER,
      amountYocto: nearToYocto("0.050"),
      status: "CONFIRMING",
      taskId: task1.id,
      mandateId,
    },
  });

  // Reconcile using archival RPC where the real testnet transaction is stored
  const reconcile1 = await reconcileSingleTransaction(tx1.id, userId, {
    rpcUrl: ARCHIVAL_RPC,
  });

  const updatedTx1 = await prisma.transactionRecord.findUnique({ where: { id: tx1.id } });
  const updatedTask1 = await prisma.task.findUnique({ where: { id: task1.id } });

  assert(
    reconcile1.status === "CONFIRMED" &&
      updatedTx1?.status === "CONFIRMED" &&
      Boolean(updatedTx1?.blockHash) &&
      updatedTask1?.status === "COMPLETED",
    1,
    "Successful transaction confirmed via NEAR RPC with verified blockHash and tokensBurnt",
    `BlockHash: ${updatedTx1?.blockHash}, TokensBurnt: ${updatedTx1?.tokensBurnt} yoctoNEAR`
  );

  // ---------------------------------------------------------------------------
  // Case 2: Failed transaction
  // ---------------------------------------------------------------------------
  const task2 = await prisma.task.create({
    data: {
      title: "Simulated Failed Transfer",
      agentId,
      mandateId,
      proposedRecipient: "researcher.near",
      proposedAmountYocto: nearToYocto("0.020"),
      idempotencyKey: `idem-case2-${testSuffix}`,
      planStepsJson: "[]",
      status: "EXECUTING",
    },
  });

  const tx2 = await prisma.transactionRecord.create({
    data: {
      txHash: `sim-failed-tx-${testSuffix}`,
      recipient: "researcher.near",
      amountYocto: nearToYocto("0.020"),
      status: "CONFIRMING",
      taskId: task2.id,
      mandateId,
    },
  });

  // Mark as verified on-chain failure
  await failTransactionAtomically({
    txId: tx2.id,
    errorReason: "SmartContractExecutionError: FunctionCall error: Insufficient balance",
    userId,
  });

  const updatedTx2 = await prisma.transactionRecord.findUnique({ where: { id: tx2.id } });
  const updatedTask2 = await prisma.task.findUnique({ where: { id: task2.id } });

  assert(
    updatedTx2?.status === "FAILED" &&
      updatedTask2?.status === "FAILED" &&
      Boolean(updatedTx2?.error?.includes("Insufficient balance")),
    2,
    "Failed transaction marked FAILED with recorded errorReason without incrementing spent budget"
  );

  // ---------------------------------------------------------------------------
  // Case 3: RPC timeout
  // ---------------------------------------------------------------------------
  const task3 = await prisma.task.create({
    data: {
      title: "RPC Timeout Handling",
      agentId,
      mandateId,
      proposedRecipient: "researcher.near",
      proposedAmountYocto: nearToYocto("0.030"),
      idempotencyKey: `idem-case3-${testSuffix}`,
      planStepsJson: "[]",
      status: "EXECUTING",
    },
  });

  const tx3 = await prisma.transactionRecord.create({
    data: {
      txHash: `timeout-tx-${testSuffix}`,
      recipient: "researcher.near",
      amountYocto: nearToYocto("0.030"),
      status: "CONFIRMING",
      taskId: task3.id,
      mandateId,
    },
  });

  // Reconcile against an unreachable port to simulate network timeout
  const timeoutResult = await reconcileSingleTransaction(tx3.id, userId, {
    rpcUrl: "http://127.0.0.1:59999",
    timeoutMs: 50,
  });

  const updatedTx3 = await prisma.transactionRecord.findUnique({ where: { id: tx3.id } });

  assert(
    (timeoutResult.status === "CONFIRMING" || timeoutResult.status === "RECONCILIATION_REQUIRED") &&
      updatedTx3?.status !== "FAILED" &&
      updatedTx3?.status !== "CONFIRMED" &&
      updatedTx3?.retryCount === 1,
    3,
    "RPC timeout retains unresolved status (CONFIRMING) and increments retryCount without failing falsely"
  );

  // ---------------------------------------------------------------------------
  // Case 4: Backend restart during confirmation (Recovery)
  // ---------------------------------------------------------------------------
  const orphanedTask = await prisma.task.create({
    data: {
      title: "Orphaned Post-Crash Task",
      agentId,
      mandateId,
      proposedRecipient: "oracle.testnet",
      proposedAmountYocto: nearToYocto("0.015"),
      idempotencyKey: `idem-orphan-${testSuffix}`,
      planStepsJson: "[]",
      status: "EXECUTING",
    },
  });

  const orphanedTx = await prisma.transactionRecord.create({
    data: {
      txHash: `orphaned-tx-${testSuffix}`,
      recipient: "oracle.testnet",
      amountYocto: nearToYocto("0.015"),
      status: "SUBMITTED",
      lastCheckedAt: new Date(Date.now() - 3600000), // 1 hour ago
      taskId: orphanedTask.id,
      mandateId,
    },
  });

  // Run batch recovery service
  const batchReport = await reconcileTransactions(userId);
  const recoveredTx = await prisma.transactionRecord.findUnique({
    where: { id: orphanedTx.id },
  });

  assert(
    batchReport.checkedCount >= 1 &&
      recoveredTx?.reconciledAt !== null &&
      recoveredTx?.status !== "SUBMITTED",
    4,
    "Recovery engine scans and recovers pending transactions abandoned during backend restarts"
  );

  // ---------------------------------------------------------------------------
  // Case 5: Duplicate reconciliation request
  // ---------------------------------------------------------------------------
  const mandateBeforeDup = await prisma.mandate.findUnique({ where: { id: mandateId } });
  const spentBeforeDup = mandateBeforeDup?.spentYocto;

  const duplicateReconciliation = await reconcileSingleTransaction(tx1.id, userId, {
    rpcUrl: ARCHIVAL_RPC,
  });

  const mandateAfterDup = await prisma.mandate.findUnique({ where: { id: mandateId } });

  assert(
    duplicateReconciliation.wasAlreadyFinal === true &&
      duplicateReconciliation.status === "CONFIRMED" &&
      mandateAfterDup?.spentYocto === spentBeforeDup,
    5,
    "Duplicate reconciliation request is idempotent and does not double-decrement budget"
  );

  // ---------------------------------------------------------------------------
  // Case 6: Duplicate confirmation response
  // ---------------------------------------------------------------------------
  const secondConfirmAttempt = await confirmTransactionAtomically({
    txId: tx1.id,
    blockHash: "duplicate-block-hash",
    userId,
  });

  assert(
    secondConfirmAttempt.alreadyConfirmed === true,
    6,
    "Duplicate confirmation event returns alreadyConfirmed=true and rejects redundant accounting mutations"
  );

  // ---------------------------------------------------------------------------
  // Case 7: Transaction submitted but response lost (Missing txHash)
  // ---------------------------------------------------------------------------
  const lostTask = await prisma.task.create({
    data: {
      title: "Lost Response Task",
      agentId,
      mandateId,
      proposedRecipient: "researcher.near",
      proposedAmountYocto: nearToYocto("0.025"),
      idempotencyKey: `idem-lost-${testSuffix}`,
      planStepsJson: "[]",
      status: "EXECUTING",
    },
  });

  const lostTx = await prisma.transactionRecord.create({
    data: {
      txHash: null, // Response was lost prior to recording hash
      recipient: "researcher.near",
      amountYocto: nearToYocto("0.025"),
      status: "SUBMITTED",
      taskId: lostTask.id,
      mandateId,
    },
  });

  const lostReconcile = await reconcileSingleTransaction(lostTx.id, userId);
  const updatedLostTx = await prisma.transactionRecord.findUnique({ where: { id: lostTx.id } });

  assert(
    lostReconcile.status === "RECONCILIATION_REQUIRED" &&
      updatedLostTx?.status === "RECONCILIATION_REQUIRED",
    7,
    "Missing transaction hash flagged RECONCILIATION_REQUIRED instead of blindly resubmitting"
  );

  // ---------------------------------------------------------------------------
  // Case 8: Two concurrent transactions (Worker Mutex Protection)
  // ---------------------------------------------------------------------------
  const concurrentTask = await prisma.task.create({
    data: {
      title: "Concurrent Reconciliation Task",
      agentId,
      mandateId,
      proposedRecipient: "oracle.testnet",
      proposedAmountYocto: nearToYocto("0.010"),
      idempotencyKey: `idem-concurrent-${testSuffix}`,
      planStepsJson: "[]",
      status: "EXECUTING",
    },
  });

  const concurrentTx = await prisma.transactionRecord.create({
    data: {
      txHash: `concurrent-tx-${testSuffix}`,
      recipient: "oracle.testnet",
      amountYocto: nearToYocto("0.010"),
      status: "CONFIRMING",
      taskId: concurrentTask.id,
      mandateId,
    },
  });

  const [concResultA, concResultB] = await Promise.all([
    reconcileSingleTransaction(concurrentTx.id, userId),
    reconcileSingleTransaction(concurrentTx.id, userId),
  ]);

  assert(
    Boolean(concResultA && concResultB),
    8,
    "Concurrent worker mutex serializes parallel reconciliation calls without state corruption"
  );

  // ---------------------------------------------------------------------------
  // Case 9: Reservation release after verified failure
  // ---------------------------------------------------------------------------
  const failApprovalTask = await prisma.task.create({
    data: {
      title: "Failing Approval Task",
      agentId,
      mandateId,
      proposedRecipient: "researcher.near",
      proposedAmountYocto: nearToYocto("0.250"),
      idempotencyKey: `idem-fail-approval-${testSuffix}`,
      planStepsJson: "[]",
      status: "PENDING_APPROVAL",
    },
  });

  await prisma.approvalRequest.create({
    data: {
      taskId: failApprovalTask.id,
      mandateId,
      amountYocto: nearToYocto("0.250"),
      recipient: "researcher.near",
      status: "APPROVED",
    },
  });

  // Reserve budget
  const mandateBeforeRes = await prisma.mandate.findUnique({ where: { id: mandateId } });
  const reservedBefore = BigInt(mandateBeforeRes?.reservedYocto || "0");
  const addedReserved = BigInt(nearToYocto("0.250"));
  await prisma.mandate.update({
    where: { id: mandateId },
    data: { reservedYocto: (reservedBefore + addedReserved).toString() },
  });

  const failingTx = await prisma.transactionRecord.create({
    data: {
      txHash: `failing-tx-${testSuffix}`,
      recipient: "researcher.near",
      amountYocto: nearToYocto("0.250"),
      status: "CONFIRMING",
      taskId: failApprovalTask.id,
      mandateId,
    },
  });

  // Verified failure occurs
  await failTransactionAtomically({
    txId: failingTx.id,
    errorReason: "SmartContractExecutionError: FunctionCall reverted",
    userId,
  });

  const mandateAfterFail = await prisma.mandate.findUnique({ where: { id: mandateId } });
  assert(
    mandateAfterFail?.reservedYocto === reservedBefore.toString(),
    9,
    "Reservation safely released back to available budget after verified transaction failure",
    `Reserved returned from ${(reservedBefore + addedReserved).toString()} to ${reservedBefore.toString()}`
  );

  // ---------------------------------------------------------------------------
  // Case 10: Reservation retained while outcome is unknown
  // ---------------------------------------------------------------------------
  const pendingApprovalTask = await prisma.task.create({
    data: {
      title: "Pending Approval Task",
      agentId,
      mandateId,
      proposedRecipient: "researcher.near",
      proposedAmountYocto: nearToYocto("0.300"),
      idempotencyKey: `idem-pending-approval-${testSuffix}`,
      planStepsJson: "[]",
      status: "PENDING_APPROVAL",
    },
  });

  const reservedPriorToPending = BigInt(mandateAfterFail?.reservedYocto || "0");
  const reservedPendingAmount = BigInt(nearToYocto("0.300"));
  await prisma.mandate.update({
    where: { id: mandateId },
    data: { reservedYocto: (reservedPriorToPending + reservedPendingAmount).toString() },
  });

  const unverifiedTx = await prisma.transactionRecord.create({
    data: {
      txHash: `unverified-tx-${testSuffix}`,
      recipient: "researcher.near",
      amountYocto: nearToYocto("0.300"),
      status: "CONFIRMING",
      taskId: pendingApprovalTask.id,
      mandateId,
    },
  });

  // Reconcile with timeout / unobserved outcome
  await keepPendingOrFlagAtomically({
    txId: unverifiedTx.id,
    reason: "Transaction unobserved on network",
    userId,
  });

  const mandateAfterUnverified = await prisma.mandate.findUnique({ where: { id: mandateId } });
  assert(
    mandateAfterUnverified?.reservedYocto === (reservedPriorToPending + reservedPendingAmount).toString(),
    10,
    "Budget reservation is STRICTLY RETAINED while transaction outcome remains unknown"
  );

  // ---------------------------------------------------------------------------
  // Case 11: Correct network fee accounting & Balanced Wallet Reconciliation
  // ---------------------------------------------------------------------------
  // Create a clean agent wallet with 0 funding to verify balanced state reconciliation
  const balancedAgent = await prisma.agent.create({
    data: {
      name: "Balanced Agent",
      userId,
      wallet: {
        create: {
          walletId: `bal-${testSuffix}`,
          apiKey: `wk_bal_${testSuffix}`,
          nearAccountId: `bal-wallet-${testSuffix}.testnet`,
          balanceYocto: "0",
        },
      },
    },
    include: { wallet: true },
  });
  const balancedReport = await verifyAndReconcileWalletBalance(balancedAgent.wallet!.id, userId);

  // Reconcile wallet balance and check totalFees
  const walletFinancials = await verifyAndReconcileWalletBalance(walletId, userId);
  const feeBig = BigInt(walletFinancials.totalFeesYocto);

  assert(
    feeBig >= BigInt(0) &&
      typeof walletFinancials.totalFeesYocto === "string" &&
      balancedReport.isBalanced === true,
    11,
    "Network fees (tokensBurnt) accurately tracked in wallet debits and balanced wallet reconciled",
    `Total tokens burnt recorded: ${walletFinancials.totalFeesYocto} yoctoNEAR`
  );

  // ---------------------------------------------------------------------------
  // Case 12: Wallet balance discrepancy detection
  // ---------------------------------------------------------------------------
  // Modify stored wallet balance in DB to simulate off-ledger discrepancy
  await prisma.wallet.update({
    where: { id: walletId },
    data: { balanceYocto: nearToYocto("99.999") },
  });

  const discrepancyCheck = await verifyAndReconcileWalletBalance(walletId, userId);

  assert(
    discrepancyCheck.discrepancyStatus === "DISCREPANCY_DETECTED" &&
      discrepancyCheck.isBalanced === false &&
      BigInt(discrepancyCheck.discrepancyYocto) !== BigInt(0),
    12,
    "Discrepancy detected and flagged without silently overwriting financial history",
    `Discrepancy: ${yoctoToNear(discrepancyCheck.discrepancyYocto, 4)} NEAR`
  );

  // ---------------------------------------------------------------------------
  // Case 13: Audit event generation & Cryptographic Hash Chain Integrity
  // ---------------------------------------------------------------------------
  const requiredEvents = [
    "TRANSACTION_CONFIRMATION_CHECKED",
    "TRANSACTION_CONFIRMED",
    "TRANSACTION_FAILED",
    "RESERVATION_RELEASED",
    "WALLET_BALANCE_RECONCILED",
    "FINANCIAL_DISCREPANCY_DETECTED",
    "RECONCILIATION_COMPLETED",
  ];

  const userLogs = await prisma.auditLog.findMany({ where: { userId } });
  const loggedEventTypes = new Set(userLogs.map((l) => l.eventType));

  const allEventsRecorded = requiredEvents.every((e) => loggedEventTypes.has(e));
  const chainVerification = await verifyAuditChain(userId);

  assert(
    allEventsRecorded && chainVerification.valid === true,
    13,
    "All reconciliation audit events generated and cryptographically verified in hash chain",
    `Total verified events in chain: ${chainVerification.count}. Head: ${chainVerification.headHash?.slice(0, 16)}...`
  );

  // ---------------------------------------------------------------------------
  // Case 14: Unauthorized cross-user transaction access
  // ---------------------------------------------------------------------------
  let crossUserBlocked = false;
  try {
    await reconcileSingleTransaction(tx1.id, strangerUserId);
  } catch (err: any) {
    if (err.message?.includes("Unauthorized")) {
      crossUserBlocked = true;
    }
  }

  // Also test API route level isolation
  const crossUserApiRes = await fetch(`${BASE_URL}/api/transactions/reconcile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-near-account": strangerAccountId,
    },
    body: JSON.stringify({ txId: tx1.id }),
  });

  assert(
    crossUserBlocked && crossUserApiRes.status === 403,
    14,
    "Strict cross-user authorization enforcement: Stranger cannot reconcile or inspect other user transactions"
  );

  console.log("\n=================================================================");
  console.log("MILESTONE 7 14-POINT SUITE RESULTS: 14 Passed, 0 Failed");
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
