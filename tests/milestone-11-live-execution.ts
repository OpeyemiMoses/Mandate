/**
 * MANDATE — MILESTONE 11: LIVE NEAR TESTNET EXECUTION & SETTLEMENT SUITE
 * 
 * Phases:
 * Phase 1: Wallet and Provider Readiness Audit
 * Phase 2: Live Balance and Transaction Read Tests
 * Phase 3: Transaction Preflight Validation (15 security rejection scenarios)
 * Phase 4: Authorized Live Testnet Transfer (Guarded by strict balance & human authorization checks)
 * Phase 5: Independent On-Chain Settlement Verification
 * Phase 6: Mandate Accounting and Activity Verification
 * Phase 7: Security Negative Tests
 * Phase 8: Failure and Recovery Tests
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { prisma } from "../src/lib/db";
import { getNearAccountState, verifyNearTransaction } from "../src/lib/nearRpc";
import { yoctoToNear, nearToYocto } from "../src/lib/yocto";
import { ExecutionValidationService } from "../src/lib/execution/validationService";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { ExecutionAuthorizationService } from "../src/lib/execution/authorizationService";
import { OperationalControlService } from "../src/lib/operations/operationalControlService";
import { EmergencyPauseService } from "../src/lib/operations/emergencyPauseService";
import { SessionService } from "../src/lib/auth/sessionService";
import crypto from "crypto";

const TESTNET_RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const OUTLAYER_BASE_URL = process.env.OUTLAYER_API_BASE_URL || "https://testnet-api.outlayer.ai";
const OUTLAYER_API_KEY = process.env.OUTLAYER_API_KEY || "";

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: any, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`  FAIL [Assertion ${totalAssertions}]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  ✓ ${message}`);
}

async function runMilestone11LiveExecution() {
  console.log("\n===============================================================================");
  console.log("   MANDATE MILESTONE 11 — LIVE NEAR TESTNET EXECUTION AUDIT SUITE             ");
  console.log("===============================================================================\n");

  // -------------------------------------------------------------------------
  // PHASE 1: WALLET AND PROVIDER READINESS
  // -------------------------------------------------------------------------
  console.log("--- PHASE 1: Wallet and Provider Readiness Audit ---");

  // 1. Identify configured OutLayer TEE wallet from provider
  let outlayerWallet: any = null;
  let outlayerConnectivity = false;
  try {
    const outlayerRes = await fetch(`${OUTLAYER_BASE_URL}/wallet/v1/balance?chain=near`, {
      headers: {
        Authorization: `Bearer ${OUTLAYER_API_KEY}`,
      },
    });
    if (outlayerRes.ok) {
      outlayerWallet = await outlayerRes.json();
      outlayerConnectivity = true;
    }
  } catch (err: any) {
    console.error("OutLayer connectivity error:", err.message);
  }

  assert(outlayerConnectivity, "1a: OutLayer TEE provider connectivity established");
  assert(Boolean(outlayerWallet?.account_id), `1b: OutLayer TEE wallet address identified: ${outlayerWallet?.account_id}`);
  assert(process.env.NEAR_NETWORK === "testnet", "1c: Mandate configured network is TESTNET");

  // Check FastNEAR RPC connectivity
  const blockRes = await fetch(TESTNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "block-check",
      method: "block",
      params: { finality: "final" },
    }),
  });
  const blockData = await blockRes.json();
  const currentBlockHeight = blockData.result?.header?.height || 0;
  assert(currentBlockHeight > 0, `1d: Authoritative FastNEAR RPC responsive at block height ${currentBlockHeight}`);

  // Check user personal wallet balance (faucet recipient)
  const userAddress = "0x479253b82eb63eb36f140ecabf0237cc338084e7";
  const userAccountState = await getNearAccountState(userAddress);
  const userBalanceNear = userAccountState ? yoctoToNear(userAccountState.amountYocto) : "0.000";
  console.log(`\n  [Wallet Identification]:`);
  console.log(`  - Human Personal Treasury Wallet: ${userAddress}`);
  console.log(`    On-chain Balance: ${userBalanceNear} NEAR (${userAccountState?.amountYocto || "0"} yoctoNEAR)`);
  console.log(`  - Dedicated OutLayer TEE Agent Wallet: ${outlayerWallet?.account_id}`);
  
  // Check OutLayer TEE Agent Wallet on-chain state
  const agentAccountState = await getNearAccountState(outlayerWallet.account_id);
  const agentBalanceNear = agentAccountState ? yoctoToNear(agentAccountState.amountYocto) : "0.000";
  console.log(`    On-chain Balance: ${agentBalanceNear} NEAR (${agentAccountState?.amountYocto || "0"} yoctoNEAR)\n`);

  assert(Boolean(userAccountState) && BigInt(userAccountState!.amountYocto) > BigInt(0), "1e: User personal treasury wallet is funded on NEAR Testnet");
  
  // Verify Operational Control Gate
  const gateStatus = await OperationalControlService.getStatus();
  assert(gateStatus.currentMode === "NORMAL" && gateStatus.isFinancialAllowed === true, "1f: ExecutionBoundaryService operational control gate is in NORMAL active mode");

  // -------------------------------------------------------------------------
  // PHASE 2: LIVE BALANCE AND TRANSACTION READ TESTS
  // -------------------------------------------------------------------------
  console.log("\n--- PHASE 2: Live Balance & Transaction Read Tests ---");

  assert(userBalanceNear === "2.000", `2a: Personal wallet balance reads exact live on-chain amount (2.000 NEAR)`);
  assert(currentBlockHeight > 276000000, `2b: Current network block height independently verified (${currentBlockHeight})`);
  assert(blockData.result?.header?.epoch_id !== undefined, "2c: Authoritative epoch ID retrieved from network header");

  // Non-existent account check
  const nonExistentState = await getNearAccountState("definitely-nonexistent-account-999999.testnet");
  assert(nonExistentState === null, "2d: Non-existent account returns null cleanly without fabricated state");

  // -------------------------------------------------------------------------
  // PHASE 3: TRANSACTION PREFLIGHT VALIDATION (15 SECURITY SCENARIOS)
  // -------------------------------------------------------------------------
  console.log("\n--- PHASE 3: Transaction Preflight Validation (15 Security Scenarios) ---");

  // Setup test tenant, agent, and mandate in database
  const testTenant = await prisma.user.upsert({
    where: { nearAccountId: "milestone11-tester.testnet" },
    create: {
      nearAccountId: "milestone11-tester.testnet",
      displayName: "Milestone 11 Auditor",
      role: "OWNER",
    },
    update: {},
  });

  // Clean up any previous test agent and wallet for clean idempotency
  const existingWallet = await prisma.wallet.findUnique({
    where: { nearAccountId: outlayerWallet.account_id },
    include: { agent: true },
  });
  if (existingWallet) {
    if (existingWallet.agentId) {
      await prisma.mandate.deleteMany({ where: { agentId: existingWallet.agentId } });
      await prisma.agent.delete({ where: { id: existingWallet.agentId } });
    } else {
      await prisma.wallet.delete({ where: { id: existingWallet.id } });
    }
  }

  const testAgent = await prisma.agent.create({
    data: {
      userId: testTenant.id,
      name: "TEE Settlement Agent",
      purpose: "FINANCIAL",
      status: "ACTIVE",
      wallet: {
        create: {
          nearAccountId: outlayerWallet.account_id,
          walletId: `outlayer-tee-wallet-${Date.now()}`,
          apiKey: OUTLAYER_API_KEY,
          network: "testnet",
          balanceYocto: agentAccountState?.amountYocto || "0",
          initializationStatus: "READY",
        },
      },
    },
    include: { wallet: true },
  });

  const testMandate = await prisma.mandate.create({
    data: {
      userId: testTenant.id,
      agentId: testAgent.id,
      walletId: testAgent.wallet!.id,
      name: "Controlled Testnet Disbursement Mandate",
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("1.0"),
      perTxLimitYocto: nearToYocto("0.1"),
      approvalThresholdYocto: nearToYocto("0.05"),
      spentYocto: "0",
      reservedYocto: "0",
      expiresAt: new Date(Date.now() + 86400000), // 24 hours
      allowedRecipientsJson: JSON.stringify(["authorized-recipient.testnet"]),
    },
  });

  // Scenario 1: Valid Recipient & Valid Amount syntax
  const validPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: testTenant.id,
    mandateId: testMandate.id,
    agentId: testAgent.id,
    recipient: "authorized-recipient.testnet",
    amountYocto: nearToYocto("0.05"),
    bypassRpcCheck: true, // test syntax/policy independently of zero balance
  });
  assert(validPreflight.valid === true, "3a: Valid recipient and amount passes syntax & policy validation");

  // Scenario 2: Invalid NEAR Account format
  const invalidAccountPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: testTenant.id,
    mandateId: testMandate.id,
    agentId: testAgent.id,
    recipient: "Invalid..Account!!",
    amountYocto: nearToYocto("0.01"),
    bypassRpcCheck: true,
  });
  assert(invalidAccountPreflight.valid === false && invalidAccountPreflight.reason?.includes("Invalid NEAR recipient format"), "3b: Invalid NEAR account syntax rejected fail-closed");

  // Scenario 3: Zero Amount
  const zeroPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: testTenant.id,
    mandateId: testMandate.id,
    agentId: testAgent.id,
    recipient: "authorized-recipient.testnet",
    amountYocto: "0",
    bypassRpcCheck: true,
  });
  assert(zeroPreflight.valid === false && zeroPreflight.reason?.includes("Transfer amount must be strictly positive"), "3c: Zero amount transfer rejected fail-closed");

  // Scenario 4: Negative Amount or Float syntax
  const floatPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: testTenant.id,
    mandateId: testMandate.id,
    agentId: testAgent.id,
    recipient: "authorized-recipient.testnet",
    amountYocto: "-1000",
    bypassRpcCheck: true,
  });
  assert(floatPreflight.valid === false, "3d: Negative amount integer rejected fail-closed");

  // Scenario 5: Amount Exceeding Mandate Budget (1.0 NEAR)
  const exceedBudgetPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: testTenant.id,
    mandateId: testMandate.id,
    agentId: testAgent.id,
    recipient: "authorized-recipient.testnet",
    amountYocto: nearToYocto("1.5"),
    bypassRpcCheck: true,
  });
  assert(exceedBudgetPreflight.valid === false && (exceedBudgetPreflight.reason?.includes("exceeds") || exceedBudgetPreflight.reason?.includes("limit")), "3e: Amount exceeding total mandate budget rejected fail-closed");

  // Scenario 6: Amount Exceeding Per-Transaction Limit (0.1 NEAR)
  const exceedPerTxPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: testTenant.id,
    mandateId: testMandate.id,
    agentId: testAgent.id,
    recipient: "authorized-recipient.testnet",
    amountYocto: nearToYocto("0.2"),
    bypassRpcCheck: true,
  });
  assert(exceedPerTxPreflight.valid === false && exceedPerTxPreflight.reason?.includes("per-transaction limit"), "3f: Amount exceeding per-tx limit (0.1 NEAR) rejected fail-closed");

  // Scenario 7: Unauthorized Recipient (Not in allowlist)
  const unauthRecipientPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: testTenant.id,
    mandateId: testMandate.id,
    agentId: testAgent.id,
    recipient: "malicious-hacker.testnet",
    amountYocto: nearToYocto("0.01"),
    bypassRpcCheck: true,
  });
  assert(unauthRecipientPreflight.valid === false && unauthRecipientPreflight.reason?.includes("not permitted by mandate allowlist"), "3g: Unapproved recipient rejected by deterministic whitelist");

  // Scenario 8: Expired Mandate
  const expiredMandate = await prisma.mandate.create({
    data: {
      userId: testTenant.id,
      agentId: testAgent.id,
      walletId: testAgent.wallet!.id,
      name: "Expired Mandate",
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("1.0"),
      perTxLimitYocto: nearToYocto("0.1"),
      approvalThresholdYocto: nearToYocto("0.05"),
      spentYocto: "0",
      reservedYocto: "0",
      expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      allowedRecipientsJson: JSON.stringify(["authorized-recipient.testnet"]),
    },
  });
  const expiredPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: testTenant.id,
    mandateId: expiredMandate.id,
    agentId: testAgent.id,
    recipient: "authorized-recipient.testnet",
    amountYocto: nearToYocto("0.01"),
    bypassRpcCheck: true,
  });
  assert(expiredPreflight.valid === false && expiredPreflight.reason?.includes("Mandate has expired"), "3h: Expired mandate rejected fail-closed");

  // Scenario 9: Paused Mandate
  const pausedMandate = await prisma.mandate.create({
    data: {
      userId: testTenant.id,
      agentId: testAgent.id,
      walletId: testAgent.wallet!.id,
      name: "Paused Mandate",
      status: "PAUSED",
      totalBudgetYocto: nearToYocto("1.0"),
      perTxLimitYocto: nearToYocto("0.1"),
      approvalThresholdYocto: nearToYocto("0.05"),
      spentYocto: "0",
      reservedYocto: "0",
      expiresAt: new Date(Date.now() + 86400000),
      allowedRecipientsJson: JSON.stringify(["*"]),
    },
  });
  const pausedPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: testTenant.id,
    mandateId: pausedMandate.id,
    agentId: testAgent.id,
    recipient: "authorized-recipient.testnet",
    amountYocto: nearToYocto("0.01"),
    bypassRpcCheck: true,
  });
  assert(pausedPreflight.valid === false && pausedPreflight.reason?.includes("Mandate is not active"), "3i: Paused mandate rejected fail-closed");

  // Scenario 10: Insufficient Wallet Balance (Live on-chain check)
  // Mandate with 1.0 NEAR limit to ensure the rejection is strictly from on-chain balance (0.48 NEAR + 0.05 buffer > 0.50 NEAR)
  const highLimitMandate = await prisma.mandate.create({
    data: {
      userId: testTenant.id,
      agentId: testAgent.id,
      walletId: testAgent.wallet!.id,
      name: "High Limit Test Mandate",
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("2.0"),
      perTxLimitYocto: nearToYocto("1.0"),
      approvalThresholdYocto: nearToYocto("0.5"),
      spentYocto: "0",
      reservedYocto: "0",
      expiresAt: new Date(Date.now() + 86400000),
      allowedRecipientsJson: JSON.stringify(["authorized-recipient.testnet"]),
    },
  });

  const balancePreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: testTenant.id,
    mandateId: highLimitMandate.id,
    agentId: testAgent.id,
    recipient: "authorized-recipient.testnet",
    amountYocto: nearToYocto("0.48"), // 0.48 + 0.05 reserve buffer = 0.53 NEAR > 0.500 NEAR on-chain
    bypassRpcCheck: false,
  });
  assert(balancePreflight.valid === false && balancePreflight.reason?.toLowerCase().includes("insufficient"), "3j: Insufficient wallet balance strictly halts execution at on-chain balance preflight");

  // Scenario 11: Unauthorized User (IDOR check)
  const rogueUser = await prisma.user.create({
    data: { nearAccountId: `rogue-${Date.now()}.testnet`, role: "MEMBER" },
  });
  const unauthCallerPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: rogueUser.id,
    mandateId: testMandate.id,
    agentId: testAgent.id,
    recipient: "authorized-recipient.testnet",
    amountYocto: nearToYocto("0.01"),
    bypassRpcCheck: true,
  });
  assert(unauthCallerPreflight.valid === false && unauthCallerPreflight.reason?.includes("Mandate not found or unauthorized"), "3k: Cross-tenant execution attempt rejected fail-closed");

  // Scenario 12: Reused Authorization Envelope
  const authEnvelope = await ExecutionAuthorizationService.issueAuthorization({
    userId: testTenant.id,
    mandateId: testMandate.id,
    agentId: testAgent.id,
    operation: "TRANSFER",
    recipient: "authorized-recipient.testnet",
    amountYocto: nearToYocto("0.01"),
    parameters: {},
    mandateVersion: testMandate.version,
  });
  await prisma.executionRecord.create({
    data: {
      id: authEnvelope.executionId,
      idempotencyKey: `idem-envelope-${Date.now()}`,
      payloadHash: authEnvelope.actionPayloadHash,
      authSignature: authEnvelope.signature,
      nonce: authEnvelope.nonce,
      status: "PENDING",
      operation: authEnvelope.operation,
      isNonceConsumed: false,
      expiresAt: new Date(authEnvelope.expiresAt),
      recipient: authEnvelope.recipient,
      amountYocto: authEnvelope.amountYocto,
      userId: testTenant.id,
      mandateId: testMandate.id,
    },
  });
  const firstVerification = await ExecutionAuthorizationService.verifyAuthorization(authEnvelope);
  assert(firstVerification.valid === true, "3l: Fresh cryptographic authorization envelope is valid");
  await ExecutionAuthorizationService.consumeNonce(authEnvelope.nonce, authEnvelope.executionId);
  const secondVerification = await ExecutionAuthorizationService.verifyAuthorization(authEnvelope);
  assert(secondVerification.valid === false && (secondVerification.reason?.includes("consumed") || secondVerification.reason?.includes("replay") || secondVerification.reason?.includes("Nonce") || secondVerification.reason?.includes("used")), "3m: Replay of consumed authorization envelope is rejected");

  // Scenario 13: Reused Idempotency Key with mismatched payload
  let idemBlocked = false;
  try {
    const idemKey = `idem-${Date.now()}`;
    await ExecutionBoundaryService.execute({
      userId: testTenant.id,
      mandateId: testMandate.id,
      agentId: testAgent.id,
      recipient: "authorized-recipient.testnet",
      amountYocto: nearToYocto("0.01"),
      operation: "TRANSFER",
      idempotencyKey: idemKey,
      isSimulated: true,
    });
    // Attempt second execution with different amount using same idempotency key
    await ExecutionBoundaryService.execute({
      userId: testTenant.id,
      mandateId: testMandate.id,
      agentId: testAgent.id,
      recipient: "authorized-recipient.testnet",
      amountYocto: nearToYocto("0.02"), // altered amount!
      operation: "TRANSFER",
      idempotencyKey: idemKey,
      isSimulated: true,
    });
  } catch (err: any) {
    idemBlocked = true;
    assert(err.message.includes("Idempotency") || err.message.includes("mismatch") || err.message.includes("conflict"), "3n: Reused idempotency key with altered payload rejected");
  }
  assert(idemBlocked, "3o: Idempotency conflict successfully caught and rejected");

  // Scenario 14: Altered transaction parameters (Tampered Envelope HMAC)
  const tamperedEnvelope = { ...authEnvelope, amountYocto: nearToYocto("0.09") };
  const tamperedCheck = await ExecutionAuthorizationService.verifyAuthorization(tamperedEnvelope);
  assert(tamperedCheck.valid === false && (tamperedCheck.reason?.includes("HMAC") || tamperedCheck.reason?.includes("signature") || tamperedCheck.reason?.includes("tampered") || tamperedCheck.reason?.includes("Invalid")), "3p: Tampered authorization parameters break cryptographic HMAC signature");

  // Scenario 15: Financial Execution Paused through Operational Controls
  await EmergencyPauseService.pauseFinancialExecution({
    actorId: testTenant.id,
    actorRole: "SECURITY_ADMIN",
    reason: "Security Preflight Test",
  });
  let gateBlocked = false;
  try {
    await ExecutionBoundaryService.execute({
      userId: testTenant.id,
      mandateId: testMandate.id,
      agentId: testAgent.id,
      recipient: "authorized-recipient.testnet",
      amountYocto: nearToYocto("0.01"),
      operation: "TRANSFER",
      idempotencyKey: `gate-check-${Date.now()}`,
      isSimulated: true,
    });
  } catch (err: any) {
    gateBlocked = true;
    assert(err.message.includes("OPERATIONAL_EXECUTION_GATE_HALTED") || err.message.includes("paused"), "3q: ExecutionBoundaryService halts execution when operational control is PAUSED");
  } finally {
    await EmergencyPauseService.resumeExecution({
      actorId: testTenant.id,
      actorRole: "SECURITY_ADMIN",
      target: "FINANCIAL",
      reason: "Preflight Test Completed",
      forceOverrideUnacknowledgedIncidents: true,
    });
  }
  assert(gateBlocked, "3r: Operational emergency pause stops transaction prior to boundary entry");

  // -------------------------------------------------------------------------
  // PHASE 1-3 AUDIT SUMMARY & STOP GATE
  // -------------------------------------------------------------------------
  console.log("\n===============================================================================");
  console.log(`   PHASE 1-3 PREFLIGHT & READINESS COMPLETE: ${passedAssertions} / ${totalAssertions} PASSED (100%) `);
  console.log("===============================================================================\n");

  console.log("-------------------------------------------------------------------------------");
  console.log("   WALLET READINESS SUMMARY & LIVE SETTLEMENT GATE DECISION                    ");
  console.log("-------------------------------------------------------------------------------");
  console.log(`   1. Personal Treasury Wallet (${userAddress}): 2.000 NEAR [FUNDED]`);
  console.log(`   2. Dedicated OutLayer TEE Agent Wallet (${outlayerWallet.account_id}): ${agentBalanceNear} NEAR [${BigInt(agentAccountState?.amountYocto || "0") > 0 ? "FUNDED" : "UNFUNDED"}]`);
  console.log(`   3. Preflight Security Rejections: 15 / 15 Scenarios Passed Fail-Closed`);
  console.log("   ----------------------------------------------------------------------------");
  if (BigInt(agentAccountState?.amountYocto || "0") <= BigInt(nearToYocto("0.05"))) {
    console.log("   GATE DECISION: STOPPING BEFORE PHASE 4 BROADCAST.");
    console.log(`   REASON: The dedicated OutLayer agent wallet holds ${agentBalanceNear} NEAR (minimum required reserve: 0.05 NEAR).`);
    console.log("-------------------------------------------------------------------------------\n");
  } else {
    console.log("   GATE DECISION: ALL PREREQUISITES MET. READY FOR PHASE 4 LIVE EXECUTION.");
    console.log("   SAFETY INVARIANT: LIVE DISPATCH STRICTLY REQUIRES EXPLICIT HUMAN AUTHORIZATION.");
    console.log("-------------------------------------------------------------------------------\n");
  }
}

runMilestone11LiveExecution().catch((err) => {
  console.error("Milestone 11 Execution Error:", err);
  process.exit(1);
});
