/**
 * Milestone 5 Verification Suite:
 * Agent Task Orchestration, Deterministic Policy Firewall & Human Approval Lifecycle
 */

import { prisma } from "../src/lib/db";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3010";

async function runMilestone5Tests() {
  console.log("=========================================================");
  console.log("=== MANDATE MILESTONE 5: TASKS & APPROVALS TEST SUITE ===");
  console.log("=========================================================\n");

  const accountId = "near_user.near";

  // Step 0: Ensure User and Mandate exist
  const user = await prisma.user.findUnique({
    where: { nearAccountId: accountId },
    include: {
      agents: { include: { wallet: true } },
      mandates: true,
    },
  });

  if (!user || user.mandates.length === 0) {
    throw new Error("Precondition failed: near_user.near with active mandate required. Run seed first.");
  }

  const activeMandate = user.mandates.find((m) => m.status === "ACTIVE") || user.mandates[0];
  console.log(`[INFO] Using Mandate: "${activeMandate.name}" (${activeMandate.id})`);
  console.log(`[INFO] Total Budget: ${yoctoToNear(activeMandate.totalBudgetYocto)} NEAR`);
  console.log(`[INFO] Per-Tx Cap: ${yoctoToNear(activeMandate.perTxLimitYocto)} NEAR`);
  console.log(`[INFO] Approval Threshold: ${yoctoToNear(activeMandate.approvalThresholdYocto)} NEAR`);
  console.log(`[INFO] Allowed Recipients: ${activeMandate.allowedRecipientsJson}\n`);

  const headers = {
    "Content-Type": "application/json",
    "x-near-account": accountId,
  };

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      testPassed++;
    } else {
      console.error(`  ✗ FAIL: ${testName}${detail ? ` - ${detail}` : ""}`);
      testFailed++;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 1: Policy Firewall Blocks Unauthorized Recipient
  // -------------------------------------------------------------------------
  console.log("--- TEST 1: Policy Firewall Rejection (Unauthorized Recipient) ---");
  const blockRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      mandateId: activeMandate.id,
      title: "Scraper Access Attempt",
      description: "Transfer 0.04 NEAR to unapproved rogue_scraper.near",
      proposedRecipient: "rogue_scraper.near",
      proposedAmountNear: "0.04",
      idempotencyKey: `idem-block-${Date.now()}`,
    }),
  });

  const blockData = await blockRes.json();
  assert(blockRes.status === 403, "HTTP status is 403 Forbidden");
  assert(blockData.verdict === "BLOCK", "Verdict is BLOCK");
  assert(blockData.reasonCode === "RECIPIENT_NOT_ALLOWED", "Reason code is RECIPIENT_NOT_ALLOWED");
  assert(Boolean(blockData.task?.id), "Task ID is created and returned for audit inspection");

  const blockedTask = await prisma.task.findUnique({
    where: { id: blockData.task.id },
  });
  assert(blockedTask?.status === "REJECTED", "Task persisted with status REJECTED");

  const blockedAudit = await prisma.auditLog.findFirst({
    where: { taskId: blockData.task.id, eventType: "POLICY_EVALUATED" },
  });
  assert(blockedAudit?.verdict === "BLOCKED", "Audit log recorded BLOCKED verdict");
  console.log("");

  // -------------------------------------------------------------------------
  // TEST 2: Policy Firewall Blocks Per-Tx Cap Exceeded
  // -------------------------------------------------------------------------
  console.log("--- TEST 2: Policy Firewall Rejection (Per-Tx Cap Exceeded) ---");
  const capRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      mandateId: activeMandate.id,
      title: "Over-limit Bulk Query",
      description: "Transfer 0.25 NEAR to researcher.near exceeding 0.10 NEAR limit",
      proposedRecipient: "researcher.near",
      proposedAmountNear: "0.25",
      idempotencyKey: `idem-cap-${Date.now()}`,
    }),
  });

  const capData = await capRes.json();
  assert(capRes.status === 403, "HTTP status is 403 Forbidden");
  assert(capData.verdict === "BLOCK", "Verdict is BLOCK");
  assert(capData.reasonCode === "PAYMENT_LIMIT_EXCEEDED", "Reason code is PAYMENT_LIMIT_EXCEEDED");
  console.log("");

  // -------------------------------------------------------------------------
  // TEST 3: Human Approval Gate & Atomic Budget Reservation
  // -------------------------------------------------------------------------
  console.log("--- TEST 3: Human Approval Gate (> 0.050 NEAR Threshold) ---");
  const mandateBeforeApproval = await prisma.mandate.findUnique({
    where: { id: activeMandate.id },
  });
  const reservedBefore = BigInt(mandateBeforeApproval?.reservedYocto || "0");

  const approvalReqRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      mandateId: activeMandate.id,
      title: "Orderbook Historical Archive",
      description: "Dataset purchase exceeding 0.050 NEAR approval threshold",
      proposedRecipient: "researcher.near",
      proposedAmountNear: "0.080",
      idempotencyKey: `idem-approval-${Date.now()}`,
    }),
  });

  const approvalReqData = await approvalReqRes.json();
  assert(approvalReqRes.ok, "HTTP status is 200 OK");
  assert(approvalReqData.verdict === "REQUIRES_APPROVAL", "Verdict is REQUIRES_APPROVAL");
  assert(Boolean(approvalReqData.approvalId), "Approval ID returned in response");

  const pendingTask = await prisma.task.findUnique({
    where: { id: approvalReqData.task.id },
    include: { approval: true },
  });
  assert(pendingTask?.status === "PENDING_APPROVAL", "Task status is PENDING_APPROVAL");
  assert(pendingTask?.approval?.status === "PENDING", "ApprovalRequest status is PENDING");

  const mandateAfterApproval = await prisma.mandate.findUnique({
    where: { id: activeMandate.id },
  });
  const expectedReserved = (reservedBefore + BigInt(nearToYocto("0.080"))).toString();
  assert(
    mandateAfterApproval?.reservedYocto === expectedReserved,
    "Mandate reservedYocto incremented atomically by 0.080 NEAR"
  );
  console.log("");

  // -------------------------------------------------------------------------
  // TEST 4: Human Approval Rejection & Budget Unreservation
  // -------------------------------------------------------------------------
  console.log("--- TEST 4: Human Rejection Releases Reserved Budget ---");
  const rejectRes = await fetch(`${BASE_URL}/api/approvals`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      approvalId: approvalReqData.approvalId,
      decision: "REJECT",
    }),
  });

  const rejectData = await rejectRes.json();
  assert(rejectRes.ok, "HTTP status is 200 OK");
  assert(rejectData.decision === "REJECTED", "Decision is REJECTED");

  const mandateAfterReject = await prisma.mandate.findUnique({
    where: { id: activeMandate.id },
  });
  assert(
    mandateAfterReject?.reservedYocto === reservedBefore.toString(),
    "Mandate reservedYocto unreserved and restored back to original level"
  );

  const rejectedTask = await prisma.task.findUnique({
    where: { id: approvalReqData.task.id },
  });
  assert(rejectedTask?.status === "REJECTED", "Task status updated to REJECTED");
  console.log("");

  // -------------------------------------------------------------------------
  // TEST 5: Human Approval Grant
  // -------------------------------------------------------------------------
  console.log("--- TEST 5: Human Approval Grant & Execution Attempt ---");
  const secondApprovalTaskRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      mandateId: activeMandate.id,
      title: "Second Approved Query",
      description: "Transfer 0.070 NEAR with human sign-off",
      proposedRecipient: "researcher.near",
      proposedAmountNear: "0.070",
      idempotencyKey: `idem-approve-${Date.now()}`,
    }),
  });
  const secondTaskData = await secondApprovalTaskRes.json();
  assert(secondTaskData.verdict === "REQUIRES_APPROVAL", "Created second approval-gated task");

  const approveRes = await fetch(`${BASE_URL}/api/approvals`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      approvalId: secondTaskData.approvalId,
      decision: "APPROVE",
    }),
  });

  const approveData = await approveRes.json();
  // Either 200 (if funded onchain) or 502 (chain refused because testnet custody account needs gas)
  assert(
    approveData.decision === "APPROVED" || approveData.decision === "APPROVED_BUT_CHAIN_REFUSED",
    "Approval recorded as approved"
  );

  const approvalRecord = await prisma.approvalRequest.findUnique({
    where: { id: secondTaskData.approvalId },
  });
  assert(approvalRecord?.status === "APPROVED", "ApprovalRequest database status is APPROVED");
  console.log("");

  // -------------------------------------------------------------------------
  // TEST 6: Direct Task Detail API (GET /api/tasks/[id])
  // -------------------------------------------------------------------------
  console.log("--- TEST 6: Direct Task Detail Endpoint (/api/tasks/[id]) ---");
  const detailRes = await fetch(`${BASE_URL}/api/tasks/${approvalReqData.task.id}`, {
    headers,
  });
  const detailData = await detailRes.json();
  assert(detailRes.ok, "HTTP status is 200 OK");
  assert(detailData.task.id === approvalReqData.task.id, "Correct task ID retrieved");
  assert(Boolean(detailData.task.agent?.name), "Task includes governing agent metadata");
  assert(Boolean(detailData.task.mandate?.name), "Task includes governing mandate metadata");
  assert(Boolean(detailData.task.policyDecision), "Task includes deterministic policyDecision breakdown");
  assert(detailData.task.auditLogs.length > 0, "Task includes audit trail");
  console.log("");

  // -------------------------------------------------------------------------
  // TEST 7: Strict Multi-User Isolation
  // -------------------------------------------------------------------------
  console.log("--- TEST 7: Strict Multi-User Isolation ---");
  const foreignHeaders = {
    "Content-Type": "application/json",
    "x-near-account": "stranger.testnet",
  };
  const foreignTaskRes = await fetch(`${BASE_URL}/api/tasks/${approvalReqData.task.id}`, {
    headers: foreignHeaders,
  });
  assert(foreignTaskRes.status === 404, "Foreign user receives 404 accessing another user's task");

  const foreignApprovalRes = await fetch(`${BASE_URL}/api/approvals`, {
    method: "POST",
    headers: foreignHeaders,
    body: JSON.stringify({
      approvalId: secondTaskData.approvalId,
      decision: "REJECT",
    }),
  });
  assert(foreignApprovalRes.status === 404, "Foreign user cannot reject/approve another user's approval request");
  console.log("");

  // Summary
  console.log("=========================================================");
  console.log(`MILESTONE 5 TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
  console.log("=========================================================");

  if (testFailed > 0) {
    process.exit(1);
  }
}

runMilestone5Tests().catch((err) => {
  console.error("Test Suite Crashed:", err);
  process.exit(1);
});
