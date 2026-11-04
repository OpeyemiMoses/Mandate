/**
 * MANDATE — MILESTONE 13.1: OBJECTIVE LIFECYCLE & EXECUTION FOUNDATION TEST SUITE
 * 
 * Verifies all 10 core assertions required by Milestone 13.1 Phase 7:
 * 1. Valid Lifecycle Transitions (DRAFT -> ACTIVE -> PLANNING -> READY -> RUNNING -> COMPLETED, plus branches)
 * 2. Invalid Lifecycle Transitions (rejected with deterministic INVALID_TRANSITION errors)
 * 3. Concurrent Transition Attempts (CAS atomic version check conflict detection)
 * 4. Stale Objective Version Rejection
 * 5. Cross-Tenant Object Access (strictly masked with OBJECTIVE_NOT_FOUND / 404)
 * 6. Unauthorized Agent Operations (agents forbidden from user-only transitions & cancellation)
 * 7. Expired & Revoked Mandates Binding Rejection (fail-closed)
 * 8. Objective / Mandate Constraint Mismatches (budget ceilings, no mandate budget expansion)
 * 9. Cancellation During Active Work (transitions cleanly to CANCELLED)
 * 10. Audit Event Integrity (ObjectiveEvent + SHA-256 cryptographic AuditLog)
 * 11. Regression Check (Preserves M1-M12 accounting invariants & operational mode)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { prisma } from "../src/lib/db";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import { ObjectiveLifecycleService } from "../src/lib/objectives/lifecycleService";
import { ObjectiveStatus } from "../src/lib/objectives/types";
import { MandateLifecycleService } from "../src/lib/mandate/lifecycleService";
import { MandateAccountingService } from "../src/lib/mandate/accountingService";
import { OperationalControlService } from "../src/lib/operations/operationalControlService";

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    totalPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    totalFailed++;
  }
}

async function runTestSuite() {
  console.log("=================================================================");
  console.log("   MANDATE — MILESTONE 13.1 OBJECTIVE LIFECYCLE VERIFICATION     ");
  console.log("=================================================================\n");

  // Setup test users & active mandate
  const testUserA = await prisma.user.upsert({
    where: { nearAccountId: "m13-tenant-a.testnet" },
    update: {},
    create: {
      nearAccountId: "m13-tenant-a.testnet",
      email: "tenant-a@mandate.test",
      role: "CUSTOMER",
    },
  });

  const testUserB = await prisma.user.upsert({
    where: { nearAccountId: "m13-tenant-b.testnet" },
    update: {},
    create: {
      nearAccountId: "m13-tenant-b.testnet",
      email: "tenant-b@mandate.test",
      role: "CUSTOMER",
    },
  });

  const testAgent = await prisma.agent.upsert({
    where: { id: "m13-test-agent" },
    update: {},
    create: {
      id: "m13-test-agent",
      userId: testUserA.id,
      name: "Milestone 13 Test Agent",
      status: "ACTIVE",
    },
  });

  const testWallet = await prisma.wallet.upsert({
    where: { id: "m13-test-wallet" },
    update: {},
    create: {
      id: "m13-test-wallet",
      walletId: "m13-test-wallet",
      apiKey: "wk_test_m13_key",
      agentId: testAgent.id,
      nearAccountId: "m13-agent-wallet.testnet",
      balanceYocto: nearToYocto("1.0"),
    },
  });

  const activeMandate = await prisma.mandate.create({
    data: {
      userId: testUserA.id,
      walletId: testWallet.id,
      agentId: testAgent.id,
      name: "Milestone 13.1 Test Mandate",
      totalBudgetYocto: nearToYocto("0.050"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.010"),
      approvalThresholdYocto: nearToYocto("0.010"),
      allowedRecipientsJson: JSON.stringify(["0x479253b82eb63eb36f140ecabf0237cc338084e7"]),
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 86400000), // 24h in future
    },
  });

  console.log("--- 1. VALID LIFECYCLE TRANSITIONS ---");
  // Create an objective in DRAFT state
  const obj1 = await prisma.objective.create({
    data: {
      userId: testUserA.id,
      mandateId: activeMandate.id,
      title: "Test Objective 1",
      originalPrompt: "Procure services within budget",
      status: "DRAFT",
      version: 1,
      planningStatus: "UNPLANNED",
      executionStatus: "NOT_STARTED",
      constraintsJson: JSON.stringify({ maxBudgetYocto: nearToYocto("0.020") }),
    },
  });

  // DRAFT -> ACTIVE
  const actRes = await ObjectiveLifecycleService.activateObjective({
    objectiveId: obj1.id,
    actorUserId: testUserA.id,
    reason: "Owner activated obj1",
  });
  assert(actRes.newStatus === "ACTIVE" && actRes.version === 2, "1a: DRAFT -> ACTIVE successful with version increment");

  // ACTIVE -> PLANNING
  const planRes = await ObjectiveLifecycleService.transitionStatus({
    objectiveId: obj1.id,
    targetStatus: "PLANNING",
    actorId: testAgent.id,
    actorRole: "AGENT",
    isAgent: true,
    reason: "Agent started planning",
  });
  assert(planRes.newStatus === "PLANNING" && planRes.version === 3, "1b: ACTIVE -> PLANNING successful with version increment");

  // PLANNING -> READY
  const readyRes = await ObjectiveLifecycleService.transitionStatus({
    objectiveId: obj1.id,
    targetStatus: "READY",
    actorId: testAgent.id,
    actorRole: "AGENT",
    isAgent: true,
    reason: "Plan verified and ready",
  });
  assert(readyRes.newStatus === "READY" && readyRes.version === 4, "1c: PLANNING -> READY successful");

  // READY -> RUNNING
  const runRes = await ObjectiveLifecycleService.transitionStatus({
    objectiveId: obj1.id,
    targetStatus: "RUNNING",
    actorId: testAgent.id,
    actorRole: "AGENT",
    isAgent: true,
    reason: "Tasks dispatched",
  });
  assert(runRes.newStatus === "RUNNING" && runRes.version === 5, "1d: READY -> RUNNING successful");

  // RUNNING -> COMPLETED
  const compRes = await ObjectiveLifecycleService.transitionStatus({
    objectiveId: obj1.id,
    targetStatus: "COMPLETED",
    actorId: testUserA.id,
    actorRole: "USER",
    reason: "All success criteria verified",
  });
  assert(compRes.newStatus === "COMPLETED" && compRes.version === 6, "1e: RUNNING -> COMPLETED successful (Terminal)");

  // Branch test: PAUSED and RESUMED
  const obj2 = await prisma.objective.create({
    data: {
      userId: testUserA.id,
      mandateId: activeMandate.id,
      title: "Test Objective 2",
      originalPrompt: "Pause and resume test",
      status: "ACTIVE",
      version: 1,
    },
  });
  const pauseRes = await ObjectiveLifecycleService.pauseObjective({
    objectiveId: obj2.id,
    actorId: testUserA.id,
    actorRole: "USER",
    reason: "Testing pause",
  });
  assert(pauseRes.newStatus === "PAUSED", "1f: ACTIVE -> PAUSED successful");

  const resumeRes = await ObjectiveLifecycleService.resumeObjective({
    objectiveId: obj2.id,
    actorId: testUserA.id,
    actorRole: "USER",
    targetStatus: "ACTIVE",
    reason: "Testing resume",
  });
  assert(resumeRes.newStatus === "ACTIVE", "1g: PAUSED -> ACTIVE resume successful");

  // Branch test: REQUIRES_INTERVENTION
  const obj3 = await prisma.objective.create({
    data: {
      userId: testUserA.id,
      mandateId: activeMandate.id,
      title: "Test Objective 3",
      originalPrompt: "Intervention test",
      status: "RUNNING",
      version: 1,
    },
  });
  const intervRes = await ObjectiveLifecycleService.transitionStatus({
    objectiveId: obj3.id,
    targetStatus: "REQUIRES_INTERVENTION",
    actorId: testAgent.id,
    actorRole: "AGENT",
    isAgent: true,
    reason: "Policy threshold exceeded",
  });
  assert(intervRes.newStatus === "REQUIRES_INTERVENTION", "1h: RUNNING -> REQUIRES_INTERVENTION successful");

  const resolveRes = await ObjectiveLifecycleService.transitionStatus({
    objectiveId: obj3.id,
    targetStatus: "RUNNING",
    actorId: testUserA.id,
    actorRole: "USER",
    reason: "User resolved policy exception",
  });
  assert(resolveRes.newStatus === "RUNNING", "1i: REQUIRES_INTERVENTION -> RUNNING resolution successful");

  console.log("\n--- 2. INVALID LIFECYCLE TRANSITIONS ---");
  // DRAFT -> RUNNING (illegal shortcut)
  const objDraft = await prisma.objective.create({
    data: {
      userId: testUserA.id,
      title: "Illegal Transition Test",
      originalPrompt: "Testing invalid transitions",
      status: "DRAFT",
      version: 1,
    },
  });

  let draftToRunBlocked = false;
  try {
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId: objDraft.id,
      targetStatus: "RUNNING",
      actorId: testUserA.id,
      actorRole: "USER",
    });
  } catch (e: any) {
    if (e.message.includes("INVALID_TRANSITION")) draftToRunBlocked = true;
  }
  assert(draftToRunBlocked, "2a: DRAFT -> RUNNING illegal transition strictly rejected");

  // DRAFT -> COMPLETED (illegal shortcut)
  let draftToCompBlocked = false;
  try {
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId: objDraft.id,
      targetStatus: "COMPLETED",
      actorId: testUserA.id,
      actorRole: "USER",
    });
  } catch (e: any) {
    if (e.message.includes("INVALID_TRANSITION")) draftToCompBlocked = true;
  }
  assert(draftToCompBlocked, "2b: DRAFT -> COMPLETED illegal transition strictly rejected");

  // Terminal state mutation: COMPLETED -> ACTIVE
  let compToActiveBlocked = false;
  try {
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId: obj1.id, // obj1 is COMPLETED
      targetStatus: "ACTIVE",
      actorId: testUserA.id,
      actorRole: "USER",
    });
  } catch (e: any) {
    if (e.message.includes("INVALID_TRANSITION")) compToActiveBlocked = true;
  }
  assert(compToActiveBlocked, "2c: COMPLETED -> ACTIVE terminal state mutation strictly rejected");

  // READY -> DRAFT (illegal backward transition)
  const objReady = await prisma.objective.create({
    data: {
      userId: testUserA.id,
      title: "Ready Obj",
      originalPrompt: "test",
      status: "READY",
      version: 1,
    },
  });
  let readyToDraftBlocked = false;
  try {
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId: objReady.id,
      targetStatus: "DRAFT",
      actorId: testUserA.id,
      actorRole: "USER",
    });
  } catch (e: any) {
    if (e.message.includes("INVALID_TRANSITION")) readyToDraftBlocked = true;
  }
  assert(readyToDraftBlocked, "2d: READY -> DRAFT illegal backward transition rejected");

  console.log("\n--- 3. CONCURRENT TRANSITION ATTEMPTS (CAS OPTIMISTIC LOCKING) ---");
  const objConcurrent = await prisma.objective.create({
    data: {
      userId: testUserA.id,
      title: "Concurrent Test Obj",
      originalPrompt: "test concurrency",
      status: "ACTIVE",
      version: 1,
    },
  });

  // Attempt two concurrent transitions starting with version 1
  const promise1 = ObjectiveLifecycleService.transitionStatus({
    objectiveId: objConcurrent.id,
    targetStatus: "PLANNING",
    actorId: testUserA.id,
    actorRole: "USER",
    expectedVersion: 1,
    reason: "Concurrent attempt 1",
  });

  const promise2 = ObjectiveLifecycleService.transitionStatus({
    objectiveId: objConcurrent.id,
    targetStatus: "PAUSED",
    actorId: testUserA.id,
    actorRole: "USER",
    expectedVersion: 1,
    reason: "Concurrent attempt 2",
  });

  const settled = await Promise.allSettled([promise1, promise2]);
  const succeeded = settled.filter((s) => s.status === "fulfilled");
  const rejected = settled.filter((s) => s.status === "rejected");

  assert(succeeded.length === 1 && rejected.length === 1, "3a: Exactly one concurrent update succeeded, second failed");
  const rejectReason = (rejected[0] as PromiseRejectedResult).reason?.message;
  assert(rejectReason.includes("CONCURRENCY_CONFLICT"), "3b: Concurrent failure threw CONCURRENCY_CONFLICT");

  console.log("\n--- 4. STALE OBJECTIVE VERSION REJECTION ---");
  let staleRejected = false;
  try {
    // Current version is 2 after the previous successful update
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId: objConcurrent.id,
      targetStatus: "CANCELLED",
      actorId: testUserA.id,
      actorRole: "USER",
      expectedVersion: 1, // STALE VERSION!
    });
  } catch (e: any) {
    if (e.message.includes("CONCURRENCY_CONFLICT") && e.message.includes("version mismatch")) {
      staleRejected = true;
    }
  }
  assert(staleRejected, "4a: Update with stale expectedVersion strictly rejected fail-closed");

  console.log("\n--- 5. CROSS-TENANT ACCESS MASKING (HTTP 404) ---");
  let crossTenantGetBlocked = false;
  try {
    // Tenant B attempts to retrieve Tenant A's objective
    await ObjectiveLifecycleService.getObjectiveForUser(obj1.id, testUserB.id);
  } catch (e: any) {
    if (e.message.includes("OBJECTIVE_NOT_FOUND")) crossTenantGetBlocked = true;
  }
  assert(crossTenantGetBlocked, "5a: Cross-tenant objective retrieval masked with OBJECTIVE_NOT_FOUND (404)");

  let crossTenantTransitionBlocked = false;
  try {
    // Tenant B attempts to transition Tenant A's objective
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId: obj1.id,
      targetStatus: "CANCELLED",
      actorId: testUserB.id,
      actorRole: "USER",
    });
  } catch (e: any) {
    if (e.message.includes("OBJECTIVE_NOT_FOUND")) crossTenantTransitionBlocked = true;
  }
  assert(crossTenantTransitionBlocked, "5b: Cross-tenant objective transition attempt masked with OBJECTIVE_NOT_FOUND (404)");

  console.log("\n--- 6. UNAUTHORIZED AGENT OPERATIONS ---");
  const objAgentTest = await prisma.objective.create({
    data: {
      userId: testUserA.id,
      title: "Agent Boundary Test",
      originalPrompt: "Agent boundary testing",
      status: "DRAFT",
      version: 1,
    },
  });

  // Agent attempts DRAFT -> ACTIVE (User-only)
  let agentActivateBlocked = false;
  try {
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId: objAgentTest.id,
      targetStatus: "ACTIVE",
      actorId: testAgent.id,
      actorRole: "AGENT",
      isAgent: true,
      reason: "Agent rogue activation attempt",
    });
  } catch (e: any) {
    if (e.message.includes("AGENT_ACTION_FORBIDDEN")) agentActivateBlocked = true;
  }
  assert(agentActivateBlocked, "6a: Agent cannot override user-only DRAFT -> ACTIVE activation");

  // Agent attempts CANCEL (User-only)
  let agentCancelBlocked = false;
  try {
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId: objAgentTest.id,
      targetStatus: "CANCELLED",
      actorId: testAgent.id,
      actorRole: "AGENT",
      isAgent: true,
      reason: "Agent rogue cancel attempt",
    });
  } catch (e: any) {
    if (e.message.includes("AGENT_ACTION_FORBIDDEN")) agentCancelBlocked = true;
  }
  assert(agentCancelBlocked, "6b: Agent cannot cancel objective (user-only command)");

  console.log("\n--- 7. EXPIRED & REVOKED MANDATES BINDING REJECTION ---");
  // 7a. Expired Mandate
  const expiredMandate = await prisma.mandate.create({
    data: {
      userId: testUserA.id,
      walletId: testWallet.id,
      agentId: testAgent.id,
      name: "Expired Mandate",
      totalBudgetYocto: nearToYocto("0.050"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.010"),
      approvalThresholdYocto: nearToYocto("0.010"),
      allowedRecipientsJson: JSON.stringify(["0x479253b82eb63eb36f140ecabf0237cc338084e7"]),
      status: "EXPIRED",
      expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
    },
  });

  const objExpired = await prisma.objective.create({
    data: {
      userId: testUserA.id,
      mandateId: expiredMandate.id,
      title: "Expired Mandate Obj",
      originalPrompt: "test",
      status: "DRAFT",
      version: 1,
    },
  });

  let expiredBlocked = false;
  try {
    await ObjectiveLifecycleService.activateObjective({
      objectiveId: objExpired.id,
      actorUserId: testUserA.id,
    });
  } catch (e: any) {
    if (e.message.includes("MANDATE_AUTHORITY_INVALID") && e.message.toLowerCase().includes("expired")) {
      expiredBlocked = true;
    }
  }
  assert(expiredBlocked, "7a: Activating objective with EXPIRED mandate strictly rejected fail-closed");

  // 7b. Revoked Mandate
  const revokedMandate = await prisma.mandate.create({
    data: {
      userId: testUserA.id,
      walletId: testWallet.id,
      agentId: testAgent.id,
      name: "Revoked Mandate",
      totalBudgetYocto: nearToYocto("0.050"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.010"),
      approvalThresholdYocto: nearToYocto("0.010"),
      allowedRecipientsJson: JSON.stringify(["0x479253b82eb63eb36f140ecabf0237cc338084e7"]),
      status: "REVOKED",
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  const objRevoked = await prisma.objective.create({
    data: {
      userId: testUserA.id,
      mandateId: revokedMandate.id,
      title: "Revoked Mandate Obj",
      originalPrompt: "test",
      status: "DRAFT",
      version: 1,
    },
  });

  let revokedBlocked = false;
  try {
    await ObjectiveLifecycleService.activateObjective({
      objectiveId: objRevoked.id,
      actorUserId: testUserA.id,
    });
  } catch (e: any) {
    if (e.message.includes("MANDATE_AUTHORITY_INVALID") && e.message.toLowerCase().includes("revoked")) {
      revokedBlocked = true;
    }
  }
  assert(revokedBlocked, "7b: Activating objective with REVOKED mandate strictly rejected fail-closed");

  console.log("\n--- 8. OBJECTIVE / MANDATE CONSTRAINT MISMATCHES ---");
  // Attempt to activate objective requesting budget exceeding available mandate budget
  const objExceedBudget = await prisma.objective.create({
    data: {
      userId: testUserA.id,
      mandateId: activeMandate.id, // Active mandate has 0.050 NEAR budget
      title: "Exceed Budget Obj",
      originalPrompt: "test budget excess",
      status: "DRAFT",
      version: 1,
      constraintsJson: JSON.stringify({ maxBudgetYocto: nearToYocto("0.100") }), // 0.100 NEAR > 0.050 NEAR!
    },
  });

  let budgetMismatchBlocked = false;
  try {
    await ObjectiveLifecycleService.activateObjective({
      objectiveId: objExceedBudget.id,
      actorUserId: testUserA.id,
    });
  } catch (e: any) {
    if (e.message.includes("MANDATE_AUTHORITY_INVALID") && e.message.includes("exceeds available mandate budget")) {
      budgetMismatchBlocked = true;
    }
  }
  assert(budgetMismatchBlocked, "8a: Objective requesting budget exceeding mandate capacity strictly rejected");

  console.log("\n--- 9. CANCELLATION DURING ACTIVE WORK ---");
  const objActiveWork = await prisma.objective.create({
    data: {
      userId: testUserA.id,
      mandateId: activeMandate.id,
      title: "In-Flight Work Cancel Test",
      originalPrompt: "test cancellation",
      status: "RUNNING",
      version: 1,
      executionStatus: "RUNNING",
    },
  });

  const cancelRes = await ObjectiveLifecycleService.cancelObjective({
    objectiveId: objActiveWork.id,
    actorId: testUserA.id,
    actorRole: "USER",
    reason: "Owner aborted in-flight objective",
  });

  const postCancelObj = await prisma.objective.findUniqueOrThrow({ where: { id: objActiveWork.id } });
  assert(cancelRes.newStatus === "CANCELLED", "9a: Objective cancelled from RUNNING state");
  assert(postCancelObj.executionStatus === "CANCELLED", "9b: Execution status updated to CANCELLED");

  console.log("\n--- 10. AUDIT EVENT INTEGRITY ---");
  const events = await prisma.objectiveEvent.findMany({
    where: { objectiveId: obj1.id },
    orderBy: { timestamp: "asc" },
  });

  assert(events.length >= 5, `10a: Recorded ${events.length} chronological ObjectiveEvent records for obj1`);
  const hasActor = events.every((e) => e.actorId && e.actorRole);
  assert(hasActor, "10b: Every event records actorId and actorRole");
  const hasTransition = events.some((e) => e.fromStatus === "DRAFT" && e.toStatus === "ACTIVE");
  assert(hasTransition, "10c: Explicit fromStatus and toStatus tracked on event records");

  const auditLogs = await prisma.auditLog.findMany({
    where: { userId: testUserA.id, eventType: { startsWith: "OBJECTIVE_" } },
  });
  assert(auditLogs.length >= 5, `10d: Dual-dispatched ${auditLogs.length} events to cryptographic audit ledger`);

  console.log("\n--- 11. REGRESSION: M1–M12 INVARIANTS & OPERATIONAL STATE ---");
  // Verify Milestone 12.1 campaign mandate accounting is unaffected
  const m12MandateId = "cmw19ayhj0001sbyxd9uizeha";
  const m12Mandate = await prisma.mandate.findUnique({ where: { id: m12MandateId } });
  if (m12Mandate) {
    const breakdown = await MandateAccountingService.getAccountingBreakdown(m12MandateId, m12Mandate.userId);
    assert(breakdown.isBalanced, "11a: Milestone 12.1 campaign mandate accounting remains 100% BALANCED");
    assert(breakdown.spentNear === "0.003", `11b: Milestone 12.1 confirmed spent intact: ${breakdown.spentNear} NEAR`);
    assert(breakdown.availableBudgetNear === "0.007", `11c: Milestone 12.1 available budget intact: ${breakdown.availableBudgetNear} NEAR`);
  }

  const currentOpMode = await OperationalControlService.getCurrentMode();
  assert(currentOpMode === "NORMAL", `11d: Platform operational mode remains NORMAL (${currentOpMode})`);

  console.log("\n=================================================================");
  console.log(`   TOTAL TESTS: ${totalPassed + totalFailed} | PASSED: ${totalPassed} | FAILED: ${totalFailed}`);
  console.log("=================================================================\n");

  // Cleanup test artifacts
  await prisma.objective.deleteMany({
    where: {
      id: { in: [obj1.id, obj2.id, obj3.id, objDraft.id, objConcurrent.id, objAgentTest.id, objExpired.id, objRevoked.id, objExceedBudget.id, objActiveWork.id, objReady.id] },
    },
  });
  await prisma.mandate.deleteMany({
    where: { id: { in: [activeMandate.id, expiredMandate.id, revokedMandate.id] } },
  });
  await prisma.wallet.deleteMany({ where: { id: testWallet.id } });
  await prisma.agent.deleteMany({ where: { id: testAgent.id } });
  await prisma.user.deleteMany({ where: { id: { in: [testUserA.id, testUserB.id] } } });

  return totalFailed === 0;
}

runTestSuite()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((err) => {
    console.error("FATAL_TEST_ERROR:", err);
    process.exit(1);
  });
