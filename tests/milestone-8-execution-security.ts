/**
 * MANDATE — MILESTONE 8: AUTONOMOUS EXECUTION SECURITY TEST SUITE
 * Aggressive adversarial testing, boundary verification, and regression tests.
 *
 * Core Principle: "AI proposes. Mandate enforces. The user controls. OutLayer executes."
 */

import crypto from "crypto";
import { prisma } from "../src/lib/db";
import { yoctoToNear, nearToYocto } from "../src/lib/yocto";
import {
  ExecutionBoundaryService,
  ExecutionValidationService,
  ExecutionAuthorizationService,
  ExecutionIdempotencyService,
  ExecutionRecoveryService,
  AuthorizationEnvelope,
  STORAGE_BUFFER_YOCTO,
  computePayloadHash,
} from "../src/lib/execution";
import { verifyAuditChain } from "../src/lib/auditLedger";
import { PolicyEngine } from "../src/lib/governance/engine";
import { validateApprovalIntegrity } from "../src/lib/governance/approvalManager";
import { registerDefaultTools } from "../src/lib/tools";

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testNum: number, name: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ Case ${testNum} PASS: ${name}`);
    if (detail) console.log(`     ↳ ${detail}`);
  } else {
    console.error(`  ✗ Case ${testNum} FAIL: ${name}`);
    if (detail) console.error(`     ↳ Details: ${detail}`);
    throw new Error(`Assertion failed in Case ${testNum}: ${name}`);
  }
}

async function runMilestone8SecuritySuite() {
  console.log("================================================================================");
  console.log("  MANDATE — MILESTONE 8: AUTONOMOUS EXECUTION SECURITY TEST SUITE");
  console.log("================================================================================");

  await registerDefaultTools();

  // Setup Test Users and Environments
  const userAlice = await prisma.user.upsert({
    where: { id: "user_m8_alice" },
    update: {},
    create: {
      id: "user_m8_alice",
      nearAccountId: "alice-m8.testnet",
      email: "alice-m8@testnet.near",
    },
  });

  const userBob = await prisma.user.upsert({
    where: { id: "user_m8_bob" },
    update: {},
    create: {
      id: "user_m8_bob",
      nearAccountId: "bob-m8.testnet",
      email: "bob-m8@testnet.near",
    },
  });

  // Dedicated Test Agent for Alice
  const agentAlice = await prisma.agent.upsert({
    where: { id: "agent_m8_procurement" },
    update: {},
    create: {
      id: "agent_m8_procurement",
      name: "Alice Procurement Specialist",
      type: "procurement",
      userId: userAlice.id,
      status: "ACTIVE",
    },
  });

  // Dedicated OutLayer Custody Wallet for Agent
  const walletAlice = await prisma.wallet.upsert({
    where: { id: "wallet_m8_alice" },
    update: {
      balanceYocto: nearToYocto("5.0"), // 5.0 NEAR
    },
    create: {
      id: "wallet_m8_alice",
      walletId: "outlayer_vault_m8_001",
      apiKey: "wk_m8_alice_secure_test_key",
      nearAccountId: "outlayer-vault-m8-alice.testnet",
      balanceYocto: nearToYocto("5.0"), // 5.0 NEAR
      agentId: agentAlice.id,
      network: "testnet",
    },
  });

  // Mandate with 2.0 NEAR budget, 0.5 NEAR perTxLimit, 0.2 NEAR approval threshold
  const mandateAlice = await prisma.mandate.upsert({
    where: { id: "mandate_m8_alice" },
    update: {
      spentYocto: "0",
      reservedYocto: "0",
      status: "ACTIVE",
      policyVersion: 1,
    },
    create: {
      id: "mandate_m8_alice",
      name: "Alice M8 Infrastructure Procurement",
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("2.0"), // 2.0 NEAR
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.5"), // 0.5 NEAR limit
      approvalThresholdYocto: nearToYocto("0.2"), // > 0.2 NEAR requires approval
      allowedRecipientsJson: JSON.stringify([
        "cloud-provider.testnet",
        "verified-vendor.testnet",
        "oracle.testnet",
      ]),
      expiresAt: new Date(Date.now() + 86400000), // 24 hours
      policyVersion: 1,
      userId: userAlice.id,
      agentId: agentAlice.id,
      walletId: walletAlice.id,
    },
  });

  // ---------------------------------------------------------------------------
  // SECTION 1: PREFLIGHT TRANSACTION VALIDATION (NEP / FORMAT / BUDGET)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 1: PREFLIGHT TRANSACTION VALIDATION");
  console.log("--------------------------------------------------------------------------------");

  // Case 1: Rejection of floating point amounts
  const floatCheck = await ExecutionValidationService.validateNearTransferPreflight({
    userId: userAlice.id,
    mandateId: mandateAlice.id,
    recipient: "cloud-provider.testnet",
    amountYocto: "0.15", // Floating point rejected!
  });
  assert(
    floatCheck.valid === false && Boolean(floatCheck.reason?.includes("Invalid amount representation")),
    1,
    "Preflight strictly rejects floating-point amount inputs",
    `Rejection: "${floatCheck.reason}"`
  );

  // Case 2: Rejection of malformed NEAR recipient accounts
  const badRecipientCheck = await ExecutionValidationService.validateNearTransferPreflight({
    userId: userAlice.id,
    mandateId: mandateAlice.id,
    recipient: "INVALID_UPPERCASE_AND_SPACES.testnet!",
    amountYocto: nearToYocto("0.1"),
  });
  assert(
    badRecipientCheck.valid === false && Boolean(badRecipientCheck.reason?.includes("Invalid NEAR recipient format")),
    2,
    "Preflight rejects invalid recipient account syntax (uppercase/illegal characters)",
    `Rejection: "${badRecipientCheck.reason}"`
  );

  // Case 3: Rejection of recipients not in mandate allowlist
  const unauthorizedRecipientCheck = await ExecutionValidationService.validateNearTransferPreflight({
    userId: userAlice.id,
    mandateId: mandateAlice.id,
    recipient: "unauthorized-stranger.testnet",
    amountYocto: nearToYocto("0.1"),
  });
  assert(
    unauthorizedRecipientCheck.valid === false && Boolean(unauthorizedRecipientCheck.reason?.includes("not permitted by mandate allowlist")),
    3,
    "Preflight rejects recipients outside the mandate allowed list",
    `Rejection: "${unauthorizedRecipientCheck.reason}"`
  );

  // Case 4: Rejection of amount exceeding per-transaction limit
  const perTxLimitCheck = await ExecutionValidationService.validateNearTransferPreflight({
    userId: userAlice.id,
    mandateId: mandateAlice.id,
    recipient: "cloud-provider.testnet",
    amountYocto: nearToYocto("0.6"), // Exceeds 0.5 perTxLimit
  });
  assert(
    perTxLimitCheck.valid === false && Boolean(perTxLimitCheck.reason?.includes("exceeds per-transaction limit")),
    4,
    "Preflight rejects amount exceeding mandate per-transaction limit (0.6 > 0.5 NEAR)",
    `Rejection: "${perTxLimitCheck.reason}"`
  );

  // Case 5: Valid preflight passes all deterministic checks
  const validPreflight = await ExecutionValidationService.validateNearTransferPreflight({
    userId: userAlice.id,
    mandateId: mandateAlice.id,
    recipient: "cloud-provider.testnet",
    amountYocto: nearToYocto("0.1"),
    bypassRpcCheck: true,
  });
  assert(
    validPreflight.valid === true && validPreflight.checks.every((c) => c.passed),
    5,
    "Compliant preflight request passes all deterministic validation checks",
    `Validated Amount: ${validPreflight.amountNear} NEAR to ${validPreflight.recipient}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 2: CRYPTOGRAPHIC AUTHORIZATION ENVELOPE INTEGRITY
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 2: CRYPTOGRAPHIC AUTHORIZATION ENVELOPES & NONCE ENFORCEMENT");
  console.log("--------------------------------------------------------------------------------");

  const validEnvelope = await ExecutionAuthorizationService.issueAuthorization({
    userId: userAlice.id,
    agentId: agentAlice.id,
    mandateId: mandateAlice.id,
    operation: "near_transfer",
    recipient: "cloud-provider.testnet",
    amountYocto: nearToYocto("0.1"),
  });

  // Case 6: Legitimate envelope verifies with constant-time HMAC
  const verifyCheck = await ExecutionAuthorizationService.verifyAuthorization(validEnvelope, {
    userId: userAlice.id,
    mandateId: mandateAlice.id,
    recipient: "cloud-provider.testnet",
    amountYocto: nearToYocto("0.1"),
  });
  assert(
    verifyCheck.valid === true,
    6,
    "Cryptographic authorization envelope verified with valid HMAC-SHA256 signature",
    `Nonce: ${validEnvelope.nonce}, Signature: ${validEnvelope.signature.slice(0, 16)}...`
  );

  // Case 7: Envelope parameter tampering is caught and rejected
  const tamperedEnvelope: AuthorizationEnvelope = {
    ...validEnvelope,
    amountYocto: nearToYocto("1.0"), // Tampered amount without signature update
  };
  const tamperedCheck = await ExecutionAuthorizationService.verifyAuthorization(tamperedEnvelope);
  assert(
    tamperedCheck.valid === false && Boolean(tamperedCheck.reason?.includes("Cryptographic signature mismatch")),
    7,
    "Tampering with envelope payload strictly invalidates HMAC authorization",
    `Rejection: "${tamperedCheck.reason}"`
  );

  // Case 8: Expired envelope is rejected
  const expiredEnvelope = await ExecutionAuthorizationService.issueAuthorization({
    userId: userAlice.id,
    mandateId: mandateAlice.id,
    operation: "near_transfer",
    recipient: "cloud-provider.testnet",
    amountYocto: nearToYocto("0.1"),
    ttlMs: -1000, // Expired 1 second ago
  });
  const expiredCheck = await ExecutionAuthorizationService.verifyAuthorization(expiredEnvelope);
  assert(
    expiredCheck.valid === false && Boolean(expiredCheck.reason?.includes("expired")),
    8,
    "Expired authorization envelope is strictly rejected",
    `Rejection: "${expiredCheck.reason}"`
  );

  // Case 9: Single-use nonce enforcement prevents replay attacks
  // Persist record with consumed nonce
  await prisma.executionRecord.deleteMany({
    where: { idempotencyKey: "idem_consumed_nonce_test" },
  });
  await prisma.executionRecord.create({
    data: {
      id: "exec_m8_consumed_test",
      idempotencyKey: "idem_consumed_nonce_test",
      payloadHash: "dummy-hash",
      status: "SIGNED",
      nonce: validEnvelope.nonce,
      authSignature: validEnvelope.signature,
      isNonceConsumed: true,
      nonceConsumedAt: new Date(),
      expiresAt: new Date(validEnvelope.expiresAt),
      recipient: validEnvelope.recipient,
      amountYocto: validEnvelope.amountYocto,
      userId: userAlice.id,
      mandateId: mandateAlice.id,
    },
  });

  const replayCheck = await ExecutionAuthorizationService.verifyAuthorization(validEnvelope);
  assert(
    replayCheck.valid === false && Boolean(replayCheck.reason?.includes("replay rejected")),
    9,
    "Replay attack with previously consumed authorization nonce is strictly rejected",
    `Rejection: "${replayCheck.reason}"`
  );

  // ---------------------------------------------------------------------------
  // SECTION 3: IDEMPOTENCY & DUPLICATE REQUEST HANDLING
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 3: IDEMPOTENCY & REPLAY ATTACK MITIGATION");
  console.log("--------------------------------------------------------------------------------");

  const testPayload = {
    operation: "near_transfer",
    recipient: "cloud-provider.testnet",
    amountYocto: nearToYocto("0.1"),
    mandateId: mandateAlice.id,
  };

  await prisma.executionRecord.deleteMany({
    where: { idempotencyKey: "idem_key_fixed_test" },
  });

  const execRecord = await prisma.executionRecord.create({
    data: {
      id: `exec_m8_idem_${Date.now()}`,
      idempotencyKey: "idem_key_fixed_test",
      payloadHash: computePayloadHash(testPayload),
      status: "CONFIRMED",
      nonce: `nonce_m8_idem_${Date.now()}`,
      authSignature: "sig_001",
      expiresAt: new Date(Date.now() + 60000),
      recipient: "cloud-provider.testnet",
      amountYocto: nearToYocto("0.1"),
      txHash: "mock-tx-idem-confirmed",
      userId: userAlice.id,
      mandateId: mandateAlice.id,
    },
  });

  // Case 10: Repeated request with identical key and payload returns existing record safely
  const duplicateSamePayload = await ExecutionIdempotencyService.evaluateIdempotency({
    idempotencyKey: "idem_key_fixed_test",
    userId: userAlice.id,
    payload: testPayload,
  });
  assert(
    duplicateSamePayload.isDuplicate === true && duplicateSamePayload.isMismatchedPayload === false,
    10,
    "Identical idempotency key with matching payload returns existing execution state",
    `Matched Execution ID: ${duplicateSamePayload.existingRecord?.id}`
  );

  // Case 11: Reusing idempotency key with altered payload is strictly rejected
  const duplicateAlteredPayload = await ExecutionIdempotencyService.evaluateIdempotency({
    idempotencyKey: "idem_key_fixed_test",
    userId: userAlice.id,
    payload: {
      ...testPayload,
      amountYocto: nearToYocto("0.5"), // Altered amount!
    },
  });
  assert(
    duplicateAlteredPayload.isDuplicate === true &&
      duplicateAlteredPayload.isMismatchedPayload === true &&
      Boolean(duplicateAlteredPayload.error?.includes("different execution payload")),
    11,
    "Reusing idempotency key with modified parameters is strictly rejected",
    `Rejection: "${duplicateAlteredPayload.error}"`
  );

  // ---------------------------------------------------------------------------
  // SECTION 4: AUTHORITATIVE EXECUTION BOUNDARY & TIMEOUT SAFETY
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 4: EXECUTION BOUNDARY & TIMEOUT RESERVATION SAFETY");
  console.log("--------------------------------------------------------------------------------");

  // Case 12: Autonomous compliant transfer executes and settles atomically via ExecutionBoundaryService
  const execResultAutonomous = await ExecutionBoundaryService.execute({
    userId: userAlice.id,
    mandateId: mandateAlice.id,
    agentId: agentAlice.id,
    operation: "near_transfer",
    recipient: "cloud-provider.testnet",
    amountYocto: nearToYocto("0.1"),
    idempotencyKey: `idem_m8_auto_${Date.now()}`,
    isSimulated: true, // Simulation mode for deterministic test
  });

  assert(
    execResultAutonomous.success === true &&
      execResultAutonomous.status === "CONFIRMED" &&
      execResultAutonomous.settled === true,
    12,
    "Autonomous execution passes all boundaries and settles budget atomically via CAS",
    `Execution ID: ${execResultAutonomous.executionId}, TxHash: ${execResultAutonomous.txHash}`
  );

  // Case 13: Operation exceeding approval threshold (> 0.2 NEAR) is blocked without approvalId
  let unapprovedError = "";
  try {
    await ExecutionBoundaryService.execute({
      userId: userAlice.id,
      mandateId: mandateAlice.id,
      agentId: agentAlice.id,
      operation: "near_transfer",
      recipient: "cloud-provider.testnet",
      amountYocto: nearToYocto("0.25"), // Exceeds 0.2 NEAR approval threshold
      idempotencyKey: `idem_m8_unappr_${Date.now()}`,
      isSimulated: true,
    });
  } catch (err: any) {
    unapprovedError = err.message;
  }
  assert(
    unapprovedError.includes("requires explicit human authorization"),
    13,
    "Execution boundary halts unapproved transfer exceeding threshold",
    `Blocked Reason: "${unapprovedError}"`
  );

  // Case 14: Golden Rule: Ambiguous RPC timeout post-broadcast does NOT release budget reservation
  const timeoutFailure = ExecutionRecoveryService.classifyFailure({
    stage: "AFTER_BROADCAST_BEFORE_RESPONSE",
    error: new Error("ETIMEDOUT: Connection to NEAR RPC timed out after broadcast"),
  });
  assert(
    timeoutFailure.canReleaseReservationImmediately === false &&
      timeoutFailure.requiresPolling === true &&
      timeoutFailure.suggestedStatus === "REQUIRES_RECOVERY",
    14,
    "Golden Rule Preserved: Ambiguous RPC timeout does NOT release budget reservation",
    `Prescribed Status: ${timeoutFailure.suggestedStatus}, Can Release Immediately: ${timeoutFailure.canReleaseReservationImmediately}`
  );

  // Case 15: Pre-broadcast failure safely permits immediate reservation release
  const preBroadcastFailure = ExecutionRecoveryService.classifyFailure({
    stage: "BEFORE_SIGNING",
    error: new Error("Validation format error"),
  });
  assert(
    preBroadcastFailure.canReleaseReservationImmediately === true &&
      preBroadcastFailure.suggestedStatus === "FAILED",
    15,
    "Pre-broadcast failure safely releases reservation immediately",
    `Prescribed Status: ${preBroadcastFailure.suggestedStatus}, Can Release Immediately: ${preBroadcastFailure.canReleaseReservationImmediately}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 5: APPROVAL INTEGRITY & PARAMETER TAMPERING ATTACKS
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 5: APPROVAL INTEGRITY & PARAMETER TAMPERING ATTACKS");
  console.log("--------------------------------------------------------------------------------");

  // Fetch up-to-date mandate version following Case 12 execution
  const currentMandate = await prisma.mandate.findUnique({ where: { id: mandateAlice.id } });
  const currentMandateVersion = currentMandate?.policyVersion || 1;

  // Create legitimate approval request for 0.3 NEAR to verified-vendor.testnet
  const initialPayload = {
    operation: "near_transfer",
    recipient: "verified-vendor.testnet",
    amountYocto: nearToYocto("0.3"),
    mandateId: mandateAlice.id,
    mandateVersion: currentMandateVersion,
  };

  const initialActionPayloadHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(initialPayload))
    .digest("hex");

  const approvalReq = await prisma.approvalRequest.create({
    data: {
      id: `appr_m8_tamper_${Date.now()}`,
      status: "APPROVED",
      recipient: "verified-vendor.testnet",
      amountYocto: nearToYocto("0.3"),
      mandateId: mandateAlice.id,
      actionPayloadHash: initialActionPayloadHash,
      mandateVersion: currentMandateVersion,
      decidedAt: new Date(),
      approverId: userAlice.id,
    },
  });

  // Case 17: Tampering with recipient after approval is granted
  let recipientTamperError = "";
  try {
    await ExecutionBoundaryService.execute({
      userId: userAlice.id,
      mandateId: mandateAlice.id,
      recipient: "cloud-provider.testnet", // Changed recipient from verified-vendor!
      amountYocto: nearToYocto("0.3"),
      operation: "near_transfer",
      approvalId: approvalReq.id,
      idempotencyKey: `idem_m8_rec_tamper_${Date.now()}`,
      isSimulated: true,
    });
  } catch (err: any) {
    recipientTamperError = err.message;
  }
  assert(
    recipientTamperError.includes("Approval Verification Failed") ||
      recipientTamperError.includes("hash mismatch") ||
      recipientTamperError.includes("recipient"),
    17,
    "Tampering with recipient after approval is strictly rejected at execution boundary",
    `Rejection: "${recipientTamperError}"`
  );

  // Case 18: Tampering with amount after approval is granted
  let amountTamperError = "";
  try {
    await ExecutionBoundaryService.execute({
      userId: userAlice.id,
      mandateId: mandateAlice.id,
      recipient: "verified-vendor.testnet",
      amountYocto: nearToYocto("0.4"), // Increased amount from 0.3!
      operation: "near_transfer",
      approvalId: approvalReq.id,
      idempotencyKey: `idem_m8_amt_tamper_${Date.now()}`,
      isSimulated: true,
    });
  } catch (err: any) {
    amountTamperError = err.message;
  }
  assert(
    amountTamperError.includes("Approval Verification Failed") ||
      amountTamperError.includes("hash mismatch") ||
      amountTamperError.includes("amount"),
    18,
    "Tampering with amount after approval is strictly rejected at execution boundary",
    `Rejection: "${amountTamperError}"`
  );

  // Case 19: Revoked approval cannot be executed
  await prisma.approvalRequest.update({
    where: { id: approvalReq.id },
    data: { status: "REVOKED", revokedAt: new Date(), revocationReason: "Suspicious activity detected" },
  });

  let revokedExecError = "";
  try {
    await ExecutionBoundaryService.execute({
      userId: userAlice.id,
      mandateId: mandateAlice.id,
      recipient: "verified-vendor.testnet",
      amountYocto: nearToYocto("0.3"),
      operation: "near_transfer",
      approvalId: approvalReq.id,
      idempotencyKey: `idem_m8_revoked_${Date.now()}`,
      isSimulated: true,
    });
  } catch (err: any) {
    revokedExecError = err.message;
  }
  assert(
    revokedExecError.toLowerCase().includes("revoked") ||
      revokedExecError.includes("Approval Verification Failed"),
    19,
    "Execution boundary rejects execution against a revoked approval",
    `Rejection: "${revokedExecError}"`
  );

  // ---------------------------------------------------------------------------
  // SECTION 6: CROSS-USER & FINANCIAL CONCURRENCY BOUNDARIES
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 6: CROSS-USER & FINANCIAL CONCURRENCY BOUNDARIES");
  console.log("--------------------------------------------------------------------------------");

  // Case 20: User Bob cannot execute using Alice's mandate
  let bobCrossUserError = "";
  try {
    await ExecutionBoundaryService.execute({
      userId: userBob.id, // Bob attempting to use Alice's mandate!
      mandateId: mandateAlice.id,
      recipient: "cloud-provider.testnet",
      amountYocto: nearToYocto("0.1"),
      idempotencyKey: `idem_bob_exploit_${Date.now()}`,
      operation: "TRANSFER",
      isSimulated: true,
    });
  } catch (err: any) {
    bobCrossUserError = err.message;
  }
  assert(
    bobCrossUserError.includes("Mandate not found or unauthorized"),
    20,
    "Cross-user execution strictly rejected: User Bob cannot execute Alice's mandate",
    `Rejection: "${bobCrossUserError}"`
  );

  // Case 21: Financial attack: Attempting to spend beyond total authorized budget
  let overspendError = "";
  try {
    await ExecutionBoundaryService.execute({
      userId: userAlice.id,
      mandateId: mandateAlice.id,
      recipient: "cloud-provider.testnet",
      amountYocto: nearToYocto("10.0"), // Exceeds 2.0 NEAR total budget!
      operation: "near_transfer",
      idempotencyKey: `idem_m8_overspend_${Date.now()}`,
      isSimulated: true,
    });
  } catch (err: any) {
    overspendError = err.message;
  }
  assert(
    overspendError.includes("exceeds") || overspendError.includes("limit"),
    21,
    "Financial boundary strictly halts spending requests exceeding total authorized budget",
    `Rejection: "${overspendError}"`
  );

  // ---------------------------------------------------------------------------
  // SECTION 7: ASYNCHRONOUS RECOVERY & SETTLEMENT RECONCILIATION
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 7: ASYNCHRONOUS RECOVERY & SETTLEMENT RECONCILIATION");
  console.log("--------------------------------------------------------------------------------");

  // Create an execution record stalled in REQUIRES_RECOVERY state with budget reserved
  const recoveryExec = await prisma.executionRecord.create({
    data: {
      id: `exec_m8_rec_${Date.now()}`,
      idempotencyKey: `idem_m8_rec_${Date.now()}`,
      payloadHash: "hash-rec",
      status: "REQUIRES_RECOVERY",
      operation: "near_transfer",
      recipient: "cloud-provider.testnet",
      amountYocto: nearToYocto("0.1"),
      nonce: `nonce_rec_${Date.now()}`,
      authSignature: "sig-rec",
      expiresAt: new Date(Date.now() + 60000),
      userId: userAlice.id,
      mandateId: mandateAlice.id,
      recoveryAttempts: 1,
      recoveryStatus: "PENDING_RECOVERY",
    },
  });

  // Case 22: ExecutionRecoveryService processes recovery safely
  const recoveryReport = await ExecutionRecoveryService.recoverExecution(recoveryExec.id, {
    maxAttempts: 3,
  });
  assert(
    recoveryReport.executionId === recoveryExec.id &&
      recoveryReport.status === "REQUIRES_RECOVERY" &&
      recoveryReport.released === false &&
      recoveryReport.settled === false,
    22,
    "Execution recovery polling increments attempts and preserves budget reservation safely",
    `Status: ${recoveryReport.status}, Notes: "${recoveryReport.notes}"`
  );

  // Case 23: Max recovery attempts reached transitions safely to MANUAL_INTERVENTION_REQUIRED
  const maxAttemptExec = await prisma.executionRecord.create({
    data: {
      id: `exec_m8_max_${Date.now()}`,
      idempotencyKey: `idem_m8_max_${Date.now()}`,
      payloadHash: "hash-max",
      status: "REQUIRES_RECOVERY",
      operation: "near_transfer",
      recipient: "cloud-provider.testnet",
      amountYocto: nearToYocto("0.1"),
      nonce: `nonce_max_${Date.now()}`,
      authSignature: "sig-max",
      expiresAt: new Date(Date.now() + 60000),
      userId: userAlice.id,
      mandateId: mandateAlice.id,
      recoveryAttempts: 3, // Already at max attempts!
      recoveryStatus: "PENDING_RECOVERY",
    },
  });

  const maxRecoveryReport = await ExecutionRecoveryService.recoverExecution(maxAttemptExec.id, {
    maxAttempts: 3,
  });
  assert(
    maxRecoveryReport.status === "MANUAL_INTERVENTION_REQUIRED" &&
      maxRecoveryReport.released === false,
    23,
    "Stalled execution transitions to MANUAL_INTERVENTION_REQUIRED while keeping reservation locked",
    `Status: ${maxRecoveryReport.status}, Released: ${maxRecoveryReport.released}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 8: COMPLETE SHA-256 AUDIT LEDGER INTEGRITY
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 8: UNIFIED CRYPTOGRAPHIC SHA-256 AUDIT CHAIN INTEGRITY");
  console.log("--------------------------------------------------------------------------------");

  // Case 24: Verify complete cryptographic hash chain
  const auditVerificationAlice = await verifyAuditChain(userAlice.id);
  assert(
    auditVerificationAlice.valid === true && auditVerificationAlice.count > 0,
    24,
    "Complete SHA-256 audit chain verified from genesis to head with 0 breaks across all execution events",
    `Total Verified Events: ${auditVerificationAlice.count}, Head Hash: ${auditVerificationAlice.headHash?.slice(0, 16)}...`
  );

  // ---------------------------------------------------------------------------
  // FINAL RESULTS
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  VERIFICATION RESULTS: ${passedTests} / ${totalTests} PASSED (100%)`);
  console.log("================================================================================\n");
  console.log("ALL MILESTONE 8 AUTONOMOUS EXECUTION SECURITY INVARIANTS VERIFIED SUCCESSFULLY!\n");
}

runMilestone8SecuritySuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Execution Security Verification Suite Failed:", err);
    process.exit(1);
  });
