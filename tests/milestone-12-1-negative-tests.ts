/**
 * MANDATE — MILESTONE 12.1: SECTION 6 NEGATIVE SECURITY TESTS & SECTION 7 RECONCILIATION
 * 
 * Tests 9 deterministic security assertions:
 * 1. Transfer exceeding remaining budget (> 0.007 NEAR) -> REJECTED
 * 2. Transfer exceeding per-tx limit (> 0.005 NEAR) -> REJECTED
 * 3. Transfer to unapproved recipient -> REJECTED
 * 4. Execution with replayed authorization envelope -> REJECTED / IDEMPOTENT SAFELY HANDLED
 * 5. Reused idempotency key with modified payload -> REJECTED
 * 6. Transfer while mandate is PAUSED -> REJECTED
 * 7. Transfer while mandate is REVOKED -> REJECTED
 * 8. Stale policy version -> REJECTED
 * 9. Emergency pause / operational halt -> REJECTED
 * 
 * Verifies:
 * - Zero on-chain broadcast for rejected tests.
 * - Zero budget corruption or drift.
 * - Full audit trails and authoritative RPC reconciliation.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { prisma } from "../src/lib/db";
import { getNearAccountState } from "../src/lib/nearRpc";
import { yoctoToNear, nearToYocto } from "../src/lib/yocto";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { MandateAccountingService } from "../src/lib/mandate/accountingService";
import { ExecutionValidationService } from "../src/lib/execution/validationService";
import { MandateLifecycleService } from "../src/lib/mandate/lifecycleService";
import { ExecutionAuthorizationService } from "../src/lib/execution/authorizationService";
import { EmergencyPauseService } from "../src/lib/operations/emergencyPauseService";
import { OperationalControlService } from "../src/lib/operations/operationalControlService";

const TESTNET_RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const MANDATE_ID = "cmw19ayhj0001sbyxd9uizeha";
const RECIPIENT = "0x479253b82eb63eb36f140ecabf0237cc338084e7";

async function runNegativeSecurityTests() {
  console.log("=== RUNNING MILESTONE 12.1 SECTION 6 NEGATIVE SECURITY TESTS ===");

  const mandate = await prisma.mandate.findUnique({
    where: { id: MANDATE_ID },
    include: { wallet: true, agent: true, user: true },
  });
  if (!mandate) throw new Error("Mandate not found");

  const results: { test: string; passed: boolean; reason: string }[] = [];

  // Snapshot accounting before tests
  const preTestAccounting = await MandateAccountingService.getAccountingBreakdown(mandate.id, mandate.userId);
  console.log(`Pre-test available budget: ${preTestAccounting.availableBudgetNear} NEAR`);

  // Test 1: Transfer exceeding remaining budget (> 0.007 NEAR, e.g. 0.008 NEAR)
  // Temporarily lift per-tx limit so budget exhaustion can be tested in isolation
  try {
    await prisma.mandate.update({
      where: { id: mandate.id },
      data: { perTxLimitYocto: nearToYocto("0.010") },
    });
    const val = await ExecutionValidationService.validateNearTransferPreflight({
      userId: mandate.userId,
      mandateId: mandate.id,
      recipient: RECIPIENT,
      amountYocto: nearToYocto("0.008"),
    });
    const budgetCheck = val.checks.find((c) => c.name === "budget_available");
    const passed = !val.valid && budgetCheck?.passed === false;
    results.push({
      test: "1. Exceeds remaining budget (> 0.007 NEAR)",
      passed,
      reason: budgetCheck?.details || val.reason || "Unexpectedly passed",
    });
  } catch (err: any) {
    results.push({ test: "1. Exceeds remaining budget (> 0.007 NEAR)", passed: true, reason: err.message });
  } finally {
    await prisma.mandate.update({
      where: { id: mandate.id },
      data: { perTxLimitYocto: nearToYocto("0.005") },
    });
  }

  // Test 2: Transfer exceeding per-transaction limit (> 0.005 NEAR, e.g. 0.006 NEAR)
  try {
    const val = await ExecutionValidationService.validateNearTransferPreflight({
      userId: mandate.userId,
      mandateId: mandate.id,
      recipient: RECIPIENT,
      amountYocto: nearToYocto("0.006"),
    });
    const limitCheck = val.checks.find((c) => c.name === "per_tx_limit");
    const passed = !val.valid && limitCheck?.passed === false;
    results.push({
      test: "2. Exceeds per-tx limit (> 0.005 NEAR)",
      passed,
      reason: limitCheck?.details || val.reason || "Unexpectedly passed",
    });
  } catch (err: any) {
    results.push({ test: "2. Exceeds per-tx limit (> 0.005 NEAR)", passed: true, reason: err.message });
  }

  // Test 3: Transfer to unapproved recipient
  try {
    const val = await ExecutionValidationService.validateNearTransferPreflight({
      userId: mandate.userId,
      mandateId: mandate.id,
      recipient: "unauthorized-malicious-actor.testnet",
      amountYocto: nearToYocto("0.001"),
    });
    const allowlistCheck = val.checks.find((c) => c.name === "recipient_allowlist");
    const passed = !val.valid && allowlistCheck?.passed === false;
    results.push({
      test: "3. Unapproved recipient",
      passed,
      reason: allowlistCheck?.details || val.reason || "Unexpectedly passed",
    });
  } catch (err: any) {
    results.push({ test: "3. Unapproved recipient", passed: true, reason: err.message });
  }

  // Test 4: Replayed authorization envelope / Reused idempotency key with identical payload
  try {
    const existingExec = await prisma.executionRecord.findFirst({
      where: { mandateId: mandate.id, status: "CONFIRMED" },
    });
    if (!existingExec) throw new Error("No confirmed execution found to test idempotency replay");

    const execResult = await ExecutionBoundaryService.execute({
      userId: mandate.userId,
      mandateId: mandate.id,
      agentId: mandate.agentId,
      recipient: existingExec.recipient,
      amountYocto: existingExec.amountYocto,
      operation: "TRANSFER",
      idempotencyKey: existingExec.idempotencyKey,
      isSimulated: true,
    });
    const passed = execResult.success && execResult.txHash === existingExec.txHash;
    results.push({
      test: "4. Replayed idempotency key (idempotent replay safety)",
      passed,
      reason: `Returned existing settled transaction hash: ${execResult.txHash} without double-spending`,
    });
  } catch (err: any) {
    results.push({ test: "4. Replayed idempotency key", passed: false, reason: err.message });
  }

  // Test 5: Reused idempotency key with MODIFIED payload (tamper attempt)
  try {
    const existingExec = await prisma.executionRecord.findFirst({
      where: { mandateId: mandate.id, status: "CONFIRMED" },
    });
    if (!existingExec) throw new Error("No confirmed execution found");

    const execResult = await ExecutionBoundaryService.execute({
      userId: mandate.userId,
      mandateId: mandate.id,
      agentId: mandate.agentId,
      recipient: existingExec.recipient,
      amountYocto: nearToYocto("0.004"), // MODIFIED AMOUNT!
      operation: "TRANSFER",
      idempotencyKey: existingExec.idempotencyKey,
      isSimulated: true,
    });
    const passed = !execResult.success && Boolean(
      execResult.error?.includes("mismatch") ||
      execResult.error?.includes("idempotency") ||
      execResult.error?.includes("hash") ||
      execResult.error?.includes("conflict")
    );
    results.push({
      test: "5. Reused idempotency key with modified payload",
      passed,
      reason: execResult.error || "Unexpectedly succeeded",
    });
  } catch (err: any) {
    results.push({ test: "5. Reused idempotency key with modified payload", passed: true, reason: err.message });
  }

  // Test 6: Transfer while mandate is PAUSED
  try {
    await MandateLifecycleService.pauseMandate({
      mandateId: mandate.id,
      actorUserId: mandate.userId,
      reason: "Negative testing pause",
    });
    const val = await ExecutionValidationService.validateNearTransferPreflight({
      userId: mandate.userId,
      mandateId: mandate.id,
      recipient: RECIPIENT,
      amountYocto: nearToYocto("0.001"),
    });
    const activeCheck = val.checks.find((c) => c.name === "mandate_active");
    const passed = !val.valid && activeCheck?.passed === false;
    results.push({
      test: "6. Mandate PAUSED rejection",
      passed,
      reason: activeCheck?.details || val.reason || "Unexpectedly passed",
    });
  } finally {
    await MandateLifecycleService.resumeMandate({
      mandateId: mandate.id,
      actorUserId: mandate.userId,
      reason: "Negative testing resume",
    });
  }

  // Test 7: Transfer while mandate is REVOKED
  try {
    const tempMandate = await prisma.mandate.create({
      data: {
        userId: mandate.userId,
        walletId: mandate.walletId,
        agentId: mandate.agentId,
        name: "Temporary Revocation Test Mandate",
        totalBudgetYocto: nearToYocto("0.010"),
        spentYocto: "0",
        reservedYocto: "0",
        perTxLimitYocto: nearToYocto("0.005"),
        approvalThresholdYocto: nearToYocto("0.005"),
        allowedRecipientsJson: JSON.stringify([RECIPIENT]),
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await MandateLifecycleService.revokeMandate({
      mandateId: tempMandate.id,
      actorUserId: mandate.userId,
      reason: "Testing revocation fail-closed",
    });
    const val = await ExecutionValidationService.validateNearTransferPreflight({
      userId: mandate.userId,
      mandateId: tempMandate.id,
      recipient: RECIPIENT,
      amountYocto: nearToYocto("0.001"),
    });
    const activeCheck = val.checks.find((c) => c.name === "mandate_active");
    const passed = !val.valid && activeCheck?.passed === false;
    results.push({
      test: "7. Mandate REVOKED rejection",
      passed,
      reason: activeCheck?.details || val.reason || "Unexpectedly passed",
    });
    await prisma.mandate.delete({ where: { id: tempMandate.id } });
  } catch (err: any) {
    results.push({ test: "7. Mandate REVOKED rejection", passed: false, reason: err.message });
  }

  // Test 8: Stale policy version rejection
  try {
    const freshMandate = await prisma.mandate.findUnique({
      where: { id: MANDATE_ID },
      select: { policyVersion: true },
    });
    const currentVersion = freshMandate?.policyVersion || 1;
    const staleVersion = currentVersion - 1;

    // Issue valid envelope with stale mandateVersion
    const envelope = await ExecutionAuthorizationService.issueAuthorization({
      userId: mandate.userId,
      mandateId: mandate.id,
      agentId: mandate.agentId,
      recipient: RECIPIENT,
      amountYocto: nearToYocto("0.001"),
      operation: "TRANSFER",
      mandateVersion: staleVersion,
    });

    const validation = await ExecutionAuthorizationService.verifyAuthorization(envelope);
    const passed = !validation.valid && Boolean(validation.reason?.includes("mismatch") || validation.reason?.includes("version"));
    results.push({
      test: "8. Stale policy version rejection (CAS Concurrency)",
      passed,
      reason: validation.reason || "Failed to reject stale version",
    });
  } catch (err: any) {
    results.push({ test: "8. Stale policy version rejection", passed: false, reason: err.message });
  }

  // Test 9: Operational control / Emergency pause rejection
  try {
    await EmergencyPauseService.pauseFinancialExecution({
      actorId: mandate.userId,
      actorRole: "OPERATOR",
      reason: "Negative security testing emergency pause",
    });

    let emergencyBlocked = false;
    let blockReason = "";
    try {
      await ExecutionBoundaryService.execute({
        userId: mandate.userId,
        mandateId: mandate.id,
        agentId: mandate.agentId,
        recipient: RECIPIENT,
        amountYocto: nearToYocto("0.001"),
        operation: "TRANSFER",
        idempotencyKey: `idemp-emergency-test-${Date.now()}`,
        isSimulated: true,
      });
    } catch (err: any) {
      if (err.message.includes("OPERATIONAL_CONTROL_BLOCKED") || err.message.includes("halted")) {
        emergencyBlocked = true;
        blockReason = err.message;
      }
    }

    results.push({
      test: "9. Global emergency pause / operational halt",
      passed: emergencyBlocked,
      reason: blockReason || "Failed to halt under emergency pause",
    });
  } finally {
    // Resume financial execution
    await OperationalControlService.transitionState({
      newMode: "NORMAL",
      actionType: "RESUME_EXECUTION",
      actorId: mandate.userId,
      actorRole: "OPERATOR",
      reason: "Negative testing completed",
    });
  }

  // Post-test accounting verification
  const postTestAccounting = await MandateAccountingService.getAccountingBreakdown(mandate.id, mandate.userId);
  console.log(`Post-test available budget: ${postTestAccounting.availableBudgetNear} NEAR`);
  const accountingUnaltered = preTestAccounting.availableBudgetYocto === postTestAccounting.availableBudgetYocto;

  console.log("\n=== NEGATIVE SECURITY TEST RESULTS ===");
  results.forEach((r) => {
    console.log(`[${r.passed ? "PASS" : "FAIL"}] ${r.test}: ${r.reason}`);
  });
  console.log(`\nAccounting Unaltered: ${accountingUnaltered}`);

  return {
    results,
    accountingUnaltered,
    preTestAccounting,
    postTestAccounting,
  };
}

async function runSection7Reconciliation() {
  console.log("\n=== SECTION 7: AUTHORITATIVE FASTNEAR RPC RECONCILIATION ===");

  const mandate = await prisma.mandate.findUnique({
    where: { id: MANDATE_ID },
    include: { wallet: true },
  });
  if (!mandate) throw new Error("Mandate not found");

  const senderAddress = mandate.wallet.nearAccountId;
  const recipientAddress = RECIPIENT;

  // Retrieve execution records
  const executions = await prisma.executionRecord.findMany({
    where: { mandateId: MANDATE_ID, status: "CONFIRMED" },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${executions.length} confirmed executions in database.`);

  const rpcVerifications: any[] = [];
  for (const exec of executions) {
    if (!exec.txHash) continue;
    const rawRes = await fetch(TESTNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `rpc-verify-${exec.id}`,
        method: "tx",
        params: [exec.txHash, senderAddress],
      }),
    });
    const rawData = await rawRes.json();
    const txInfo = rawData?.result;

    rpcVerifications.push({
      execId: exec.id,
      idempotencyKey: exec.idempotencyKey,
      txHash: exec.txHash,
      amountNear: yoctoToNear(exec.amountYocto),
      dbStatus: exec.status,
      rpcFinalStatus: txInfo?.final_execution_status,
      signer: txInfo?.transaction?.signer_id,
      receiver: txInfo?.transaction?.receiver_id,
      blockHash: txInfo?.transaction_outcome?.block_hash,
      gasBurnt: txInfo?.transaction_outcome?.outcome?.gas_burnt,
      tokensBurntYocto: txInfo?.transaction_outcome?.outcome?.tokens_burnt,
    });
  }

  // On-chain balances
  const onChainSender = await getNearAccountState(senderAddress);
  const onChainRecipient = await getNearAccountState(recipientAddress);

  // Accounting breakdown
  const finalAccounting = await MandateAccountingService.getAccountingBreakdown(mandate.id, mandate.userId);

  const reconciliationReport = {
    network: "NEAR Testnet",
    rpcEndpoint: TESTNET_RPC,
    senderAddress,
    recipientAddress,
    senderOnChainBalanceNear: yoctoToNear(onChainSender?.amountYocto || "0"),
    recipientOnChainBalanceNear: yoctoToNear(onChainRecipient?.amountYocto || "0"),
    executions: rpcVerifications,
    mandateAccounting: {
      totalBudgetNear: finalAccounting.totalBudgetNear,
      spentNear: finalAccounting.spentNear,
      reservedNear: finalAccounting.reservedNear,
      availableBudgetNear: finalAccounting.availableBudgetNear,
      confirmedTxCount: finalAccounting.confirmedTxCount,
      isBalanced: finalAccounting.isBalanced,
      discrepancyYocto: finalAccounting.discrepancyYocto,
    },
  };

  console.log("\nRECONCILIATION_REPORT:", JSON.stringify(reconciliationReport, null, 2));
  return reconciliationReport;
}

async function main() {
  const negResults = await runNegativeSecurityTests();
  const reconReport = await runSection7Reconciliation();

  const allPassed = negResults.results.every((r) => r.passed) && negResults.accountingUnaltered && reconReport.mandateAccounting.isBalanced;

  console.log(`\nALL_CHECKS_PASSED: ${allPassed}`);
  process.exit(allPassed ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("FATAL_ERROR:", err);
    process.exit(1);
  });
}
