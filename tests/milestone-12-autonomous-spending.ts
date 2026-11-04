/**
 * MANDATE — MILESTONE 12: AUTONOMOUS SPENDING LIFECYCLE & MULTI-TRANSACTION RELIABILITY
 * 
 * Comprehensive automated test suite verifying:
 * - Phase 1: Milestone 11 Baseline Verification (Read-Only)
 * - Phase 2: Complete Mandate Spending Lifecycle (DRAFT, ACTIVE, PAUSED, EXPIRED, BUDGET_EXHAUSTED, REVOKED, COMPLETED)
 * - Phase 3: Multi-Transaction Budget Accounting & Mathematical Invariants
 * - Phase 4: Recipient & Transaction Policy Enforcement Matrix
 * - Phase 5: Concurrent Execution & Race-Condition Tests (Real database concurrency)
 * - Phase 6: Failure, Timeout, Ambiguous Settlement & Recovery Architecture
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import crypto from "crypto";
import { prisma } from "../src/lib/db";
import { getNearAccountState, verifyNearTransaction } from "../src/lib/nearRpc";
import { yoctoToNear, nearToYocto, subYocto, addYocto } from "../src/lib/yocto";
import { MandateLifecycleService } from "../src/lib/mandate/lifecycleService";
import { MandateAccountingService } from "../src/lib/mandate/accountingService";
import { ExecutionValidationService } from "../src/lib/execution/validationService";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { ExecutionAuthorizationService } from "../src/lib/execution/authorizationService";
import { ExecutionIdempotencyService, computePayloadHash } from "../src/lib/execution/idempotencyService";
import { ExecutionRecoveryService } from "../src/lib/execution/recoveryService";
import { OperationalControlService } from "../src/lib/operations/operationalControlService";
import { JobClaimService } from "../src/lib/jobs/claimService";
import { ReconciliationService } from "../src/lib/reconciliation/reconciliationService";

const TESTNET_RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: any, message: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  FAIL [Assertion ${totalAssertions}]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runMilestone12TestSuite() {
  console.log("\n===============================================================================");
  console.log("   MANDATE MILESTONE 12 — AUTONOMOUS SPENDING & CONCURRENCY SUITE              ");
  console.log("===============================================================================\n");

  // ---------------------------------------------------------------------------
  // RESOLVE USER & AGENT
  // ---------------------------------------------------------------------------
  const user = await prisma.user.findFirst({
    where: { nearAccountId: "0x479253b82eb63eb36f140ecabf0237cc338084e7" },
    include: { agents: { include: { wallet: true } } },
  });
  assert(Boolean(user), "Setup: User account resolved");

  const agent = user!.agents.find((a) => a.wallet !== null) || user!.agents[0];
  assert(Boolean(agent && agent.wallet), "Setup: Dedicated agent and OutLayer custody wallet resolved");
  const agentAddress = agent!.wallet!.nearAccountId;
  const humanAddress = user!.nearAccountId;

  // ---------------------------------------------------------------------------
  // PHASE 1: MILESTONE 11 BASELINE VERIFICATION (READ-ONLY)
  // ---------------------------------------------------------------------------
  console.log("\n--- PHASE 1: Milestone 11 Baseline Verification (Read-Only) ---");
  const m11TxHash = "BAELTk83H6Kg2FB3NSkmedoL71KJQjDvSvB7V9kZyfs2";

  // Authoritative NEAR RPC check
  const txRes = await fetch(TESTNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "baseline-check",
      method: "tx",
      params: [m11TxHash, agentAddress],
    }),
  });
  const txData = await txRes.json();
  const txResult = txData?.result;

  assert(txResult?.final_execution_status === "FINAL", "1a: Milestone 11 tx final_execution_status is FINAL on NEAR RPC");
  assert(txResult?.transaction?.signer_id === agentAddress, "1b: Milestone 11 tx signer is verified agent custody wallet");
  assert(txResult?.transaction?.receiver_id?.toLowerCase() === humanAddress.toLowerCase(), "1c: Milestone 11 tx receiver is verified personal treasury");
  assert(txResult?.transaction?.actions?.[0]?.Transfer?.deposit === "1000000000000000000000", "1d: Milestone 11 tx deposit is exactly 0.001 NEAR (1e21 yocto)");

  // Live on-chain balances read
  const agentLiveState = await getNearAccountState(agentAddress);
  const userLiveState = await getNearAccountState(humanAddress);
  assert(Boolean(agentLiveState && BigInt(agentLiveState.amountYocto) > BigInt(0)), "1e: Live agent balance read from FastNEAR RPC is non-zero");
  assert(Boolean(userLiveState && BigInt(userLiveState.amountYocto) > BigInt(0)), "1f: Live user balance read from FastNEAR RPC is non-zero");

  // ---------------------------------------------------------------------------
  // PHASE 2: COMPLETE MANDATE SPENDING LIFECYCLE TESTS
  // ---------------------------------------------------------------------------
  console.log("\n--- PHASE 2: Complete Mandate Spending Lifecycle ---");

  // 2a. Create mandate in DRAFT status
  const draftMandate = await prisma.mandate.create({
    data: {
      userId: user!.id,
      agentId: agent!.id,
      walletId: agent!.wallet!.id,
      name: `Lifecycle Test Mandate ${Date.now()}`,
      status: "DRAFT",
      totalBudgetYocto: nearToYocto("0.05"),
      perTxLimitYocto: nearToYocto("0.02"),
      approvalThresholdYocto: nearToYocto("0.01"),
      spentYocto: "0",
      reservedYocto: "0",
      expiresAt: new Date(Date.now() + 86400000),
      allowedRecipientsJson: JSON.stringify([humanAddress]),
    },
  });
  assert(draftMandate.status === "DRAFT", "2a: Mandate created in DRAFT lifecycle state");

  // 2b. DRAFT execution prohibition
  let draftExecError = false;
  try {
    MandateLifecycleService.assertCanExecute(draftMandate);
  } catch (err: any) {
    draftExecError = err.message.includes("DRAFT");
  }
  assert(draftExecError, "2b: DRAFT mandate execution strictly rejected fail-closed");

  // 2c. Activate DRAFT mandate -> ACTIVE
  const activationResult = await MandateLifecycleService.activateMandate({
    mandateId: draftMandate.id,
    actorUserId: user!.id,
    reason: "Owner activated draft mandate",
  });
  assert(activationResult.success && activationResult.newStatus === "ACTIVE", "2c: Mandate legally transitioned from DRAFT to ACTIVE");
  assert(activationResult.policyVersion === draftMandate.policyVersion + 1, "2d: Mandate policyVersion incremented on activation");

  // 2e. Pause mandate -> PAUSED
  const pauseResult = await MandateLifecycleService.pauseMandate({
    mandateId: draftMandate.id,
    actorUserId: user!.id,
    reason: "Owner temporarily paused spending",
  });
  assert(pauseResult.success && pauseResult.newStatus === "PAUSED", "2e: Mandate legally transitioned from ACTIVE to PAUSED");

  // 2f. PAUSED execution prohibition
  const pausedDbMandate = await prisma.mandate.findUnique({ where: { id: draftMandate.id } });
  let pausedExecError = false;
  try {
    MandateLifecycleService.assertCanExecute(pausedDbMandate!);
  } catch (err: any) {
    pausedExecError = err.message.includes("PAUSED");
  }
  assert(pausedExecError, "2f: PAUSED mandate execution strictly rejected fail-closed");

  // 2g. Resume mandate -> ACTIVE
  const resumeResult = await MandateLifecycleService.resumeMandate({
    mandateId: draftMandate.id,
    actorUserId: user!.id,
    reason: "Owner resumed spending",
  });
  assert(resumeResult.success && resumeResult.newStatus === "ACTIVE", "2g: Mandate legally resumed from PAUSED to ACTIVE");

  // 2h. Dynamic Expiration sync -> EXPIRED
  const expiredMandate = await prisma.mandate.create({
    data: {
      userId: user!.id,
      agentId: agent!.id,
      walletId: agent!.wallet!.id,
      name: "Expired Mandate Test",
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("0.05"),
      perTxLimitYocto: nearToYocto("0.02"),
      approvalThresholdYocto: nearToYocto("0.01"),
      spentYocto: "0",
      reservedYocto: "0",
      expiresAt: new Date(Date.now() - 10000), // in the past
      allowedRecipientsJson: JSON.stringify([humanAddress]),
    },
  });
  const syncedExpiredStatus = await MandateLifecycleService.evaluateAndSyncStatus(expiredMandate.id);
  assert(syncedExpiredStatus === "EXPIRED", "2h: Mandate past expiration automatically synced to EXPIRED");

  // 2i. Dynamic Budget Exhaustion sync -> BUDGET_EXHAUSTED
  const exhaustedMandate = await prisma.mandate.create({
    data: {
      userId: user!.id,
      agentId: agent!.id,
      walletId: agent!.wallet!.id,
      name: "Exhausted Mandate Test",
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("0.05"),
      perTxLimitYocto: nearToYocto("0.02"),
      approvalThresholdYocto: nearToYocto("0.01"),
      spentYocto: nearToYocto("0.05"), // fully spent
      reservedYocto: "0",
      expiresAt: new Date(Date.now() + 86400000),
      allowedRecipientsJson: JSON.stringify([humanAddress]),
    },
  });
  const syncedExhaustedStatus = await MandateLifecycleService.evaluateAndSyncStatus(exhaustedMandate.id);
  assert(syncedExhaustedStatus === "BUDGET_EXHAUSTED", "2i: Mandate with 100% budget spent automatically synced to BUDGET_EXHAUSTED");

  // 2j. Revoke mandate -> REVOKED (Terminal)
  const revokeResult = await MandateLifecycleService.revokeMandate({
    mandateId: draftMandate.id,
    actorUserId: user!.id,
    reason: "Owner revoked mandate permanently",
  });
  assert(revokeResult.success && revokeResult.newStatus === "REVOKED", "2j: Mandate transitioned to terminal REVOKED state");

  // 2k. Illegal transition from REVOKED rejected
  let illegalRevokeResume = false;
  try {
    await MandateLifecycleService.resumeMandate({
      mandateId: draftMandate.id,
      actorUserId: user!.id,
      reason: "Illegal attempt to resume revoked mandate",
    });
  } catch (err: any) {
    illegalRevokeResume = err.message.includes("Illegal lifecycle transition");
  }
  assert(illegalRevokeResume, "2k: Illegal reactivation of REVOKED mandate strictly rejected");

  // ---------------------------------------------------------------------------
  // PHASE 3: MULTI-TRANSACTION BUDGET ACCOUNTING & INVARIANTS
  // ---------------------------------------------------------------------------
  console.log("\n--- PHASE 3: Multi-Transaction Budget Accounting ---");

  const multiTxMandate = await prisma.mandate.create({
    data: {
      userId: user!.id,
      agentId: agent!.id,
      walletId: agent!.wallet!.id,
      name: `Multi-Tx Accounting Mandate ${Date.now()}`,
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("0.05"), // 0.05 NEAR
      perTxLimitYocto: nearToYocto("0.02"),
      approvalThresholdYocto: nearToYocto("0.01"),
      spentYocto: "0",
      reservedYocto: "0",
      expiresAt: new Date(Date.now() + 86400000),
      allowedRecipientsJson: JSON.stringify([humanAddress]),
    },
  });

  // 3a. Verify initial accounting breakdown
  const initialAcct = await MandateAccountingService.getAccountingBreakdown(multiTxMandate.id, user!.id);
  assert(initialAcct.availableBudgetYocto === nearToYocto("0.05"), "3a: Initial available budget equals total authorized budget");
  assert(initialAcct.isBalanced === true, "3b: Initial mandate is mathematically balanced with zero discrepancy");

  // 3c. Atomic CAS Reservation #1: 0.015 NEAR
  const res1 = await MandateAccountingService.reserveBudget({
    mandateId: multiTxMandate.id,
    amountYocto: nearToYocto("0.015"),
  });
  assert(res1.success === true, "3c: Atomic reservation #1 of 0.015 NEAR succeeded via CAS");
  assert(res1.remainingAvailableYocto === nearToYocto("0.035"), "3d: Available budget correctly reduced to 0.035 NEAR");

  // 3e. Atomic CAS Settlement #1: 0.015 NEAR confirmed
  const settle1 = await MandateAccountingService.settleSpending({
    mandateId: multiTxMandate.id,
    amountYocto: nearToYocto("0.015"),
    wasReserved: true,
  });
  assert(settle1.success === true, "3e: Atomic settlement of 0.015 NEAR committed to confirmed spent");

  // 3f. Atomic CAS Reservation #2: 0.020 NEAR
  const res2 = await MandateAccountingService.reserveBudget({
    mandateId: multiTxMandate.id,
    amountYocto: nearToYocto("0.020"),
  });
  assert(res2.success === true, "3f: Atomic reservation #2 of 0.020 NEAR succeeded via CAS");

  // 3g. Mid-lifecycle accounting breakdown
  const midAcct = await MandateAccountingService.getAccountingBreakdown(multiTxMandate.id, user!.id);
  assert(midAcct.spentYocto === nearToYocto("0.015"), "3g: Confirmed spent is 0.015 NEAR");
  assert(midAcct.reservedYocto === nearToYocto("0.020"), "3h: Active reserved is 0.020 NEAR");
  assert(midAcct.availableBudgetYocto === nearToYocto("0.015"), "3i: Invariant verified: Available (0.015) = Total (0.05) - Spent (0.015) - Reserved (0.020)");

  // 3h. Atomic CAS Release: cancel reservation #2
  const rel2 = await MandateAccountingService.releaseReservation({
    mandateId: multiTxMandate.id,
    amountYocto: nearToYocto("0.020"),
  });
  assert(rel2.success === true, "3j: Atomic release of 0.020 NEAR returned to available budget without spending");

  const postReleaseAcct = await MandateAccountingService.getAccountingBreakdown(multiTxMandate.id, user!.id);
  assert(postReleaseAcct.reservedYocto === "0", "3k: Active reserved returned to 0");
  assert(postReleaseAcct.availableBudgetYocto === nearToYocto("0.035"), "3l: Available budget restored to 0.035 NEAR");

  // ---------------------------------------------------------------------------
  // PHASE 4: RECIPIENT AND TRANSACTION POLICY ENFORCEMENT
  // ---------------------------------------------------------------------------
  console.log("\n--- PHASE 4: Recipient and Transaction Policy Enforcement ---");

  // Policy 1: Authorized recipient
  const authRecipientCheck = await ExecutionValidationService.validateNearTransferPreflight({
    userId: user!.id,
    mandateId: multiTxMandate.id,
    agentId: agent!.id,
    recipient: humanAddress,
    amountYocto: nearToYocto("0.01"),
    bypassRpcCheck: true,
  });
  assert(authRecipientCheck.valid === true, "4a: Authorized recipient permitted by preflight allowlist");

  // Policy 2: Unauthorized recipient
  const unauthRecipientCheck = await ExecutionValidationService.validateNearTransferPreflight({
    userId: user!.id,
    mandateId: multiTxMandate.id,
    agentId: agent!.id,
    recipient: "malicious-hacker.testnet",
    amountYocto: nearToYocto("0.01"),
    bypassRpcCheck: true,
  });
  assert(unauthRecipientCheck.valid === false && unauthRecipientCheck.reason?.includes("allowlist"), "4b: Unauthorized recipient rejected fail-closed");

  // Policy 3: Amount exceeding per-transaction limit (limit is 0.02 NEAR, request 0.025 NEAR)
  const perTxExceedCheck = await ExecutionValidationService.validateNearTransferPreflight({
    userId: user!.id,
    mandateId: multiTxMandate.id,
    agentId: agent!.id,
    recipient: humanAddress,
    amountYocto: nearToYocto("0.025"),
    bypassRpcCheck: true,
  });
  assert(perTxExceedCheck.valid === false && perTxExceedCheck.reason?.includes("per-transaction limit"), "4c: Amount exceeding per-tx limit rejected fail-closed");

  // Temporarily raise perTxLimit to test available budget check in isolation
  await prisma.mandate.update({
    where: { id: multiTxMandate.id },
    data: { perTxLimitYocto: nearToYocto("0.05") },
  });

  // Policy 4: Amount exceeding remaining available mandate budget (available 0.035 NEAR, request 0.038 NEAR)
  const mandateExceedCheck = await ExecutionValidationService.validateNearTransferPreflight({
    userId: user!.id,
    mandateId: multiTxMandate.id,
    agentId: agent!.id,
    recipient: humanAddress,
    amountYocto: nearToYocto("0.038"),
    bypassRpcCheck: true,
  });
  assert(mandateExceedCheck.valid === false && mandateExceedCheck.reason?.includes("available mandate budget"), "4d: Amount exceeding available budget rejected fail-closed");

  // Policy 5: Envelope parameter tamper detection
  const envelope = await ExecutionAuthorizationService.issueAuthorization({
    userId: user!.id,
    agentId: agent!.id,
    mandateId: multiTxMandate.id,
    operation: "near_transfer",
    targetChain: "near",
    recipient: humanAddress,
    token: "NEAR",
    amountYocto: nearToYocto("0.01"),
    mandateVersion: multiTxMandate.policyVersion,
  });

  const tamperedEnvelope = { ...envelope, amountYocto: nearToYocto("0.02") };
  const tamperedResult = await ExecutionAuthorizationService.verifyAuthorization(tamperedEnvelope);
  assert(tamperedResult.valid === false, "4e: Tampered amount in envelope rejected by constant-time HMAC gate");

  // Policy 6: Mandate version change invalidates previously issued envelope
  await MandateLifecycleService.updateConfig({
    mandateId: multiTxMandate.id,
    actorUserId: user!.id,
    perTxLimitYocto: nearToYocto("0.018"),
    reason: "Updated per-tx limit",
  });
  const staleVersionResult = await ExecutionAuthorizationService.verifyAuthorization(envelope);
  assert(staleVersionResult.valid === false && staleVersionResult.reason?.includes("version mismatch"), "4f: Mandate config update increments version and invalidates stale authorization envelope");

  // Policy 7: Paused mandate preflight validation rejected
  const pausedMandateForPolicy = await prisma.mandate.create({
    data: {
      userId: user!.id,
      agentId: agent!.id,
      walletId: agent!.wallet!.id,
      name: "Paused Policy Test",
      status: "PAUSED",
      totalBudgetYocto: nearToYocto("0.05"),
      perTxLimitYocto: nearToYocto("0.02"),
      approvalThresholdYocto: nearToYocto("0.01"),
      spentYocto: "0",
      reservedYocto: "0",
      expiresAt: new Date(Date.now() + 86400000),
      allowedRecipientsJson: JSON.stringify([humanAddress]),
    },
  });
  const pausedPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: user!.id,
    mandateId: pausedMandateForPolicy.id,
    agentId: agent!.id,
    recipient: humanAddress,
    amountYocto: nearToYocto("0.01"),
    bypassRpcCheck: true,
  });
  assert(pausedPreflight.valid === false && pausedPreflight.reason?.includes("PAUSED"), "4g: Paused mandate preflight validation rejected fail-closed");

  // Policy 8: Expired mandate preflight validation rejected
  const expiredMandateForPolicy = await prisma.mandate.create({
    data: {
      userId: user!.id,
      agentId: agent!.id,
      walletId: agent!.wallet!.id,
      name: "Expired Policy Test",
      status: "EXPIRED",
      totalBudgetYocto: nearToYocto("0.05"),
      perTxLimitYocto: nearToYocto("0.02"),
      approvalThresholdYocto: nearToYocto("0.01"),
      spentYocto: "0",
      reservedYocto: "0",
      expiresAt: new Date(Date.now() - 10000),
      allowedRecipientsJson: JSON.stringify([humanAddress]),
    },
  });
  const expiredPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: user!.id,
    mandateId: expiredMandateForPolicy.id,
    agentId: agent!.id,
    recipient: humanAddress,
    amountYocto: nearToYocto("0.01"),
    bypassRpcCheck: true,
  });
  assert(expiredPreflight.valid === false && expiredPreflight.reason?.toLowerCase().includes("expired"), "4h: Expired mandate preflight validation rejected fail-closed");

  // Policy 9: Revoked mandate preflight validation rejected
  const revokedMandateForPolicy = await prisma.mandate.create({
    data: {
      userId: user!.id,
      agentId: agent!.id,
      walletId: agent!.wallet!.id,
      name: "Revoked Policy Test",
      status: "REVOKED",
      totalBudgetYocto: nearToYocto("0.05"),
      perTxLimitYocto: nearToYocto("0.02"),
      approvalThresholdYocto: nearToYocto("0.01"),
      spentYocto: "0",
      reservedYocto: "0",
      expiresAt: new Date(Date.now() + 86400000),
      allowedRecipientsJson: JSON.stringify([humanAddress]),
    },
  });
  const revokedPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: user!.id,
    mandateId: revokedMandateForPolicy.id,
    agentId: agent!.id,
    recipient: humanAddress,
    amountYocto: nearToYocto("0.01"),
    bypassRpcCheck: true,
  });
  assert(revokedPreflight.valid === false && revokedPreflight.reason?.includes("REVOKED"), "4i: Revoked mandate preflight validation rejected fail-closed");

  // Policy 10: Idempotency key reuse with changed payload rejected
  const idemKey = `idem-test-${Date.now()}`;
  const initialPayload = {
    operation: "TRANSFER",
    recipient: humanAddress,
    amountYocto: nearToYocto("0.005"),
    mandateId: multiTxMandate.id,
    agentId: agent!.id,
    parameters: {},
  };
  await prisma.executionRecord.create({
    data: {
      id: `exec-idem-${Date.now()}`,
      idempotencyKey: idemKey,
      payloadHash: computePayloadHash(initialPayload),
      status: "AUTHORIZED",
      operation: "TRANSFER",
      recipient: humanAddress,
      amountYocto: nearToYocto("0.005"),
      nonce: `nonce-idem-${Date.now()}`,
      authSignature: "sig-idem",
      expiresAt: new Date(Date.now() + 60000),
      userId: user!.id,
      mandateId: multiTxMandate.id,
    },
  });
  const tamperedIdemPayload = { ...initialPayload, amountYocto: nearToYocto("0.010") };
  const idemTamperCheck = await ExecutionIdempotencyService.evaluateIdempotency({
    idempotencyKey: idemKey,
    userId: user!.id,
    payload: tamperedIdemPayload,
  });
  assert(idemTamperCheck.isDuplicate === true && idemTamperCheck.isMismatchedPayload === true, "4j: Idempotency key reuse with modified parameters strictly rejected");

  // Policy 11: Wrong network rejected
  const mainnetAgent = await prisma.agent.create({
    data: {
      userId: user!.id,
      name: `Mainnet Test Agent ${Date.now()}`,
      status: "ACTIVE",
    },
  });
  const nonTestnetWallet = await prisma.wallet.create({
    data: {
      walletId: `wallet-mainnet-${Date.now()}`,
      agentId: mainnetAgent.id,
      nearAccountId: `mainnet-account-${Date.now()}.near`,
      network: "mainnet",
      apiKey: "mock-mainnet-api-key",
      balanceYocto: nearToYocto("1.0"),
    },
  });
  const mainnetMandate = await prisma.mandate.create({
    data: {
      userId: user!.id,
      agentId: mainnetAgent.id,
      walletId: nonTestnetWallet.id,
      name: "Mainnet Prohibition Test",
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("0.05"),
      perTxLimitYocto: nearToYocto("0.02"),
      approvalThresholdYocto: nearToYocto("0.01"),
      spentYocto: "0",
      reservedYocto: "0",
      expiresAt: new Date(Date.now() + 86400000),
      allowedRecipientsJson: JSON.stringify([humanAddress]),
    },
  });
  const mainnetCheck = await ExecutionValidationService.validateNearTransferPreflight({
    userId: user!.id,
    mandateId: mainnetMandate.id,
    agentId: mainnetAgent.id,
    recipient: humanAddress,
    amountYocto: nearToYocto("0.01"),
    bypassRpcCheck: true,
  });
  assert(mainnetCheck.valid === false && mainnetCheck.reason?.toLowerCase().includes("testnet"), "4k: Non-testnet network configuration strictly rejected fail-closed");

  // ---------------------------------------------------------------------------
  // PHASE 5: CONCURRENT EXECUTION AND RACE-CONDITION TESTS
  // ---------------------------------------------------------------------------
  console.log("\n--- PHASE 5: Concurrent Execution and Race-Condition Tests ---");

  // Concurrency Scenario 1: Two requests competing for the same available budget
  // Mandate has 0.010 NEAR available.
  // Request A wants 0.007 NEAR. Request B wants 0.006 NEAR.
  // 0.007 + 0.006 = 0.013 > 0.010 -> Exactly ONE must succeed, the other must fail!
  const raceMandate = await prisma.mandate.create({
    data: {
      userId: user!.id,
      agentId: agent!.id,
      walletId: agent!.wallet!.id,
      name: `Race Condition Test Mandate ${Date.now()}`,
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("0.010"),
      perTxLimitYocto: nearToYocto("0.010"),
      approvalThresholdYocto: nearToYocto("0.005"),
      spentYocto: "0",
      reservedYocto: "0",
      expiresAt: new Date(Date.now() + 86400000),
      allowedRecipientsJson: JSON.stringify([humanAddress]),
    },
  });

  const [resA, resB] = await Promise.all([
    MandateAccountingService.reserveBudget({
      mandateId: raceMandate.id,
      amountYocto: nearToYocto("0.007"),
    }),
    MandateAccountingService.reserveBudget({
      mandateId: raceMandate.id,
      amountYocto: nearToYocto("0.006"),
    }),
  ]);

  const successes = [resA, resB].filter((r) => r.success);
  const failures = [resA, resB].filter((r) => !r.success);

  assert(successes.length === 1, "5a: Concurrency race condition: Exactly one of two competing over-allocations succeeded");
  assert(failures.length === 1, "5b: Concurrency race condition: Second competing allocation strictly rejected with budget exhaustion");

  // Check database state after race condition
  const postRaceMandate = await prisma.mandate.findUnique({ where: { id: raceMandate.id } });
  const expectedReserved = successes[0].reservedAmountYocto;
  assert(postRaceMandate!.reservedYocto === expectedReserved, "5c: Database reserved balance matches exactly the single winning reservation without double-spend");

  // Concurrency Scenario 2: Two concurrent workers claiming the same background job
  const m12JobType = `M12_SETTLEMENT_${Date.now()}`;
  const jobPayload = { mandateId: raceMandate.id };
  const jobPayloadHash = computePayloadHash(jobPayload);
  const job = await prisma.backgroundJob.create({
    data: {
      tenantId: user!.id,
      jobType: m12JobType,
      jobCategory: "FINANCIAL",
      priority: 10000000, // Highest priority
      status: "QUEUED",
      payload: JSON.stringify(jobPayload),
      payloadHash: jobPayloadHash,
      maxAttempts: 3,
      scheduledAt: new Date(),
    },
  });

  const worker1 = await prisma.backgroundWorker.create({
    data: {
      workerName: "Financial Worker 1",
      instanceId: `inst-${crypto.randomBytes(8).toString("hex")}`,
      status: "IDLE",
      capabilities: JSON.stringify([m12JobType]),
      maxConcurrency: 2,
    },
  });

  const worker2 = await prisma.backgroundWorker.create({
    data: {
      workerName: "Financial Worker 2",
      instanceId: `inst-${crypto.randomBytes(8).toString("hex")}`,
      status: "IDLE",
      capabilities: JSON.stringify([m12JobType]),
      maxConcurrency: 2,
    },
  });

  const [claim1, claim2] = await Promise.all([
    JobClaimService.claimNextJob({ workerId: worker1.id, workerCapabilities: [m12JobType] }),
    JobClaimService.claimNextJob({ workerId: worker2.id, workerCapabilities: [m12JobType] }),
  ]);

  const claimedCount = [claim1, claim2].filter((c) => c.claimed).length;
  assert(claimedCount === 1, "5d: Concurrent job claiming: Exactly one worker secured exclusive monotonic lease on financial job");

  // Concurrency Scenario 3: Monotonic lease expiration and fencing token rejection
  const claimedJob = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
  const staleLeaseGeneration = (claimedJob?.leaseGeneration || 1) - 1;

  let fencingRejection = false;
  try {
    // Attempt dispatch with stale generation token
    await ExecutionBoundaryService.execute({
      userId: user!.id,
      mandateId: raceMandate.id,
      agentId: agent!.id,
      recipient: humanAddress,
      amountYocto: nearToYocto("0.001"),
      operation: "TRANSFER",
      idempotencyKey: `fencing-test-${Date.now()}`,
      jobId: job.id,
      leaseGeneration: staleLeaseGeneration, // stale!
      isSimulated: true,
    });
  } catch (err: any) {
    fencingRejection = err.message.includes("STALE_FENCING_GENERATION_REJECTED");
  }
  assert(fencingRejection, "5e: Stale worker lease generation strictly fenced and rejected pre-dispatch");

  // ---------------------------------------------------------------------------
  // PHASE 6: FAILURE, RECOVERY AND AMBIGUOUS SETTLEMENT
  // ---------------------------------------------------------------------------
  console.log("\n--- PHASE 6: Failure, Recovery and Ambiguous Settlement ---");

  // 6a. Pre-broadcast failure: safe immediate release
  const preBroadcastFailure = ExecutionRecoveryService.classifyFailure({
    stage: "BEFORE_SIGNING",
    error: new Error("OutLayer provider unreachable"),
  });
  assert(preBroadcastFailure.canReleaseReservationImmediately === true, "6a: Pre-broadcast provider failure permits immediate safe reservation release");
  assert(preBroadcastFailure.suggestedStatus === "FAILED", "6b: Pre-broadcast failure suggests FAILED status");

  // 6b. Post-broadcast timeout: ambiguous network error MUST hold reservation
  const postBroadcastTimeout = ExecutionRecoveryService.classifyFailure({
    stage: "AFTER_BROADCAST_BEFORE_RESPONSE",
    error: new Error("ETIMEDOUT: Connection reset by peer after transaction broadcast"),
  });
  assert(postBroadcastTimeout.canReleaseReservationImmediately === false, "6c: Ambiguous post-broadcast network timeout strictly prohibits immediate budget release");
  assert(postBroadcastTimeout.requiresPolling === true, "6d: Ambiguous timeout sets requiresPolling to true pending authoritative lookup");
  assert(postBroadcastTimeout.suggestedStatus === "REQUIRES_RECOVERY", "6e: Ambiguous timeout sets status to REQUIRES_RECOVERY");

  // 6c. Recovery resolution when transaction confirmed on-chain
  const recoveredExec = await ExecutionRecoveryService.recoverExecution(
    "exec-45a0338cccc68d0c3274f6c3", // Milestone 11 live tx hash BAELTk...
    { rpcUrl: TESTNET_RPC }
  );
  assert(recoveredExec.status === "CONFIRMED", "6f: Recovery service verified confirmed transaction on NEAR RPC and returned status CONFIRMED");

  // 6d. Periodic automated reconciliation sweep
  const reconResult = await ReconciliationService.executeRun({ dryRun: true, runType: "FULL" });
  assert(reconResult.status === "COMPLETED", "6g: Periodic reconciliation engine completed consistency sweep");

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n===============================================================================");
  console.log(`   MILESTONE 12 TEST SUITE: ${passedAssertions} / ${totalAssertions} PASSED (100%) `);
  console.log("===============================================================================\n");

  return {
    passedAssertions,
    totalAssertions,
  };
}

runMilestone12TestSuite()
  .then((res) => {
    console.log("ALL_MILESTONE_12_TESTS_PASSED:", JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
