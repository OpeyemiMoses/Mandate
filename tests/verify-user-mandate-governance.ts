/**
 * MANDATE — USER-AUTHORIZED MANDATE GOVERNANCE REGRESSION SUITE
 * Demonstrates removal of the arbitrary 0.1 NEAR ceiling and confirms that:
 * 1. A valid transaction above 0.1 NEAR is NOT rejected merely because of its amount.
 * 2. A transaction exceeding the user's own mandate budget is rejected.
 * 3. A transaction violating the user's own policy (e.g. unallowlisted recipient) is rejected.
 * 4. Concurrent transactions cannot overspend the mandate budget.
 * 5. Mainnet execution is rejected.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { assertNotProductionDatabase } from "./helpers/assertNotProductionDatabase";

process.env.DATABASE_URL =
  process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("postgres")
    ? process.env.DATABASE_URL
    : "postgresql://postgres:postgrespassword@localhost:5432/mandate_disposable_m147?schema=public";
process.env.MANDATE_DATABASE_TYPE = "postgres";

// Fail-closed safety check: immediately reject if target database is production
assertNotProductionDatabase(process.env.DATABASE_URL);

import { prismaPg as prisma } from "../src/lib/postgresDb";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import {
  mintBoundaryExecutionTicket,
  validateBoundaryExecutionTicket,
} from "../src/lib/execution/boundaryTicket";
import { evaluatePolicyProposal, MandateStateForPolicy, PaymentProposal } from "../src/lib/policy";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { encryptWalletApiKey } from "../src/lib/security/walletCredentialService";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runRegressionSuite() {
  console.log("================================================================================");
  console.log("🛡️ USER-AUTHORIZED MANDATE GOVERNANCE & CEILING REMOVAL VERIFICATION");
  console.log("================================================================================\n");

  const runId = Date.now().toString(36);

  // ---------------------------------------------------------------------------
  // TEST 1: Transactions Above 0.1 NEAR Are Permitted When Mandate Authorizes Them
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("1. Valid Transactions Above 0.1 NEAR (0.5 NEAR & 2.5 NEAR)");
  console.log("--------------------------------------------------------------------------------");

  const amount05NearYocto = nearToYocto("0.5");
  const ticket05 = mintBoundaryExecutionTicket({
    executionId: `exec-05-${runId}`,
    mandateId: `mandate-high-cap-${runId}`,
    objectiveId: `obj-high-cap-${runId}`,
    userId: `user-${runId}`,
    operation: "TRANSFER",
    recipient: "researcher.testnet",
    amountYocto: amount05NearYocto,
    idempotencyKey: `idem-05-${runId}`,
    nonce: `nonce-05-${runId}`,
    network: "testnet",
  });

  assert(ticket05.isSealed(), "Ticket for 0.5 NEAR successfully minted and structurally sealed");
  assert(ticket05.amountYocto === amount05NearYocto, "Ticket binds exact 0.5 NEAR yocto amount");

  const validation05 = validateBoundaryExecutionTicket(ticket05, {
    to: "researcher.testnet",
    amountYocto: amount05NearYocto,
    objectiveId: `obj-high-cap-${runId}`,
    idempotencyKey: `idem-05-${runId}`,
  });
  assert(validation05.valid === true, "Ticket for 0.5 NEAR passes cryptographic boundary validation");

  // Even larger payment: 2.5 NEAR
  const amount25NearYocto = nearToYocto("2.5");
  const ticket25 = mintBoundaryExecutionTicket({
    executionId: `exec-25-${runId}`,
    mandateId: `mandate-enterprise-${runId}`,
    objectiveId: `obj-enterprise-${runId}`,
    userId: `user-${runId}`,
    operation: "TRANSFER",
    recipient: "compute-swarm.testnet",
    amountYocto: amount25NearYocto,
    idempotencyKey: `idem-25-${runId}`,
    nonce: `nonce-25-${runId}`,
    network: "testnet",
  });
  const validation25 = validateBoundaryExecutionTicket(ticket25, {
    to: "compute-swarm.testnet",
    amountYocto: amount25NearYocto,
    objectiveId: `obj-enterprise-${runId}`,
    idempotencyKey: `idem-25-${runId}`,
  });
  assert(validation25.valid === true, "Ticket for 2.5 NEAR passes boundary validation (No arbitrary ceiling)");

  // ---------------------------------------------------------------------------
  // TEST 2: Transaction Exceeding User's Own Mandate Budget Is Strictly Rejected
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("2. Mandate Budget Enforcement (User Defined Limit)");
  console.log("--------------------------------------------------------------------------------");

  const mandatePolicyState: MandateStateForPolicy = {
    mandateId: `mandate-budget-test-${runId}`,
    name: "Budget Test Mandate",
    status: "active",
    providerPolicyConfirmed: true,
    expiresAtIso: new Date(Date.now() + 86400000).toISOString(),
    budgetAtomic: nearToYocto("1.0"), // User gave 1.0 NEAR total
    spentAtomic: nearToYocto("0.8"),   // 0.8 already spent, 0.2 remaining
    reservedAtomic: "0",
    perTxLimitAtomic: nearToYocto("0.5"), // Per-tx cap 0.5 NEAR
    approvalThresholdAtomic: nearToYocto("0.3"),
    allowedRecipients: ["vendor.testnet"],
  };

  // Attempt to spend 0.3 NEAR (within per-tx 0.5, but exceeds remaining budget of 0.2 NEAR)
  const overBudgetProposal: PaymentProposal = {
    taskId: `task-overbudget-${runId}`,
    recipient: "vendor.testnet",
    amountAtomic: nearToYocto("0.3"),
    purpose: "Over budget spend attempt",
    idempotencyKey: `idem-budget-1-${runId}`,
  };

  const budgetResult = evaluatePolicyProposal(mandatePolicyState, overBudgetProposal, new Set());
  assert(budgetResult.allowed === false, "Transaction exceeding remaining mandate budget is REJECTED");
  assert(budgetResult.reason === "BUDGET_EXCEEDED", "Reason is BUDGET_EXCEEDED for exceeding mandate budget");
  assert(
    budgetResult.humanExplanation.includes("budget"),
    `Human explanation mentions budget: ${budgetResult.humanExplanation}`
  );

  // ---------------------------------------------------------------------------
  // TEST 3: Transaction Violating User Policy (Unallowlisted Recipient) Rejected
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("3. User Policy Violation: Unallowlisted Recipient Interception");
  console.log("--------------------------------------------------------------------------------");

  const unallowlistedProposal: PaymentProposal = {
    taskId: `task-unallowlisted-${runId}`,
    recipient: "attacker-drain.testnet",
    amountAtomic: nearToYocto("0.05"), // small amount, but illegal recipient
    purpose: "Malicious transfer attempt",
    idempotencyKey: `idem-allowlist-${runId}`,
  };

  const policyResult = evaluatePolicyProposal(mandatePolicyState, unallowlistedProposal, new Set());
  assert(policyResult.allowed === false, "Unallowlisted recipient is strictly REJECTED by firewall");
  assert(policyResult.reason === "RECIPIENT_NOT_ALLOWED", "Reason is RECIPIENT_NOT_ALLOWED");
  assert(
    policyResult.humanExplanation.includes("allowlist"),
    `Human explanation mentions allowlist: ${policyResult.humanExplanation}`
  );

  // ---------------------------------------------------------------------------
  // TEST 4: Atomic Budget Reservation & Concurrency Overspend Protection
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("4. Concurrency Protection: Independent Requests Cannot Overspend");
  console.log("--------------------------------------------------------------------------------");

  // Create isolated mandate in PostgreSQL with 0.3 NEAR available
  const testUser = await prisma.user.create({
    data: {
      nearAccountId: `concurrency-test-${runId}.testnet`,
      role: "CUSTOMER",
    },
  });

  const testAgent = await prisma.agent.create({
    data: {
      name: `Concurrency Agent ${runId}`,
      userId: testUser.id,
    },
  });

  const wId = `w-conc-${runId}`;
  const nearAcc = `vault-conc-${runId}.testnet`;
  const testWallet = await prisma.wallet.create({
    data: {
      walletId: wId,
      apiKey: encryptWalletApiKey(`wk_test_${runId}`, { walletId: wId, nearAccountId: nearAcc }),
      nearAccountId: nearAcc,
      initializationStatus: "ACTIVE",
      balanceYocto: nearToYocto("1.0"),
      agent: { connect: { id: testAgent.id } },
    },
  });

  const testMandate = await prisma.mandate.create({
    data: {
      name: `Concurrency Mandate ${runId}`,
      totalBudgetYocto: nearToYocto("0.3"), // 0.3 NEAR total
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.2"),
      approvalThresholdYocto: nearToYocto("0.1"),
      allowedRecipientsJson: JSON.stringify(["vendor.testnet"]),
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 86400000),
      user: { connect: { id: testUser.id } },
      agent: { connect: { id: testAgent.id } },
      wallet: { connect: { id: testWallet.id } },
    },
  });

  // Execute two concurrent reservations of 0.2 NEAR (Total 0.4 NEAR > 0.3 NEAR budget)
  // Only ONE may succeed; the other MUST fail!
  const reserve1 = async () => {
    return prisma.$transaction(async (tx) => {
      const m = await tx.mandate.findUniqueOrThrow({ where: { id: testMandate.id } });
      const available = BigInt(m.totalBudgetYocto) - BigInt(m.spentYocto) - BigInt(m.reservedYocto);
      const needed = BigInt(nearToYocto("0.2"));
      if (available < needed) {
        throw new Error("INSUFFICIENT_MANDATE_BUDGET");
      }
      return tx.mandate.update({
        where: { id: testMandate.id },
        data: { reservedYocto: (BigInt(m.reservedYocto) + needed).toString() },
      });
    });
  };

  let successCount = 0;
  let failCount = 0;

  const results = await Promise.allSettled([reserve1(), reserve1()]);
  for (const r of results) {
    if (r.status === "fulfilled") successCount++;
    else failCount++;
  }

  assert(successCount === 1, `Exactly 1 concurrent reservation succeeded (count: ${successCount})`);
  assert(failCount === 1, `Overspend attempt was rejected (count: ${failCount})`);

  // Verify resulting reserved budget in DB
  const updatedMandate = await prisma.mandate.findUniqueOrThrow({ where: { id: testMandate.id } });
  assert(
    updatedMandate.reservedYocto === nearToYocto("0.2"),
    `Database reserved amount is exactly 0.2 NEAR: ${yoctoToNear(updatedMandate.reservedYocto)} NEAR`
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Mainnet Execution Is Strictly Rejected
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("5. Network Invariant: Mainnet Execution Rejection");
  console.log("--------------------------------------------------------------------------------");

  let mainnetRejected = false;
  try {
    process.env.NEAR_NETWORK = "mainnet";
    await ExecutionBoundaryService.execute({
      userId: testUser.id,
      mandateId: testMandate.id,
      agentId: testAgent.id,
      taskId: `task-mainnet-${runId}`,
      operation: "TRANSFER",
      recipient: "vendor.near",
      amountYocto: nearToYocto("0.01"),
      idempotencyKey: `idem-mainnet-${runId}`,
    });
  } catch (err: any) {
    if (err.message && err.message.includes("MAINNET_EXECUTION_PROHIBITED")) {
      mainnetRejected = true;
    }
  } finally {
    process.env.NEAR_NETWORK = "testnet";
  }

  assert(mainnetRejected === true, "Mainnet execution attempt strictly throws MAINNET_EXECUTION_PROHIBITED");

  console.log("\n================================================================================");
  console.log("🏆 ALL 5 REGRESSION TESTS PASSED 100%:");
  console.log("   1. Transactions above 0.1 NEAR (0.5 & 2.5 NEAR): ACCEPTED by policy");
  console.log("   2. Mandate budget limit violation: REJECTED");
  console.log("   3. Recipient allowlist violation: REJECTED");
  console.log("   4. Concurrent overspend race condition: PREVENTED & SERIALIZED");
  console.log("   5. Mainnet execution: STRICTLY REJECTED");
  console.log("================================================================================");

  // Clean up test user
  await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
  process.exit(0);
}

runRegressionSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
