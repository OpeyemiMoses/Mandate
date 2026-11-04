/**
 * MANDATE — Milestone 10 Multi-User Adversarial Test Suite
 * Customer Experience Simplification, Complete User Scoping & IDOR Prevention
 * 
 * Verifies strict tenant isolation across 3 distinct users (Alice, Bob, Carol)
 * executing all 15 required adversarial security scenarios.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { prisma } from "../src/lib/db";
import { SessionService } from "../src/lib/auth";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { CredentialVault, CURRENT_VAULT_VERSION } from "../src/lib/integrations/credentialVault";
import { OperationalControlService } from "../src/lib/operations/operationalControlService";
import { nearToYocto } from "../src/lib/yocto";
import { recordAuditEvent } from "../src/lib/auditLedger";

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3001";

let passedAssertions = 0;
let totalAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
  console.log(`  ✓ ${message}`);
}

async function runMilestone10TestSuite() {
  console.log("===============================================================================");
  console.log("   MANDATE MILESTONE 10 — MULTI-USER ADVERSARIAL TEST SUITE                   ");
  console.log("===============================================================================\n");

  const testSuffix = Date.now().toString().slice(-6);

  // Reset operational control plane to NORMAL mode for testing
  await OperationalControlService.transitionState({
    newMode: "NORMAL",
    actionType: "RESUME_EXECUTION",
    actorId: "system",
    actorRole: "OWNER",
    reason: "Milestone 10 test suite reset",
  });

  // -------------------------------------------------------------------------
  // Setup: Provision 3 Distinct Tenants (Alice, Bob, Carol)
  // -------------------------------------------------------------------------
  console.log("--- Setup: Provisioning 3 Tenants (Alice, Bob, Carol) ---");

  // User A (Alice - MEMBER)
  const alice = await prisma.user.upsert({
    where: { nearAccountId: `alice-m10-${testSuffix}.testnet` },
    create: {
      nearAccountId: `alice-m10-${testSuffix}.testnet`,
      displayName: "Alice Tenant A",
      role: "MEMBER",
    },
    update: { role: "MEMBER" },
  });
  const aliceSession = await SessionService.createSession(alice.id, alice.nearAccountId, alice.role);

  // User B (Bob - MEMBER)
  const bob = await prisma.user.upsert({
    where: { nearAccountId: `bob-m10-${testSuffix}.testnet` },
    create: {
      nearAccountId: `bob-m10-${testSuffix}.testnet`,
      displayName: "Bob Tenant B",
      role: "MEMBER",
    },
    update: { role: "MEMBER" },
  });
  const bobSession = await SessionService.createSession(bob.id, bob.nearAccountId, bob.role);

  // User C (Carol - MEMBER)
  const carol = await prisma.user.upsert({
    where: { nearAccountId: `carol-m10-${testSuffix}.testnet` },
    create: {
      nearAccountId: `carol-m10-${testSuffix}.testnet`,
      displayName: "Carol Tenant C",
      role: "MEMBER",
    },
    update: { role: "MEMBER" },
  });
  const carolSession = await SessionService.createSession(carol.id, carol.nearAccountId, carol.role);

  // Platform Operator Admin (Role: ADMIN)
  const admin = await prisma.user.upsert({
    where: { nearAccountId: `admin-m10-${testSuffix}.testnet` },
    create: {
      nearAccountId: `admin-m10-${testSuffix}.testnet`,
      displayName: "Security Admin",
      role: "ADMIN",
    },
    update: { role: "ADMIN" },
  });
  const adminSession = await SessionService.createSession(admin.id, admin.nearAccountId, admin.role);

  console.log(`  ✓ User A (Alice): ${alice.nearAccountId} (ID: ${alice.id})`);
  console.log(`  ✓ User B (Bob): ${bob.nearAccountId} (ID: ${bob.id})`);
  console.log(`  ✓ User C (Carol): ${carol.nearAccountId} (ID: ${carol.id})`);
  console.log(`  ✓ Platform Admin: ${admin.nearAccountId} (ID: ${admin.id}, Role: ${admin.role})`);

  // -------------------------------------------------------------------------
  // Provision Test Entities for User B (Bob) to be targeted by User A (Alice)
  // -------------------------------------------------------------------------
  console.log("\n--- Setup: Provisioning Bob's Resources ---");

  // Bob's Agent & OutLayer Wallet
  const bobAgent = await prisma.agent.create({
    data: {
      name: `Bob Procurement Agent ${testSuffix}`,
      purpose: "Bob's private procurement",
      type: "research_procurement",
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

  // Bob's Spending Mandate
  const bobMandate = await prisma.mandate.create({
    data: {
      name: `Bob Treasury Mandate ${testSuffix}`,
      description: "Bob's private corporate treasury mandate",
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("10"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("2"),
      approvalThresholdYocto: nearToYocto("1"),
      allowedRecipientsJson: JSON.stringify(["vendor.testnet", "service.testnet"]),
      expiresAt: new Date(Date.now() + 30 * 86400000),
      userId: bob.id,
      agentId: bobAgent.id,
      walletId: bobAgent.wallet!.id,
    },
  });

  // Bob's Task
  const bobTask = await prisma.task.create({
    data: {
      title: `Bob Hardware Task ${testSuffix}`,
      description: "Procure test servers for Bob",
      taskType: "PURCHASE",
      status: "PENDING_APPROVAL",
      proposedRecipient: "vendor.testnet",
      proposedAmountYocto: nearToYocto("1.5"),
      idempotencyKey: `task-bob-${testSuffix}`,
      planStepsJson: JSON.stringify([{ step: 1, action: "Order servers" }]),
      agentId: bobAgent.id,
      mandateId: bobMandate.id,
    },
  });

  // Bob's Approval Request
  const bobApproval = await prisma.approvalRequest.create({
    data: {
      mandateId: bobMandate.id,
      taskId: bobTask.id,
      recipient: "vendor.testnet",
      amountYocto: nearToYocto("1.5"),
      status: "PENDING",
      reason: "Above 1 NEAR approval threshold",
    },
  });

  // Bob's Objective
  const bobObjective = await prisma.objective.create({
    data: {
      title: `Bob Cloud Deployment ${testSuffix}`,
      originalPrompt: "Deploy multi-region cloud cluster",
      status: "IN_PROGRESS",
      priority: "HIGH",
      userId: bob.id,
      mandateId: bobMandate.id,
    },
  });

  // Bob's Integration Connection
  const encryptedCreds = CredentialVault.encrypt(
    { apiKey: `secret_bob_key_${testSuffix}` },
    CURRENT_VAULT_VERSION
  );
  const bobConnection = await prisma.integrationConnection.create({
    data: {
      userId: bob.id,
      providerId: "openai",
      adapterType: "rest",
      name: `Bob OpenAI Connection ${testSuffix}`,
      status: "CONNECTED",
      authType: "API_KEY",
      encryptedCredentials: encryptedCreds,
      credentialVersion: CURRENT_VAULT_VERSION,
      configJson: JSON.stringify({ baseUrl: "https://api.openai.com" }),
    },
  });

  // Bob's Operational Incident
  const bobIncident = await prisma.incident.create({
    data: {
      tenant: { connect: { id: bob.id } },
      incidentNumber: `INC-BOB-${testSuffix}`,
      title: `Bob Agent Anomaly ${testSuffix}`,
      description: "Synthetic test incident for Bob",
      category: "SYSTEM_DEGRADATION",
      severity: "SEV-3",
      status: "OPEN",
      source: "MANUAL",
    },
  });

  // Bob's Recovery Plan
  const bobRecoveryPlan = await prisma.recoveryPlan.create({
    data: {
      incident: { connect: { id: bobIncident.id } },
      tenant: { connect: { id: bob.id } },
      targetEntityType: "AGENT",
      targetEntityId: bobAgent.id,
      strategy: "CIRCUIT_BREAKER_RESET",
      status: "PENDING_APPROVAL",
      isFinancial: false,
      actionPayloadJson: JSON.stringify({ action: "RESET_AGENT_STATE" }),
      payloadHash: `hash-plan-${testSuffix}`,
      requiresApproval: true,
      createdBy: "SYSTEM_PLANNER",
    },
  });

  // Bob's Audit Event
  await recordAuditEvent({
    userId: bob.id,
    eventType: "AGENT_CREATED",
    verdict: "SUCCESS",
    description: `Bob created agent ${bobAgent.name}`,
    mandateId: bobMandate.id,
    taskId: bobTask.id,
    details: { agentId: bobAgent.id },
  });

  console.log(`  ✓ Bob's Agent: ${bobAgent.id}`);
  console.log(`  ✓ Bob's Mandate: ${bobMandate.id}`);
  console.log(`  ✓ Bob's Task: ${bobTask.id}`);
  console.log(`  ✓ Bob's Approval: ${bobApproval.id}`);
  console.log(`  ✓ Bob's Objective: ${bobObjective.id}`);
  console.log(`  ✓ Bob's Integration: ${bobConnection.id}`);
  console.log(`  ✓ Bob's Incident: ${bobIncident.id}`);
  console.log(`  ✓ Bob's Recovery Plan: ${bobRecoveryPlan.id}`);

  // Provision Alice's baseline entities
  const aliceAgent = await prisma.agent.create({
    data: {
      name: `Alice Agent ${testSuffix}`,
      purpose: "Alice's autonomous tasks",
      type: "research_procurement",
      status: "ACTIVE",
      userId: alice.id,
      wallet: {
        create: {
          walletId: `outlayer-alice-${testSuffix}`,
          apiKey: `wk_alice_${testSuffix}`,
          nearAccountId: `alice-agent-${testSuffix}.testnet`,
          network: "testnet",
          balanceYocto: nearToYocto("2"),
          isInitialized: true,
          initializationStatus: "READY",
        },
      },
    },
    include: { wallet: true },
  });

  const aliceMandate = await prisma.mandate.create({
    data: {
      name: `Alice Mandate ${testSuffix}`,
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("5"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("1"),
      approvalThresholdYocto: nearToYocto("0.5"),
      allowedRecipientsJson: JSON.stringify(["alice-vendor.testnet"]),
      expiresAt: new Date(Date.now() + 30 * 86400000),
      userId: alice.id,
      agentId: aliceAgent.id,
      walletId: aliceAgent.wallet!.id,
    },
  });

  await recordAuditEvent({
    userId: alice.id,
    eventType: "AGENT_CREATED",
    verdict: "SUCCESS",
    description: `Alice created agent ${aliceAgent.name}`,
    mandateId: aliceMandate.id,
    details: { agentId: aliceAgent.id },
  });

  const aliceHeaders = {
    "Content-Type": "application/json",
    "x-session-token": aliceSession.token,
  };
  const bobHeaders = {
    "Content-Type": "application/json",
    "x-session-token": bobSession.token,
  };
  const carolHeaders = {
    "Content-Type": "application/json",
    "x-session-token": carolSession.token,
  };
  const adminHeaders = {
    "Content-Type": "application/json",
    "x-session-token": adminSession.token,
  };

  // =========================================================================
  // SCENARIO 1: Cross-User Agent Access
  // =========================================================================
  console.log("\n--- SCENARIO 1: Cross-User Agent Access ---");
  {
    // 1a. User A attempts to read User B's agent
    const getRes = await fetch(`${baseUrl}/api/agents/${bobAgent.id}`, { headers: aliceHeaders });
    assert(getRes.status === 404, `Scenario 1a: Alice GET Bob's agent returns 404 (got ${getRes.status})`);

    // 1b. User A attempts to modify User B's agent
    const patchRes = await fetch(`${baseUrl}/api/agents/${bobAgent.id}`, {
      method: "PATCH",
      headers: aliceHeaders,
      body: JSON.stringify({ name: "Maliciously Renamed Agent" }),
    });
    assert(patchRes.status === 404, `Scenario 1b: Alice PATCH Bob's agent returns 404 (got ${patchRes.status})`);

    // 1c. User A attempts to delete User B's agent
    const delRes = await fetch(`${baseUrl}/api/agents/${bobAgent.id}`, {
      method: "DELETE",
      headers: aliceHeaders,
    });
    assert(delRes.status === 404, `Scenario 1c: Alice DELETE Bob's agent returns 404 (got ${delRes.status})`);

    // Verify Bob's agent in DB is untouched
    const freshBobAgent = await prisma.agent.findUnique({ where: { id: bobAgent.id } });
    assert(freshBobAgent?.name === bobAgent.name, "Scenario 1d: Bob's agent name is unchanged in database");
    assert(freshBobAgent?.status === "ACTIVE", "Scenario 1e: Bob's agent status is still ACTIVE in database");

    // Positive control: Bob can read his own agent
    const bobSelfRes = await fetch(`${baseUrl}/api/agents/${bobAgent.id}`, { headers: bobHeaders });
    assert(bobSelfRes.status === 200, `Scenario 1f: Bob GET his own agent succeeds with 200 (got ${bobSelfRes.status})`);
  }

  // =========================================================================
  // SCENARIO 2: Cross-User Wallet Access
  // =========================================================================
  console.log("\n--- SCENARIO 2: Cross-User Wallet Access ---");
  {
    // 2a. User A attempts to withdraw from User B's agent wallet
    const withdrawRes = await fetch(`${baseUrl}/api/wallets/withdraw`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({
        agentId: bobAgent.id,
        amountNear: "0.5",
      }),
    });
    assert(withdrawRes.status === 404, `Scenario 2a: Alice withdrawing from Bob's agent wallet returns 404 (got ${withdrawRes.status})`);

    // 2b. User A attempts to fund User B's agent wallet
    const fundRes = await fetch(`${baseUrl}/api/wallets/fund`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({
        agentId: bobAgent.id,
        amountNear: "1.0",
        txHash: "malicious-tx-hash",
      }),
    });
    assert(fundRes.status === 404, `Scenario 2b: Alice funding Bob's agent wallet returns 404 (got ${fundRes.status})`);

    // 2c. User A attempts to initialize / inspect User B's wallet
    const initRes = await fetch(`${baseUrl}/api/wallets/initialize?agentId=${bobAgent.id}`, {
      headers: aliceHeaders,
    });
    assert(initRes.status === 404, `Scenario 2c: Alice initializing Bob's wallet returns 404 (got ${initRes.status})`);

    // Verify Bob's wallet balance is intact
    const freshBobWallet = await prisma.wallet.findUnique({ where: { id: bobAgent.wallet!.id } });
    assert(freshBobWallet?.balanceYocto === nearToYocto("5"), "Scenario 2d: Bob's wallet balance is completely unchanged");
  }

  // =========================================================================
  // SCENARIO 3: Cross-User Mandate Mutation
  // =========================================================================
  console.log("\n--- SCENARIO 3: Cross-User Mandate Mutation ---");
  {
    // 3a. User A attempts to read User B's mandate
    const getMandateRes = await fetch(`${baseUrl}/api/mandates/${bobMandate.id}`, { headers: aliceHeaders });
    assert(getMandateRes.status === 404, `Scenario 3a: Alice GET Bob's mandate returns 404 (got ${getMandateRes.status})`);

    // 3b. User A attempts to mutate User B's mandate
    const patchMandateRes = await fetch(`${baseUrl}/api/mandates/${bobMandate.id}`, {
      method: "PATCH",
      headers: aliceHeaders,
      body: JSON.stringify({ status: "REVOKED" }),
    });
    assert(patchMandateRes.status === 404, `Scenario 3b: Alice PATCH Bob's mandate returns 404 (got ${patchMandateRes.status})`);

    // 3c. User A attempts to delete User B's mandate
    const delMandateRes = await fetch(`${baseUrl}/api/mandates/${bobMandate.id}`, {
      method: "DELETE",
      headers: aliceHeaders,
    });
    assert(delMandateRes.status === 404, `Scenario 3c: Alice DELETE Bob's mandate returns 404 (got ${delMandateRes.status})`);

    // Verify Bob's mandate is still ACTIVE
    const freshBobMandate = await prisma.mandate.findUnique({ where: { id: bobMandate.id } });
    assert(freshBobMandate?.status === "ACTIVE", "Scenario 3d: Bob's mandate is still ACTIVE in database");

    // Positive control: Bob can read his own mandate
    const bobMandateSelf = await fetch(`${baseUrl}/api/mandates/${bobMandate.id}`, { headers: bobHeaders });
    assert(bobMandateSelf.status === 200, `Scenario 3e: Bob can read his own mandate (got ${bobMandateSelf.status})`);
  }

  // =========================================================================
  // SCENARIO 4: Cross-User Objective Access
  // =========================================================================
  console.log("\n--- SCENARIO 4: Cross-User Objective Access ---");
  {
    // 4a. User A attempts to read User B's objective
    const getObjRes = await fetch(`${baseUrl}/api/objectives/${bobObjective.id}`, { headers: aliceHeaders });
    assert(getObjRes.status === 404, `Scenario 4a: Alice GET Bob's objective returns 404 (got ${getObjRes.status})`);

    // 4b. User A attempts to update User B's objective
    const patchObjRes = await fetch(`${baseUrl}/api/objectives/${bobObjective.id}`, {
      method: "PATCH",
      headers: aliceHeaders,
      body: JSON.stringify({ title: "Tampered Objective" }),
    });
    assert(patchObjRes.status === 404, `Scenario 4b: Alice PATCH Bob's objective returns 404 (got ${patchObjRes.status})`);

    // 4c. User A attempts to pause User B's objective
    const pauseObjRes = await fetch(`${baseUrl}/api/objectives/${bobObjective.id}/pause`, {
      method: "POST",
      headers: aliceHeaders,
    });
    assert(pauseObjRes.status === 404, `Scenario 4c: Alice POST Bob's objective pause returns 404 (got ${pauseObjRes.status})`);

    // 4d. User A attempts to cancel User B's objective
    const cancelObjRes = await fetch(`${baseUrl}/api/objectives/${bobObjective.id}/cancel`, {
      method: "POST",
      headers: aliceHeaders,
    });
    assert(cancelObjRes.status === 404, `Scenario 4d: Alice POST Bob's objective cancel returns 404 (got ${cancelObjRes.status})`);

    // 4e. User A attempts to delete User B's objective
    const delObjRes = await fetch(`${baseUrl}/api/objectives/${bobObjective.id}`, {
      method: "DELETE",
      headers: aliceHeaders,
    });
    assert(delObjRes.status === 404, `Scenario 4e: Alice DELETE Bob's objective returns 404 (got ${delObjRes.status})`);

    // Verify Bob's objective is untouched
    const freshBobObj = await prisma.objective.findUnique({ where: { id: bobObjective.id } });
    assert(freshBobObj?.title === bobObjective.title, "Scenario 4f: Bob's objective title is unchanged");
    assert(freshBobObj?.status === "IN_PROGRESS", "Scenario 4g: Bob's objective status is still IN_PROGRESS");
  }

  // =========================================================================
  // SCENARIO 5: Cross-User Task Access
  // =========================================================================
  console.log("\n--- SCENARIO 5: Cross-User Task Access ---");
  {
    // 5a. User A attempts to read User B's task
    const getTaskRes = await fetch(`${baseUrl}/api/tasks/${bobTask.id}`, { headers: aliceHeaders });
    assert(getTaskRes.status === 404, `Scenario 5a: Alice GET Bob's task returns 404 (got ${getTaskRes.status})`);

    // 5b. User A attempts to execute User B's task
    const execTaskRes = await fetch(`${baseUrl}/api/tasks/${bobTask.id}`, {
      method: "POST",
      headers: aliceHeaders,
    });
    assert(execTaskRes.status === 404, `Scenario 5b: Alice POST Bob's task execution returns 404 (got ${execTaskRes.status})`);

    // Verify Bob's task is still PENDING_APPROVAL
    const freshBobTask = await prisma.task.findUnique({ where: { id: bobTask.id } });
    assert(freshBobTask?.status === "PENDING_APPROVAL", "Scenario 5c: Bob's task status is still PENDING_APPROVAL");

    // Positive control: Bob can read his own task
    const bobTaskSelf = await fetch(`${baseUrl}/api/tasks/${bobTask.id}`, { headers: bobHeaders });
    assert(bobTaskSelf.status === 200, `Scenario 5d: Bob can read his own task (got ${bobTaskSelf.status})`);
  }

  // =========================================================================
  // SCENARIO 6: Cross-User Approval Bypass
  // =========================================================================
  console.log("\n--- SCENARIO 6: Cross-User Approval Bypass ---");
  {
    // 6a. User A attempts to APPROVE User B's pending request
    const approveRes = await fetch(`${baseUrl}/api/approvals`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({
        approvalId: bobApproval.id,
        decision: "APPROVE",
      }),
    });
    assert(approveRes.status === 404, `Scenario 6a: Alice approving Bob's request returns 404 (got ${approveRes.status})`);

    // 6b. User A attempts to REJECT User B's pending request
    const rejectRes = await fetch(`${baseUrl}/api/approvals`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({
        approvalId: bobApproval.id,
        decision: "REJECT",
      }),
    });
    assert(rejectRes.status === 404, `Scenario 6b: Alice rejecting Bob's request returns 404 (got ${rejectRes.status})`);

    // Verify Bob's approval request in DB is still PENDING
    const freshBobAppr = await prisma.approvalRequest.findUnique({ where: { id: bobApproval.id } });
    assert(freshBobAppr?.status === "PENDING", "Scenario 6c: Bob's approval status is still PENDING in DB");
    assert(freshBobAppr?.decidedAt === null, "Scenario 6d: Bob's approval decidedAt is still null");
    assert(freshBobAppr?.approverId === null, "Scenario 6e: Bob's approverId is still null");
  }

  // =========================================================================
  // SCENARIO 7: Cross-User Activity/Audit Snooping
  // =========================================================================
  console.log("\n--- SCENARIO 7: Cross-User Activity/Audit Snooping ---");
  {
    // 7a. Alice lists audit activity
    const auditRes = await fetch(`${baseUrl}/api/audit`, { headers: aliceHeaders });
    assert(auditRes.status === 200, `Scenario 7a: Alice GET /api/audit returns 200 (got ${auditRes.status})`);
    const auditJson = await auditRes.json();
    const aliceAuditLogs = auditJson.auditLogs || [];

    // Verify zero events belong to Bob or Carol
    const containsBobEvents = aliceAuditLogs.some((l: any) => l.userId === bob.id || l.mandateId === bobMandate.id);
    const containsCarolEvents = aliceAuditLogs.some((l: any) => l.userId === carol.id);
    assert(!containsBobEvents, "Scenario 7b: Alice's audit stream contains ZERO events from Bob");
    assert(!containsCarolEvents, "Scenario 7c: Alice's audit stream contains ZERO events from Carol");

    // 7b. Alice attempts to query audit log with Bob's mandateId
    const mandateAuditRes = await fetch(`${baseUrl}/api/audit?mandateId=${bobMandate.id}`, { headers: aliceHeaders });
    assert(mandateAuditRes.status === 404, `Scenario 7d: Alice querying audit with Bob's mandateId returns 404 (got ${mandateAuditRes.status})`);

    // 7c. Alice attempts to query audit log with Bob's taskId
    const taskAuditRes = await fetch(`${baseUrl}/api/audit?taskId=${bobTask.id}`, { headers: aliceHeaders });
    assert(taskAuditRes.status === 404, `Scenario 7e: Alice querying audit with Bob's taskId returns 404 (got ${taskAuditRes.status})`);
  }

  // =========================================================================
  // SCENARIO 8: Cross-User Integration Credential Leakage
  // =========================================================================
  console.log("\n--- SCENARIO 8: Cross-User Integration Credential Leakage ---");
  {
    // 8a. User A attempts to read User B's integration connection
    const getConnRes = await fetch(`${baseUrl}/api/integrations/${bobConnection.id}`, { headers: aliceHeaders });
    assert(getConnRes.status === 404, `Scenario 8a: Alice GET Bob's integration returns 404 (got ${getConnRes.status})`);

    // 8b. User A attempts to update User B's integration
    const patchConnRes = await fetch(`${baseUrl}/api/integrations/${bobConnection.id}`, {
      method: "PATCH",
      headers: aliceHeaders,
      body: JSON.stringify({ name: "Tampered Integration" }),
    });
    assert(patchConnRes.status === 404, `Scenario 8b: Alice PATCH Bob's integration returns 404 (got ${patchConnRes.status})`);

    // 8c. User A attempts to delete User B's integration
    const delConnRes = await fetch(`${baseUrl}/api/integrations/${bobConnection.id}`, {
      method: "DELETE",
      headers: aliceHeaders,
    });
    assert(delConnRes.status === 404, `Scenario 8c: Alice DELETE Bob's integration returns 404 (got ${delConnRes.status})`);

    // Verify Bob's connection in DB is intact
    const freshBobConn = await prisma.integrationConnection.findUnique({ where: { id: bobConnection.id } });
    assert(freshBobConn?.name === bobConnection.name, "Scenario 8d: Bob's integration connection name is unchanged");
    assert(freshBobConn?.status === "CONNECTED", "Scenario 8e: Bob's integration connection is still CONNECTED");
  }

  // =========================================================================
  // SCENARIO 9: Cross-User Search/Discovery Leakage
  // =========================================================================
  console.log("\n--- SCENARIO 9: Cross-User Search/Discovery Leakage ---");
  {
    // 9a. Alice discovers capabilities
    const discRes = await fetch(`${baseUrl}/api/discovery/capabilities`, { headers: aliceHeaders });
    assert(discRes.status === 200, `Scenario 9a: Alice GET /api/discovery/capabilities returns 200 (got ${discRes.status})`);
    const discJson = await discRes.json();
    const capabilities = discJson.capabilities || [];

    // Verify Bob's private connection ID does not appear in any capability
    const leaksBobConnection = capabilities.some((c: any) => c.integrationConnectionId === bobConnection.id);
    assert(!leaksBobConnection, "Scenario 9b: Alice's capabilities discovery does NOT leak Bob's connection");

    // 9b. Alice checks integration states
    const statesRes = await fetch(`${baseUrl}/api/discovery/integrations`, { headers: aliceHeaders });
    assert(statesRes.status === 200, `Scenario 9c: Alice GET /api/discovery/integrations returns 200 (got ${statesRes.status})`);
    const statesJson = await statesRes.json();
    const integrations = statesJson.integrations || [];

    const leaksBobInStates = integrations.some((i: any) => i.connectionId === bobConnection.id);
    assert(!leaksBobInStates, "Scenario 9d: Alice's integration catalog does NOT expose Bob's connectionId");
  }

  // =========================================================================
  // SCENARIO 10: Cross-User Incident Isolation
  // =========================================================================
  console.log("\n--- SCENARIO 10: Cross-User Incident Isolation ---");
  {
    // 10a. User A attempts to read User B's operational incident
    const getIncRes = await fetch(`${baseUrl}/api/incidents/${bobIncident.id}`, { headers: aliceHeaders });
    assert(getIncRes.status === 404, `Scenario 10a: Alice GET Bob's incident returns 404 (got ${getIncRes.status})`);

    // 10b. User A attempts to resolve User B's incident
    const resolveIncRes = await fetch(`${baseUrl}/api/incidents/${bobIncident.id}/resolve`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({ resolutionSummary: "Alice resolved this" }),
    });
    assert(resolveIncRes.status === 404, `Scenario 10b: Alice resolving Bob's incident returns 404 (got ${resolveIncRes.status})`);

    // Verify Bob's incident is still OPEN in DB
    const freshBobInc = await prisma.incident.findUnique({ where: { id: bobIncident.id } });
    assert(freshBobInc?.status === "OPEN", "Scenario 10c: Bob's incident status is still OPEN in database");
  }

  // =========================================================================
  // SCENARIO 11: Cross-User Recovery Isolation
  // =========================================================================
  console.log("\n--- SCENARIO 11: Cross-User Recovery Isolation ---");
  {
    // 11a. User A attempts to read User B's recovery plan
    const getPlanRes = await fetch(`${baseUrl}/api/recovery/plans/${bobRecoveryPlan.id}`, { headers: aliceHeaders });
    assert(getPlanRes.status === 404, `Scenario 11a: Alice GET Bob's recovery plan returns 404 (got ${getPlanRes.status})`);

    // 11b. User A attempts to approve User B's recovery plan
    const approvePlanRes = await fetch(`${baseUrl}/api/recovery/plans/${bobRecoveryPlan.id}/approve`, {
      method: "POST",
      headers: aliceHeaders,
      body: JSON.stringify({ notes: "Alice approval" }),
    });
    assert(approvePlanRes.status === 404, `Scenario 11b: Alice approving Bob's recovery plan returns 404 (got ${approvePlanRes.status})`);

    // 11c. User A attempts to execute User B's recovery plan
    const execPlanRes = await fetch(`${baseUrl}/api/recovery/plans/${bobRecoveryPlan.id}/execute`, {
      method: "POST",
      headers: aliceHeaders,
    });
    assert(execPlanRes.status === 404, `Scenario 11c: Alice executing Bob's recovery plan returns 404 (got ${execPlanRes.status})`);

    // Verify Bob's recovery plan is still PENDING_APPROVAL in DB
    const freshBobPlan = await prisma.recoveryPlan.findUnique({ where: { id: bobRecoveryPlan.id } });
    assert(freshBobPlan?.status === "PENDING_APPROVAL", "Scenario 11d: Bob's recovery plan is still PENDING_APPROVAL");
  }

  // =========================================================================
  // SCENARIO 12: Cross-User Financial Job Fencing
  // =========================================================================
  console.log("\n--- SCENARIO 12: Cross-User Financial Job Fencing ---");
  {
    // Worker / ExecutionBoundaryService executing with Alice's identity targeting Bob's mandate
    let fencedThrown = false;
    let fenceError = "";

    try {
      await ExecutionBoundaryService.execute({
        userId: alice.id,
        mandateId: bobMandate.id,
        agentId: bobAgent.id,
        operation: "execute_payment",
        recipient: "vendor.testnet",
        amountYocto: nearToYocto("0.1"),
        idempotencyKey: `fencing-test-${testSuffix}`,
      });
    } catch (err: any) {
      fencedThrown = true;
      fenceError = err.message;
    }

    assert(fencedThrown, "Scenario 12a: ExecutionBoundaryService rejects cross-tenant mandate invocation");
    assert(
      fenceError.includes("Mandate not found or unauthorized"),
      `Scenario 12b: Rejection message explicitly cites unauthorized mandate ("${fenceError}")`
    );

    // Verify Bob's mandate budget is completely untouched
    const freshBobMandate = await prisma.mandate.findUnique({ where: { id: bobMandate.id } });
    assert(freshBobMandate?.spentYocto === "0", "Scenario 12c: Bob's mandate spent budget is still 0");
    assert(freshBobMandate?.reservedYocto === "0", "Scenario 12d: Bob's mandate reserved budget is still 0");
  }

  // =========================================================================
  // SCENARIO 13: Unauthenticated Request Rejection
  // =========================================================================
  console.log("\n--- SCENARIO 13: Unauthenticated Request Rejection ---");
  {
    const protectedRoutes = [
      { name: "Agents", url: `${baseUrl}/api/agents` },
      { name: "Mandates", url: `${baseUrl}/api/mandates` },
      { name: "Wallets", url: `${baseUrl}/api/wallets` },
      { name: "Approvals", url: `${baseUrl}/api/approvals` },
      { name: "Tasks", url: `${baseUrl}/api/tasks` },
      { name: "Objectives", url: `${baseUrl}/api/objectives` },
      { name: "Integrations", url: `${baseUrl}/api/integrations` },
      { name: "Audit Activity", url: `${baseUrl}/api/audit` },
      { name: "User Profile", url: `${baseUrl}/api/user/profile` },
    ];

    for (const route of protectedRoutes) {
      const res = await fetch(route.url, {
        headers: { "Content-Type": "application/json" },
      });
      assert(res.status === 401, `Scenario 13: Unauthenticated GET ${route.name} returns 401 (got ${res.status})`);
    }
  }

  // =========================================================================
  // SCENARIO 14: Error Response Masking
  // =========================================================================
  console.log("\n--- SCENARIO 14: Error Response Masking ---");
  {
    // Cross-tenant lookups must return 404 (NotFoundError), NEVER revealing existence via 403 or 500
    const maskingTests = [
      { resource: "Agent", url: `${baseUrl}/api/agents/${bobAgent.id}` },
      { resource: "Mandate", url: `${baseUrl}/api/mandates/${bobMandate.id}` },
      { resource: "Objective", url: `${baseUrl}/api/objectives/${bobObjective.id}` },
      { resource: "Task", url: `${baseUrl}/api/tasks/${bobTask.id}` },
      { resource: "Integration", url: `${baseUrl}/api/integrations/${bobConnection.id}` },
      { resource: "Incident", url: `${baseUrl}/api/incidents/${bobIncident.id}` },
      { resource: "Recovery Plan", url: `${baseUrl}/api/recovery/plans/${bobRecoveryPlan.id}` },
    ];

    for (const test of maskingTests) {
      const res = await fetch(test.url, { headers: aliceHeaders });
      assert(res.status === 404, `Scenario 14: Cross-tenant ${test.resource} lookup masks existence with 404 (got ${res.status})`);
      const body = await res.json();
      assert(
        body.success === false &&
        (body.error?.toLowerCase().includes("not found") || body.error?.toLowerCase().includes("not found or access denied")),
        `Scenario 14: Cross-tenant ${test.resource} response masks details cleanly (${body.error})`
      );
    }
  }

  // =========================================================================
  // SCENARIO 15: Multi-User Concurrent Operations
  // =========================================================================
  console.log("\n--- SCENARIO 15: Multi-User Concurrent Operations ---");
  {
    // Simultaneously:
    // Alice creates a mandate and queries her mandates
    // Bob creates an agent and queries his agents
    // Carol creates an objective and queries her objectives
    const [aliceMandateRes, bobAgentRes, carolObjectiveRes] = await Promise.all([
      fetch(`${baseUrl}/api/mandates`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({
          name: `Concurrent Alice Mandate ${testSuffix}`,
          agentId: aliceAgent.id,
          totalBudgetNear: "3",
          perTxLimitNear: "1",
          approvalThresholdNear: "0.5",
          allowedRecipients: ["alice-store.testnet"],
        }),
      }),
      fetch(`${baseUrl}/api/agents`, {
        method: "POST",
        headers: bobHeaders,
        body: JSON.stringify({
          name: `Concurrent Bob Agent ${testSuffix}`,
          purpose: "Concurrent processing",
          type: "research_procurement",
        }),
      }),
      fetch(`${baseUrl}/api/objectives`, {
        method: "POST",
        headers: carolHeaders,
        body: JSON.stringify({
          title: `Concurrent Carol Objective ${testSuffix}`,
          prompt: "Analyze distributed transactions",
          priority: "HIGH",
          autoPlan: false,
        }),
      }),
    ]);

    assert(aliceMandateRes.status === 201, `Scenario 15a: Alice concurrent mandate creation succeeds with 201 (got ${aliceMandateRes.status})`);
    assert(bobAgentRes.status === 201, `Scenario 15b: Bob concurrent agent creation succeeds with 201 (got ${bobAgentRes.status})`);
    assert(carolObjectiveRes.status === 201, `Scenario 15c: Carol concurrent objective creation succeeds with 201 (got ${carolObjectiveRes.status})`);

    // Verify isolation in queries
    const [aliceList, bobList, carolList] = await Promise.all([
      fetch(`${baseUrl}/api/mandates`, { headers: aliceHeaders }).then((r) => r.json()),
      fetch(`${baseUrl}/api/agents`, { headers: bobHeaders }).then((r) => r.json()),
      fetch(`${baseUrl}/api/objectives`, { headers: carolHeaders }).then((r) => r.json()),
    ]);

    // Alice's mandate list must only contain Alice's mandates
    const aliceMandates = aliceList.mandates || [];
    const aliceHasBobMandate = aliceMandates.some((m: any) => m.name.includes("Bob") || m.id === bobMandate.id);
    assert(!aliceHasBobMandate, "Scenario 15d: Alice's mandate list contains 0 mandates belonging to Bob");

    // Bob's agent list must only contain Bob's agents
    const bobAgents = bobList.agents || [];
    const bobHasAliceAgent = bobAgents.some((a: any) => a.id === aliceAgent.id);
    assert(!bobHasAliceAgent, "Scenario 15e: Bob's agent list contains 0 agents belonging to Alice");

    // Carol's objective list must only contain Carol's objectives
    const carolObjectives = carolList.objectives || [];
    const carolHasBobObjective = carolObjectives.some((o: any) => o.id === bobObjective.id);
    assert(!carolHasBobObjective, "Scenario 15f: Carol's objective list contains 0 objectives belonging to Bob");
  }

  // =========================================================================
  // SCENARIO 16: Operator Endpoint Role Authorization Enforcement
  // =========================================================================
  console.log("\n--- SCENARIO 16: Operator Endpoint Role Authorization Enforcement ---");
  {
    // Member accounts (Alice - role MEMBER) must be blocked with HTTP 403 Forbidden
    const operatorEndpoints = [
      { name: "Workers Fleet", url: `${baseUrl}/api/workers` },
      { name: "Observability Overview", url: `${baseUrl}/api/observability/overview` },
      { name: "Observability Metrics", url: `${baseUrl}/api/observability/metrics` },
      { name: "Worker Capacity", url: `${baseUrl}/api/observability/capacity` },
      { name: "Operational Alerts", url: `${baseUrl}/api/observability/alerts` },
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
      assert(
        res.status === 403,
        `Scenario 16: Member Alice access to ${ep.name} returns HTTP 403 Forbidden (got ${res.status})`
      );
      const data = await res.json();
      assert(
        data.success === false && data.error?.toLowerCase().includes("forbidden"),
        `Scenario 16: Member Alice access to ${ep.name} returns forbidden error message (${data.error})`
      );
    }

    // Platform Admin (role ADMIN) is permitted to access operator endpoints
    const adminEndpoints = [
      { name: "Workers Fleet", url: `${baseUrl}/api/workers` },
      { name: "Observability Overview", url: `${baseUrl}/api/observability/overview` },
      { name: "Reconciliation Runs", url: `${baseUrl}/api/reconciliation/runs` },
      { name: "Operational Status", url: `${baseUrl}/api/operations/status` },
      { name: "Circuit Breakers", url: `${baseUrl}/api/resilience/providers` },
      { name: "Dead Letters", url: `${baseUrl}/api/dead-letters` },
    ];

    for (const ep of adminEndpoints) {
      const res = await fetch(ep.url, { headers: adminHeaders });
      assert(
        res.status === 200,
        `Scenario 16: Admin access to ${ep.name} returns HTTP 200 OK (got ${res.status})`
      );
      const data = await res.json();
      assert(data.success === true, `Scenario 16: Admin access to ${ep.name} returns success: true`);
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n===============================================================================");
  console.log(`   MILESTONE 10 TEST SUMMARY: ALL ${passedAssertions} / ${totalAssertions} ASSERTIONS PASSED (100%) `);
  console.log("===============================================================================\n");
}

runMilestone10TestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal Test Suite Failure:", err);
    process.exit(1);
  });
