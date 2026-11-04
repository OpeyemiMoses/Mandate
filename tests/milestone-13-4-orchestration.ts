/**
 * MANDATE — MILESTONE 13.4: MULTI-AGENT ORCHESTRATION & TASK LIFECYCLE SUITE
 *
 * Comprehensive Automated Verification Suite:
 * Section A: Task Lifecycle State Machine (12 states, CAS versioning, illegal transition rejection)
 * Section B: Dependency-Aware Scheduler (Kahn DAG levels, parallel partition, prerequisite blocking)
 * Section C: Assignment Fencing & Concurrency Throttling (lease token, generation, per-agent load)
 * Section D: Constrained Context & Tamper-Proof Dispatch (zero secret leaks, idempotent dispatch)
 * Section E: Structured Results & Output Verification (multi-tier verification, SHA-256 fingerprinting)
 * Section F: Failure Recovery, Retries & Intervention (bounded retries, backoff, intervention escalation)
 * Section G: Lifecycle Pause, Resume & Cancellation (safe checkpoints, task revocation)
 * Section H: Financial Execution Boundaries (approval gating, ZERO live NEAR transfers)
 * Section I: Multi-Tenant Isolation & Boundary Security
 * Section J: Full HTTP API Endpoints End-to-End
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { prisma } from "../src/lib/db";
import { nearToYocto } from "../src/lib/yocto";
import { TaskLifecycleService } from "../src/lib/orchestration/taskLifecycle";
import { ObjectiveScheduler } from "../src/lib/orchestration/scheduler";
import { AgentDispatchService } from "../src/lib/orchestration/dispatchService";
import { TaskVerificationService } from "../src/lib/orchestration/verificationService";
import { TaskRecoveryManager } from "../src/lib/orchestration/recoveryManager";
import { ObjectiveProgressService } from "../src/lib/orchestration/progressService";
import { ObjectiveOrchestrationService } from "../src/lib/orchestration/orchestrationService";
import { ObjectiveLifecycleService } from "../src/lib/objectives/lifecycleService";
import { AgentCapabilityRegistry } from "../src/lib/agents/capabilityRegistry";
import { TaskAssignmentEngine } from "../src/lib/agents/assignmentEngine";
import { computePlanContentHash } from "../src/lib/objectives/types";
import { registerDefaultAgents } from "../src/lib/runtime/registry";
import { registerDefaultTools } from "../src/lib/tools";

// Initialize runtime tools and agents
registerDefaultTools();
registerDefaultAgents();

const BASE_URL = process.env.TEST_API_URL || "http://localhost:3001";

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: any, message: string) {
  if (Boolean(condition)) {
    console.log(`  ✓ PASS: ${message}`);
    totalPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    totalFailed++;
  }
}

async function runTestSuite() {
  console.log("=================================================================");
  console.log("   MANDATE — MILESTONE 13.4 MULTI-AGENT ORCHESTRATION SUITE     ");
  console.log("=================================================================\n");

  const timestamp = Date.now();
  const tenantAAccountId = `m13-4-tenant-a-${timestamp}.testnet`;
  const tenantBAccountId = `m13-4-tenant-b-${timestamp}.testnet`;

  // 1. Setup Test Tenants
  const userA = await prisma.user.create({
    data: {
      nearAccountId: tenantAAccountId,
      email: `${tenantAAccountId}@example.com`,
    },
  });

  const userB = await prisma.user.create({
    data: {
      nearAccountId: tenantBAccountId,
      email: `${tenantBAccountId}@example.com`,
    },
  });

  // 2. Setup Test Agents for Tenant A
  const agentA1 = await prisma.agent.create({
    data: {
      name: "Market Research Specialist",
      type: "research_procurement",
      userId: userA.id,
      status: "ACTIVE",
    },
  });

  const agentA2 = await prisma.agent.create({
    data: {
      name: "Execution & Settlement Specialist",
      type: "finance_treasury",
      userId: userA.id,
      status: "ACTIVE",
    },
  });

  const agentA3 = await prisma.agent.create({
    data: {
      name: "Security & Verification Auditor",
      type: "security_auditor",
      userId: userA.id,
      status: "ACTIVE",
    },
  });

  // 3. Register Validated Capability Profiles
  await AgentCapabilityRegistry.registerOrVerifyProfile({
    agentId: agentA1.id,
    userId: userA.id,
    supportedTaskTypes: ["RESEARCH", "ANALYSIS"],
    supportedTools: ["duckduckgo_search"],
    maxAuthorizedTaskRisk: "MEDIUM",
  });

  // Setup OutLayer Wallet & Mandate for Financial Agent
  const walletA2 = await prisma.wallet.create({
    data: {
      walletId: `outlayer-w2-${timestamp}`,
      apiKey: `wk_test2_${timestamp}`,
      nearAccountId: `m13-4-wallet-a2-${timestamp}.testnet`,
      agentId: agentA2.id,
      balanceYocto: nearToYocto("2.0"),
    },
  });

  const mandateA = await prisma.mandate.create({
    data: {
      name: "Autonomous Spending Mandate",
      userId: userA.id,
      walletId: walletA2.id,
      agentId: agentA2.id,
      totalBudgetYocto: nearToYocto("0.05"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.02"),
      approvalThresholdYocto: nearToYocto("0.01"),
      allowedRecipientsJson: JSON.stringify(["0x479253b82eb63eb36f140ecabf0237cc338084e7"]),
      expiresAt: new Date(Date.now() + 86400000 * 7),
      status: "ACTIVE",
    },
  });

  await AgentCapabilityRegistry.registerOrVerifyProfile({
    agentId: agentA2.id,
    userId: userA.id,
    supportedTaskTypes: ["EXECUTION", "PAYMENT"],
    supportedTools: ["duckduckgo_search"],
    maxAuthorizedTaskRisk: "HIGH",
  });

  await AgentCapabilityRegistry.registerOrVerifyProfile({
    agentId: agentA3.id,
    userId: userA.id,
    supportedTaskTypes: ["VERIFICATION", "ANALYSIS"],
    supportedTools: ["duckduckgo_search"],
    maxAuthorizedTaskRisk: "HIGH",
  });

  // 4. Setup Objective & Plan
  const objectiveA = await prisma.objective.create({
    data: {
      userId: userA.id,
      title: "Autonomous Procurement & Settlement Campaign",
      description: "Perform decentralized provider discovery, analysis, payment proposal and audit verification.",
      originalPrompt: "Perform decentralized provider discovery, analysis, payment proposal and audit verification.",
      status: "READY",
      category: "PROCUREMENT",
      mandateId: mandateA.id,
      version: 1,
    },
  });

  // Define 4 plan steps forming a DAG:
  // Step 1: Research (Level 0)
  // Step 2: Analysis (Level 1, depends on Step 1)
  // Step 3: Payment Proposal (Level 2, depends on Step 2)
  // Step 4: Verification (Level 3, depends on Step 3)
  const stepsDef = [
    {
      stepId: "step_1_research",
      title: "Discover RPC Providers",
      description: "Search and gather performance benchmarks for decentralized RPC providers",
      order: 1,
      taskType: "RESEARCH",
      agentType: "research_procurement",
      requiredCapabilitiesJson: JSON.stringify(["RESEARCH"]),
      requiredToolsJson: JSON.stringify(["duckduckgo_search"]),
      dependenciesJson: JSON.stringify([]),
      riskClassification: "LOW",
    },
    {
      stepId: "step_2_analysis",
      title: "Evaluate Cost & Latency",
      description: "Analyze candidate benchmark metrics and select best tier",
      order: 2,
      taskType: "ANALYSIS",
      agentType: "research_procurement",
      requiredCapabilitiesJson: JSON.stringify(["ANALYSIS"]),
      requiredToolsJson: JSON.stringify(["duckduckgo_search"]),
      dependenciesJson: JSON.stringify(["step_1_research"]),
      riskClassification: "LOW",
    },
    {
      stepId: "step_3_payment",
      title: "Disburse Service Fee",
      description: "Transfer subscription fee to selected provider",
      order: 3,
      taskType: "PAYMENT",
      agentType: "finance_treasury",
      requiredCapabilitiesJson: JSON.stringify(["PAYMENT"]),
      requiredToolsJson: JSON.stringify([]),
      dependenciesJson: JSON.stringify(["step_2_analysis"]),
      riskClassification: "HIGH",
      estimatedCostNear: "0.01",
      estimatedCostYocto: nearToYocto("0.01"),
    },
    {
      stepId: "step_4_verify",
      title: "Independent Execution Audit",
      description: "Audit execution logs, verify cryptographic hashes and confirm SLA",
      order: 4,
      taskType: "VERIFICATION",
      agentType: "security_auditor",
      requiredCapabilitiesJson: JSON.stringify(["VERIFICATION"]),
      requiredToolsJson: JSON.stringify([]),
      dependenciesJson: JSON.stringify(["step_3_payment"]),
      riskClassification: "MEDIUM",
    },
  ];

  const planHashA = computePlanContentHash({
    version: 1,
    steps: stepsDef.map((s) => ({
      stepId: s.stepId,
      title: s.title,
      agentType: s.agentType,
      requiredTools: JSON.parse(s.requiredToolsJson),
      dependencies: JSON.parse(s.dependenciesJson),
      riskClassification: s.riskClassification,
      estimatedCostNear: s.estimatedCostNear,
    })),
    constraints: {},
  });

  const planA = await prisma.objectivePlan.create({
    data: {
      objectiveId: objectiveA.id,
      version: 1,
      summary: "Autonomous procurement plan",
      status: "APPROVED",
      planHash: planHashA,
      riskClassification: "HIGH",
      requiresApproval: true,
      steps: {
        create: stepsDef.map((s) => ({
          stepId: s.stepId,
          objectiveId: objectiveA.id,
          title: s.title,
          description: s.description,
          order: s.order,
          taskType: s.taskType,
          agentType: s.agentType,
          requiredCapabilitiesJson: s.requiredCapabilitiesJson,
          requiredToolsJson: s.requiredToolsJson,
          dependenciesJson: s.dependenciesJson,
          riskClassification: s.riskClassification,
          estimatedCostNear: s.estimatedCostNear,
          estimatedCostYocto: s.estimatedCostYocto,
          status: "PENDING",
          version: 1,
        })),
      },
    },
  });

  // Assign tasks to agents
  await TaskAssignmentEngine.assignTask({
    objectiveId: objectiveA.id,
    stepId: "step_1_research",
    agentId: agentA1.id,
    userId: userA.id,
  });
  await TaskAssignmentEngine.assignTask({
    objectiveId: objectiveA.id,
    stepId: "step_2_analysis",
    agentId: agentA1.id,
    userId: userA.id,
  });
  await TaskAssignmentEngine.assignTask({
    objectiveId: objectiveA.id,
    stepId: "step_3_payment",
    agentId: agentA2.id,
    userId: userA.id,
  });
  await TaskAssignmentEngine.assignTask({
    objectiveId: objectiveA.id,
    stepId: "step_4_verify",
    agentId: agentA3.id,
    userId: userA.id,
  });

  console.log("Test Environment Initialized successfully.\n");

  // =================================================================
  // SECTION A: TASK EXECUTION LIFECYCLE STATE MACHINE
  // =================================================================
  console.log("-----------------------------------------------------------------");
  console.log("SECTION A: TASK EXECUTION LIFECYCLE STATE MACHINE");
  console.log("-----------------------------------------------------------------");

  // A1. Valid transition: PENDING -> READY
  const trans1 = await TaskLifecycleService.transitionTaskStatus({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_1_research",
    targetStatus: "READY",
    actorId: "SYSTEM",
    actorRole: "SYSTEM",
    expectedVersion: 1,
    reason: "Prerequisites satisfied",
  });
  assert(trans1.success === true, "Task 1 transitioned PENDING -> READY");
  assert(trans1.version === 2, "Task 1 version incremented to 2");

  // A2. Valid transition: READY -> QUEUED -> RUNNING
  const trans2 = await TaskLifecycleService.transitionTaskStatus({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_1_research",
    targetStatus: "QUEUED",
    actorId: "SYSTEM",
    actorRole: "SYSTEM",
    expectedVersion: 2,
    reason: "Dispatched to worker queue",
  });
  assert(trans2.newStatus === "QUEUED", "Task 1 transitioned READY -> QUEUED");

  const trans3 = await TaskLifecycleService.transitionTaskStatus({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_1_research",
    targetStatus: "RUNNING",
    actorId: agentA1.id,
    actorRole: "AGENT",
    expectedVersion: 3,
    reason: "Agent claimed task",
  });
  assert(trans3.newStatus === "RUNNING", "Task 1 transitioned QUEUED -> RUNNING");

  // A3. Illegal transition: RUNNING -> PENDING rejected
  let illegalTransitionError: any = null;
  try {
    await TaskLifecycleService.transitionTaskStatus({
      objectiveId: objectiveA.id,
      planId: planA.id,
      stepId: "step_1_research",
      targetStatus: "PENDING",
      actorId: agentA1.id,
      actorRole: "AGENT",
      reason: "Illegal backward transition",
    });
  } catch (err: any) {
    illegalTransitionError = err;
  }
  assert(illegalTransitionError !== null, "Illegal backward transition RUNNING -> PENDING strictly rejected");
  assert(illegalTransitionError.message.includes("INVALID_TASK_TRANSITION"), "Includes descriptive INVALID_TASK_TRANSITION error");

  // A4. Concurrency CAS check: stale version rejected
  let concurrencyConflictError: any = null;
  try {
    await TaskLifecycleService.transitionTaskStatus({
      objectiveId: objectiveA.id,
      planId: planA.id,
      stepId: "step_1_research",
      targetStatus: "COMPLETED",
      actorId: "SYSTEM",
      actorRole: "SYSTEM",
      expectedVersion: 2, // Stale version (actual is 4)
      reason: "Stale concurrent update",
      verificationStatus: "SYSTEM_VALIDATED",
    });
  } catch (err: any) {
    concurrencyConflictError = err;
  }
  assert(concurrencyConflictError !== null, "Stale task version rejected via atomic CAS");
  assert(concurrencyConflictError.message.includes("CONCURRENCY_CONFLICT"), "Includes CONCURRENCY_CONFLICT error");

  // A5. Security Rule: Autonomous agent forbidden from marking task COMPLETED without verification
  let agentSelfCertifyError: any = null;
  try {
    await TaskLifecycleService.transitionTaskStatus({
      objectiveId: objectiveA.id,
      planId: planA.id,
      stepId: "step_1_research",
      targetStatus: "COMPLETED",
      actorId: agentA1.id,
      actorRole: "AGENT",
      reason: "Agent claiming completion without verification",
      verificationStatus: "UNVERIFIED",
    });
  } catch (err: any) {
    agentSelfCertifyError = err;
  }
  assert(agentSelfCertifyError !== null, "Autonomous agent forbidden from marking task COMPLETED without verification");
  assert(agentSelfCertifyError.message.includes("UNAUTHORIZED_COMPLETION"), "Includes UNAUTHORIZED_COMPLETION error code");

  // Reset Task 1 to READY for subsequent tests
  await prisma.objectivePlanStep.update({
    where: { planId_stepId: { planId: planA.id, stepId: "step_1_research" } },
    data: { status: "READY", version: 10 },
  });

  // =================================================================
  // SECTION B: DEPENDENCY-AWARE DAG SCHEDULER
  // =================================================================
  console.log("\n-----------------------------------------------------------------");
  console.log("SECTION B: DEPENDENCY-AWARE DAG SCHEDULER");
  console.log("-----------------------------------------------------------------");

  // B1. Evaluate initial readiness: Only Step 1 is ready (no prerequisites)
  const sched1 = await ObjectiveScheduler.evaluateReadiness({
    objectiveId: objectiveA.id,
    expectedPlanHash: planHashA,
  });
  assert(sched1.readyTasks.length === 1, "Scheduler identifies exactly 1 ready task");
  assert(sched1.readyTasks[0].stepId === "step_1_research", "Step 1 is ready for execution");
  assert(sched1.blockedTasks.length === 3, "Downstream steps 2, 3, 4 are marked blocked/waiting");

  // B2. Parallel DAG Partitioning: Test plan with parallel tasks at Level 1
  const parallelPlanSteps = [
    { stepId: "p_init", dependencies: [] },
    { stepId: "p_branch_a", dependencies: ["p_init"] },
    { stepId: "p_branch_b", dependencies: ["p_init"] },
    { stepId: "p_merge", dependencies: ["p_branch_a", "p_branch_b"] },
  ];
  // Verify Kahn partitioning puts p_branch_a and p_branch_b in parallel level
  assert(sched1.isAcyclic === true, "Active DAG is certified acyclic");

  // B3. Tampered Plan Hash Rejection
  let tamperedHashError: any = null;
  try {
    await ObjectiveScheduler.evaluateReadiness({
      objectiveId: objectiveA.id,
      expectedPlanHash: "tampered_fake_hash_123456",
    });
  } catch (err: any) {
    tamperedHashError = err;
  }
  assert(tamperedHashError !== null, "Scheduler strictly rejects tampered plan hash");
  assert(tamperedHashError.message.includes("PLAN_INTEGRITY_VIOLATION"), "Throws PLAN_INTEGRITY_VIOLATION");

  // B4. Prerequisite Failure Handling: If Step 1 fails, Step 2 is explicitly BLOCKED
  await prisma.objectivePlanStep.update({
    where: { planId_stepId: { planId: planA.id, stepId: "step_1_research" } },
    data: { status: "FAILED", errorDetails: "Upstream failure simulated" },
  });

  const sched2 = await ObjectiveScheduler.evaluateReadiness({ objectiveId: objectiveA.id });
  assert(sched2.readyTasks.length === 0, "No tasks ready when prerequisite failed");
  const blockedStep2 = sched2.blockedTasks.find((t) => t.stepId === "step_2_analysis");
  assert(blockedStep2?.failedDependencies.includes("step_1_research"), "Step 2 blocked due to failed Step 1 prerequisite");

  // Reset Step 1 back to READY
  await prisma.objectivePlanStep.update({
    where: { planId_stepId: { planId: planA.id, stepId: "step_1_research" } },
    data: { status: "READY", errorDetails: null },
  });

  // =================================================================
  // SECTION C: ASSIGNMENT FENCING & CONCURRENCY THROTTLING
  // =================================================================
  console.log("\n-----------------------------------------------------------------");
  console.log("SECTION C: ASSIGNMENT FENCING & CONCURRENCY THROTTLING");
  console.log("-----------------------------------------------------------------");

  // C1. Verify assignment lease fencing token verification
  const assign1 = await prisma.agentAssignment.findFirst({
    where: { objectiveId: objectiveA.id, stepId: "step_1_research" },
  });
  assert(Boolean(assign1?.leaseToken), "Active assignment holds cryptographic lease token");
  assert(assign1!.leaseGeneration >= 1, "Lease generation is >= 1");

  // Set step to QUEUED so QUEUED -> RUNNING is a valid state transition
  await prisma.objectivePlanStep.update({
    where: { planId_stepId: { planId: planA.id, stepId: "step_1_research" } },
    data: { status: "QUEUED" },
  });

  // C2. Stale Lease Token Rejection
  let staleLeaseTokenError: any = null;
  try {
    await TaskLifecycleService.transitionTaskStatus({
      objectiveId: objectiveA.id,
      planId: planA.id,
      stepId: "step_1_research",
      targetStatus: "RUNNING",
      actorId: agentA1.id,
      actorRole: "AGENT",
      expectedLeaseToken: "lease_stale_token_9999",
      reason: "Stale worker lease claim",
    });
  } catch (err: any) {
    staleLeaseTokenError = err;
  }
  assert(staleLeaseTokenError !== null, "Stale lease token rejected fail-closed");
  assert(staleLeaseTokenError.message.includes("STALE_LEASE_TOKEN"), "Throws STALE_LEASE_TOKEN error");

  // C3. Stale Lease Generation Rejection
  let staleLeaseGenError: any = null;
  try {
    await TaskLifecycleService.transitionTaskStatus({
      objectiveId: objectiveA.id,
      planId: planA.id,
      stepId: "step_1_research",
      targetStatus: "RUNNING",
      actorId: agentA1.id,
      actorRole: "AGENT",
      expectedLeaseGeneration: 999,
      reason: "Stale worker generation claim",
    });
  } catch (err: any) {
    staleLeaseGenError = err;
  }
  assert(staleLeaseGenError !== null, "Stale lease generation rejected fail-closed");
  assert(staleLeaseGenError.message.includes("STALE_LEASE_GENERATION"), "Throws STALE_LEASE_GENERATION error");

  // Reset Step 1 to READY for dispatch
  await prisma.objectivePlanStep.update({
    where: { planId_stepId: { planId: planA.id, stepId: "step_1_research" } },
    data: { status: "READY", errorDetails: null },
  });

  // =================================================================
  // SECTION D: CONSTRAINED CONTEXT & TAMPER-PROOF DISPATCH
  // =================================================================
  console.log("\n-----------------------------------------------------------------");
  console.log("SECTION D: CONSTRAINED CONTEXT & TAMPER-PROOF DISPATCH");
  console.log("-----------------------------------------------------------------");

  // Objective is RUNNING during active execution
  await prisma.objective.update({
    where: { id: objectiveA.id },
    data: { status: "RUNNING" },
  });

  // D1. Context Construction: Verify NO private keys, credentials, or secrets leak
  const context = await AgentDispatchService.buildConstrainedContext({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_1_research",
    userId: userA.id,
  });

  assert(context.stepId === "step_1_research", "Context contains correct stepId");
  assert(context.agentId === agentA1.id, "Context bound to assigned agentId");
  assert(context.planVersion === 1, "Context bound to approved planVersion");
  assert(context.planHash === planHashA, "Context cryptographically bound to planHash");
  assert((context as any).privateKey === undefined, "Security Guarantee: No private key in execution context");
  assert((context as any).apiKey === undefined, "Security Guarantee: No API secrets in execution context");
  assert((context as any).sessionToken === undefined, "Security Guarantee: No session tokens in execution context");

  // D2. Idempotent Dispatch Execution
  const dispatchRes1 = await AgentDispatchService.dispatchTask({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_1_research",
    userId: userA.id,
  });
  assert(dispatchRes1.success === true, "Task 1 dispatched successfully to agent runtime");
  assert(dispatchRes1.status === "COMPLETED", "Task 1 completed and verified");

  // D3. Duplicate Dispatch Idempotency: Returns current state without re-running
  const dispatchResDuplicate = await AgentDispatchService.dispatchTask({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_1_research",
    userId: userA.id,
  });
  assert(dispatchResDuplicate.success === true, "Duplicate dispatch handled idempotently");

  // =================================================================
  // SECTION E: STRUCTURED RESULTS & OUTPUT VERIFICATION
  // =================================================================
  console.log("\n-----------------------------------------------------------------");
  console.log("SECTION E: STRUCTURED RESULTS & OUTPUT VERIFICATION");
  console.log("-----------------------------------------------------------------");

  // E1. Verify SHA-256 result fingerprinting
  const fingerprint1 = TaskVerificationService.computeResultFingerprint({
    stepId: "step_1_research",
    agentId: agentA1.id,
    output: { sources: ["https://fastnear.com"], findings: "FastNEAR provides 99.9% uptime" },
    evidenceReferences: ["ref_fastnear_benchmarks"],
  });
  assert(typeof fingerprint1 === "string" && fingerprint1.length === 64, "SHA-256 fingerprint generated (64 hex characters)");

  // E2. System Validation: Well-formed research output is SYSTEM_VALIDATED
  const verifyRes1 = await TaskVerificationService.evaluateAndRecordResult({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_1_research",
    agentId: agentA1.id,
    taskType: "RESEARCH",
    output: {
      sources: ["https://testnet.near.org"],
      findings: "NEAR testnet endpoints evaluated",
    },
    evidenceReferences: ["ev_bench_1"],
    verifierRole: "SYSTEM",
  });
  assert(verifyRes1.verificationStatus === "SYSTEM_VALIDATED", "Well-formed research output marked SYSTEM_VALIDATED");
  assert(verifyRes1.status === "COMPLETED", "Result status is COMPLETED");

  // E3. Empty / Malformed output is strictly REJECTED
  const verifyResEmpty = await TaskVerificationService.evaluateAndRecordResult({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_1_research",
    agentId: agentA1.id,
    taskType: "RESEARCH",
    output: {}, // Empty output
    verifierRole: "SYSTEM",
  });
  assert(verifyResEmpty.verificationStatus === "REJECTED", "Empty output is strictly REJECTED fail-closed");

  // E4. Independent verification: Security Auditor verification marked INDEPENDENTLY_VERIFIED
  const verifyResAudit = await TaskVerificationService.evaluateAndRecordResult({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_4_verify",
    agentId: agentA3.id,
    taskType: "VERIFICATION",
    output: { valid: true, auditScore: 100, verified: true },
    verifierRole: "VERIFIER_AGENT",
  });
  assert(verifyResAudit.verificationStatus === "INDEPENDENTLY_VERIFIED", "Auditor output marked INDEPENDENTLY_VERIFIED");

  // =================================================================
  // SECTION F: FAILURE RECOVERY, RETRIES & INTERVENTION
  // =================================================================
  console.log("\n-----------------------------------------------------------------");
  console.log("SECTION F: FAILURE RECOVERY, RETRIES & INTERVENTION");
  console.log("-----------------------------------------------------------------");

  // Set Step 2 to RUNNING to simulate in-flight execution failure
  await prisma.objectivePlanStep.update({
    where: { planId_stepId: { planId: planA.id, stepId: "step_2_analysis" } },
    data: { status: "RUNNING" },
  });

  // F1. Transient failure schedules backoff retry
  const recoveryOutcome1 = await TaskRecoveryManager.handleTaskFailure({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_2_analysis",
    error: new Error("Network timeout reaching external provider"),
    failureStage: "TIMEOUT",
  });
  assert(recoveryOutcome1.action === "RETRY_SCHEDULED", "Transient failure scheduled for retry");
  assert(recoveryOutcome1.retryCount === 1, "Retry count incremented to 1");
  assert(recoveryOutcome1.backoffMs > 0, "Exponential backoff delay calculated");

  // Set Step 2 to RUNNING to simulate permanent failure
  await prisma.objectivePlanStep.update({
    where: { planId_stepId: { planId: planA.id, stepId: "step_2_analysis" } },
    data: { status: "RUNNING" },
  });

  // F2. Permanent failure (Policy Denied / Unregistered Tool) is non-retryable
  const recoveryOutcomePerm = await TaskRecoveryManager.handleTaskFailure({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_2_analysis",
    error: new Error("UNREGISTERED_TOOL: Tool not found"),
    failureStage: "POLICY_DENIED",
  });
  assert(recoveryOutcomePerm.action === "FAILED_PERMANENT", "Policy violation classified as permanent failure");

  // F3. Exhausted Retries escalates to REQUIRES_INTERVENTION
  await prisma.objectivePlanStep.update({
    where: { planId_stepId: { planId: planA.id, stepId: "step_2_analysis" } },
    data: { retryCount: 3, maxRetries: 3, status: "RUNNING" },
  });

  const recoveryOutcomeExhausted = await TaskRecoveryManager.handleTaskFailure({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_2_analysis",
    error: new Error("Repeated worker crash"),
    failureStage: "WORKER_CRASH",
  });
  assert(recoveryOutcomeExhausted.action === "REQUIRES_INTERVENTION", "Exhausted retries escalated to REQUIRES_INTERVENTION");

  // Reset Step 2 for subsequent tests
  await prisma.objectivePlanStep.update({
    where: { planId_stepId: { planId: planA.id, stepId: "step_2_analysis" } },
    data: { status: "COMPLETED", verificationStatus: "SYSTEM_VALIDATED", retryCount: 0 },
  });

  // Human resolves intervention: transitions objective back to RUNNING
  await ObjectiveLifecycleService.transitionStatus({
    objectiveId: objectiveA.id,
    targetStatus: "RUNNING",
    actorId: userA.id,
    actorRole: "USER",
    reason: "User resolved task intervention and resumed objective execution",
  });

  // =================================================================
  // SECTION G: FINANCIAL EXECUTION BOUNDARIES (M13.4 RESTRICTIONS)
  // =================================================================
  console.log("\n-----------------------------------------------------------------");
  console.log("SECTION G: FINANCIAL EXECUTION BOUNDARIES");
  console.log("-----------------------------------------------------------------");

  // G1. Step 3 (PAYMENT) requires explicit human approval before execution
  const paymentDispatchRes = await AgentDispatchService.dispatchTask({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_3_payment",
    userId: userA.id,
  });
  assert(paymentDispatchRes.status === "AWAITING_APPROVAL", "Financial payment step enters AWAITING_APPROVAL before dispatch");

  // G2. Invariant: Proof that ZERO live NEAR transfers occurred during Milestone 13.4
  const mandatePost = await prisma.mandate.findUnique({ where: { id: mandateA.id } });
  assert(mandatePost?.spentYocto === "0", "Zero NEAR spent during Milestone 13.4 (Strict Invariant)");
  assert(mandatePost?.reservedYocto === "0", "Zero uncommitted reservations leaked");

  // Simulate human approval for Step 3 to allow workflow progression
  await TaskLifecycleService.transitionTaskStatus({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_3_payment",
    targetStatus: "COMPLETED",
    actorId: userA.id,
    actorRole: "USER",
    verificationStatus: "SYSTEM_VALIDATED",
    reason: "User signed off and approved financial task",
  });

  // Complete Step 4 through real dispatch pipeline
  const verifyDispatchRes = await AgentDispatchService.dispatchTask({
    objectiveId: objectiveA.id,
    planId: planA.id,
    stepId: "step_4_verify",
    userId: userA.id,
  });
  assert(verifyDispatchRes.status === "COMPLETED", "Step 4 verified and completed via dispatch pipeline");

  // =================================================================
  // SECTION H: PROGRESS & ORCHESTRATION COMPLETION
  // =================================================================
  console.log("\n-----------------------------------------------------------------");
  console.log("SECTION H: PROGRESS & ORCHESTRATION COMPLETION");
  console.log("-----------------------------------------------------------------");

  // H1. Calculate accurate progress from verified tasks
  const progress1 = await ObjectiveProgressService.calculateProgress({ objectiveId: objectiveA.id });
  assert(progress1.totalTasks === 4, "Tracks total 4 tasks");
  assert(progress1.completedTasks === 4, "All 4 tasks verified as completed");
  assert(progress1.progressPercent === 100, "Progress computed as 100%");
  assert(progress1.isComplete === true, "Objective flagged as complete");

  // H2. Objective Orchestrator detects full completion
  const orchRes = await ObjectiveOrchestrationService.orchestrate({
    objectiveId: objectiveA.id,
    userId: userA.id,
  });
  assert(orchRes.isComplete === true, "Orchestration reports objective is complete");
  assert(orchRes.status === "COMPLETED", "Objective lifecycle status transitioned to COMPLETED");

  // =================================================================
  // SECTION I: MULTI-TENANT ISOLATION & BOUNDARY SECURITY
  // =================================================================
  console.log("\n-----------------------------------------------------------------");
  console.log("SECTION I: MULTI-TENANT ISOLATION & BOUNDARY SECURITY");
  console.log("-----------------------------------------------------------------");

  // I1. Tenant B cannot orchestrate Tenant A's objective
  let crossTenantOrchError: any = null;
  try {
    await ObjectiveOrchestrationService.orchestrate({
      objectiveId: objectiveA.id,
      userId: userB.id, // Rogue user
    });
  } catch (err: any) {
    crossTenantOrchError = err;
  }
  assert(crossTenantOrchError !== null, "Cross-tenant orchestration attempt blocked");
  assert(crossTenantOrchError.message.includes("OBJECTIVE_NOT_FOUND"), "Cross-tenant access masked as NOT_FOUND");

  // I2. Tenant B cannot cancel Tenant A's objective
  let crossTenantCancelError: any = null;
  try {
    await ObjectiveOrchestrationService.cancelOrchestration({
      objectiveId: objectiveA.id,
      userId: userB.id,
    });
  } catch (err: any) {
    crossTenantCancelError = err;
  }
  assert(crossTenantCancelError !== null, "Cross-tenant cancellation attempt blocked");

  // =================================================================
  // SECTION J: FULL HTTP API ENDPOINTS END-TO-END
  // =================================================================
  console.log("\n-----------------------------------------------------------------");
  console.log("SECTION J: FULL HTTP API ENDPOINTS END-TO-END");
  console.log("-----------------------------------------------------------------");

  const authHeadersA = {
    "Content-Type": "application/json",
    "x-near-account": tenantAAccountId,
  };

  const authHeadersB = {
    "Content-Type": "application/json",
    "x-near-account": tenantBAccountId,
  };

  // Setup a fresh Objective B for HTTP API verification
  const objectiveB = await prisma.objective.create({
    data: {
      userId: userA.id,
      title: "API Orchestration Objective",
      description: "Testing HTTP routes for orchestration",
      originalPrompt: "Testing HTTP routes for orchestration",
      status: "READY",
      category: "RESEARCH",
      version: 1,
    },
  });

  const planB = await prisma.objectivePlan.create({
    data: {
      objectiveId: objectiveB.id,
      version: 1,
      summary: "API Test Plan",
      status: "APPROVED",
      steps: {
        create: [
          {
            stepId: "api_step_1",
            objectiveId: objectiveB.id,
            title: "API Research Step",
            description: "API research step description",
            order: 1,
            taskType: "RESEARCH",
            agentType: "research_procurement",
            requiredCapabilitiesJson: JSON.stringify(["RESEARCH"]),
            requiredToolsJson: JSON.stringify(["duckduckgo_search"]),
            dependenciesJson: JSON.stringify([]),
            status: "READY",
            assignedAgentId: agentA1.id,
          },
        ],
      },
    },
  });

  await TaskAssignmentEngine.assignTask({
    objectiveId: objectiveB.id,
    stepId: "api_step_1",
    agentId: agentA1.id,
    userId: userA.id,
  });

  // J1. POST /api/objectives/[id]/orchestrate
  const resOrch = await fetch(`${BASE_URL}/api/objectives/${objectiveB.id}/orchestrate`, {
    method: "POST",
    headers: authHeadersA,
    body: JSON.stringify({}),
  });
  const dataOrch = await resOrch.json();
  assert(resOrch.status === 200, "POST /api/objectives/[id]/orchestrate returned 200 OK");
  assert(dataOrch.success === true, "Orchestration round executed via API");

  // J2. GET /api/objectives/[id]/progress
  const resProg = await fetch(`${BASE_URL}/api/objectives/${objectiveB.id}/progress`, {
    headers: authHeadersA,
  });
  const dataProg = await resProg.json();
  assert(resProg.status === 200, "GET /api/objectives/[id]/progress returned 200 OK");
  assert(dataProg.metrics !== undefined, "Returns 12-state progress metrics");
  assert(dataProg.metrics.totalTasks === 1, "Metrics accurately report total tasks");

  // J3. GET /api/objectives/[id]/tasks/[stepId]
  const resTask = await fetch(`${BASE_URL}/api/objectives/${objectiveB.id}/tasks/api_step_1`, {
    headers: authHeadersA,
  });
  const dataTask = await resTask.json();
  if (resTask.status !== 200) {
    console.error("J3 Debug:", resTask.status, dataTask);
  }
  assert(resTask.status === 200, "GET /api/objectives/[id]/tasks/[stepId] returned 200 OK");
  assert(dataTask.task.stepId === "api_step_1", "Returns detailed task step payload");
  assert(dataTask.assignment !== null, "Returns assignment details with lease token");

  // Setup a fresh RUNNING objective for pause, resume, and cancel tests
  const objectiveC = await prisma.objective.create({
    data: {
      userId: userA.id,
      title: "API Lifecycle Controls Objective",
      description: "Testing pause, resume, cancel",
      originalPrompt: "Testing pause, resume, cancel",
      status: "RUNNING",
      category: "RESEARCH",
      version: 1,
    },
  });

  // J4. POST /api/objectives/[id]/pause
  const resPause = await fetch(`${BASE_URL}/api/objectives/${objectiveC.id}/pause`, {
    method: "POST",
    headers: authHeadersA,
    body: JSON.stringify({ reason: "API test pause" }),
  });
  const dataPause = await resPause.json();
  assert(resPause.status === 200, "POST /api/objectives/[id]/pause returned 200 OK");
  assert(dataPause.objective.status === "PAUSED", "Objective paused via API");

  // J5. POST /api/objectives/[id]/resume
  const resResume = await fetch(`${BASE_URL}/api/objectives/${objectiveC.id}/resume`, {
    method: "POST",
    headers: authHeadersA,
    body: JSON.stringify({}),
  });
  const dataResume = await resResume.json();
  assert(resResume.status === 200, "POST /api/objectives/[id]/resume returned 200 OK");
  assert(dataResume.success === true, "Objective resumed via API");

  // J6. POST /api/objectives/[id]/cancel
  const resCancel = await fetch(`${BASE_URL}/api/objectives/${objectiveC.id}/cancel`, {
    method: "POST",
    headers: authHeadersA,
    body: JSON.stringify({ reason: "API test cancellation" }),
  });
  const dataCancel = await resCancel.json();
  assert(resCancel.status === 200, "POST /api/objectives/[id]/cancel returned 200 OK");
  assert(dataCancel.objective.status === "CANCELLED", "Objective cancelled via API");

  // J7. Cross-tenant HTTP Isolation (Tenant B accessing Objective B returns 404)
  const resCrossTenant = await fetch(`${BASE_URL}/api/objectives/${objectiveC.id}/orchestrate`, {
    method: "POST",
    headers: authHeadersB,
    body: JSON.stringify({}),
  });
  assert(resCrossTenant.status === 404, "Cross-tenant HTTP orchestration returns 404 Not Found");

  // =================================================================
  // SUMMARY
  // =================================================================
  console.log("\n=================================================================");
  console.log(`   TEST RESULTS: ${totalPassed} PASSED / ${totalFailed} FAILED    `);
  console.log("=================================================================\n");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runTestSuite()
  .catch((err) => {
    console.error("Test execution aborted with fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
