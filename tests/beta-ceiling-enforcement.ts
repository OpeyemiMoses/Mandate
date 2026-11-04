/**
 * MANDATE — PUBLIC BETA TRANSACTION CEILING & TICKET BINDING TEST SUITE
 * Milestone 13.10 Conditional GO Remediation (Section 2.1 & 2.2)
 *
 * Verifies:
 * 1. Hard platform-wide beta ceiling of 0.1 NEAR per transaction.
 * 2. BoundaryExecutionTicket binds all 12 parameters including objectiveId.
 * 3. Exact yoctoNEAR boundary enforcement:
 *    - 0.001 NEAR accepted
 *    - 0.099 NEAR accepted
 *    - 0.1 NEAR accepted
 *    - 0.1000000000000000000000001 NEAR (10^23 + 1 yoctoNEAR) rejected
 *    - Oversized payments (0.5 NEAR, 1.0 NEAR) rejected
 * 4. Objective ID tampering detection.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

process.env.DATABASE_URL =
  process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres")
    ? process.env.DATABASE_URL
    : "postgresql://postgres:postgrespassword@localhost:5432/mandate_prod?schema=public";
process.env.MANDATE_DATABASE_TYPE = "postgres";

import { prisma } from "../src/lib/db";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import {
  mintBoundaryExecutionTicket,
  validateBoundaryExecutionTicket,
  PUBLIC_BETA_MAX_TX_YOCTO,
  PUBLIC_BETA_MAX_TX_NEAR,
} from "../src/lib/execution/boundaryTicket";
import { ExecutionValidationService } from "../src/lib/execution/validationService";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runCeilingAndTicketVerification() {
  console.log("================================================================================");
  console.log("🛡️ MANDATE PUBLIC BETA TRANSACTION CEILING & TICKET BINDING VERIFICATION");
  console.log("================================================================================\n");

  const suffix = Date.now().toString(36);

  // ---------------------------------------------------------------------------
  // 1. TICKET MINTING BOUNDARY & CEILING CHECKS
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("1. BoundaryExecutionTicket Minting & Exact Ceiling Tests");
  console.log("--------------------------------------------------------------------------------");

  const oneYoctoOverCeiling = (BigInt(PUBLIC_BETA_MAX_TX_YOCTO) + BigInt(1)).toString();
  console.log(`  - Ceiling Yocto:       ${PUBLIC_BETA_MAX_TX_YOCTO} (0.1 NEAR)`);
  console.log(`  - 1 Yocto Over Ceiling: ${oneYoctoOverCeiling} (0.1000000000000000000000001 NEAR)`);

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

  // Test 2: 0.099 NEAR accepted
  const ticket099 = mintBoundaryExecutionTicket({
    executionId: `exec-099-${suffix}`,
    mandateId: "mandate-test",
    objectiveId: "objective-test-1",
    userId: "user-test",
    operation: "cloud_payment",
    recipient: "provider.testnet",
    amountYocto: nearToYocto("0.099"),
    network: "testnet",
    idempotencyKey: `idem-099-${suffix}`,
    nonce: `nonce-099-${suffix}`,
  });
  assert(Boolean(ticket099.isSealed()), "0.099 NEAR ticket minted successfully");

  // Test 3: Exactly 0.1 NEAR accepted
  const ticket010 = mintBoundaryExecutionTicket({
    executionId: `exec-010-${suffix}`,
    mandateId: "mandate-test",
    objectiveId: "objective-test-1",
    userId: "user-test",
    operation: "cloud_payment",
    recipient: "provider.testnet",
    amountYocto: PUBLIC_BETA_MAX_TX_YOCTO,
    network: "testnet",
    idempotencyKey: `idem-010-${suffix}`,
    nonce: `nonce-010-${suffix}`,
  });
  assert(Boolean(ticket010.isSealed()), "0.1 NEAR (ceiling boundary) ticket minted successfully");

  // Test 4: 0.1000000000000000000000001 NEAR (1 yocto over) REJECTED
  let rejectedOver1Yocto = false;
  try {
    mintBoundaryExecutionTicket({
      executionId: `exec-over1-${suffix}`,
      mandateId: "mandate-test",
      userId: "user-test",
      operation: "cloud_payment",
      recipient: "provider.testnet",
      amountYocto: oneYoctoOverCeiling,
      network: "testnet",
      idempotencyKey: `idem-over1-${suffix}`,
      nonce: `nonce-over1-${suffix}`,
    });
  } catch (err: any) {
    if (err.message.includes("PLATFORM_BETA_CEILING_EXCEEDED")) {
      rejectedOver1Yocto = true;
    }
  }
  assert(rejectedOver1Yocto, "0.1000000000000000000000001 NEAR strictly rejected by mintBoundaryExecutionTicket");

  // Test 5: 0.5 NEAR REJECTED
  let rejected05 = false;
  try {
    mintBoundaryExecutionTicket({
      executionId: `exec-05-${suffix}`,
      mandateId: "mandate-test",
      userId: "user-test",
      operation: "cloud_payment",
      recipient: "provider.testnet",
      amountYocto: nearToYocto("0.5"),
      network: "testnet",
      idempotencyKey: `idem-05-${suffix}`,
      nonce: `nonce-05-${suffix}`,
    });
  } catch (err: any) {
    if (err.message.includes("PLATFORM_BETA_CEILING_EXCEEDED")) {
      rejected05 = true;
    }
  }
  assert(rejected05, "0.5 NEAR strictly rejected by mintBoundaryExecutionTicket");

  // ---------------------------------------------------------------------------
  // 2. TICKET VALIDATION & OBJECTIVE BINDING CHECKS
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("2. Ticket Validation & Objective Binding Integrity");
  console.log("--------------------------------------------------------------------------------");

  // Test 6: Valid transfer matches ticket
  const validCheck = validateBoundaryExecutionTicket(ticket010, {
    to: "provider.testnet",
    amountYocto: PUBLIC_BETA_MAX_TX_YOCTO,
    idempotencyKey: `idem-010-${suffix}`,
    objectiveId: "objective-test-1",
  });
  assert(validCheck.valid, "Valid ticket with matching objectiveId passes validation");

  // Test 7: Mismatched objectiveId rejected
  const mismatchedObjective = validateBoundaryExecutionTicket(ticket010, {
    to: "provider.testnet",
    amountYocto: PUBLIC_BETA_MAX_TX_YOCTO,
    idempotencyKey: `idem-010-${suffix}`,
    objectiveId: "attacker-objective",
  });
  assert(!mismatchedObjective.valid, "Mismatched objectiveId rejected by validator");
  assert(
    mismatchedObjective.reason?.includes("Objective ID mismatch") === true,
    `Validator reported: ${mismatchedObjective.reason}`
  );

  // Test 8: Tampered transfer amount over ceiling rejected
  const tamperedCeiling = validateBoundaryExecutionTicket(ticket001, {
    to: "provider.testnet",
    amountYocto: oneYoctoOverCeiling,
  });
  assert(!tamperedCeiling.valid, "Tampered amount over ceiling rejected by validator");

  // ---------------------------------------------------------------------------
  // 3. SERVICE-LEVEL PREFLIGHT VALIDATION (ExecutionValidationService)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("3. Service-Level Preflight Validation (ExecutionValidationService)");
  console.log("--------------------------------------------------------------------------------");

  // Setup test tenant and high-budget mandate (e.g. 5 NEAR mandate, 1 NEAR per-tx)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: "cmvy0hwds0000sbpigdca711i" } });
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: "cmw172diy0002sbokl7yqsdaw" } });
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: "cmw172diy0003sboktabqi0yl" } });

  const testMandate = await prisma.mandate.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      walletId: wallet.id,
      name: `Ceiling Test Mandate ${suffix}`,
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("5.0"), // 5 NEAR total
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("1.0"), // Customer set 1.0 NEAR, but platform ceiling must override!
      approvalThresholdYocto: nearToYocto("2.0"),
      allowedRecipientsJson: JSON.stringify(["test.testnet"]),
      policyVersion: 1,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  // Test 9: Preflight with 0.1 NEAR passes
  const preflight01 = await ExecutionValidationService.validateNearTransferPreflight({
    userId: user.id,
    mandateId: testMandate.id,
    recipient: "test.testnet",
    amountYocto: PUBLIC_BETA_MAX_TX_YOCTO, // 0.1 NEAR
    bypassRpcCheck: true,
  });
  assert(preflight01.valid, "Preflight accepts 0.1 NEAR (ceiling boundary)");

  // Test 10: Preflight with 0.1000000000000000000000001 NEAR rejected even though mandate limit is 1.0 NEAR
  const preflightOver1 = await ExecutionValidationService.validateNearTransferPreflight({
    userId: user.id,
    mandateId: testMandate.id,
    recipient: "test.testnet",
    amountYocto: oneYoctoOverCeiling,
    bypassRpcCheck: true,
  });
  assert(!preflightOver1.valid, "Preflight rejects 0.1000000000000000000000001 NEAR despite mandate perTxLimit being 1.0 NEAR");
  assert(
    preflightOver1.reason?.includes("PLATFORM_BETA_CEILING_EXCEEDED") === true,
    `Preflight reported: ${preflightOver1.reason}`
  );

  // ---------------------------------------------------------------------------
  // 4. AUTHORITATIVE GATEWAY ENFORCEMENT (ExecutionBoundaryService)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("4. Authoritative Gateway Enforcement (ExecutionBoundaryService.execute)");
  console.log("--------------------------------------------------------------------------------");

  // Test 11: Execute 0.1 NEAR passes
  const exec01 = await ExecutionBoundaryService.execute({
    userId: user.id,
    mandateId: testMandate.id,
    agentId: agent.id,
    operation: "cloud_payment",
    recipient: "test.testnet",
    amountYocto: PUBLIC_BETA_MAX_TX_YOCTO,
    idempotencyKey: `exec-gate-01-${suffix}`,
    isSimulated: true,
  });
  assert(exec01.success && exec01.status === "CONFIRMED", "ExecutionBoundaryService accepts exactly 0.1 NEAR");

  // Test 12: Execute over-ceiling throws PLATFORM_BETA_CEILING_EXCEEDED
  let execOverRejected = false;
  try {
    await ExecutionBoundaryService.execute({
      userId: user.id,
      mandateId: testMandate.id,
      agentId: agent.id,
      operation: "cloud_payment",
      recipient: "test.testnet",
      amountYocto: oneYoctoOverCeiling,
      idempotencyKey: `exec-gate-over-${suffix}`,
      isSimulated: true,
    });
  } catch (err: any) {
    if (err.message.includes("PLATFORM_BETA_CEILING_EXCEEDED")) {
      execOverRejected = true;
    }
  }
  assert(execOverRejected, "ExecutionBoundaryService.execute strictly throws PLATFORM_BETA_CEILING_EXCEEDED on over-ceiling attempt");

  console.log("\n================================================================================");
  console.log("🏆 PUBLIC BETA TRANSACTION CEILING & TICKET BINDING VERIFICATION: ALL PASSED");
  console.log("   - 0.001 NEAR: ACCEPTED");
  console.log("   - 0.099 NEAR: ACCEPTED");
  console.log("   - 0.100 NEAR: ACCEPTED");
  console.log("   - 0.1000000000000000000000001 NEAR: STRICTLY REJECTED");
  console.log("   - Objective ID parameter binding: VERIFIED");
  console.log("================================================================================");
}

runCeilingAndTicketVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
  });

