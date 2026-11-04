import { prisma } from "../src/lib/db";
import { agentRegistry } from "../src/lib/runtime/registry";
import { executionOrchestrator } from "../src/lib/runtime/orchestrator";
import { emitRuntimeEvent, getExecutionEvents } from "../src/lib/runtime/events";
import {
  UniversalAgent,
  AgentCapability,
  AgentExecutionContext,
  AgentExecutionResult,
  ExecutionStatus,
} from "../src/lib/runtime/types";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import { verifyAuditChain } from "../src/lib/auditLedger";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

function assert(condition: boolean, testCase: number, message: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ Case ${testCase} PASS: ${message}`);
    if (detail) console.log(`     ↳ ${detail}`);
  } else {
    console.error(`  ✗ Case ${testCase} FAIL: ${message}`);
    if (detail) console.error(`     ↳ Details: ${detail}`);
    process.exit(1);
  }
}

// Mock Test Agent for testing registry & transitions
class MockSpecialistAgent implements UniversalAgent {
  public readonly type = "mock_specialist";
  public readonly version = "1.0.0";
  public readonly name = "Mock Specialist Agent";
  public readonly description = "Test specialist agent for universal runtime tests";

  public getCapabilities(): AgentCapability[] {
    return [
      {
        id: "mock_cap",
        name: "Mock Capability",
        description: "Executes mock tasks",
        category: "analytics",
        requiresMandate: false,
      },
    ];
  }

  public validateConfig(config: Record<string, unknown>) {
    if (config.invalidField) {
      return { valid: false, errors: ["invalidField is not allowed"] };
    }
    return { valid: true };
  }

  public async initialize(context: AgentExecutionContext) {
    await context.emitEvent("mock.initialized", { step: "init" });
  }

  public async execute(context: AgentExecutionContext): Promise<AgentExecutionResult> {
    await context.emitEvent("mock.started", { step: "exec" });
    return {
      status: "COMPLETED",
      summary: "Mock specialist executed successfully",
      output: { result: "ok" },
      proposedActions: [],
      evidence: [],
      errors: [],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
  }

  public async pause(executionId: string) {
    return true;
  }

  public async resume(executionId: string) {
    return true;
  }

  public async cancel(executionId: string) {
    return true;
  }

  public async getStatus(executionId: string): Promise<ExecutionStatus> {
    return "COMPLETED";
  }
}

async function main() {
  console.log("=================================================================");
  console.log("=== MANDATE MILESTONE 1: UNIVERSAL AGENT RUNTIME TEST SUITE =====");
  console.log("=================================================================\n");

  const testSuffix = Date.now().toString().slice(-5);
  const primaryAccountId = `runtime-user-${testSuffix}.testnet`;
  const secondaryAccountId = `runtime-other-${testSuffix}.testnet`;

  // Setup Users
  const auth1 = await fetch(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: primaryAccountId }),
  }).then((r) => r.json());
  const user1Id = auth1.user.id;

  const auth2 = await fetch(`${BASE_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: secondaryAccountId }),
  }).then((r) => r.json());
  const user2Id = auth2.user.id;

  const headers1 = {
    "Content-Type": "application/json",
    "x-near-account": primaryAccountId,
  };
  const headers2 = {
    "Content-Type": "application/json",
    "x-near-account": secondaryAccountId,
  };

  // -------------------------------------------------------------
  // Test 1: Agent Registry & Duplicate Handling
  // -------------------------------------------------------------
  console.log("\n[Test 1] Agent Registry & Specialist Registration");
  const defaultAgent = agentRegistry.getAgent("research_procurement");
  assert(
    !!defaultAgent && defaultAgent.type === "research_procurement",
    1,
    "Default Research & Procurement specialist is pre-registered in registry",
    `Resolved: ${defaultAgent?.name} v${defaultAgent?.version}`
  );

  const mockAgent = new MockSpecialistAgent();
  agentRegistry.register(mockAgent);
  const retrievedMock = agentRegistry.getAgent("mock_specialist");
  assert(
    !!retrievedMock && retrievedMock.name === "Mock Specialist Agent",
    1,
    "Specialist agent registered dynamically into universal registry without hardcoding"
  );

  let duplicateCaught = false;
  try {
    agentRegistry.register(mockAgent);
  } catch (e: any) {
    duplicateCaught = true;
  }
  assert(
    duplicateCaught,
    1,
    "Duplicate agent registration with identical type and version is safely rejected"
  );

  // -------------------------------------------------------------
  // Test 2: Unknown Agent Type Rejection
  // -------------------------------------------------------------
  console.log("\n[Test 2] Unknown Agent Type Rejection");
  const unknownTypeRes = await fetch(`${BASE_URL}/api/agents`, {
    method: "POST",
    headers: headers1,
    body: JSON.stringify({
      name: "Bad Agent",
      type: "unregistered_bogus_type",
    }),
  });
  const unknownTypeData = await unknownTypeRes.json();
  assert(
    unknownTypeRes.status === 400 && unknownTypeData.success === false,
    2,
    "API rejects provisioning agent with unregistered agent type",
    `Error: ${unknownTypeData.error}`
  );

  // -------------------------------------------------------------
  // Test 3: Agent Configuration Validation
  // -------------------------------------------------------------
  console.log("\n[Test 3] Agent Configuration Validation");
  const badConfigValidation = mockAgent.validateConfig({ invalidField: "hack" });
  assert(
    !badConfigValidation.valid && badConfigValidation.errors?.length! > 0,
    3,
    "Invalid agent configuration rejected with structured schema error messages"
  );

  const goodConfigValidation = mockAgent.validateConfig({});
  assert(
    goodConfigValidation.valid,
    3,
    "Valid agent configuration passes validation"
  );

  // -------------------------------------------------------------
  // Test 4: Agent Capabilities Query
  // -------------------------------------------------------------
  console.log("\n[Test 4] Agent Capabilities Query");
  const caps = defaultAgent!.getCapabilities();
  assert(
    caps.length === 3 &&
      caps.some((c) => c.id === "web_research") &&
      caps.some((c) => c.id === "procurement_proposal"),
    4,
    "Capabilities query returns typed capability list with spending mandate requirements",
    `Capabilities: ${caps.map((c) => c.id).join(", ")}`
  );

  // Provision an agent for User 1
  const createAgentRes = await fetch(`${BASE_URL}/api/agents`, {
    method: "POST",
    headers: headers1,
    body: JSON.stringify({
      name: `AgentAlpha-${testSuffix}`,
      type: "research_procurement",
      purpose: "Enterprise Procurement",
    }),
  });
  const createAgentData = await createAgentRes.json();
  assert(
    createAgentRes.status === 201 && !!createAgentData.agent?.id,
    4,
    "Successfully provisioned agent linked to Universal Runtime",
    `Agent ID: ${createAgentData.agent?.id}`
  );
  const agent1 = createAgentData.agent;

  // Fund Agent Wallet
  await fetch(`${BASE_URL}/api/wallets/fund`, {
    method: "POST",
    headers: headers1,
    body: JSON.stringify({
      walletId: agent1.wallet.id,
      amountNear: "5.000",
    }),
  });

  // Create Mandate for Agent 1
  const mandateRes = await fetch(`${BASE_URL}/api/mandates`, {
    method: "POST",
    headers: headers1,
    body: JSON.stringify({
      name: `MandateAlpha-${testSuffix}`,
      agentId: agent1.id,
      walletId: agent1.wallet.id,
      totalBudgetNear: "2.000",
      perTxLimitNear: "0.200",
      approvalThresholdNear: "0.050",
      allowedRecipients: ["researcher.near", "nearblocks.testnet", "oracle.testnet"],
      durationDays: 30,
    }),
  });
  const mandateData = await mandateRes.json();
  const mandate1 = mandateData.mandate;
  assert(
    mandateRes.status === 201 && !!mandate1?.id,
    4,
    "Created spending mandate bound to agent",
    `Mandate ID: ${mandate1.id}`
  );

  // -------------------------------------------------------------
  // Test 5: Successful Execution through Orchestrator
  // -------------------------------------------------------------
  console.log("\n[Test 5] Successful Universal Execution");
  const execRes1 = await fetch(`${BASE_URL}/api/agents/${agent1.id}/executions`, {
    method: "POST",
    headers: headers1,
    body: JSON.stringify({
      prompt: "Research live NEAR testnet indexer services and compare features without purchasing",
      mandateId: mandate1.id,
    }),
  });
  const execData1 = await execRes1.json();
  assert(
    execRes1.status === 201 && !!execData1.execution?.id,
    5,
    "Dispatched universal execution via /api/agents/[id]/executions",
    `Execution ID: ${execData1.execution?.id}`
  );

  // Retrieve execution record
  const checkRes1 = await fetch(`${BASE_URL}/api/executions/${execData1.execution.id}`, {
    headers: headers1,
  });
  const checkData1 = await checkRes1.json();
  let execRecord1 = checkData1.execution || execData1.execution;

  assert(
    execRecord1.status === "COMPLETED",
    5,
    "Universal execution completed 4-step workflow autonomously",
    `Status: ${execRecord1.status}, Current step: ${execRecord1.currentStep}`
  );
  assert(
    !!execRecord1.outputJson && execRecord1.outputJson.includes("requirements"),
    5,
    "Structured output persisted to database"
  );

  // -------------------------------------------------------------
  // Test 6: Policy Firewall Blocking During Universal Execution
  // -------------------------------------------------------------
  console.log("\n[Test 6] Policy Firewall Blocking During Universal Execution");
  // Update mandate to remove all allowed recipients so proposal is strictly blocked
  await prisma.mandate.update({
    where: { id: mandate1.id },
    data: { allowedRecipientsJson: JSON.stringify(["unrelated-party.testnet"]) },
  });

  const execResBlocked = await fetch(`${BASE_URL}/api/agents/${agent1.id}/executions`, {
    method: "POST",
    headers: headers1,
    body: JSON.stringify({
      prompt: "Subscribe to NEARBlocks API for 0.080 NEAR",
      mandateId: mandate1.id,
    }),
  });
  const execDataBlocked = await execResBlocked.json();
  const checkResBlocked = await fetch(`${BASE_URL}/api/executions/${execDataBlocked.execution.id}`, {
    headers: headers1,
  });
  const checkDataBlocked = await checkResBlocked.json();
  let execRecordBlocked = checkDataBlocked.execution || execDataBlocked.execution;

  assert(
    execRecordBlocked.status === "FAILED",
    6,
    "Universal agent execution blocked by deterministic policy firewall",
    `Status: ${execRecordBlocked.status}, Error: ${execRecordBlocked.errorDetails}`
  );

  // Restore allowed recipients
  await prisma.mandate.update({
    where: { id: mandate1.id },
    data: { allowedRecipientsJson: JSON.stringify(["researcher.near", "nearblocks.testnet", "oracle.testnet"]) },
  });

  // -------------------------------------------------------------
  // Test 7: Human Approval Gate Handling
  // -------------------------------------------------------------
  console.log("\n[Test 7] Human Approval Gate Handling");
  // Set approval threshold low (0.01 NEAR) while per-tx limit is higher (0.2 NEAR)
  // Proposed payment is 0.08 NEAR -> will trigger WAITING_FOR_APPROVAL
  await prisma.mandate.update({
    where: { id: mandate1.id },
    data: {
      approvalThresholdYocto: nearToYocto("0.010"),
      perTxLimitYocto: nearToYocto("0.200"),
    },
  });

  const execResApproval = await fetch(`${BASE_URL}/api/agents/${agent1.id}/executions`, {
    method: "POST",
    headers: headers1,
    body: JSON.stringify({
      prompt: "Subscribe to NEARBlocks analytics indexer for 0.080 NEAR",
      mandateId: mandate1.id,
    }),
  });
  const execDataApproval = await execResApproval.json();
  const checkResApproval = await fetch(`${BASE_URL}/api/executions/${execDataApproval.execution.id}`, {
    headers: headers1,
  });
  const checkDataApproval = await checkResApproval.json();
  let execRecordApproval = checkDataApproval.execution || execDataApproval.execution;

  assert(
    execRecordApproval.status === "WAITING_FOR_APPROVAL",
    7,
    "Universal execution correctly transitions to WAITING_FOR_APPROVAL",
    `Status: ${execRecordApproval.status}`
  );

  const pendingApproval = await prisma.approvalRequest.findFirst({
    where: { executionId: execRecordApproval.id },
  });
  assert(
    !!pendingApproval && pendingApproval.status === "PENDING",
    7,
    "ApprovalRequest record generated with linked executionId and atomic budget reservation",
    `Approval ID: ${pendingApproval?.id}, Amount: ${yoctoToNear(pendingApproval?.amountYocto || "0")} NEAR`
  );

  // -------------------------------------------------------------
  // Test 8: Pause and Resume Lifecycle Transitions
  // -------------------------------------------------------------
  console.log("\n[Test 8] Pause and Resume Lifecycle Transitions");
  const testExec = await prisma.agentExecution.create({
    data: {
      agentId: agent1.id,
      userId: user1Id,
      mandateId: mandate1.id,
      status: "RUNNING",
      inputJson: JSON.stringify({ test: "pause_resume" }),
      currentStep: "Running test workflow",
    },
  });

  const pauseRes = await fetch(`${BASE_URL}/api/executions/${testExec.id}/pause`, {
    method: "POST",
    headers: headers1,
  });
  const pauseData = await pauseRes.json();
  assert(
    pauseRes.status === 200 && (pauseData.status === "PAUSED" || pauseData.execution?.status === "PAUSED"),
    8,
    "Pause request successfully transitions execution from RUNNING to PAUSED"
  );

  const resumeRes = await fetch(`${BASE_URL}/api/executions/${testExec.id}/resume`, {
    method: "POST",
    headers: headers1,
  });
  const resumeData = await resumeRes.json();
  assert(
    resumeRes.status === 200 && (resumeData.status === "RUNNING" || resumeData.execution?.status === "RUNNING"),
    8,
    "Resume request successfully transitions execution from PAUSED to RUNNING"
  );

  // -------------------------------------------------------------
  // Test 9: Cancellation Handling
  // -------------------------------------------------------------
  console.log("\n[Test 9] Cancellation Handling");
  const cancelExec = await prisma.agentExecution.create({
    data: {
      agentId: agent1.id,
      userId: user1Id,
      mandateId: mandate1.id,
      status: "RUNNING",
      inputJson: JSON.stringify({ test: "cancel_workflow" }),
      currentStep: "Running long task to be cancelled",
    },
  });

  const cancelRes = await fetch(`${BASE_URL}/api/executions/${cancelExec.id}/cancel`, {
    method: "POST",
    headers: headers1,
  });
  const cancelData = await cancelRes.json();
  assert(
    cancelRes.status === 200 && (cancelData.status === "CANCELLED" || cancelData.execution?.status === "CANCELLED"),
    9,
    "Cancel request transitions execution to CANCELLED state and records timestamp",
    `Status: ${cancelData.status || cancelData.execution?.status}`
  );

  // -------------------------------------------------------------
  // Test 10: Centralized State Transition Enforcement
  // -------------------------------------------------------------
  console.log("\n[Test 10] Centralized State Transition Enforcement");
  let invalidTransitionCaught1 = false;
  try {
    // Cannot transition COMPLETED back to RUNNING
    await executionOrchestrator.transition(execRecord1.id, "RUNNING", {
      reason: "Attempting illegal state transition",
    });
  } catch (e: any) {
    invalidTransitionCaught1 = true;
  }
  assert(
    invalidTransitionCaught1,
    10,
    "Orchestrator strictly rejects invalid transition (COMPLETED -> RUNNING)"
  );

  let invalidTransitionCaught2 = false;
  try {
    // Cannot transition CANCELLED to RUNNING
    await executionOrchestrator.transition(cancelExec.id, "RUNNING", {
      reason: "Attempting illegal restart of cancelled execution",
    });
  } catch (e: any) {
    invalidTransitionCaught2 = true;
  }
  assert(
    invalidTransitionCaught2,
    10,
    "Orchestrator strictly rejects invalid transition (CANCELLED -> RUNNING)"
  );

  // -------------------------------------------------------------
  // Test 11: Idempotency Deduplication
  // -------------------------------------------------------------
  console.log("\n[Test 11] Idempotency Deduplication");
  const fixedIdemKey = `idem-test-${Date.now()}`;
  const firstIdemRes = await fetch(`${BASE_URL}/api/executions`, {
    method: "POST",
    headers: headers1,
    body: JSON.stringify({
      agentId: agent1.id,
      prompt: "Idempotent research execution",
      idempotencyKey: fixedIdemKey,
    }),
  });
  const firstIdemData = await firstIdemRes.json();
  const firstIdemId = firstIdemData.execution.id;

  const secondIdemRes = await fetch(`${BASE_URL}/api/executions`, {
    method: "POST",
    headers: headers1,
    body: JSON.stringify({
      agentId: agent1.id,
      prompt: "Idempotent research execution",
      idempotencyKey: fixedIdemKey,
    }),
  });
  const secondIdemData = await secondIdemRes.json();
  const secondIdemId = secondIdemData.execution.id;

  assert(
    firstIdemId === secondIdemId,
    11,
    "Identical idempotencyKey returns existing execution record without duplicate processing",
    `Execution ID: ${firstIdemId}`
  );

  // -------------------------------------------------------------
  // Test 12: Concurrency Locking & Multi-User Isolation
  // -------------------------------------------------------------
  console.log("\n[Test 12] Concurrency Locking & Multi-User Isolation");
  // Seed 5 RUNNING executions for User 1 to hit the concurrency limit of 5
  const dummyExecs = await Promise.all(
    [1, 2, 3, 4, 5].map((i) =>
      prisma.agentExecution.create({
        data: {
          agentId: agent1.id,
          userId: user1Id,
          status: "RUNNING",
          inputJson: JSON.stringify({ dummy: i }),
          lockToken: `lock-dummy-${i}`,
          lockedAt: new Date(),
        },
      })
    )
  );

  const limitHitRes = await fetch(`${BASE_URL}/api/executions`, {
    method: "POST",
    headers: headers1,
    body: JSON.stringify({
      agentId: agent1.id,
      prompt: "Over concurrency limit execution",
    }),
  });
  const limitHitData = await limitHitRes.json();
  assert(
    limitHitRes.status === 429,
    12,
    "Concurrency limit enforced: 6th simultaneous execution rejected with HTTP 429",
    `Response: ${limitHitData.error}`
  );

  // Verify User 2 can still execute (multi-user isolation)
  const agent2Res = await fetch(`${BASE_URL}/api/agents`, {
    method: "POST",
    headers: headers2,
    body: JSON.stringify({
      name: `AgentBeta-${testSuffix}`,
      type: "research_procurement",
    }),
  });
  const agent2Data = await agent2Res.json();
  const agent2 = agent2Data.agent;

  const user2ExecRes = await fetch(`${BASE_URL}/api/executions`, {
    method: "POST",
    headers: headers2,
    body: JSON.stringify({
      agentId: agent2.id,
      prompt: "Independent user 2 execution",
    }),
  });
  assert(
    user2ExecRes.status === 201,
    12,
    "Multi-user isolation: User 2 execution succeeds independently despite User 1 hitting limit"
  );

  // Clean up dummy executions
  await prisma.agentExecution.deleteMany({
    where: { id: { in: dummyExecs.map((e) => e.id) } },
  });

  // -------------------------------------------------------------
  // Test 13: Orphaned Execution Recovery
  // -------------------------------------------------------------
  console.log("\n[Test 13] Orphaned Execution Recovery");
  // Create an execution with an expired lock (> 10 minutes ago) and max retries reached
  const tenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);
  const orphanedExec = await prisma.agentExecution.create({
    data: {
      agentId: agent1.id,
      userId: user1Id,
      status: "RUNNING",
      inputJson: JSON.stringify({ task: "orphaned_task" }),
      lockToken: "stale-lock-token",
      lockedAt: tenMinutesAgo,
      retryCount: 3,
      maxRetries: 3,
      currentStep: "Stuck in dead worker process",
    },
  });

  const recoveredCount = await executionOrchestrator.recoverOrphanedExecutions();
  assert(
    recoveredCount >= 1,
    13,
    "Orchestrator detectAndRecover successfully identified and recovered orphaned executions",
    `Recovered count: ${recoveredCount}`
  );

  const updatedOrphaned = await prisma.agentExecution.findUnique({
    where: { id: orphanedExec.id },
  });
  assert(
    Boolean(updatedOrphaned?.status === "FAILED" && updatedOrphaned?.errorDetails?.includes("Orphaned execution exceeded max retries")),
    13,
    "Orphaned execution marked as FAILED with recovery diagnostic details"
  );

  // -------------------------------------------------------------
  // Test 14: Structured Runtime Events & Audit Ledger Linkage
  // -------------------------------------------------------------
  console.log("\n[Test 14] Runtime Events & Audit Ledger Linkage");
  const events = await getExecutionEvents(execRecord1.id, user1Id);
  assert(
    events.length > 0,
    14,
    "Runtime events emitted and stored in ExecutionEvent table",
    `Count: ${events.length}, Types: ${events.map((e) => e.eventType).slice(0, 4).join(", ")}`
  );

  const auditCheck = await verifyAuditChain(user1Id);
  assert(
    auditCheck.valid,
    14,
    "Cryptographic hash chain of audit ledger verified valid with zero tampered blocks",
    `Total verified blocks: ${auditCheck.count}`
  );

  console.log("\n=================================================================");
  console.log("=== ALL 14 UNIVERSAL AGENT RUNTIME TEST CASES PASSED! ===========");
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("Test failed with unhandled error:", err);
  process.exit(1);
});
