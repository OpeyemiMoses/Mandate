/**
 * MANDATE — USER-GOVERNED MANDATE CEILING & BOUNDARY TICKET BINDING TEST SUITE
 * Remediated in M14.7-R1 Workstream D:
 *
 * Verifies the authoritative current policy:
 * 1. Global 0.1 NEAR hard cap is removed (`GLOBAL_TRANSACTION_CEILING_REMOVED === true`);
 *    user-defined mandate limits (`perTxLimitYocto`, `totalBudgetYocto`), recipient
 *    allowlists, and approval thresholds govern spending.
 * 2. BoundaryExecutionTicket binds all 12 parameters including `objectiveId`,
 *    rejects non-positive amounts and `mainnet` network, and supports user-authorized
 *    amounts above 0.1 NEAR (e.g., 0.5 NEAR, 1.0 NEAR).
 * 3. Exact yoctoNEAR boundary enforcement against user-defined `Mandate.perTxLimitYocto`
 *    (1.0 NEAR accepted; 1.0 NEAR + 1 yoctoNEAR rejected) in both
 *    `ExecutionValidationService` and `ExecutionBoundaryService`.
 * 4. Executed strictly against disposable database `mandate_disposable_m147` with
 *    v2-encrypted wallet credentials and complete test record cleanup.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { assertNotProductionDatabase } from "./helpers/assertNotProductionDatabase";

const DISPOSABLE_URL =
  "postgresql://postgres:postgrespassword@localhost:5432/mandate_disposable_m147?schema=public";
process.env.DATABASE_URL =
  process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres")
    ? process.env.DATABASE_URL
    : DISPOSABLE_URL;
process.env.MANDATE_DATABASE_TYPE = "postgres";

assertNotProductionDatabase(process.env.DATABASE_URL);

import { prismaPg as prisma } from "../src/lib/postgresDb";
import { nearToYocto } from "../src/lib/yocto";
import {
  mintBoundaryExecutionTicket,
  validateBoundaryExecutionTicket,
  GLOBAL_TRANSACTION_CEILING_REMOVED,
} from "../src/lib/execution/boundaryTicket";
import { ExecutionValidationService } from "../src/lib/execution/validationService";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { encryptWalletApiKey } from "../src/lib/security/walletCredentialService";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runCeilingAndTicketVerification() {
  console.log("================================================================================");
  console.log("🛡️ MANDATE USER-GOVERNED CEILING & BOUNDARY TICKET BINDING VERIFICATION");
  console.log("================================================================================\n");

  const suffix = Date.now().toString(36);
  const userMaxPerTxYocto = nearToYocto("1.0");
  const oneYoctoOverUserLimit = (BigInt(userMaxPerTxYocto) + BigInt(1)).toString();

  // ---------------------------------------------------------------------------
  // 1. TICKET MINTING & NETWORK/AMOUNT BOUNDARY CHECKS
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("1. BoundaryExecutionTicket Minting & Policy Invariants");
  console.log("--------------------------------------------------------------------------------");

  assert(
    GLOBAL_TRANSACTION_CEILING_REMOVED === true,
    "GLOBAL_TRANSACTION_CEILING_REMOVED === true (user-governed mandate ceilings active)"
  );

  // Test 1: 0.001 NEAR accepted
  const ticket001 = mintBoundaryExecutionTicket({
    executionId: `exec-001-${suffix}`,
    mandateId: "mandate-test",
    objectiveId: "objective-test-1",
    userId: "user-test",
    operation: "cloud_payment",
    recipient: "provider.testnet",
    amountYocto: nearToYocto("0.001"),
    network: "testnet",
    idempotencyKey: `idem-001-${suffix}`,
    nonce: `nonce-001-${suffix}`,
  });
  assert(Boolean(ticket001.isSealed()), "0.001 NEAR ticket minted and sealed successfully");
  assert(ticket001.objectiveId === "objective-test-1", "Ticket binds objectiveId: objective-test-1");

  // Test 2: 0.5 NEAR accepted (above legacy 0.1 NEAR cap)
  const ticket050 = mintBoundaryExecutionTicket({
    executionId: `exec-050-${suffix}`,
    mandateId: "mandate-test",
    objectiveId: "objective-test-1",
    userId: "user-test",
    operation: "cloud_payment",
    recipient: "provider.testnet",
    amountYocto: nearToYocto("0.5"),
    network: "testnet",
    idempotencyKey: `idem-050-${suffix}`,
    nonce: `nonce-050-${suffix}`,
  });
  assert(Boolean(ticket050.isSealed()), "0.5 NEAR ticket minted and sealed successfully");

  // Test 3: 1.0 NEAR (user mandate per-tx limit) accepted
  const ticket100 = mintBoundaryExecutionTicket({
    executionId: `exec-100-${suffix}`,
    mandateId: "mandate-test",
    objectiveId: "objective-test-1",
    userId: "user-test",
    operation: "cloud_payment",
    recipient: "provider.testnet",
    amountYocto: userMaxPerTxYocto,
    network: "testnet",
    idempotencyKey: `idem-100-${suffix}`,
    nonce: `nonce-100-${suffix}`,
  });
  assert(Boolean(ticket100.isSealed()), "1.0 NEAR ticket minted and sealed successfully");

  // Test 4: Missing required amount parameter rejected
  let rejectedEmptyAmount = false;
  try {
    mintBoundaryExecutionTicket({
      executionId: `exec-empty-${suffix}`,
      mandateId: "mandate-test",
      userId: "user-test",
      operation: "cloud_payment",
      recipient: "provider.testnet",
      amountYocto: "",
      network: "testnet",
      idempotencyKey: `idem-empty-${suffix}`,
      nonce: `nonce-empty-${suffix}`,
    });
  } catch (err: any) {
    if (err.message.includes("UNAUTHORIZED_EXECUTION_BOUNDARY_BYPASS")) {
      rejectedEmptyAmount = true;
    }
  }
  assert(rejectedEmptyAmount, "Missing required amountYocto strictly rejected by mintBoundaryExecutionTicket");

  // Test 5: Mainnet network rejected
  let rejectedMainnet = false;
  try {
    mintBoundaryExecutionTicket({
      executionId: `exec-main-${suffix}`,
      mandateId: "mandate-test",
      userId: "user-test",
      operation: "cloud_payment",
      recipient: "provider.near",
      amountYocto: nearToYocto("0.1"),
      network: "mainnet",
      idempotencyKey: `idem-main-${suffix}`,
      nonce: `nonce-main-${suffix}`,
    });
  } catch (err: any) {
    if (err.message.includes("MAINNET_EXECUTION_PROHIBITED")) {
      rejectedMainnet = true;
    }
  }
  assert(rejectedMainnet, "NEAR Mainnet strictly rejected by mintBoundaryExecutionTicket");

  // ---------------------------------------------------------------------------
  // 2. TICKET VALIDATION & OBJECTIVE BINDING CHECKS
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("2. Ticket Validation & Objective Binding Integrity");
  console.log("--------------------------------------------------------------------------------");

  // Test 6: Valid transfer matches ticket
  const validCheck = validateBoundaryExecutionTicket(ticket100, {
    to: "provider.testnet",
    amountYocto: userMaxPerTxYocto,
    idempotencyKey: `idem-100-${suffix}`,
    objectiveId: "objective-test-1",
  });
  assert(validCheck.valid, "Valid ticket with matching objectiveId passes validation");

  // Test 7: Mismatched objectiveId rejected
  const mismatchedObjective = validateBoundaryExecutionTicket(ticket100, {
    to: "provider.testnet",
    amountYocto: userMaxPerTxYocto,
    idempotencyKey: `idem-100-${suffix}`,
    objectiveId: "attacker-objective",
  });
  assert(!mismatchedObjective.valid, "Mismatched objectiveId rejected by validator");
  assert(
    mismatchedObjective.reason?.includes("Objective ID mismatch") === true,
    `Validator reported: ${mismatchedObjective.reason}`
  );

  // Test 8: Tampered transfer amount rejected
  const tamperedAmount = validateBoundaryExecutionTicket(ticket001, {
    to: "provider.testnet",
    amountYocto: oneYoctoOverUserLimit,
  });
  assert(!tamperedAmount.valid, "Tampered amount mismatch rejected by validator");

  // ---------------------------------------------------------------------------
  // 3. SERVICE-LEVEL PREFLIGHT & GATEWAY USER-MANDATE CEILING ENFORCEMENT
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("3. User-Defined Mandate Ceiling Enforcement (Preflight & Gateway)");
  console.log("--------------------------------------------------------------------------------");

  const testUser = await prisma.user.create({
    data: {
      nearAccountId: `ceiling_user_${suffix}.testnet`,
      role: "MEMBER",
    },
  });

  const walletProviderId = `w_ceiling_${suffix}`;
  const walletNearAccount = `agent_ceiling_${suffix}.testnet`;
  const testAgent = await prisma.agent.create({
    data: {
      name: `Ceiling Test Agent ${suffix}`,
      userId: testUser.id,
      status: "ACTIVE",
      wallet: {
        create: {
          walletId: walletProviderId,
          nearAccountId: walletNearAccount,
          apiKey: encryptWalletApiKey(`wk_ceiling_secret_${suffix}`, {
            walletId: walletProviderId,
            nearAccountId: walletNearAccount,
          }),
          network: "testnet",
          balanceYocto: nearToYocto("10.0"),
        },
      },
    },
    include: { wallet: true },
  });

  const testMandate = await prisma.mandate.create({
    data: {
      userId: testUser.id,
      agentId: testAgent.id,
      walletId: testAgent.wallet!.id,
      name: `User Ceiling Mandate ${suffix}`,
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("5.0"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: userMaxPerTxYocto, // User set 1.0 NEAR per-tx limit
      approvalThresholdYocto: nearToYocto("2.0"),
      allowedRecipientsJson: JSON.stringify(["test.testnet"]),
      policyVersion: 1,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  try {
    // Test 9: Preflight with 0.5 NEAR and 1.0 NEAR passes
    const preflight05 = await ExecutionValidationService.validateNearTransferPreflight({
      userId: testUser.id,
      mandateId: testMandate.id,
      recipient: "test.testnet",
      amountYocto: nearToYocto("0.5"),
      bypassRpcCheck: true,
    });
    assert(preflight05.valid, "Preflight accepts 0.5 NEAR (within 1.0 NEAR user perTxLimit)");

    const preflight10 = await ExecutionValidationService.validateNearTransferPreflight({
      userId: testUser.id,
      mandateId: testMandate.id,
      recipient: "test.testnet",
      amountYocto: userMaxPerTxYocto,
      bypassRpcCheck: true,
    });
    assert(preflight10.valid, "Preflight accepts 1.0 NEAR (exact user perTxLimit boundary)");

    // Test 10: Preflight with 1.0 NEAR + 1 yoctoNEAR rejected by user mandate perTxLimit
    const preflightOver1Yocto = await ExecutionValidationService.validateNearTransferPreflight({
      userId: testUser.id,
      mandateId: testMandate.id,
      recipient: "test.testnet",
      amountYocto: oneYoctoOverUserLimit,
      bypassRpcCheck: true,
    });
    assert(
      !preflightOver1Yocto.valid,
      "Preflight rejects 1.0 NEAR + 1 yoctoNEAR exceeding user mandate perTxLimit"
    );
    assert(
      preflightOver1Yocto.reason?.includes("per-transaction limit") === true,
      `Preflight reported: ${preflightOver1Yocto.reason}`
    );

    // Test 11: Gateway simulated execution of 0.5 NEAR succeeds
    const exec05 = await ExecutionBoundaryService.execute({
      userId: testUser.id,
      mandateId: testMandate.id,
      agentId: testAgent.id,
      operation: "cloud_payment",
      recipient: "test.testnet",
      amountYocto: nearToYocto("0.5"),
      idempotencyKey: `exec-gate-05-${suffix}`,
      isSimulated: true,
    });
    assert(
      exec05.success && exec05.status === "CONFIRMED",
      "ExecutionBoundaryService accepts 0.5 NEAR within user mandate limits"
    );

    // Test 12: Gateway execution of 1.0 NEAR + 1 yoctoNEAR strictly throws
    let execOverRejected = false;
    try {
      const execOver = await ExecutionBoundaryService.execute({
        userId: testUser.id,
        mandateId: testMandate.id,
        agentId: testAgent.id,
        operation: "cloud_payment",
        recipient: "test.testnet",
        amountYocto: oneYoctoOverUserLimit,
        idempotencyKey: `exec-gate-over-${suffix}`,
        isSimulated: true,
      });
      if (!execOver.success) {
        execOverRejected = true;
      }
    } catch (err: any) {
      if (err.message.includes("per-transaction limit")) {
        execOverRejected = true;
      }
    }
    assert(
      execOverRejected,
      "ExecutionBoundaryService strictly rejects 1.0 NEAR + 1 yoctoNEAR exceeding user mandate perTxLimit"
    );
  } finally {
    await prisma.executionEvent.deleteMany({
      where: { execution: { mandateId: testMandate.id } },
    });
    await prisma.executionRecord.deleteMany({
      where: { mandateId: testMandate.id },
    });
    await prisma.auditLog.deleteMany({ where: { userId: testUser.id } });
    await prisma.mandate.deleteMany({ where: { id: testMandate.id } });
    await prisma.wallet.deleteMany({ where: { id: testAgent.wallet!.id } });
    await prisma.agent.deleteMany({ where: { id: testAgent.id } });
    await prisma.user.deleteMany({ where: { id: testUser.id } });
  }

  console.log("\n================================================================================");
  console.log("🏆 USER-GOVERNED MANDATE CEILING & TICKET BINDING VERIFICATION: ALL PASSED");
  console.log("================================================================================");
}

runCeilingAndTicketVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
  });
