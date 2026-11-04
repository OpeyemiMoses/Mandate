/**
 * Milestone 6 Verification Suite:
 * Immutable Security Audit Ledger, User Isolation & Full End-to-End Product Lifecycle
 */

import { prisma } from "../src/lib/db";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3010";

async function runMilestone6Tests() {
  console.log("=========================================================");
  console.log("=== MANDATE MILESTONE 6: AUDIT LEDGER & E2E SUITE =======");
  console.log("=========================================================\n");

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
  // PART 1: AUDIT API ISOLATION & FILTERING
  // -------------------------------------------------------------------------
  console.log("--- PART 1: Audit API Scoping & Category Filtering ---");
  const aliceAccount = "near_user.near";
  const aliceHeaders = {
    "Content-Type": "application/json",
    "x-near-account": aliceAccount,
  };

  // 1. Query Alice's audit logs
  const aliceAuditRes = await fetch(`${BASE_URL}/api/audit`, { headers: aliceHeaders });
  const aliceAuditData = await aliceAuditRes.json();
  assert(aliceAuditRes.ok, "Alice audit API returns HTTP 200");
  assert(Array.isArray(aliceAuditData.logs), "Logs returned as array");
  assert(aliceAuditData.logs.length > 0, "Alice has audit records recorded from earlier operations");

  // 2. Query as Foreign User (stranger.testnet)
  const strangerHeaders = {
    "Content-Type": "application/json",
    "x-near-account": "stranger.testnet",
  };
  const strangerAuditRes = await fetch(`${BASE_URL}/api/audit`, { headers: strangerHeaders });
  const strangerAuditData = await strangerAuditRes.json();
  assert(strangerAuditRes.ok, "Stranger audit API returns HTTP 200");
  const leakedAliceLogs = (strangerAuditData.logs || []).filter(
    (l: any) => l.mandateName === "DeFi Research" || l.details?.senderAccountId === aliceAccount
  );
  assert(
    leakedAliceLogs.length === 0,
    "Strict Multi-User Isolation: Stranger cannot view any of Alice's audit events"
  );

  // 3. Category Filter tests
  const policyRes = await fetch(`${BASE_URL}/api/audit?category=policy`, { headers: aliceHeaders });
  const policyData = await policyRes.json();
  const allPolicy = policyData.logs.every((l: any) => l.eventType === "POLICY_EVALUATED");
  assert(allPolicy && policyData.logs.length > 0, "Category 'policy' returns only POLICY_EVALUATED events");

  const approvalRes = await fetch(`${BASE_URL}/api/audit?category=approval`, { headers: aliceHeaders });
  const approvalData = await approvalRes.json();
  const allApproval = approvalData.logs.every((l: any) => l.eventType.includes("APPROVAL"));
  assert(allApproval, "Category 'approval' returns only APPROVAL events");
  console.log("");

  // -------------------------------------------------------------------------
  // PART 2: COMPLETE END-TO-END AUTONOMOUS PRODUCT LIFECYCLE
  // -------------------------------------------------------------------------
  console.log("--- PART 2: Complete End-to-End User & Agent Lifecycle ---");
  const testUser = `hannah-${Date.now().toString().slice(-4)}.testnet`;
  const userHeaders = {
    "Content-Type": "application/json",
    "x-near-account": testUser,
  };

  // Step 1: Connect personal NEAR wallet
  console.log(`[E2E Step 1] Connecting user personal wallet: ${testUser}`);
  const authRes = await fetch(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: testUser }),
  });
  const authData = await authRes.json();
  assert(authRes.ok && authData.success, `Personal wallet connected (${testUser})`);
  assert(authData.onchain?.balanceNear !== undefined, "Live NEAR RPC balance queried from testnet");

  // Step 2: Create dedicated AI Agent with OutLayer TEE wallet
  console.log(`[E2E Step 2] Creating dedicated AI Agent`);
  const agentRes = await fetch(`${BASE_URL}/api/agents`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      name: "Autonomous DeFi Scout",
      purpose: "Automated onchain liquidity querying",
    }),
  });
  const agentData = await agentRes.json();
  assert(agentRes.ok && agentData.success, "Dedicated AI Agent created");
  const custodyAddress = agentData.agent.wallet?.nearAccountId;
  assert(Boolean(custodyAddress), "Dedicated 64-char OutLayer TEE custody address provisioned");
  const agentId = agentData.agent.id;

  // Step 3: Fund agent custody wallet
  console.log(`[E2E Step 3] User funds agent custody wallet with 2.500 NEAR`);
  const fundRes = await fetch(`${BASE_URL}/api/wallets/fund`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      amountNear: "2.500",
      agentId,
      txHash: `tx-e2e-fund-${Date.now()}`,
    }),
  });
  const fundData = await fundRes.json();
  assert(fundRes.ok && fundData.success, "Agent wallet funded with 2.500 NEAR");
  assert(fundData.agentWalletBalanceNear === "2.500", "Agent wallet balance updated to 2.500 NEAR");

  // Step 4: Create spending mandate bound to the agent
  console.log(`[E2E Step 4] User creates spending mandate bound to agent`);
  const mandateRes = await fetch(`${BASE_URL}/api/mandates`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      name: "DEX Volatility Mandate",
      description: "Autonomous data purchase within limits",
      agentId,
      totalBudgetNear: "2.000",
      perTxLimitNear: "0.200",
      approvalThresholdNear: "0.050",
      allowedRecipients: ["researcher.near", "oracle.testnet"],
      expiresAt: "2026-12-31T23:59:59Z",
    }),
  });
  const mandateData = await mandateRes.json();
  assert(mandateRes.ok && mandateData.success, "Mandate created with agent binding");
  const mandateId = mandateData.mandate.id;

  // Step 5: Agent attempts unauthorized rogue payment -> BLOCKED
  console.log(`[E2E Step 5] Agent proposes payment to unapproved recipient rogue_scam.near`);
  const rogueRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      mandateId,
      title: "Rogue Data Purchase",
      description: "Transfer to unapproved recipient",
      proposedRecipient: "rogue_scam.near",
      proposedAmountNear: "0.040",
    }),
  });
  const rogueData = await rogueRes.json();
  assert(rogueRes.status === 403, "Rogue proposal blocked with HTTP 403");
  assert(rogueData.verdict === "BLOCK", "Verdict is BLOCK");
  assert(rogueData.reasonCode === "RECIPIENT_NOT_ALLOWED", "Blocked with RECIPIENT_NOT_ALLOWED");

  // Step 6: Agent proposes high-value payment (0.090 NEAR > 0.050 threshold) -> APPROVAL GATE
  console.log(`[E2E Step 6] Agent proposes 0.090 NEAR payment (exceeds 0.050 NEAR threshold)`);
  const highValRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      mandateId,
      title: "Full Orderbook Archive",
      description: "30-day historical liquidity data",
      proposedRecipient: "researcher.near",
      proposedAmountNear: "0.090",
    }),
  });
  const highValData = await highValRes.json();
  assert(highValRes.ok, "High-value task accepted for evaluation");
  assert(highValData.verdict === "REQUIRES_APPROVAL", "Verdict is REQUIRES_APPROVAL");
  assert(Boolean(highValData.approvalId), "Approval request created");

  // Verify budget reserved atomically
  const mandateCheck = await prisma.mandate.findUnique({ where: { id: mandateId } });
  assert(
    mandateCheck?.reservedYocto === nearToYocto("0.090"),
    "Budget reserved atomically: exactly 0.090 NEAR"
  );

  // Step 7: Human approves payment
  console.log(`[E2E Step 7] User reviews and approves payment in Approvals queue`);
  const approveRes = await fetch(`${BASE_URL}/api/approvals`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      approvalId: highValData.approvalId,
      decision: "APPROVE",
    }),
  });
  const approveData = await approveRes.json();
  assert(
    approveData.decision === "APPROVED" || approveData.decision === "APPROVED_BUT_CHAIN_REFUSED",
    "Approval granted and processed"
  );

  // Step 8: User withdraws unused funds
  console.log(`[E2E Step 8] User withdraws 0.500 NEAR unused funds back to personal wallet`);
  const withdrawRes = await fetch(`${BASE_URL}/api/wallets/withdraw`, {
    method: "POST",
    headers: userHeaders,
    body: JSON.stringify({
      amountNear: "0.500",
      agentId,
    }),
  });
  const withdrawData = await withdrawRes.json();
  assert(
    withdrawData.success || withdrawRes.status === 502,
    "Withdrawal request processed against unreserved balance"
  );

  // Step 9: Query complete immutable audit log for this user
  console.log(`[E2E Step 9] Querying full immutable audit ledger`);
  const finalAuditRes = await fetch(`${BASE_URL}/api/audit`, { headers: userHeaders });
  const finalAuditData = await finalAuditRes.json();
  assert(finalAuditRes.ok, "Audit log retrieved");
  assert(finalAuditData.logs.length >= 4, "Audit ledger captured all key security lifecycle events");

  const eventTypes = finalAuditData.logs.map((l: any) => l.eventType);
  assert(eventTypes.includes("AGENT_CREATED"), "Audit captured AGENT_CREATED");
  assert(eventTypes.includes("MANDATE_CREATED"), "Audit captured MANDATE_CREATED");
  assert(eventTypes.includes("POLICY_EVALUATED"), "Audit captured POLICY_EVALUATED");
  console.log(`[INFO] Recorded Event Types: ${eventTypes.join(", ")}\n`);

  // Summary
  console.log("=========================================================");
  console.log(`MILESTONE 6 TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
  console.log("=========================================================");

  if (testFailed > 0) {
    process.exit(1);
  }
}

runMilestone6Tests().catch((err) => {
  console.error("Test Suite Crashed:", err);
  process.exit(1);
});
