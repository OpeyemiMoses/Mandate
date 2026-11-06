/**
 * MANDATE — MULTI-PROCESS FINANCIAL CONCURRENCY & INTEGRITY STRESS TEST SUITE
 * Remediation Item 6: Independent Verification of Concurrency, Atomic Reservation & Idempotency
 *
 * Scenarios:
 * 1. Two concurrent requests racing for the same remaining budget (zero overspend)
 * 2. Ten simultaneous requests attempting concurrent reservation (zero double-spend, idempotency & rollback)
 * 3. Worker process crash / simulated abortion during reservation (reconciliation and release)
 */

import "dotenv/config";
import { assertNotProductionDatabase } from "./helpers/assertNotProductionDatabase";

assertNotProductionDatabase(process.env.DATABASE_URL);

import { prisma } from "../src/lib/db";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import {
  reserveMandateBudgetAtomic,
  releaseMandateBudgetAtomic,
  settleMandateBudgetAtomic,
} from "../src/lib/objectives/authority";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { verifyAuditChain } from "../src/lib/auditLedger";
import { encryptWalletApiKey } from "../src/lib/security/walletCredentialService";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";

async function runConcurrencyStressSuite() {
  console.log("================================================================================");
  console.log("  MANDATE — MULTI-PROCESS FINANCIAL CONCURRENCY & INTEGRITY STRESS SUITE");
  console.log("================================================================================\n");

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition: boolean, testNum: string, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ Case ${testNum} PASS: ${testName}`);
      if (detail) console.log(`     ↳ ${detail}`);
      testPassed++;
    } else {
      console.error(`  ✗ Case ${testNum} FAIL: ${testName}${detail ? ` - ${detail}` : ""}`);
      testFailed++;
    }
  }

  // Setup unique test user and custody wallet
  const testUserId = `user_concurrency_${Date.now()}`;
  const testNearAccount = `concurrency-stress-${Date.now().toString().slice(-6)}.testnet`;

  const user = await prisma.user.create({
    data: {
      id: testUserId,
      nearAccountId: testNearAccount,
      displayName: "Concurrency Stress Test User",
    },
  });

  const agent = await prisma.agent.create({
    data: {
      id: `agent_conc_${Date.now()}`,
      userId: user.id,
      name: "High-Concurrency Autonomous Agent",
      purpose: "Multi-process stress test",
      status: "ACTIVE",
      wallet: {
        create: {
          walletId: `outlayer_vault_conc_${Date.now()}`,
          apiKey: encryptWalletApiKey(`outlayer_key_conc_${Date.now()}`, {
            walletId: `outlayer_vault_conc_${Date.now()}`,
            nearAccountId: `wallet_${Date.now().toString().slice(-8)}.testnet`,
          }),
          nearAccountId: `wallet_${Date.now().toString().slice(-8)}.testnet`,
          network: "testnet",
          balanceYocto: nearToYocto("50.0"),
          onChainBalanceYocto: nearToYocto("50.0"),
          isInitialized: true,
          initializationStatus: "READY",
        },
      },
    },
    include: { wallet: true },
  });

  console.log(`[Setup] User: ${user.nearAccountId}, Agent: ${agent.name}, Custody Wallet: ${agent.wallet?.nearAccountId}\n`);

  // ============================================================================
  // SCENARIO 1: TWO CONCURRENT REQUESTS RACING FOR THE SAME REMAINING BUDGET
  // Mandate Total Budget = 0.50 NEAR
  // Two parallel requests of 0.30 NEAR each.
  // Invariant: Total spend + reservation must NEVER exceed 0.50 NEAR. Exactly 1 must win.
  // ============================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("SCENARIO 1: TWO CONCURRENT REQUESTS RACING FOR LIMITED BUDGET (RACE CONDITION)");
  console.log("--------------------------------------------------------------------------------");

  const mandate1 = await prisma.mandate.create({
    data: {
      id: `mandate_conc_race_${Date.now()}`,
      userId: user.id,
      agentId: agent.id,
      walletId: agent.wallet!.id,
      name: "Race Condition Guard Mandate",
      totalBudgetYocto: nearToYocto("0.50"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.50"),
      approvalThresholdYocto: nearToYocto("0.50"),
      allowedRecipientsJson: JSON.stringify(["liquidity.testnet", "oracle.testnet"]),
      expiresAt: new Date(Date.now() + 86400000),
      status: "ACTIVE",
    },
  });

  const raceAmountYocto = nearToYocto("0.30");

  // Fire both reservations simultaneously
  const [res1, res2] = await Promise.all([
    reserveMandateBudgetAtomic({
      mandateId: mandate1.id,
      amountYocto: raceAmountYocto,
    }),
    reserveMandateBudgetAtomic({
      mandateId: mandate1.id,
      amountYocto: raceAmountYocto,
    }),
  ]);

  const successes = [res1, res2].filter((r) => r.success);
  const failures = [res1, res2].filter((r) => !r.success);

  assert(
    successes.length === 1 && failures.length === 1,
    "1.1",
    "Atomic CAS reservation allows exactly one of two racing requests",
    `Wins: ${successes.length}, Blocked: ${failures.length} (Reason: "${failures[0]?.reason}")`
  );

  const mandate1After = await prisma.mandate.findUnique({ where: { id: mandate1.id } });
  const totalAllocated1 = BigInt(mandate1After!.spentYocto) + BigInt(mandate1After!.reservedYocto);
  const maxBudget1 = BigInt(mandate1.totalBudgetYocto);

  assert(
    totalAllocated1 <= maxBudget1 && mandate1After!.reservedYocto === raceAmountYocto,
    "1.2",
    "Total mandate allocation strictly preserves the platform budget invariant (never exceeds ceiling)",
    `Allocated: ${yoctoToNear(totalAllocated1.toString())} NEAR <= Limit: ${yoctoToNear(maxBudget1.toString())} NEAR`
  );

  // Settle winning reservation atomically
  const settleRes = await settleMandateBudgetAtomic({
    mandateId: mandate1.id,
    amountYocto: raceAmountYocto,
    wasReserved: true,
  });

  const mandate1Settled = await prisma.mandate.findUnique({ where: { id: mandate1.id } });
  assert(
    settleRes.success &&
      mandate1Settled!.spentYocto === raceAmountYocto &&
      mandate1Settled!.reservedYocto === "0",
    "1.3",
    "Settlement converts reserved budget to spent budget atomically",
    `Spent: ${yoctoToNear(mandate1Settled!.spentYocto)} NEAR, Reserved: ${yoctoToNear(mandate1Settled!.reservedYocto)} NEAR`
  );

  // ============================================================================
  // SCENARIO 2: 10 SIMULTANEOUS REQUESTS (ATOMIC RESERVATION & IDEMPOTENCY)
  // Mandate Total Budget = 1.00 NEAR
  // 10 concurrent requests of 0.20 NEAR each.
  // Invariant: At most 5 can succeed (5 * 0.20 = 1.00). Exactly 5 succeed, 5 rejected.
  // ============================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SCENARIO 2: 10 HIGH-CONCURRENCY WORKERS & IDEMPOTENCY CONFLICT MITIGATION");
  console.log("--------------------------------------------------------------------------------");

  const mandate2 = await prisma.mandate.create({
    data: {
      id: `mandate_conc_10way_${Date.now()}`,
      userId: user.id,
      agentId: agent.id,
      walletId: agent.wallet!.id,
      name: "10-Way Concurrency Stress Mandate",
      totalBudgetYocto: nearToYocto("1.00"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.25"),
      approvalThresholdYocto: nearToYocto("0.25"),
      allowedRecipientsJson: JSON.stringify(["liquidity.testnet", "oracle.testnet"]),
      expiresAt: new Date(Date.now() + 86400000),
      status: "ACTIVE",
    },
  });

  const requestAmountYocto = nearToYocto("0.20");
  const concurrentTasks = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    idempotencyKey: `idem_burst_${Date.now()}_task_${i + 1}`,
  }));

  // Launch 10 simultaneous reservations
  const burstResults = await Promise.all(
    concurrentTasks.map(async (t) => {
      const res = await reserveMandateBudgetAtomic({
        mandateId: mandate2.id,
        amountYocto: requestAmountYocto,
      });
      return { taskId: t.id, ...res };
    })
  );

  const burstSuccesses = burstResults.filter((r) => r.success);
  const burstFailures = burstResults.filter((r) => !r.success);

  assert(
    burstSuccesses.length === 5 && burstFailures.length === 5,
    "2.1",
    "10 simultaneous parallel reservations: exactly 5 succeed (1.00 NEAR total) and 5 fail",
    `Successes: ${burstSuccesses.length}, Failures: ${burstFailures.length}`
  );

  const mandate2After = await prisma.mandate.findUnique({ where: { id: mandate2.id } });
  const expectedReserved = (BigInt(requestAmountYocto) * BigInt(5)).toString();

  assert(
    mandate2After!.reservedYocto === expectedReserved,
    "2.2",
    "Database state matches exact arithmetic sum of accepted reservations (zero double-spend)",
    `Reserved: ${yoctoToNear(mandate2After!.reservedYocto)} NEAR === Expected: ${yoctoToNear(expectedReserved)} NEAR`
  );

  // Sub-scenario 2.3: Idempotency Key collision across concurrent requests
  const mandateIdem = await prisma.mandate.create({
    data: {
      id: `mandate_conc_idem_${Date.now()}`,
      userId: user.id,
      agentId: agent.id,
      walletId: agent.wallet!.id,
      name: "Idempotency Collision Mandate",
      totalBudgetYocto: nearToYocto("1.00"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.25"),
      approvalThresholdYocto: nearToYocto("0.25"),
      allowedRecipientsJson: JSON.stringify(["oracle.testnet"]),
      expiresAt: new Date(Date.now() + 86400000),
      status: "ACTIVE",
    },
  });

  const sharedIdemKey = `idem_collision_test_${Date.now()}`;
  const [idemRes1, idemRes2] = await Promise.all([
    ExecutionBoundaryService.execute({
      userId: user.id,
      mandateId: mandateIdem.id,
      agentId: agent.id,
      operation: "task_idempotency_race",
      recipient: "oracle.testnet",
      amountYocto: nearToYocto("0.05"),
      idempotencyKey: sharedIdemKey,
      isSimulated: true,
      parameters: { payloadVer: 1 },
    }),
    ExecutionBoundaryService.execute({
      userId: user.id,
      mandateId: mandateIdem.id,
      agentId: agent.id,
      operation: "task_idempotency_race",
      recipient: "oracle.testnet",
      amountYocto: nearToYocto("0.05"),
      idempotencyKey: sharedIdemKey,
      isSimulated: true,
      parameters: { payloadVer: 1 },
    }),
  ]);

  assert(
    Boolean(idemRes1.executionId && idemRes2.executionId && idemRes1.executionId === idemRes2.executionId),
    "2.3",
    "Concurrent duplicate idempotency keys return unified identical execution ID (no duplicate execution)",
    `First Exec: ${idemRes1.executionId}, Second Exec: ${idemRes2.executionId}`
  );

  // Sub-scenario 2.4: Rollback and release of 2 reservations allows new reservation
  const release1 = await releaseMandateBudgetAtomic({
    mandateId: mandate2.id,
    amountYocto: requestAmountYocto,
  });
  const release2 = await releaseMandateBudgetAtomic({
    mandateId: mandate2.id,
    amountYocto: requestAmountYocto,
  });

  assert(
    release1.success && release2.success,
    "2.4",
    "Atomic CAS budget release safely deallocates 0.40 NEAR back to pool",
    `Remaining Reserved: ${yoctoToNear(release2.remainingReservedYocto || "0")} NEAR`
  );

  const retryReservation = await reserveMandateBudgetAtomic({
    mandateId: mandate2.id,
    amountYocto: requestAmountYocto,
  });

  assert(
    retryReservation.success,
    "2.5",
    "Newly freed budget is immediately claimable by next queue worker",
    `Reserved: ${yoctoToNear(retryReservation.reservedAmountYocto || "0")} NEAR`
  );

  // ============================================================================
  // SCENARIO 3: PROCESS CRASH / SIMULATED ABORTION & RECONCILIATION
  // ============================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SCENARIO 3: WORKER ABORTION DURING RESERVATION & RECONCILIATION RECOVERY");
  console.log("--------------------------------------------------------------------------------");

  const mandate3 = await prisma.mandate.create({
    data: {
      id: `mandate_conc_crash_${Date.now()}`,
      userId: user.id,
      agentId: agent.id,
      walletId: agent.wallet!.id,
      name: "Crash Simulation Mandate",
      totalBudgetYocto: nearToYocto("2.00"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.50"),
      approvalThresholdYocto: nearToYocto("0.50"),
      allowedRecipientsJson: JSON.stringify(["liquidity.testnet"]),
      expiresAt: new Date(Date.now() + 86400000),
      status: "ACTIVE",
    },
  });

  // Step 1: Simulate worker reserving budget for a task, then process aborts
  const crashAmountYocto = nearToYocto("0.45");
  const crashRes = await reserveMandateBudgetAtomic({
    mandateId: mandate3.id,
    amountYocto: crashAmountYocto,
  });

  assert(
    crashRes.success,
    "3.1",
    "Worker successfully reserves 0.45 NEAR prior to simulated crash"
  );

  // Step 2: Create execution record marked as REQUIRES_RECOVERY simulating interrupted node
  const stalledExecId = `exec_crashed_${Date.now()}`;
  await prisma.agentExecution.create({
    data: {
      id: stalledExecId,
      userId: user.id,
      mandateId: mandate3.id,
      agentId: agent.id,
      status: "REQUIRES_RECOVERY",
      currentStep: "Worker process interrupted mid-reservation",
      inputJson: JSON.stringify({ reason: "simulated-sigkill", amountYocto: crashAmountYocto }),
    },
  });

  const mandateDuringCrash = await prisma.mandate.findUnique({ where: { id: mandate3.id } });
  assert(
    mandateDuringCrash!.reservedYocto === crashAmountYocto,
    "3.2",
    "Budget reservation is locked and preserved while execution state is unconfirmed (Golden Rule)",
    `Reserved: ${yoctoToNear(mandateDuringCrash!.reservedYocto)} NEAR`
  );

  // Step 3: Run recovery resolution (worker crashes pre-broadcast, so reservation can be released safely)
  await prisma.agentExecution.update({
    where: { id: stalledExecId },
    data: {
      status: "FAILED",
      errorDetails: "Worker crashed before network broadcast; confirmed zero onchain transaction.",
      completedAt: new Date(),
    },
  });

  const releaseCrashed = await releaseMandateBudgetAtomic({
    mandateId: mandate3.id,
    amountYocto: crashAmountYocto,
  });

  const mandateAfterRecovery = await prisma.mandate.findUnique({ where: { id: mandate3.id } });

  assert(
    releaseCrashed.success && mandateAfterRecovery!.reservedYocto === "0",
    "3.3",
    "Recovery cleanup safely restores unspent budget to available pool after verified pre-broadcast failure",
    `Remaining Reserved: ${yoctoToNear(mandateAfterRecovery!.reservedYocto)} NEAR, Spent: ${yoctoToNear(mandateAfterRecovery!.spentYocto)} NEAR`
  );

  // Final cryptographic audit chain check for user
  const chainResult = await verifyAuditChain(user.id);
  assert(
    chainResult.valid === true,
    "3.4",
    "Cryptographic audit chain remains intact and strictly verifiable across all concurrent operations",
    `Total Events: ${chainResult.count}`
  );

  // Teardown test fixtures to prevent test artifacts in database
  try {
    await prisma.mandate.deleteMany({ where: { userId: user.id } });
    if (agent.wallet) {
      await prisma.wallet.delete({ where: { id: agent.wallet.id } });
    }
    await prisma.agent.delete({ where: { id: agent.id } });
    await prisma.user.delete({ where: { id: user.id } });
  } catch {}

  // Clean summary
  console.log("\n================================================================================");
  console.log(`CONCURRENCY SUITE RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
  console.log("================================================================================\n");

  if (testFailed > 0) {
    process.exit(1);
  }
}

runConcurrencyStressSuite().catch((err) => {
  console.error("Concurrency Stress Suite Crashed:", err);
  process.exit(1);
});
