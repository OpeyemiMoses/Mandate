/**
 * MANDATE — MILESTONE 10: LIVE TESTNET SETTLEMENT & DEPLOYMENT READINESS
 *
 * Demonstrates a complete, real, on-chain NEAR testnet lifecycle:
 * 1. Provision a dedicated OutLayer TEE agent wallet (64-char implicit account).
 * 2. Perform initialization check (confirms account is uninitialized on NEAR RPC).
 * 3. User authorizes on-chain initialization transfer (0.05 NEAR) from connected wallet.
 * 4. Verify initialization transfer independently via NEAR RPC.
 * 5. Confirm OutLayer reads back on-chain balance and marks wallet READY.
 * 6. Create active spending mandate with approval threshold.
 * 7. Dispatch spending task -> policy firewall gates to human approval queue.
 * 8. Human approves payment proposal.
 * 9. Execute transfer through OutLayer TEE enclave onto NEAR testnet.
 * 10. Independently verify the real transaction hash via NEAR RPC.
 * 11. Reconcile transaction, accounting balances, and fees.
 * 12. Verify unbroken SHA-256 cryptographic audit ledger hash chain.
 */

import { connect, keyStores, KeyPair } from "near-api-js";
import { prisma } from "../src/lib/db";
import { yoctoToNear, nearToYocto, subYocto } from "../src/lib/yocto";
import { verifyAuditChain } from "../src/lib/auditLedger";
import { getNearAccountState, verifyNearTransaction } from "../src/lib/nearRpc";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3010";

let testPassed = 0;
let testFailed = 0;

function assert(condition: boolean, testCase: number, message: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ Step ${testCase} PASS: ${message}`);
    if (detail) console.log(`     ↳ ${detail}`);
    testPassed++;
  } else {
    console.error(`  ✗ Step ${testCase} FAIL: ${message}`);
    if (detail) console.error(`     ↳ Details: ${detail}`);
    testFailed++;
    process.exit(1);
  }
}

async function runMilestone10LiveSettlement() {
  console.log("=================================================================");
  console.log("=== MANDATE MILESTONE 10: LIVE TESTNET SETTLEMENT GATE ======");
  console.log("=================================================================\n");

  // ---------------------------------------------------------------------------
  // STEP 1: Connect a real NEAR Testnet Personal Wallet
  // ---------------------------------------------------------------------------
  console.log("--- STEP 1: Personal Wallet Connection on NEAR Testnet ---");
  const personalKeyPair = KeyPair.fromRandom("ed25519");
  const personalAccountId = `mandate-owner-${Date.now().toString().slice(-6)}.testnet`;
  console.log(`[INFO] Provisioning testnet personal account: ${personalAccountId}...`);

  const faucetRes = await fetch("https://helper.testnet.near.org/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      newAccountId: personalAccountId,
      newAccountPublicKey: personalKeyPair.getPublicKey().toString(),
    }),
  });

  const faucetData = await faucetRes.json();
  const faucetSuccess = faucetRes.ok && Boolean(faucetData.transaction?.hash);
  assert(
    faucetSuccess,
    1,
    "Connected real NEAR testnet personal account funded with testnet NEAR",
    `Account: ${personalAccountId}, Faucet Tx: ${faucetData.transaction?.hash}`
  );

  // Authenticate user in Mandate backend
  const sessionToken = `sess_live_m10_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      nearAccountId: personalAccountId,
      sessionToken,
    },
  });

  const headers = {
    "Content-Type": "application/json",
    "x-session-token": sessionToken,
    "x-near-account": personalAccountId,
  };

  // ---------------------------------------------------------------------------
  // STEP 2: Provision Dedicated OutLayer TEE Agent Wallet
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 2: Dedicated OutLayer TEE Agent Wallet Provisioning ---");
  const agentRes = await fetch(`${BASE_URL}/api/agents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Autonomous Live Procurement Agent",
      description: "Dedicated agent with OutLayer TEE custody for live testnet settlement",
      purpose: "PROCUREMENT",
    }),
  });
  const agentJson = await agentRes.json();
  const agentId = agentJson.agent?.id;
  const agentWalletAddress = agentJson.agent?.wallet?.nearAccountId;

  assert(
    agentRes.status === 201 && Boolean(agentId) && Boolean(agentWalletAddress) && agentWalletAddress.length === 64,
    2,
    "Dedicated OutLayer agent wallet provisioned with 64-char implicit account",
    `Agent ID: ${agentId}, Implicit Address: ${agentWalletAddress}`
  );

  // ---------------------------------------------------------------------------
  // STEP 3: Verify Uninitialized State Prior to Funding
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 3: Initial State Verification on NEAR Testnet ---");
  const initCheckRes = await fetch(`${BASE_URL}/api/wallets/initialize?agentId=${agentId}`, {
    headers,
  });
  const initCheckJson = await initCheckRes.json();

  assert(
    initCheckRes.ok && initCheckJson.onChainExists === false && initCheckJson.isInitialized === false,
    3,
    "Agent implicit account confirmed uninitialized on NEAR RPC prior to funding",
    `Status: ${initCheckJson.status}, On-Chain Exists: ${initCheckJson.onChainExists}, Recommended: ${initCheckJson.recommendedFundingNear} NEAR`
  );

  // ---------------------------------------------------------------------------
  // STEP 4: User-Authorized Account Initialization Transfer (0.05 NEAR)
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 4: Executing User-Authorized Initialization Funding ---");
  const INITIALIZATION_AMOUNT_NEAR = "0.05";
  const INITIALIZATION_AMOUNT_YOCTO = nearToYocto(INITIALIZATION_AMOUNT_NEAR); // 50000000000000000000000

  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey("testnet", personalAccountId, personalKeyPair);
  const nearConn = await connect({
    networkId: "testnet",
    keyStore,
    nodeUrl: "https://rpc.testnet.near.org",
  });
  const senderAccount = await nearConn.account(personalAccountId);

  console.log(`[INFO] Transferring ${INITIALIZATION_AMOUNT_NEAR} NEAR to implicit account ${agentWalletAddress}...`);
  const fundingTx = await senderAccount.sendMoney(agentWalletAddress, BigInt(INITIALIZATION_AMOUNT_YOCTO));
  const fundingTxHash = fundingTx.transaction.hash;

  assert(
    Boolean(fundingTxHash),
    4,
    "Personal wallet broadcasted initialization transfer to agent implicit account",
    `Tx Hash: ${fundingTxHash}`
  );

  // ---------------------------------------------------------------------------
  // STEP 5: Independent Verification & Wallet Activation (READY)
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 5: Independent Verification & Wallet Activation ---");
  const activateRes = await fetch(`${BASE_URL}/api/wallets/initialize`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      agentId,
      txHash: fundingTxHash,
    }),
  });
  const activateJson = await activateRes.json();

  // Verify on NEAR RPC directly
  const rpcStateAfterFunding = await getNearAccountState(agentWalletAddress);
  assert(
    activateRes.ok &&
      activateJson.isInitialized === true &&
      activateJson.status === "READY" &&
      rpcStateAfterFunding !== null,
    5,
    "Agent custody wallet verified on NEAR RPC and marked READY for execution",
    `On-Chain Amount: ${yoctoToNear(rpcStateAfterFunding?.amountYocto || "0")} NEAR, Status: ${activateJson.status}`
  );

  // ---------------------------------------------------------------------------
  // STEP 6: Mandate Creation Bound to Dedicated Agent
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 6: Mandate Creation with Deterministic Policy Rules ---");
  const mandateRes = await fetch(`${BASE_URL}/api/mandates`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Live Testnet Settlement Mandate",
      description: "Strict policy bounding autonomous payments under 0.02 NEAR",
      agentId,
      totalBudgetNear: "0.04",
      perTxLimitNear: "0.02",
      approvalThresholdNear: "0.005",
      allowedRecipients: [personalAccountId, "nearblocks.testnet"],
      expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
    }),
  });
  const mandateJson = await mandateRes.json();
  const mandateId = mandateJson.mandate?.id;

  assert(
    mandateRes.status === 201 && Boolean(mandateId),
    6,
    "Spending mandate created and bound to dedicated agent custody wallet",
    `Mandate ID: ${mandateId}, Total Budget: 0.04 NEAR, Cap: 0.02 NEAR, Threshold: 0.005 NEAR`
  );

  // ---------------------------------------------------------------------------
  // STEP 7: Submit Native NEAR Payment Proposal Gated by Policy Firewall
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 7: Task Proposal & Policy Firewall Evaluation ---");
  const TRANSFER_AMOUNT_NEAR = "0.01"; // > 0.005 threshold -> triggers approval gate
  const taskRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Real Testnet Verification Settlement",
      description: "Transfer 0.01 NEAR from OutLayer TEE custody back to owner for settlement verification",
      mandateId,
      proposedRecipient: personalAccountId,
      proposedAmountNear: TRANSFER_AMOUNT_NEAR,
      idempotencyKey: `idem-live-settlement-${Date.now()}`,
    }),
  });
  const taskJson = await taskRes.json();
  const taskId = taskJson.task?.id;
  const approvalId = taskJson.approvalId;

  assert(
    taskRes.ok &&
      (taskJson.verdict === "REQUIRES_APPROVAL" || taskJson.verdict === "REQUIRE_APPROVAL") &&
      Boolean(approvalId) &&
      taskJson.task?.status === "PENDING_APPROVAL",
    7,
    "Policy firewall evaluated proposal: amount exceeds threshold, gated to human approval",
    `Task ID: ${taskId}, Approval ID: ${approvalId}, Reserved Budget: ${TRANSFER_AMOUNT_NEAR} NEAR`
  );

  // ---------------------------------------------------------------------------
  // STEP 8: Human Approval & OutLayer TEE Execution
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 8: Human Approval Grant & OutLayer TEE Execution ---");
  const approveRes = await fetch(`${BASE_URL}/api/approvals`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      approvalId,
      decision: "APPROVE",
    }),
  });
  const approveJson = await approveRes.json();
  const liveTxHash = approveJson.txHash || approveJson.transaction?.txHash;

  assert(
    approveRes.ok && approveJson.decision === "APPROVED" && Boolean(liveTxHash) && !liveTxHash.startsWith("mock-"),
    8,
    "OutLayer TEE enclave signed and broadcast real on-chain transfer to NEAR Testnet",
    `Tx Hash: ${liveTxHash}, Message: ${approveJson.message || approveJson.error}`
  );

  // ---------------------------------------------------------------------------
  // STEP 9: Independent On-Chain Verification via NEAR RPC
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 9: Independent On-Chain Verification via NEAR RPC ---");
  console.log(`[INFO] Querying rpc.testnet.near.org for tx ${liveTxHash}...`);

  let txVerification = await verifyNearTransaction(liveTxHash, agentWalletAddress, { timeoutMs: 15000 });
  let pollAttempts = 10;
  while (!txVerification.isTerminal && pollAttempts > 0) {
    await new Promise((r) => setTimeout(r, 2000));
    txVerification = await verifyNearTransaction(liveTxHash, agentWalletAddress, { timeoutMs: 15000 });
    pollAttempts--;
  }

  // Also query raw RPC tx endpoint for full receipt verification
  const rawTxRpc = await fetch("https://rpc.testnet.near.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "verify-terminal",
      method: "tx",
      params: [liveTxHash, agentWalletAddress],
    }),
  }).then((r) => r.json());

  const txDetails = rawTxRpc.result?.transaction;
  const executionStatus = rawTxRpc.result?.status;
  const confirmedReceiver = txDetails?.receiver_id;
  const transferredDepositYocto = txDetails?.actions?.[0]?.Transfer?.deposit;
  const isFinalSuccess =
    txVerification.status === "SUCCESS" ||
    executionStatus?.SuccessValue !== undefined ||
    rawTxRpc.result?.final_execution_status === "FINAL";

  assert(
    isFinalSuccess,
    9,
    "Real NEAR testnet transaction verified as FINAL on-chain via independent RPC",
    `BlockHash: ${txVerification.blockHash || rawTxRpc.result?.transaction_outcome?.block_hash}, Gas Burnt: ${txVerification.gasBurnt}`
  );

  // ---------------------------------------------------------------------------
  // STEP 10: Sender, Recipient & Transferred Amount Verification
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 10: Verified Financial Transaction Parameters ---");
  const expectedDepositYocto = nearToYocto(TRANSFER_AMOUNT_NEAR);

  assert(
    txDetails?.signer_id === agentWalletAddress &&
      confirmedReceiver === personalAccountId &&
      transferredDepositYocto === expectedDepositYocto,
    10,
    "Verified exact sender, recipient, and native NEAR transfer amount on-chain",
    `Signer: ${txDetails?.signer_id}\n     ↳ Receiver: ${confirmedReceiver}\n     ↳ Transferred: ${yoctoToNear(transferredDepositYocto || "0")} NEAR (${transferredDepositYocto} yoctoNEAR)`
  );

  // ---------------------------------------------------------------------------
  // STEP 11: Financial Accounting & Reconciliation Verification
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 11: Financial Accounting & Ledger Reconciliation ---");
  const postTxMandate = await prisma.mandate.findUnique({ where: { id: mandateId } });
  const postTxWallet = await prisma.wallet.findUnique({ where: { id: agentJson.agent.wallet.id } });

  const remainingBudgetYocto = subYocto(postTxMandate!.totalBudgetYocto, postTxMandate!.spentYocto);

  assert(
    postTxMandate?.spentYocto === expectedDepositYocto &&
      postTxMandate?.reservedYocto === "0" &&
      remainingBudgetYocto === subYocto(nearToYocto("0.04"), expectedDepositYocto),
    11,
    "Mandate financial accounting strictly reconciled: spent incremented, reserved cleared",
    `Total: 0.04 NEAR, Spent: ${yoctoToNear(postTxMandate!.spentYocto)} NEAR, Remaining: ${yoctoToNear(remainingBudgetYocto)} NEAR`
  );

  // ---------------------------------------------------------------------------
  // STEP 12: Cryptographic Audit Ledger Integrity Verification
  // ---------------------------------------------------------------------------
  console.log("\n--- STEP 12: Cryptographic Audit Ledger Hash-Chain Verification ---");
  const chainVerification = await verifyAuditChain(user.id);

  assert(
    chainVerification.valid === true && chainVerification.count >= 5,
    12,
    "All lifecycle events cryptographically verified in unbroken SHA-256 hash chain",
    `Total Events: ${chainVerification.count}, Head Hash: ${chainVerification.headHash}`
  );

  // ---------------------------------------------------------------------------
  // FINAL SCORECARD
  // ---------------------------------------------------------------------------
  console.log("\n=================================================================");
  console.log(`=== MANDATE MILESTONE 10 RESULTS: ${testPassed}/12 STEPS PASSED (${testFailed} FAILED) ===`);
  console.log("=== LIVE TESTNET SETTLEMENT GATE: 100% PASSED & CONFIRMED ======");
  console.log(`=== LIVE EXPLORER URL: https://testnet.nearblocks.io/txns/${liveTxHash}`);
  console.log("=================================================================\n");
}

runMilestone10LiveSettlement().catch((err) => {
  console.error("Unhandled test execution error:", err);
  process.exit(1);
});
