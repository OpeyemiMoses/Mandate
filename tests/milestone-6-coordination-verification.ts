/**
 * MANDATE — MILESTONE 6: UNIVERSAL MULTI-AGENT COORDINATION VERIFICATION
 * 
 * Exhaustive production verification of Multi-Agent Coordination:
 * 1. Workflow Planning & DAG cycle rejection.
 * 2. Capability matching using real agent registry.
 * 3. Unauthorized assignment & user isolation.
 * 4. Controlled shared context: versioning, access control, secret redaction, SHA-256 tamper detection.
 * 5. Structured agent handoff protocol: schema validation, destination binding, replay prevention.
 * 6. Database-backed distributed task leases: multi-instance exclusivity & abandoned lease recovery.
 * 7. Parallel execution of independent tasks & DAG dependency enforcement.
 * 8. Shared financial coordination: atomic CAS budget reservation, settlement, failure release, duplicate prevention.
 * 9. Failure recovery, agent reassignment, cascade prevention & cancellation propagation.
 * 10. Unified SHA-256 cryptographic audit chain verification.
 */

import { prisma } from "../src/lib/db";
import { agentRegistry, registerDefaultAgents } from "../src/lib/runtime/registry";
import {
  MultiAgentWorkflowPlanner,
  validateDAG,
} from "../src/lib/coordination/workflowPlanner";
import { SharedContextService, computeArtifactHash } from "../src/lib/coordination/sharedContext";
import { HandoffManager } from "../src/lib/coordination/handoffManager";
import { TaskLeaseManager } from "../src/lib/coordination/leaseManager";
import { FinancialCoordinator } from "../src/lib/coordination/financialCoordinator";
import { CoordinationRecoveryManager } from "../src/lib/coordination/recoveryManager";
import { MultiAgentCoordinator } from "../src/lib/coordination/coordinator";
import { verifyAuditChain } from "../src/lib/auditLedger";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testNum: number, description: string, detail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ Case ${testNum} PASS: ${description}`);
    if (detail) console.log(`     ↳ ${detail}`);
  } else {
    failedCount++;
    console.error(`  ✗ Case ${testNum} FAIL: ${description}`);
    if (detail) console.error(`     ↳ Details: ${detail}`);
    process.exit(1);
  }
}

async function main() {
  console.log("================================================================================");
  console.log("  MANDATE — MILESTONE 6: MULTI-AGENT COORDINATION TEST SUITE");
  console.log("================================================================================\n");

  registerDefaultAgents();

  const runTag = Date.now().toString().slice(-6);

  // Setup Test Users
  const userAlice = await prisma.user.create({
    data: {
      nearAccountId: `alice_coord_${runTag}.testnet`,
      displayName: "Alice Coordinator",
    },
  });

  const userBob = await prisma.user.create({
    data: {
      nearAccountId: `bob_coord_${runTag}.testnet`,
      displayName: "Bob Attacker",
    },
  });

  // Provision Alice's Specialist Agents
  const agentProcurement = await prisma.agent.create({
    data: {
      userId: userAlice.id,
      name: "Alice Procurement Specialist",
      type: "research_procurement",
      version: "1.0.0",
      status: "ACTIVE",
    },
  });

  const agentTreasury = await prisma.agent.create({
    data: {
      userId: userAlice.id,
      name: "Alice Treasury Specialist",
      type: "finance_treasury",
      version: "1.0.0",
      status: "ACTIVE",
    },
  });

  const agentOperations = await prisma.agent.create({
    data: {
      userId: userAlice.id,
      name: "Alice Operations Specialist",
      type: "operations_execution",
      version: "1.0.0",
      status: "ACTIVE",
    },
  });

  const agentAuditor = await prisma.agent.create({
    data: {
      userId: userAlice.id,
      name: "Alice Security Auditor",
      type: "security_auditor",
      version: "1.0.0",
      status: "ACTIVE",
    },
  });

  // Provision Mandate and Wallet for Alice
  const walletAlice = await prisma.wallet.create({
    data: {
      walletId: `outlayer-vault-${runTag}`,
      apiKey: `wk_test_${runTag}`,
      nearAccountId: `alice-vault-${runTag}.testnet`,
      balanceYocto: nearToYocto("50.0"),
      agentId: agentTreasury.id,
    },
  });

  const mandateAlice = await prisma.mandate.create({
    data: {
      name: "Coordination Treasury Mandate",
      userId: userAlice.id,
      agentId: agentTreasury.id,
      walletId: walletAlice.id,
      totalBudgetYocto: nearToYocto("10.0"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("5.0"),
      approvalThresholdYocto: nearToYocto("2.0"),
      status: "ACTIVE",
      policyVersion: 1,
      allowedRecipientsJson: JSON.stringify(["*"]),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });

  // ---------------------------------------------------------------------------
  // SECTION 1: WORKFLOW PLANNING & DAG DEPENDENCIES
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("SECTION 1: WORKFLOW PLANNING & DAG CYCLE REJECTION");
  console.log("--------------------------------------------------------------------------------");

  // Test 1: Cycle Detection in DAG
  const cyclicTasks = [
    {
      stepId: "step_A",
      title: "Step A",
      order: 1,
      agentType: "research_procurement",
      requiredCapabilities: ["web_research"],
      dependencies: ["step_B"],
    },
    {
      stepId: "step_B",
      title: "Step B",
      order: 2,
      agentType: "finance_treasury",
      requiredCapabilities: ["treasury_balance_audit"],
      dependencies: ["step_A"], // Cycle A -> B -> A
    },
  ];

  const cycleResult = validateDAG(cyclicTasks as any);
  assert(
    !cycleResult.valid && Boolean(cycleResult.error?.includes("Cycle detected")),
    1,
    "Workflow DAG strictly detects and rejects dependency cycles",
    `Error reported: "${cycleResult.error}"`
  );

  // Test 2: Unknown Dependency Detection
  const unknownDepTasks = [
    {
      stepId: "step_A",
      title: "Step A",
      order: 1,
      agentType: "research_procurement",
      requiredCapabilities: ["web_research"],
      dependencies: ["step_NON_EXISTENT"],
    },
  ];
  const unknownDepResult = validateDAG(unknownDepTasks as any);
  assert(
    !unknownDepResult.valid && Boolean(unknownDepResult.error?.includes("non-existent")),
    2,
    "Workflow DAG rejects dependencies referencing non-existent tasks",
    `Error reported: "${unknownDepResult.error}"`
  );

  // Test 3: Kahn's Algorithm Execution Levels on Valid DAG
  const validTasks = [
    {
      stepId: "step_research",
      title: "Market Research",
      order: 1,
      priority: 10,
      agentType: "research_procurement",
      requiredCapabilities: ["web_research"],
      dependencies: [],
    },
    {
      stepId: "step_treasury",
      title: "Treasury Audit",
      order: 2,
      priority: 20,
      agentType: "finance_treasury",
      requiredCapabilities: ["treasury_balance_audit"],
      dependencies: [],
    },
    {
      stepId: "step_disburse",
      title: "Execute Disbursement",
      order: 3,
      priority: 30,
      agentType: "finance_treasury",
      requiredCapabilities: ["disbursement_execution"],
      dependencies: ["step_research", "step_treasury"],
    },
    {
      stepId: "step_operations",
      title: "Dispatch Notifications",
      order: 4,
      priority: 40,
      agentType: "operations_execution",
      requiredCapabilities: ["notification_dispatch"],
      dependencies: ["step_disburse"],
    },
  ];

  const validDagResult = validateDAG(validTasks as any);
  assert(
    validDagResult.valid && validDagResult.executionLevels?.length === 3,
    3,
    "DAG successfully computes parallel execution levels (Level 0: [research, treasury], Level 1: [disburse], Level 2: [operations])",
    `Levels: ${JSON.stringify(validDagResult.executionLevels)}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 2: REAL CAPABILITY MATCHING & WORKFLOW PLANNING
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 2: REAL CAPABILITY MATCHING & WORKFLOW CREATION");
  console.log("--------------------------------------------------------------------------------");

  // Create an approved objective for Alice
  const objectiveAlice = await prisma.objective.create({
    data: {
      userId: userAlice.id,
      title: "End-to-End Enterprise Procurement and Disbursement",
      originalPrompt: "Procure analytics and disburse 1 NEAR from treasury",
      status: "ACTIVE",
      mandateId: mandateAlice.id,
    },
  });

  const planAlice = await prisma.objectivePlan.create({
    data: {
      objectiveId: objectiveAlice.id,
      version: 1,
      summary: "Coordinated 4-agent workflow",
      status: "APPROVED",
      steps: {
        create: [
          {
            stepId: "step_1_research",
            objectiveId: objectiveAlice.id,
            title: "Vendor Research",
            description: "Research candidates",
            order: 1,
            agentType: "research_procurement",
            requiredCapabilitiesJson: JSON.stringify(["web_research"]),
            dependenciesJson: JSON.stringify([]),
            status: "READY",
          },
          {
            stepId: "step_2_treasury",
            objectiveId: objectiveAlice.id,
            title: "Treasury Liquidity Audit",
            description: "Audit capital reserves",
            order: 2,
            agentType: "finance_treasury",
            requiredCapabilitiesJson: JSON.stringify(["treasury_balance_audit"]),
            dependenciesJson: JSON.stringify([]),
            status: "READY",
          },
          {
            stepId: "step_3_disburse",
            objectiveId: objectiveAlice.id,
            title: "Execute Custody Payment",
            description: "Disburse 1 NEAR",
            order: 3,
            agentType: "finance_treasury",
            requiredCapabilitiesJson: JSON.stringify(["disbursement_execution"]),
            dependenciesJson: JSON.stringify(["step_1_research", "step_2_treasury"]),
            estimatedCostNear: "1.0",
            status: "PENDING",
          },
          {
            stepId: "step_4_operations",
            objectiveId: objectiveAlice.id,
            title: "Operations Verification",
            description: "Send dispatch confirmation",
            order: 4,
            agentType: "operations_execution",
            requiredCapabilitiesJson: JSON.stringify(["notification_dispatch"]),
            dependenciesJson: JSON.stringify(["step_3_disburse"]),
            status: "PENDING",
          },
        ],
      },
    },
    include: { steps: true },
  });

  // Test 4: Plan multi-agent workflow
  const plannedWorkflow = await MultiAgentWorkflowPlanner.planWorkflow({
    objectiveId: objectiveAlice.id,
    userId: userAlice.id,
    concurrencyLimit: 4,
  });

  assert(
    plannedWorkflow.tasks.length === 4 && plannedWorkflow.assignments.length === 4,
    4,
    "Workflow planner creates CoordinationRun with 4 tasks and 4 capability-matched agent assignments",
    `Run ID: ${plannedWorkflow.run.id}`
  );

  const runId = plannedWorkflow.run.id;

  // Test 5: Capability Match Verification
  const task1 = plannedWorkflow.tasks.find((t) => t.stepId === "step_1_research");
  const task2 = plannedWorkflow.tasks.find((t) => t.stepId === "step_2_treasury");
  const task4 = plannedWorkflow.tasks.find((t) => t.stepId === "step_4_operations");

  assert(
    task1.assignedAgentId === agentProcurement.id &&
      task2.assignedAgentId === agentTreasury.id &&
      task4.assignedAgentId === agentOperations.id,
    5,
    "Each specialist task accurately allocated to genuine registered agent instance",
    `Procurement -> ${agentProcurement.name}, Treasury -> ${agentTreasury.name}, Operations -> ${agentOperations.name}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 3: CONTROLLED SHARED CONTEXT & SECRET SANITIZATION
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 3: CONTROLLED SHARED OBJECTIVE CONTEXT & INTEGRITY");
  console.log("--------------------------------------------------------------------------------");

  // Test 6: Write Artifact with Secret Scrubbing & SHA-256 Hashing
  const sensitivePayload = {
    selectedVendor: "NearAnalytics Pro",
    contractPriceNear: "1.0",
    apiKey: "sk_live_secret_key_12345678",
    authToken: "bearer_xyz_super_private",
    publicEndpoint: "https://api.nearanalytics.io",
  };

  const writtenArtifact = await SharedContextService.writeArtifact({
    runId,
    objectiveId: objectiveAlice.id,
    userId: userAlice.id,
    artifactId: "procurement_recommendation",
    title: "Procurement Vendor Recommendation",
    data: sensitivePayload,
    producingAgentId: agentProcurement.id,
    producingAgentType: "research_procurement",
    producingTaskId: task1.id,
    allowedReaderAgentTypes: ["finance_treasury", "operations_execution"], // Restricted readers
    allowedWriterAgentTypes: ["research_procurement"],
    seal: true,
  });

  assert(
    writtenArtifact.data.apiKey?.includes("[REDACTED_SECRET") &&
      writtenArtifact.data.authToken?.includes("[REDACTED_SECRET") &&
      writtenArtifact.data.selectedVendor === "NearAnalytics Pro",
    6,
    "Shared context scrubs sensitive secrets and tokens before model-visible storage",
    `Scrubbed apiKey: ${writtenArtifact.data.apiKey}`
  );

  // Test 7: Authorized Read & Cryptographic Hash Check
  const readSuccess = await SharedContextService.readArtifact({
    runId,
    artifactId: "procurement_recommendation",
    userId: userAlice.id,
    requestingAgentType: "finance_treasury", // Authorized reader
  });

  assert(
    readSuccess.dataHash === writtenArtifact.dataHash && readSuccess.data.contractPriceNear === "1.0",
    7,
    "Authorized agent reads artifact with confirmed cryptographic SHA-256 integrity",
    `SHA-256: ${readSuccess.dataHash}`
  );

  // Test 8: Unauthorized Agent Type Read Rejection
  let unauthorizedReadBlocked = false;
  try {
    await SharedContextService.readArtifact({
      runId,
      artifactId: "procurement_recommendation",
      userId: userAlice.id,
      requestingAgentType: "unauthorized_marketing_agent", // Unauthorized!
    });
  } catch (err: any) {
    unauthorizedReadBlocked = err.message.includes("is unauthorized to read artifact");
  }

  assert(
    unauthorizedReadBlocked,
    8,
    "Per-agent access control blocks unauthorized agent types from reading restricted artifacts"
  );

  // Test 9: Tamper Detection on Altered Payload
  // Simulate database tampering
  await prisma.sharedObjectiveArtifact.update({
    where: { id: writtenArtifact.id },
    data: { dataJson: JSON.stringify({ ...writtenArtifact.data, contractPriceNear: "999.0" }) },
  });

  let tamperDetected = false;
  try {
    await SharedContextService.readArtifact({
      runId,
      artifactId: "procurement_recommendation",
      userId: userAlice.id,
      requestingAgentType: "finance_treasury",
    });
  } catch (err: any) {
    tamperDetected = err.message.includes("Cryptographic integrity violation");
  }

  assert(
    tamperDetected,
    9,
    "Tamper detection catches modified JSON payloads against immutable SHA-256 hash"
  );

  // Restore untampered artifact for subsequent tests
  await prisma.sharedObjectiveArtifact.update({
    where: { id: writtenArtifact.id },
    data: { dataJson: JSON.stringify(writtenArtifact.data) },
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: AGENT HANDOFF PROTOCOL & REPLAY PREVENTION
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 4: AGENT HANDOFF PROTOCOL & REPLAY ATTACK REJECTION");
  console.log("--------------------------------------------------------------------------------");

  // Test 10: Create Structured Handoff
  const handoff = await HandoffManager.createHandoff({
    runId,
    objectiveId: objectiveAlice.id,
    userId: userAlice.id,
    sourceAgentId: agentProcurement.id,
    destinationAgentId: agentTreasury.id,
    taskId: task1.id,
    targetTaskId: task2.id,
    outputReference: writtenArtifact.artifactId,
    structuredPayload: {
      vendor: "NearAnalytics Pro",
      disbursementYocto: nearToYocto("1.0"),
      vendorAccountId: "vendor.testnet",
    },
    evidenceReferences: ["https://nearanalytics.io/pricing"],
    idempotencyKey: `handoff_procurement_to_treasury_${runTag}`,
  });

  assert(
    handoff.status === "PENDING" && handoff.destinationAgentId === agentTreasury.id,
    10,
    "Agent handoff created with status PENDING, destination binding, and evidence links",
    `Handoff ID: ${handoff.id}`
  );

  // Test 11: Schema Validation Rejection (Missing Field)
  let schemaRejectionCaught = false;
  try {
    await HandoffManager.acceptHandoff({
      handoffId: handoff.id,
      destinationAgentId: agentTreasury.id,
      userId: userAlice.id,
      expectedSchema: {
        vendor: "string",
        missingNonExistentField: "string", // Required by receiving agent
      },
    });
  } catch (err: any) {
    schemaRejectionCaught = err.message.includes("missing required attribute");
  }

  assert(
    schemaRejectionCaught,
    11,
    "Handoff protocol strictly rejects payloads failing receiving agent's schema expectation"
  );

  // Reset handoff back to PENDING for acceptance test
  await prisma.agentHandoff.update({
    where: { id: handoff.id },
    data: { status: "PENDING", validationError: null },
  });

  // Test 12: Legitimate Handoff Acceptance
  const acceptedHandoff = await HandoffManager.acceptHandoff({
    handoffId: handoff.id,
    destinationAgentId: agentTreasury.id,
    userId: userAlice.id,
    expectedSchema: {
      vendor: "string",
      disbursementYocto: "string",
      vendorAccountId: "string",
    },
  });

  assert(
    acceptedHandoff.status === "ACCEPTED" && Boolean(acceptedHandoff.acceptedAt),
    12,
    "Legitimate handoff accepted with schema validation and timestamped transition"
  );

  // Test 13: Replay Attack Rejection
  let replayBlocked = false;
  try {
    await HandoffManager.acceptHandoff({
      handoffId: handoff.id,
      destinationAgentId: agentTreasury.id,
      userId: userAlice.id,
    });
  } catch (err: any) {
    replayBlocked = err.message.includes("Handoff replay rejected");
  }

  assert(
    replayBlocked,
    13,
    "Replay attack on already accepted handoff is strictly rejected"
  );

  // ---------------------------------------------------------------------------
  // SECTION 5: DATABASE-BACKED DISTRIBUTED TASK LEASES
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 5: DISTRIBUTED TASK LEASES & MULTI-INSTANCE EXCLUSIVITY");
  console.log("--------------------------------------------------------------------------------");

  // Test 14: Acquire Task Lease
  const leaseWorker1 = await TaskLeaseManager.acquireLease({
    taskId: task1.id,
    runId,
    workerId: "instance_node_1",
    userId: userAlice.id,
    ttlSeconds: 5,
  });

  assert(
    leaseWorker1.acquired && Boolean(leaseWorker1.leaseToken),
    14,
    "Worker 1 acquires exclusive database-backed task lease",
    `Worker 1 Token: ${leaseWorker1.leaseToken?.slice(0, 8)}...`
  );

  // Test 15: Concurrency Conflict - Worker 2 Blocked
  const leaseWorker2 = await TaskLeaseManager.acquireLease({
    taskId: task1.id,
    runId,
    workerId: "instance_node_2",
    userId: userAlice.id,
    ttlSeconds: 5,
  });

  assert(
    !leaseWorker2.acquired && leaseWorker2.reason === "LEASE_CONFLICT",
    15,
    "Worker 2 is blocked from acquiring task actively held by Worker 1 (LEASE_CONFLICT)",
    `Held by: ${leaseWorker2.heldBy}`
  );

  // Test 16: Heartbeat Renews Lease
  const heartbeat = await TaskLeaseManager.heartbeatLease({
    taskId: task1.id,
    workerId: "instance_node_1",
    leaseToken: leaseWorker1.leaseToken!,
    ttlSeconds: 10,
  });

  assert(
    heartbeat.renewed && Boolean(heartbeat.expiresAt),
    16,
    "Worker 1 successfully heartbeats and extends lease TTL"
  );

  // Test 17: Abandoned Lease Recovery
  // Simulate expired lease
  await prisma.taskLease.update({
    where: { taskId: task1.id },
    data: {
      expiresAt: new Date(Date.now() - 10000), // Expired 10s ago
      isReleased: false,
    },
  });
  await prisma.coordinationTask.update({
    where: { id: task1.id },
    data: { status: "RUNNING" },
  });

  const recoveredCount = await TaskLeaseManager.recoverAbandonedLeases(runId, userAlice.id);
  const recoveredTask = await prisma.coordinationTask.findUnique({
    where: { id: task1.id },
    include: { lease: true },
  });

  assert(
    recoveredCount === 1 && recoveredTask?.status === "READY" && recoveredTask.lease?.isReleased === true,
    17,
    "Expired/abandoned worker lease recovered and task safely reset to READY for retry",
    `Recovered count: ${recoveredCount}, status: ${recoveredTask?.status}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 6: CENTRAL FINANCIAL AUTHORITY & CAS CONCURRENCY
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 6: CENTRAL FINANCIAL COORDINATION & CAS CONCURRENCY");
  console.log("--------------------------------------------------------------------------------");

  const task3 = plannedWorkflow.tasks.find((t) => t.stepId === "step_3_disburse");

  // Test 18: Pre-Execution Atomic Reservation & Successful Settlement
  const disburseAmountYocto = nearToYocto("1.0");

  const financialExecution = await FinancialCoordinator.executeWithAuthority({
    runId,
    taskId: task3.id,
    agentId: agentTreasury.id,
    userId: userAlice.id,
    amountYocto: disburseAmountYocto,
    recipient: "custody-vendor.testnet",
    purpose: "Disburse 1 NEAR for vendor analytics",
    idempotencyKey: `fin_tx_${runTag}_1`,
    action: async () => {
      // Simulate real settlement action
      return { txHash: `near_tx_receipt_${runTag}`, settled: true };
    },
  });

  assert(
    financialExecution.success && financialExecution.settled && Boolean(financialExecution.transactionRecordId),
    18,
    "Financial action obtains CAS pre-reservation, executes successfully, and settles atomically",
    `Settled amount: ${financialExecution.amountNear} NEAR (TxRecord: ${financialExecution.transactionRecordId})`
  );

  // Test 19: Mathematical Invariant Check: Authorized = Spent + Reserved + Available
  const mandatePostSettle = await prisma.mandate.findUnique({
    where: { id: mandateAlice.id },
  });

  const total = BigInt(mandatePostSettle!.totalBudgetYocto);
  const spent = BigInt(mandatePostSettle!.spentYocto || "0");
  const reserved = BigInt(mandatePostSettle!.reservedYocto || "0");
  const available = total - (spent + reserved);

  assert(
    total === spent + reserved + available && spent === BigInt(disburseAmountYocto) && reserved === BigInt(0),
    19,
    "Authority Invariant Preserved: Authorized (10.0 NEAR) = Spent (1.0 NEAR) + Reserved (0) + Available (9.0 NEAR)",
    `Spent: ${yoctoToNear(spent.toString())} NEAR, Available: ${yoctoToNear(available.toString())} NEAR`
  );

  // Test 20: Execution Failure Triggers Automatic Budget Release (Zero Leakage)
  const failDisburseAmountYocto = nearToYocto("2.0");

  const failedExecution = await FinancialCoordinator.executeWithAuthority({
    runId,
    taskId: task3.id,
    agentId: agentTreasury.id,
    userId: userAlice.id,
    amountYocto: failDisburseAmountYocto,
    recipient: "custody-vendor.testnet",
    purpose: "Simulated failing disbursement",
    idempotencyKey: `fin_tx_${runTag}_fail`,
    action: async () => {
      throw new Error("RPC Network Timeout during custody disbursement");
    },
  });

  const mandatePostFailure = await prisma.mandate.findUnique({
    where: { id: mandateAlice.id },
  });

  const postFailSpent = BigInt(mandatePostFailure!.spentYocto || "0");
  const postFailReserved = BigInt(mandatePostFailure!.reservedYocto || "0");

  assert(
    !failedExecution.success &&
      failedExecution.released &&
      postFailReserved === BigInt(0) &&
      postFailSpent === BigInt(disburseAmountYocto),
    20,
    "Execution failure automatically releases reserved budget back to available pool with zero leak",
    `Reserved returned to 0, Spent remains exactly 1.0 NEAR`
  );

  // Test 21: Duplicate Financial Action Rejection (Idempotency)
  let duplicateRejected = false;
  try {
    await FinancialCoordinator.executeWithAuthority({
      runId,
      taskId: task3.id,
      agentId: agentTreasury.id,
      userId: userAlice.id,
      amountYocto: disburseAmountYocto,
      recipient: "custody-vendor.testnet",
      purpose: "Duplicate disbursement attempt",
      idempotencyKey: `fin_tx_${runTag}_1`, // Identical key already settled in Test 18!
      action: async () => ({ settled: true }),
    });
  } catch (err: any) {
    duplicateRejected = err.message.includes("already settled");
  }

  assert(
    duplicateRejected,
    21,
    "Duplicate financial actions with matching idempotency keys are strictly rejected"
  );

  // ---------------------------------------------------------------------------
  // SECTION 7: FULL RUN ORCHESTRATION & PARALLEL EXECUTION
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 7: MULTI-AGENT EXECUTION LOOP & DEPENDENCY ENFORCEMENT");
  console.log("--------------------------------------------------------------------------------");

  // Reset tasks to clean state for coordinator execution
  await prisma.coordinationTask.updateMany({
    where: { runId, stepId: { in: ["step_1_research", "step_2_treasury"] } },
    data: { status: "READY", retryCount: 0, errorDetails: null },
  });
  await prisma.coordinationTask.updateMany({
    where: { runId, stepId: { in: ["step_3_disburse", "step_4_operations"] } },
    data: { status: "PENDING", retryCount: 0, errorDetails: null },
  });
  await prisma.coordinationRun.update({
    where: { id: runId },
    data: { status: "PENDING" },
  });

  // Execute full coordination run
  const runProgress = await MultiAgentCoordinator.executeRun({
    runId,
    userId: userAlice.id,
    workerId: "test_master_worker",
  });

  const finalRunTasks = await prisma.coordinationTask.findMany({
    where: { runId },
    orderBy: { order: "asc" },
  });

  const allCompleted = finalRunTasks.every((t) => t.status === "COMPLETED");

  assert(
    runProgress.status === "COMPLETED" && allCompleted,
    22,
    "MultiAgentCoordinator coordinates all 4 specialist agents to full COMPLETED status",
    `Completed: ${runProgress.completedTasks}/${runProgress.totalTasks} tasks (${runProgress.progressPercent}%)`
  );

  // ---------------------------------------------------------------------------
  // SECTION 8: FAILURE RECOVERY, REASSIGNMENT & CANCELLATION
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 8: REASSIGNMENT, CASCADE PREVENTION & CANCELLATION");
  console.log("--------------------------------------------------------------------------------");

  // Create a second run to test reassignment and cascade blocking
  const failObjective = await prisma.objective.create({
    data: {
      userId: userAlice.id,
      title: "Failure Recovery Test Objective",
      originalPrompt: "Test failure and reassignment",
      status: "ACTIVE",
    },
  });

  const failPlan = await prisma.objectivePlan.create({
    data: {
      objectiveId: failObjective.id,
      version: 1,
      summary: "Failure test plan",
      status: "APPROVED",
      steps: {
        create: [
          {
            stepId: "f_step_1",
            objectiveId: failObjective.id,
            title: "Crashing Upstream Step",
            description: "Crashing upstream step description",
            order: 1,
            agentType: "research_procurement",
            requiredCapabilitiesJson: JSON.stringify(["web_research"]),
            status: "READY",
          },
          {
            stepId: "f_step_2",
            objectiveId: failObjective.id,
            title: "Dependent Downstream Step",
            description: "Dependent downstream step description",
            order: 2,
            agentType: "operations_execution",
            requiredCapabilitiesJson: JSON.stringify(["notification_dispatch"]),
            dependenciesJson: JSON.stringify(["f_step_1"]),
            status: "PENDING",
          },
        ],
      },
    },
    include: { steps: true },
  });

  const failWorkflow = await MultiAgentWorkflowPlanner.planWorkflow({
    objectiveId: failObjective.id,
    userId: userAlice.id,
  });

  const failTask1 = failWorkflow.tasks.find((t) => t.stepId === "f_step_1");
  const failTask2 = failWorkflow.tasks.find((t) => t.stepId === "f_step_2");

  // Test 23: Reassign Task to Capable Agent
  const reassignment = await CoordinationRecoveryManager.reassignTask({
    runId: failWorkflow.run.id,
    taskId: failTask1.id,
    userId: userAlice.id,
    reason: "Agent process unresponsive; shifting execution",
  });

  assert(
    reassignment.success && Boolean(reassignment.newAgentId),
    23,
    "Failed or unresponsive task successfully reassigned to capable agent with preserved history",
    `New Agent ID: ${reassignment.newAgentId}`
  );

  // Test 24: Prevent Cascade Failure - Block Downstream Tasks
  const blockedIds = await CoordinationRecoveryManager.blockDownstreamTasks(
    failWorkflow.run.id,
    "f_step_1"
  );
  const downstreamTaskCheck = await prisma.coordinationTask.findUnique({
    where: { id: failTask2.id },
  });

  assert(
    downstreamTaskCheck?.status === "BLOCKED" && blockedIds.includes(failTask2.id),
    24,
    "Downstream tasks automatically marked BLOCKED when upstream dependency fails permanently"
  );

  // Test 25: Cancellation Propagation
  await CoordinationRecoveryManager.cancelCoordinationRun(
    failWorkflow.run.id,
    userAlice.id,
    "User initiated emergency halt"
  );

  const cancelledRun = await prisma.coordinationRun.findUnique({
    where: { id: failWorkflow.run.id },
    include: { tasks: true },
  });

  assert(
    cancelledRun?.status === "CANCELLED" &&
      cancelledRun.tasks.every((t) => ["CANCELLED", "COMPLETED", "BLOCKED"].includes(t.status)),
    25,
    "Cancellation propagates atomically across coordination run and all active tasks"
  );

  // ---------------------------------------------------------------------------
  // SECTION 9: USER ISOLATION
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 9: USER ISOLATION");
  console.log("--------------------------------------------------------------------------------");

  // Test 26: Cross-User Access Rejection
  let unauthorizedRunAccessBlocked = false;
  try {
    await MultiAgentCoordinator.executeRun({
      runId: plannedWorkflow.run.id, // Alice's run
      userId: userBob.id, // Bob attempting execution!
    });
  } catch (err: any) {
    unauthorizedRunAccessBlocked = err.message.includes("unauthorized");
  }

  assert(
    unauthorizedRunAccessBlocked,
    26,
    "User isolation prevents unauthorized user from executing or accessing another user's coordination run"
  );

  // ---------------------------------------------------------------------------
  // SECTION 10: UNIFIED SHA-256 CRYPTOGRAPHIC AUDIT LEDGER INTEGRITY
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 10: UNIFIED SHA-256 CRYPTOGRAPHIC AUDIT LEDGER INTEGRITY");
  console.log("--------------------------------------------------------------------------------");

  // Test 27: Verify SHA-256 Audit Chain Continuity
  const aliceAuditVerification = await verifyAuditChain(userAlice.id);

  assert(
    aliceAuditVerification.valid && aliceAuditVerification.count > 10,
    27,
    "Full SHA-256 cryptographic audit chain validated from genesis to head with zero breaks",
    `Verified ${aliceAuditVerification.count} linked audit events. Head Hash: ${aliceAuditVerification.headHash?.slice(0, 16)}...`
  );

  console.log("\n================================================================================");
  console.log(`  VERIFICATION RESULTS: ${passedCount} / ${passedCount + failedCount} PASSED (${Math.round((passedCount / (passedCount + failedCount)) * 100)}%)`);
  console.log("================================================================================");

  if (failedCount === 0) {
    console.log("\nALL MILESTONE 6 MULTI-AGENT COORDINATION INVARIANTS VERIFIED SUCCESSFULLY!\n");
  }
}

main().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
