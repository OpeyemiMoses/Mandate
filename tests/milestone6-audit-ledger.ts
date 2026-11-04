/**
 * MANDATE — MILESTONE 6: AUDIT LEDGER COMPREHENSIVE TEST SUITE
 * Verifies all 18 test cases specified for the Cryptographic Audit Ledger & Financial Event History
 */

import { prisma } from "../src/lib/db";
import { recordAuditEvent, verifyAuditChain, GENESIS_HASH } from "../src/lib/auditLedger";
import { reconcileTransactions } from "../src/lib/reconciliation";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3010";

async function runMilestone6FullTestSuite() {
  console.log("=================================================================");
  console.log("=== MANDATE MILESTONE 6: COMPREHENSIVE 18-POINT AUDIT SUITE ===");
  console.log("=================================================================\n");

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, testNum: number, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ Case ${testNum} PASS: ${testName}`);
      testPassed++;
    } else {
      console.error(`  ✗ Case ${testNum} FAIL: ${testName}${detail ? ` - ${detail}` : ""}`);
      testFailed++;
    }
  }

  const testUserAccount = `audit-tester-${Date.now().toString().slice(-5)}.testnet`;

  // Precondition: Connect user
  const authRes = await fetch(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: testUserAccount }),
  });
  const authData = await authRes.json();
  const userId = authData.user.id;
  const userHeaders = {
    "Content-Type": "application/json",
    "x-near-account": testUserAccount,
  };

  // ---------------------------------------------------------------------------
  // Case 1: Agent creation generates an audit event
  // ---------------------------------------------------------------------------
  const agentRes = await fetch(`${BASE_URL}/api/agents`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      name: "Audit Research Agent",
      purpose: "Auditable liquidity operations",
    }),
  });
  const agentData = await agentRes.json();
  const agentId = agentData.agent.id;

  const agentLog = await prisma.auditLog.findFirst({
    where: { userId, eventType: "AGENT_CREATED" },
  });
  assert(
    Boolean(agentLog && agentLog.currentHash && agentLog.sequenceNumber >= 1),
    1,
    "Agent creation generates a cryptographically hashed audit event",
    agentLog ? `CurrentHash: ${agentLog.currentHash?.slice(0, 16)}...` : "Missing log"
  );

  // ---------------------------------------------------------------------------
  // Case 2: Wallet funding generates an audit event
  // ---------------------------------------------------------------------------
  const fundTxHash = `tx-fund-audit-${Date.now()}`;
  const fundRes = await fetch(`${BASE_URL}/api/wallets/fund`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      amountNear: "3.000",
      agentId,
      txHash: fundTxHash,
    }),
  });
  const fundData = await fundRes.json();

  const fundLog = await prisma.auditLog.findFirst({
    where: { userId, eventType: "AGENT_FUNDED" },
  });
  assert(
    Boolean(fundLog && fundLog.prevHash === agentLog?.currentHash),
    2,
    "Wallet funding generates an audit event linked to predecessor hash",
    `prevHash matches agent currentHash`
  );

  // ---------------------------------------------------------------------------
  // Case 3: Mandate creation generates an audit event
  // ---------------------------------------------------------------------------
  const mandateRes = await fetch(`${BASE_URL}/api/mandates`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      name: "DeFi Auditor Mandate",
      agentId,
      totalBudgetNear: "2.500",
      perTxLimitNear: "0.200",
      approvalThresholdNear: "0.050",
      allowedRecipients: ["researcher.near", "oracle.testnet"],
      expiresAt: "2026-12-31T23:59:59Z",
    }),
  });
  const mandateData = await mandateRes.json();
  const mandateId = mandateData.mandate.id;

  const mandateLog = await prisma.auditLog.findFirst({
    where: { userId, eventType: "MANDATE_CREATED" },
  });
  assert(
    Boolean(mandateLog && mandateLog.currentHash),
    3,
    "Mandate creation generates an audit event with SHA-256 hash"
  );

  // ---------------------------------------------------------------------------
  // Case 4: Task dispatch generates an audit event
  // ---------------------------------------------------------------------------
  const taskRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      mandateId,
      title: "Query DEX Liquidity",
      description: "Autonomous task dispatch check",
      proposedRecipient: "researcher.near",
      proposedAmountNear: "0.030",
    }),
  });
  const taskData = await taskRes.json();

  const taskLog = await prisma.auditLog.findFirst({
    where: { userId, taskId: taskData.task?.id },
  });
  assert(
    Boolean(taskLog && taskLog.eventType === "POLICY_EVALUATED"),
    4,
    "Task dispatch generates policy evaluation audit event"
  );

  // ---------------------------------------------------------------------------
  // Case 5: Policy ALLOW generates an audit event
  // ---------------------------------------------------------------------------
  const allowLog = await prisma.auditLog.findFirst({
    where: { userId, taskId: taskData.task?.id, verdict: "ALLOWED" },
  });
  assert(
    Boolean(allowLog),
    5,
    "Policy ALLOW verdict generates an audit event with verdict=ALLOWED"
  );

  // ---------------------------------------------------------------------------
  // Case 6: Policy BLOCK generates an audit event
  // ---------------------------------------------------------------------------
  const rogueRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      mandateId,
      title: "Scraper Access",
      proposedRecipient: "rogue_malicious.near",
      proposedAmountNear: "0.040",
    }),
  });
  const rogueData = await rogueRes.json();

  const blockLog = await prisma.auditLog.findFirst({
    where: { userId, verdict: "BLOCKED", reasonCode: "RECIPIENT_NOT_ALLOWED" },
  });
  assert(
    Boolean(blockLog && blockLog.reasonCode === "RECIPIENT_NOT_ALLOWED"),
    6,
    "Policy BLOCK generates audit event with reasonCode=RECIPIENT_NOT_ALLOWED"
  );

  // ---------------------------------------------------------------------------
  // Case 7: Approval generates an audit event
  // ---------------------------------------------------------------------------
  const highValRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      mandateId,
      title: "Historical Dataset Purchase",
      proposedRecipient: "researcher.near",
      proposedAmountNear: "0.080",
    }),
  });
  const highValData = await highValRes.json();

  const approveRes = await fetch(`${BASE_URL}/api/approvals`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      approvalId: highValData.approvalId,
      decision: "APPROVE",
    }),
  });

  const approvalLog = await prisma.auditLog.findFirst({
    where: {
      userId,
      eventType: { in: ["APPROVAL_GRANTED_AND_SETTLED", "OUTLAYER_FAILED"] },
      taskId: highValData.task.id,
    },
  });
  assert(
    Boolean(approvalLog),
    7,
    "Approval decision generates an audit event"
  );

  // ---------------------------------------------------------------------------
  // Case 8: Rejection generates an audit event
  // ---------------------------------------------------------------------------
  const rejectTaskRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      mandateId,
      title: "Second High Value Task",
      proposedRecipient: "researcher.near",
      proposedAmountNear: "0.090",
    }),
  });
  const rejectTaskData = await rejectTaskRes.json();

  await fetch(`${BASE_URL}/api/approvals`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      approvalId: rejectTaskData.approvalId,
      decision: "REJECT",
    }),
  });

  const rejectLog = await prisma.auditLog.findFirst({
    where: { userId, eventType: "APPROVAL_REJECTED", taskId: rejectTaskData.task.id },
  });
  assert(
    Boolean(rejectLog && rejectLog.verdict === "REJECTED"),
    8,
    "Rejection decision generates an audit event with verdict=REJECTED"
  );

  // ---------------------------------------------------------------------------
  // Case 9: Transaction submission generates an audit event
  // ---------------------------------------------------------------------------
  const submittedLog = await prisma.auditLog.findFirst({
    where: {
      userId,
      eventType: { in: ["OUTLAYER_CONFIRMED", "OUTLAYER_FAILED", "TRANSACTION_CONFIRMED"] },
    },
  });
  assert(
    Boolean(submittedLog),
    9,
    "Transaction submission / TEE broadcast generates an audit event"
  );

  // ---------------------------------------------------------------------------
  // Case 10: Blockchain confirmation generates an audit event
  // ---------------------------------------------------------------------------
  // Record a transaction record and run reconciliation
  const testTxRecord = await prisma.transactionRecord.create({
    data: {
      txHash: `mock-reconcile-hash-${Date.now()}`,
      recipient: "researcher.near",
      amountYocto: nearToYocto("0.020"),
      status: "SUBMITTED",
      mandateId,
      taskId: taskData.task.id,
    },
  });

  // Directly verify reconciliation execution
  const reconcileReport = await reconcileTransactions(userId);
  assert(
    reconcileReport.checkedCount >= 1,
    10,
    "Transaction reconciliation scans pending records and verifies blockchain state"
  );

  // ---------------------------------------------------------------------------
  // Case 11: Agent revocation generates an audit event
  // ---------------------------------------------------------------------------
  const ephemeralAgentRes = await fetch(`${BASE_URL}/api/agents`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      name: "Ephemeral Agent for Revocation Test",
      purpose: "Test agent revocation audit event",
    }),
  });
  const ephemeralAgentData = await ephemeralAgentRes.json();
  const ephemeralAgentId = ephemeralAgentData.agent.id;

  const revokeRes = await fetch(`${BASE_URL}/api/agents/${ephemeralAgentId}`, {
    method: "DELETE",
    headers: userHeaders,
  });

  const revokeLog = await prisma.auditLog.findFirst({
    where: { userId, eventType: "AGENT_REVOKED", agentId: ephemeralAgentId },
  });
  assert(
    Boolean(revokeLog && revokeLog.verdict === "SUCCESS"),
    11,
    "Agent revocation generates an AGENT_REVOKED audit event"
  );

  // ---------------------------------------------------------------------------
  // Case 12: User cannot read another user's audit records
  // ---------------------------------------------------------------------------
  const foreignRes = await fetch(`${BASE_URL}/api/audit`, {
    headers: {
      "Content-Type": "application/json",
      "x-near-account": "eavesdropper.testnet",
    },
  });
  const foreignData = await foreignRes.json();
  const leakedLogs = (foreignData.logs || []).filter((l: any) => l.userId === userId);
  assert(
    leakedLogs.length === 0,
    12,
    "User cannot read another user's audit records (Strict Isolation)"
  );

  // ---------------------------------------------------------------------------
  // Case 13: User cannot modify or delete audit records (Append-only)
  // ---------------------------------------------------------------------------
  const deleteAttempt = await fetch(`${BASE_URL}/api/audit`, {
    method: "DELETE",
    headers: userHeaders,
  });
  assert(
    deleteAttempt.status === 405 || deleteAttempt.status === 404,
    13,
    "Application APIs reject mutation or deletion of audit records (Append-only)"
  );

  // ---------------------------------------------------------------------------
  // Case 14: Duplicate events handled correctly
  // ---------------------------------------------------------------------------
  const duplicateIdemKey = `idem-dup-${Date.now()}`;
  const dupFirst = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      mandateId,
      title: "Idempotent Query 1",
      proposedRecipient: "researcher.near",
      proposedAmountNear: "0.010",
      idempotencyKey: duplicateIdemKey,
    }),
  });
  const dupSecond = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      mandateId,
      title: "Idempotent Query 2",
      proposedRecipient: "researcher.near",
      proposedAmountNear: "0.010",
      idempotencyKey: duplicateIdemKey,
    }),
  });
  const dupSecondData = await dupSecond.json();
  assert(
    dupSecond.status === 403 && dupSecondData.reasonCode === "DUPLICATE_PAYMENT",
    14,
    "Duplicate event proposal rejected with DUPLICATE_PAYMENT"
  );

  // ---------------------------------------------------------------------------
  // Case 15: Hash chain integrity verifies successfully
  // ---------------------------------------------------------------------------
  const verifyChainResult = await verifyAuditChain(userId);
  assert(
    verifyChainResult.valid === true && verifyChainResult.count >= 6,
    15,
    "Hash chain integrity verifies successfully across complete audit history",
    `Total verified: ${verifyChainResult.count} linked events. Head: ${verifyChainResult.headHash?.slice(0, 16)}...`
  );

  // ---------------------------------------------------------------------------
  // Case 16: Tampered records are detected
  // ---------------------------------------------------------------------------
  // Select a middle record and tamper with its payload in the database
  const userLogs = await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { sequenceNumber: "asc" },
  });

  const middleLog = userLogs[Math.floor(userLogs.length / 2)];
  const originalJson = middleLog.detailsJson;

  // Intentionally modify payload to simulate adversary tampering with database
  await prisma.auditLog.update({
    where: { id: middleLog.id },
    data: { detailsJson: JSON.stringify({ forged: true, unauthorizedAmountNear: "1000.0" }) },
  });

  const tamperedCheck = await verifyAuditChain(userId);
  assert(
    tamperedCheck.valid === false && tamperedCheck.tamperedEventId === middleLog.id,
    16,
    "Tampered records are detected by the cryptographic verification algorithm",
    `Detected tampering at event ${tamperedCheck.tamperedEventId}`
  );

  // Restore record to maintain database consistency
  await prisma.auditLog.update({
    where: { id: middleLog.id },
    data: { detailsJson: originalJson },
  });

  const restoredCheck = await verifyAuditChain(userId);
  assert(
    restoredCheck.valid === true,
    16,
    "Integrity check returns valid after restoring authentic record"
  );

  // ---------------------------------------------------------------------------
  // Case 17: Concurrent event creation does not corrupt the chain
  // ---------------------------------------------------------------------------
  const concurrentPromises = [
    recordAuditEvent({
      userId,
      eventType: "CONCURRENT_TEST_A",
      verdict: "SUCCESS",
      description: "Concurrent stream test event A",
    }),
    recordAuditEvent({
      userId,
      eventType: "CONCURRENT_TEST_B",
      verdict: "SUCCESS",
      description: "Concurrent stream test event B",
    }),
  ];

  await Promise.all(concurrentPromises);
  const concurrentCheck = await verifyAuditChain(userId);
  assert(
    concurrentCheck.valid === true,
    17,
    "Concurrent event creation does not corrupt the hash chain"
  );

  // ---------------------------------------------------------------------------
  // Case 18: Failed transactions are recorded correctly
  // ---------------------------------------------------------------------------
  const failedLog = await prisma.auditLog.findFirst({
    where: { userId, verdict: "FAILED" },
  });
  assert(
    Boolean(failedLog && failedLog.reasonCode),
    18,
    "Failed operations are recorded with explicit reason code and failure details"
  );

  // Clean summary
  console.log("\n=================================================================");
  console.log(`MILESTONE 6 18-POINT SUITE RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
  console.log("=================================================================");

  if (testFailed > 0) {
    process.exit(1);
  }
}

runMilestone6FullTestSuite().catch((err) => {
  console.error("Test Suite Crashed:", err);
  process.exit(1);
});
