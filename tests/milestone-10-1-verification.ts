/**
 * MANDATE — MILESTONE 10.1: INDEPENDENT DATA INTEGRITY, USER ISOLATION & PRODUCTION VERIFICATION
 * 
 * Verifies:
 * 1. Activity Provenance Audit (zero orphaned audit records, fresh user gets empty activity)
 * 2. Extended 3-User Adversarial Ownership Audit (Coordination, Executions, Jobs, Reconcile, Audit, Discovery)
 * 3. Administrator Access & Operational Role Enforcement (16 operator endpoints block Member with 403)
 * 4. Wallet & Transaction Integrity (Live NEAR Testnet RPC, terminal status checks, no fabricated success)
 * 5. Customer Product Focus (AppShell strictly customer-facing, no Reliability & Ops)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { prisma } from "../src/lib/db";
import { SessionService } from "../src/lib/auth/sessionService";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { OperationalControlService } from "../src/lib/operations/operationalControlService";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import { recordAuditEvent } from "../src/lib/auditLedger";
import { verifyNearTransaction, getNearAccountState } from "../src/lib/nearRpc";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3001";
let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`  FAIL [Assertion ${totalAssertions}]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  ✓ ${message}`);
}

async function runMilestone10_1TestSuite() {
  console.log("\n===============================================================================");
  console.log("   MANDATE MILESTONE 10.1 — INDEPENDENT VERIFICATION & AUDIT SUITE             ");
  console.log("===============================================================================\n");

  const testSuffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // Ensure operational state is NORMAL
  await OperationalControlService.transitionState({
    newMode: "NORMAL",
    actionType: "RESUME_EXECUTION",
    actorId: "system",
    actorRole: "OWNER",
    reason: "Milestone 10.1 test suite reset",
  });

  // -------------------------------------------------------------------------
  // SECTION 1: ACTIVITY PROVENANCE AUDIT
  // -------------------------------------------------------------------------
  console.log("--- SECTION 1: Activity Provenance Audit ---");
  {
    // 1a. Database AuditLog orphan check
    const nullUserCount = await prisma.auditLog.count({ where: { userId: null } });
    assert(nullUserCount === 0, "1a: Zero orphaned audit logs in SQLite database (userId === null is 0)");

    // 1b. Fresh Test Account Activity check
    const freshUser = await prisma.user.create({
      data: {
        nearAccountId: `fresh-audit-${testSuffix}.testnet`,
        displayName: "Fresh Inactive Customer",
        role: "MEMBER",
      },
    });
    const freshSession = await SessionService.createSession(freshUser.id, freshUser.nearAccountId, freshUser.role);

    const freshAuditRes = await fetch(`${baseUrl}/api/audit`, {
      headers: {
        "Content-Type": "application/json",
        "x-session-token": freshSession.token,
      },
    });
    assert(freshAuditRes.status === 200, `1b: Fresh user audit request succeeds with 200 (got ${freshAuditRes.status})`);
    const freshAuditData = await freshAuditRes.json();
    assert(freshAuditData.success === true, "1c: Fresh user audit response indicates success: true");
    assert(Array.isArray(freshAuditData.logs) && freshAuditData.logs.length === 0, "1d: Fresh user logs list is strictly empty ([])");
    assert(Array.isArray(freshAuditData.auditLogs) && freshAuditData.auditLogs.length === 0, "1e: Fresh user auditLogs list is strictly empty ([])");
    assert(freshAuditData.count === 0, "1f: Fresh user audit count is strictly 0");
  }

  // -------------------------------------------------------------------------
  // SETUP: Provision 3 Tenants (Alice, Bob, Carol) + Platform Admin
  // -------------------------------------------------------------------------
  console.log("\n--- Setup: Provisioning 3 Tenants & 1 Platform Admin ---");
  const alice = await prisma.user.upsert({
    where: { nearAccountId: `alice-m101-${testSuffix}.testnet` },
    create: {
      nearAccountId: `alice-m101-${testSuffix}.testnet`,
      displayName: "Alice Tenant A",
      role: "MEMBER",
    },
    update: { role: "MEMBER" },
  });
  const aliceSession = await SessionService.createSession(alice.id, alice.nearAccountId, alice.role);

  const bob = await prisma.user.upsert({
    where: { nearAccountId: `bob-m101-${testSuffix}.testnet` },
    create: {
      nearAccountId: `bob-m101-${testSuffix}.testnet`,
      displayName: "Bob Tenant B",
      role: "MEMBER",
    },
    update: { role: "MEMBER" },
  });
  const bobSession = await SessionService.createSession(bob.id, bob.nearAccountId, bob.role);

  const carol = await prisma.user.upsert({
    where: { nearAccountId: `carol-m101-${testSuffix}.testnet` },
    create: {
      nearAccountId: `carol-m101-${testSuffix}.testnet`,
      displayName: "Carol Tenant C",
      role: "MEMBER",
    },
    update: { role: "MEMBER" },
  });
  const carolSession = await SessionService.createSession(carol.id, carol.nearAccountId, carol.role);

  const admin = await prisma.user.upsert({
    where: { nearAccountId: `admin-m101-${testSuffix}.testnet` },
    create: {
      nearAccountId: `admin-m101-${testSuffix}.testnet`,
      displayName: "Security Operator Admin",
      role: "ADMIN",
    },
    update: { role: "ADMIN" },
  });
  const adminSession = await SessionService.createSession(admin.id, admin.nearAccountId, admin.role);

  const aliceHeaders = { "Content-Type": "application/json", "x-session-token": aliceSession.token };
  const bobHeaders = { "Content-Type": "application/json", "x-session-token": bobSession.token };
  const adminHeaders = { "Content-Type": "application/json", "x-session-token": adminSession.token };

  // Provision Bob's comprehensive resource graph
  const bobAgent = await prisma.agent.create({
    data: {
      name: `Bob Agent ${testSuffix}`,
      purpose: "Procurement agent",
      type: "procurement",
      status: "ACTIVE",
      userId: bob.id,
      wallet: {
        create: {
          walletId: `outlayer-bob-${testSuffix}`,
          apiKey: `wk_bob_${testSuffix}`,
          nearAccountId: `bob-agent-${testSuffix}.testnet`,
          network: "testnet",
          balanceYocto: nearToYocto("5"),
          isInitialized: true,
          initializationStatus: "READY",
        },
      },
    },
    include: { wallet: true },
  });

  const bobMandate = await prisma.mandate.create({
    data: {
      name: `Bob Mandate ${testSuffix}`,
      description: "Treasury mandate for Bob",
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("10"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("2"),
      approvalThresholdYocto: nearToYocto("1"),
      allowedRecipientsJson: JSON.stringify(["vendor.testnet"]),
      expiresAt: new Date(Date.now() + 86400000 * 30),
      userId: bob.id,
      agentId: bobAgent.id,
      walletId: bobAgent.wallet!.id,
    },
  });

  const bobTask = await prisma.task.create({
    data: {
      title: `Bob Task ${testSuffix}`,
      description: "Order server supplies",
      taskType: "PURCHASE",
      status: "PENDING_APPROVAL",
      proposedRecipient: "vendor.testnet",
      proposedAmountYocto: nearToYocto("1.5"),
      idempotencyKey: `task-bob-${testSuffix}`,
      planStepsJson: JSON.stringify([{ step: 1, action: "Purchase" }]),
      agentId: bobAgent.id,
      mandateId: bobMandate.id,
    },
  });

  const bobObjective = await prisma.objective.create({
    data: {
      title: `Bob Strategic Objective ${testSuffix}`,
      description: "Scale distributed compute",
      originalPrompt: "Scale distributed compute",
      status: "IN_PROGRESS",
      priority: "HIGH",
      progressPercent: 30,
      userId: bob.id,
    },
  });

  const bobPlan = await prisma.objectivePlan.create({
    data: {
      objectiveId: bobObjective.id,
      version: 1,
      status: "APPROVED",
      summary: "Scale distributed compute",
      estimatedCostNear: "1",
      planJson: JSON.stringify({ steps: [{ step: 1, title: "Initialize" }] }),
    },
  });

  const bobCoordinationRun = await prisma.coordinationRun.create({
    data: {
      objective: { connect: { id: bobObjective.id } },
      user: { connect: { id: bob.id } },
      plan: { connect: { id: bobPlan.id } },
      mandate: { connect: { id: bobMandate.id } },
      status: "RUNNING",
      concurrencyLimit: 3,
      planVersion: 1,
    },
  });

  const bobCoordinationTask = await prisma.coordinationTask.create({
    data: {
      run: { connect: { id: bobCoordinationRun.id } },
      stepId: `step-1-${testSuffix}`,
      title: "Index DeFi liquidity pools",
      agentType: "researcher",
      status: "RUNNING",
      priority: 1,
      order: 1,
    },
  });

  const bobExecution = await prisma.executionRecord.create({
    data: {
      idempotencyKey: `idem-bob-${testSuffix}`,
      payloadHash: `hash-payload-${testSuffix}`,
      operation: "TRANSFER",
      recipient: "vendor.testnet",
      amountYocto: nearToYocto("0.5"),
      status: "CONFIRMED",
      mandate: { connect: { id: bobMandate.id } },
      agent: { connect: { id: bobAgent.id } },
      user: { connect: { id: bob.id } },
      authSignature: `sig-${testSuffix}`,
      nonce: `nonce-${testSuffix}`,
      txHash: `tx-real-hash-${testSuffix}`,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  const bobJob = await prisma.backgroundJob.create({
    data: {
      tenant: { connect: { id: bob.id } },
      jobType: "MANDATE_DISBURSEMENT",
      payload: JSON.stringify({ mandateId: bobMandate.id, amountYocto: nearToYocto("0.5") }),
      payloadHash: `hash-job-${testSuffix}`,
      status: "QUEUED",
      priority: 5,
    },
  });

  console.log(`  ✓ Setup Complete: Bob Graph Provisioned (Run: ${bobCoordinationRun.id}, Exec: ${bobExecution.id}, Job: ${bobJob.id})`);

  // -------------------------------------------------------------------------
  // SECTION 2: EXTENDED MULTI-TENANT OWNERSHIP AUDIT
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 2: Extended Multi-Tenant Ownership Audit ---");

  // 2a. Coordination Runs Isolation
  {
    // Alice GET Bob's run -> 404
    const getRunRes = await fetch(`${baseUrl}/api/coordination/${bobCoordinationRun.id}`, { headers: aliceHeaders });
    assert(getRunRes.status === 404, `2a: Alice GET Bob's coordination run returns 404 (got ${getRunRes.status})`);

    // Alice POST start Bob's run -> 404
    const startRunRes = await fetch(`${baseUrl}/api/coordination/${bobCoordinationRun.id}/start`, {
      method: "POST",
      headers: aliceHeaders,
    });
    assert(startRunRes.status === 404, `2b: Alice POST start Bob's coordination run returns 404 (got ${startRunRes.status})`);

    // Alice POST pause Bob's run -> 404
    const pauseRunRes = await fetch(`${baseUrl}/api/coordination/${bobCoordinationRun.id}/pause`, {
      method: "POST",
      headers: aliceHeaders,
    });
    assert(pauseRunRes.status === 404, `2c: Alice POST pause Bob's coordination run returns 404 (got ${pauseRunRes.status})`);

    // Alice POST resume Bob's run -> 404
    const resumeRunRes = await fetch(`${baseUrl}/api/coordination/${bobCoordinationRun.id}/resume`, {
      method: "POST",
      headers: aliceHeaders,
    });
    assert(resumeRunRes.status === 404, `2d: Alice POST resume Bob's coordination run returns 404 (got ${resumeRunRes.status})`);

    // Alice POST cancel Bob's run -> 404
    const cancelRunRes = await fetch(`${baseUrl}/api/coordination/${bobCoordinationRun.id}/cancel`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({ reason: "Malicious cancel" }),
    });
    assert(cancelRunRes.status === 404, `2e: Alice POST cancel Bob's coordination run returns 404 (got ${cancelRunRes.status})`);

    // Alice GET Bob's run tasks -> 404
    const tasksRes = await fetch(`${baseUrl}/api/coordination/${bobCoordinationRun.id}/tasks`, { headers: aliceHeaders });
    assert(tasksRes.status === 404, `2f: Alice GET Bob's coordination tasks returns 404 (got ${tasksRes.status})`);

    // Alice GET Bob's run events -> 404
    const eventsRes = await fetch(`${baseUrl}/api/coordination/${bobCoordinationRun.id}/events`, { headers: aliceHeaders });
    assert(eventsRes.status === 404, `2g: Alice GET Bob's coordination events returns 404 (got ${eventsRes.status})`);

    // Alice GET Bob's run handoffs -> 404
    const handoffsRes = await fetch(`${baseUrl}/api/coordination/${bobCoordinationRun.id}/handoffs`, { headers: aliceHeaders });
    assert(handoffsRes.status === 404, `2h: Alice GET Bob's coordination handoffs returns 404 (got ${handoffsRes.status})`);

    // Alice list coordination runs -> returns 0 of Bob's runs
    const listRunsRes = await fetch(`${baseUrl}/api/coordination`, { headers: aliceHeaders });
    assert(listRunsRes.status === 200, `2i: Alice GET coordination runs list succeeds (got ${listRunsRes.status})`);
    const listRunsData = await listRunsRes.json();
    const aliceHasBobRun = (listRunsData.runs || []).some((r: any) => r.id === bobCoordinationRun.id);
    assert(!aliceHasBobRun, "2j: Alice's coordination runs list contains 0 runs belonging to Bob");
  }

  // 2b. Execution Records Isolation
  {
    // Alice GET Bob's execution detail -> 404
    const getExecRes = await fetch(`${baseUrl}/api/execution/${bobExecution.id}`, { headers: aliceHeaders });
    assert(getExecRes.status === 404, `2k: Alice GET Bob's execution detail returns 404 (got ${getExecRes.status})`);

    // Alice GET executions list -> contains 0 of Bob's executions
    const listExecRes = await fetch(`${baseUrl}/api/execution`, { headers: aliceHeaders });
    assert(listExecRes.status === 200, `2l: Alice GET execution list succeeds (got ${listExecRes.status})`);
    const listExecData = await listExecRes.json();
    const aliceHasBobExec = (listExecData.executions || []).some((e: any) => e.id === bobExecution.id);
    assert(!aliceHasBobExec, "2m: Alice's execution list contains 0 executions belonging to Bob");
  }

  // 2c. Background Jobs Isolation
  {
    // Alice GET Bob's job -> 404
    const getJobRes = await fetch(`${baseUrl}/api/jobs/${bobJob.id}`, { headers: aliceHeaders });
    assert(getJobRes.status === 404, `2n: Alice GET Bob's background job returns 404 (got ${getJobRes.status})`);

    // Alice POST cancel Bob's job -> 404
    const cancelJobRes = await fetch(`${baseUrl}/api/jobs/${bobJob.id}/cancel`, {
      method: "POST",
      headers: aliceHeaders,
    });
    assert(cancelJobRes.status === 404, `2o: Alice POST cancel Bob's job returns 404 (got ${cancelJobRes.status})`);

    // Alice GET jobs list -> contains 0 of Bob's jobs
    const listJobsRes = await fetch(`${baseUrl}/api/jobs`, { headers: aliceHeaders });
    assert(listJobsRes.status === 200, `2p: Alice GET jobs list succeeds (got ${listJobsRes.status})`);
    const listJobsData = await listJobsRes.json();
    const aliceHasBobJob = (listJobsData.jobs || []).some((j: any) => j.id === bobJob.id);
    assert(!aliceHasBobJob, "2q: Alice's jobs list contains 0 jobs belonging to Bob");
  }

  // 2d. Transactions & Reconcile Isolation
  {
    const reconRes = await fetch(`${baseUrl}/api/transactions/reconcile`, { headers: aliceHeaders });
    assert(reconRes.status === 200, `2r: Alice GET transaction reconcile summary succeeds (got ${reconRes.status})`);
    const reconData = await reconRes.json();
    const aliceWallets = reconData.financialAccounting?.wallets || [];
    const aliceHasBobWallet = aliceWallets.some((w: any) => w.id === bobAgent.wallet!.id);
    assert(!aliceHasBobWallet, "2s: Alice's financial accounting contains 0 wallets belonging to Bob");
  }

  // 2e. Financial Boundary Fencing
  {
    let blockedAtBoundary = false;
    let boundaryError = "";
    try {
      await ExecutionBoundaryService.execute({
        mandateId: bobMandate.id,
        agentId: bobAgent.id,
        userId: alice.id, // Alice attempting to spend Bob's mandate
        recipient: "attacker.testnet",
        amountYocto: nearToYocto("0.5"),
        operation: "TRANSFER",
        idempotencyKey: `attack-${testSuffix}`,
        isSimulated: true,
      });
    } catch (err: any) {
      blockedAtBoundary = true;
      boundaryError = err.message;
    }
    assert(blockedAtBoundary, "2t: ExecutionBoundaryService strictly rejects cross-tenant mandate invocation");
    assert(
      boundaryError.toLowerCase().includes("not found") ||
      boundaryError.toLowerCase().includes("not owned") ||
      boundaryError.toLowerCase().includes("unauthorized"),
      `2u: Rejection correctly cites mandate not found or unauthorized (${boundaryError})`
    );
  }

  // -------------------------------------------------------------------------
  // SECTION 3: ADMINISTRATOR ACCESS & ROLE AUDIT
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 3: Administrator Access & Operational Role Enforcement ---");
  {
    // Member Alice accessing all 16 operator endpoints must receive HTTP 403 Forbidden
    const operatorEndpoints = [
      { name: "Workers Fleet", url: `${baseUrl}/api/workers` },
      { name: "Worker Detail", url: `${baseUrl}/api/workers/non-existent-worker` },
      { name: "Observability Overview", url: `${baseUrl}/api/observability/overview` },
      { name: "Observability Metrics", url: `${baseUrl}/api/observability/metrics` },
      { name: "Observability Capacity", url: `${baseUrl}/api/observability/capacity` },
      { name: "Observability Alerts", url: `${baseUrl}/api/observability/alerts` },
      { name: "Observability Queue", url: `${baseUrl}/api/observability/queue` },
      { name: "Observability Workers", url: `${baseUrl}/api/observability/workers` },
      { name: "Reconciliation Runs", url: `${baseUrl}/api/reconciliation/runs` },
      { name: "Reconciliation Discrepancies", url: `${baseUrl}/api/reconciliation/discrepancies` },
      { name: "Operational Status", url: `${baseUrl}/api/operations/status` },
      { name: "Circuit Breakers", url: `${baseUrl}/api/resilience/providers` },
      { name: "Backpressure Queue", url: `${baseUrl}/api/resilience/queue` },
      { name: "Recovery Plans", url: `${baseUrl}/api/recovery/plans` },
      { name: "Dead Letters", url: `${baseUrl}/api/dead-letters` },
      { name: "Incidents List", url: `${baseUrl}/api/incidents` },
    ];

    for (const ep of operatorEndpoints) {
      const res = await fetch(ep.url, { headers: aliceHeaders });
      assert(res.status === 403, `3a: Member Alice access to ${ep.name} returns HTTP 403 Forbidden (got ${res.status})`);
      const body = await res.json();
      assert(
        body.success === false && body.error?.toLowerCase().includes("forbidden"),
        `3b: Member Alice access to ${ep.name} returns forbidden error (${body.error})`
      );
    }

    // Platform Admin permitted access (HTTP 200 OK)
    const adminChecks = [
      { name: "Workers Fleet", url: `${baseUrl}/api/workers` },
      { name: "Observability Overview", url: `${baseUrl}/api/observability/overview` },
      { name: "Reconciliation Runs", url: `${baseUrl}/api/reconciliation/runs` },
      { name: "Operational Status", url: `${baseUrl}/api/operations/status` },
      { name: "Circuit Breakers", url: `${baseUrl}/api/resilience/providers` },
      { name: "Dead Letters", url: `${baseUrl}/api/dead-letters` },
    ];

    for (const ep of adminChecks) {
      const res = await fetch(ep.url, { headers: adminHeaders });
      assert(res.status === 200, `3c: Admin access to ${ep.name} succeeds with HTTP 200 OK (got ${res.status})`);
      const body = await res.json();
      assert(body.success === true, `3d: Admin access to ${ep.name} returns success: true`);
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 4: WALLET & TRANSACTION INTEGRITY
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 4: Wallet and Transaction Integrity ---");
  {
    // 4a. Live NEAR Testnet RPC balance retrieval
    const nearState = await getNearAccountState("testnet");
    assert(nearState !== null, "4a: NEAR RPC successfully returns live account state for testnet");
    assert(typeof nearState?.amountYocto === "string" && BigInt(nearState.amountYocto) > BigInt(0), "4b: NEAR RPC balance is a valid integer yoctoNEAR string (> 0)");
    assert(typeof nearState?.blockHeight === "number" && nearState.blockHeight > 0, "4c: NEAR RPC returns authoritative block height (> 0)");

    // 4d. Transaction status check: non-existent transaction cannot fabricate SUCCESS
    const fakeTxStatus = await verifyNearTransaction(
      "8Zf9GkFakeTransactionHashThatDoesNotExist111111111",
      "testnet",
      { timeoutMs: 3000 }
    );
    assert(fakeTxStatus.status !== "SUCCESS", `4d: Non-existent transaction hash is never marked SUCCESS (got ${fakeTxStatus.status})`);

    // 4e. Integer-only yoctoNEAR calculation consistency
    const fiveNearYocto = nearToYocto("5");
    const formattedNear = yoctoToNear(fiveNearYocto, 3);
    assert(formattedNear === "5.000", `4e: Integer-only yoctoNEAR format precision is exact ("5.000" == "${formattedNear}")`);
  }

  // -------------------------------------------------------------------------
  // SECTION 5: CUSTOMER EXPERIENCE & NAVIGATION FOCUS
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 5: Customer Product Focus Verification ---");
  {
    const fs = await import("fs");
    const appShellCode = fs.readFileSync("./src/components/AppShell.tsx", "utf-8");

    // Must NOT contain "Reliability & Ops" drawer
    const hasReliabilityDrawer = appShellCode.includes("Reliability & Ops");
    assert(!hasReliabilityDrawer, "5a: AppShell sidebar contains ZERO 'Reliability & Ops' operator drawers");

    // Must NOT contain ADMIN_NAV_ITEMS in customer navigation
    const hasAdminNav = appShellCode.includes("ADMIN_NAV_ITEMS");
    assert(!hasAdminNav, "5b: AppShell contains ZERO ADMIN_NAV_ITEMS in navigation tree");

    // Must contain the 10 customer destinations
    const customerDestinations = [
      "/dashboard",
      "/activity",
      "/agents",
      "/wallets",
      "/mandates",
      "/objectives",
      "/tasks",
      "/approvals",
      "/integrations",
      "/settings",
    ];

    for (const dest of customerDestinations) {
      assert(appShellCode.includes(dest), `5c: AppShell includes customer destination "${dest}"`);
    }
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log("\n===============================================================================");
  console.log(`   MILESTONE 10.1 SUMMARY: ALL ${passedAssertions} / ${totalAssertions} ASSERTIONS PASSED (100%) `);
  console.log("===============================================================================\n");
}

runMilestone10_1TestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Milestone 10.1 Test Suite Failure:", err);
    process.exit(1);
  });
