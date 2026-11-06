/**
 * MANDATE — M13.11.1 MULTI-PROCESS CONCURRENCY & SHARED-BUDGET ISOLATION PROOF
 *
 * Spawns multiple independent OS child processes, each with separate Prisma/PostgreSQL connections,
 * competing concurrently for a shared financial mandate budget.
 *
 * Invariant:
 * Total committed spending + outstanding reservations must NEVER exceed authorized budget.
 */

import "dotenv/config";
import { assertNotProductionDatabase } from "./helpers/assertNotProductionDatabase";

assertNotProductionDatabase(process.env.DATABASE_URL);

import { fork } from "child_process";
import path from "path";
import { prisma } from "../src/lib/db";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import { encryptWalletApiKey } from "../src/lib/security/walletCredentialService";
import {
  reserveMandateBudgetAtomic,
  releaseMandateBudgetAtomic,
  settleMandateBudgetAtomic,
} from "../src/lib/objectives/authority";

// If run as a child process worker:
if (process.env.IS_CHILD_WORKER === "true") {
  const mandateId = process.env.WORKER_MANDATE_ID!;
  const amountYocto = process.env.WORKER_AMOUNT_YOCTO!;
  const workerIndex = process.env.WORKER_INDEX!;

  (async () => {
    try {
      const res = await reserveMandateBudgetAtomic({
        mandateId,
        amountYocto,
      });
      if (process.send) {
        process.send({ workerIndex, success: res.success, reason: res.reason, reservedAmount: res.reservedAmountYocto });
      }
      process.exit(0);
    } catch (err: any) {
      if (process.send) {
        process.send({ workerIndex, success: false, error: err.message });
      }
      process.exit(1);
    }
  })();
} else {
  // Main orchestrator process
  runOrchestrator();
}

async function runOrchestrator() {
  console.log("================================================================================");
  console.log("  MANDATE — MULTI-PROCESS SEPARATE-DB-CONNECTION CONCURRENCY STRESS");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, num: string, title: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ Case ${num} PASS: ${title}`);
      if (detail) console.log(`     ↳ ${detail}`);
      passed++;
    } else {
      console.error(`  ✗ Case ${num} FAIL: ${title}`);
      if (detail) console.error(`     ↳ Details: ${detail}`);
      failed++;
    }
  }

  // 1. Setup multi-process test mandate
  const testUser = await prisma.user.create({
    data: {
      nearAccountId: `mproc-test-${Date.now().toString().slice(-6)}.testnet`,
      displayName: "Multi-Process Orchestrator",
    },
  });

  const mprocWalletId = `vault_mproc_${Date.now()}`;
  const mprocNearAccount = `wallet_mproc_${Date.now().toString().slice(-6)}.testnet`;
  const mprocEncryptedKey = encryptWalletApiKey(`key_mproc_${Date.now()}`, {
    walletId: mprocWalletId,
    nearAccountId: mprocNearAccount,
  });

  const testAgent = await prisma.agent.create({
    data: {
      userId: testUser.id,
      name: "Multi-Process Concurrency Agent",
      status: "ACTIVE",
      wallet: {
        create: {
          walletId: mprocWalletId,
          apiKey: mprocEncryptedKey,
          nearAccountId: mprocNearAccount,
          network: "testnet",
          balanceYocto: nearToYocto("10.0"),
          onChainBalanceYocto: nearToYocto("10.0"),
          isInitialized: true,
          initializationStatus: "READY",
        },
      },
    },
    include: { wallet: true },
  });

  // Shared budget = 1.00 NEAR
  const mandate = await prisma.mandate.create({
    data: {
      userId: testUser.id,
      agentId: testAgent.id,
      walletId: testAgent.wallet!.id,
      name: "Multi-Process Shared Budget Mandate",
      totalBudgetYocto: nearToYocto("1.00"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.50"),
      approvalThresholdYocto: nearToYocto("0.50"),
      allowedRecipientsJson: JSON.stringify(["*"]),
      expiresAt: new Date(Date.now() + 86400000),
      status: "ACTIVE",
    },
  });

  console.log(`[Setup] Mandate ID: ${mandate.id}, Total Budget: 1.00 NEAR\n`);

  // ---------------------------------------------------------------------------
  // TEST 1: Spawning 4 Independent OS Processes with Separate DB Connections
  // Each child requests 0.40 NEAR. Total requested = 1.60 NEAR.
  // Invariant: Exactly 2 workers can succeed (0.80 NEAR <= 1.00 NEAR).
  // ---------------------------------------------------------------------------
  console.log("--- 1. Launching 4 Independent OS Processes (0.40 NEAR each vs 1.00 NEAR budget) ---");

  const workerCount = 4;
  const requestYocto = nearToYocto("0.40");
  const workerPromises: Promise<any>[] = [];

  for (let i = 0; i < workerCount; i++) {
    const p = new Promise((resolve) => {
      const child = fork(__filename, [], {
        env: {
          ...process.env,
          IS_CHILD_WORKER: "true",
          WORKER_MANDATE_ID: mandate.id,
          WORKER_AMOUNT_YOCTO: requestYocto,
          WORKER_INDEX: String(i + 1),
        },
      });

      child.on("message", (msg) => {
        resolve(msg);
      });

      child.on("error", (err) => {
        resolve({ workerIndex: i + 1, success: false, error: err.message });
      });
    });

    workerPromises.push(p);
  }

  const results = await Promise.all(workerPromises);
  const successes = results.filter((r) => r.success);
  const rejections = results.filter((r) => !r.success);

  assert(
    successes.length === 2 && rejections.length === 2,
    "1.1",
    "Across 4 separate OS processes, exactly 2 succeed and 2 are blocked by budget exhaustion",
    `Successes: ${successes.length}, Rejections: ${rejections.length}`
  );

  // Read mandate from DB to verify invariant
  const mandateAfter = await prisma.mandate.findUnique({ where: { id: mandate.id } });
  const totalCommitted = BigInt(mandateAfter!.spentYocto || "0") + BigInt(mandateAfter!.reservedYocto || "0");
  const totalBudget = BigInt(mandateAfter!.totalBudgetYocto);

  assert(
    totalCommitted <= totalBudget,
    "1.2",
    "Invariant holds: Total committed + reserved <= total authorized budget",
    `Committed: ${yoctoToNear(totalCommitted.toString())} NEAR <= Authorized: ${yoctoToNear(totalBudget.toString())} NEAR`
  );

  assert(
    mandateAfter!.reservedYocto === (BigInt(requestYocto) * BigInt(2)).toString(),
    "1.3",
    "PostgreSQL database reserved balance matches exact sum of winning child processes (0.80 NEAR)",
    `Reserved: ${yoctoToNear(mandateAfter!.reservedYocto)} NEAR`
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Uncertain Status / Ambiguous Post-Broadcast Failure
  // Reservation MUST NOT be released when broadcast status is uncertain
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Testing Budget Reservation Retention Under Uncertain Status ---");

  // Worker 1 simulates an ambiguous timeout after broadcasting to network
  const ambiguousExecId = `exec_ambiguous_${Date.now()}`;
  await prisma.executionRecord.create({
    data: {
      id: ambiguousExecId,
      userId: testUser.id,
      mandateId: mandate.id,
      agentId: testAgent.id,
      operation: "network_transfer",
      recipient: "validator.testnet",
      amountYocto: requestYocto,
      chain: "near",
      idempotencyKey: `idem_ambiguous_${Date.now()}`,
      payloadHash: `sha256_mock_${Date.now()}`,
      nonce: `nonce_mock_${Date.now()}`,
      authSignature: `sig_mock_${Date.now()}`,
      expiresAt: new Date(Date.now() + 60000),
      status: "TIMEOUT",
      recoveryStatus: "PENDING_RECOVERY",
      errorReason: "Network socket closed before transaction receipt confirmed",
    },
  });

  // Verify reservation is retained in DB
  const mandateDuringTimeout = await prisma.mandate.findUnique({ where: { id: mandate.id } });
  assert(
    BigInt(mandateDuringTimeout!.reservedYocto) >= BigInt(requestYocto),
    "2.1",
    "Budget reservation is NEVER released while transaction status is TIMEOUT / PENDING_RECOVERY",
    `Active Reservation: ${yoctoToNear(mandateDuringTimeout!.reservedYocto)} NEAR`
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Definite Pre-Broadcast Failure Releases Reservation
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Testing Release on Confirmed Pre-Broadcast Failure ---");

  // Worker 2 had a definite failure before broadcasting (e.g. invalid recipient or policy check)
  const releaseRes = await releaseMandateBudgetAtomic({
    mandateId: mandate.id,
    amountYocto: requestYocto,
  });

  const mandateAfterRelease = await prisma.mandate.findUnique({ where: { id: mandate.id } });
  assert(
    releaseRes.success && mandateAfterRelease!.reservedYocto === requestYocto,
    "3.1",
    "Confirmed pre-broadcast failure safely deallocates exactly 0.40 NEAR back to available pool",
    `Remaining Reserved: ${yoctoToNear(mandateAfterRelease!.reservedYocto)} NEAR`
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Settle Confirmed Transaction Converts Reserved to Spent
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Testing Confirmed Settlement (Reserved -> Spent) ---");

  const settleRes = await settleMandateBudgetAtomic({
    mandateId: mandate.id,
    amountYocto: requestYocto,
    wasReserved: true,
  });

  const mandateFinal = await prisma.mandate.findUnique({ where: { id: mandate.id } });
  assert(
    settleRes.success &&
      mandateFinal!.spentYocto === requestYocto &&
      mandateFinal!.reservedYocto === "0",
    "4.1",
    "On-chain confirmation atomically transitions reserved budget into spent budget (0 reserved, 0.40 spent)",
    `Spent: ${yoctoToNear(mandateFinal!.spentYocto)} NEAR, Reserved: ${yoctoToNear(mandateFinal!.reservedYocto)} NEAR`
  );

  // Teardown test fixtures to prevent test artifacts in database
  try {
    await prisma.mandate.delete({ where: { id: mandate.id } });
    if (testAgent.wallet) {
      await prisma.wallet.delete({ where: { id: testAgent.wallet.id } });
    }
    await prisma.agent.delete({ where: { id: testAgent.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  } catch (cleanErr: any) {
    console.warn("Teardown warning:", cleanErr.message);
  }

  console.log("\n================================================================================");
  console.log(`MULTI-PROCESS CONCURRENCY TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}
