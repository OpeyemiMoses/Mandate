/**
 * MANDATE — MILESTONE 13.3: AGENT CAPABILITY REGISTRY, DETERMINISTIC ASSIGNMENT & GOVERNED DELEGATION
 *
 * Comprehensive Automated Verification Suite:
 * Section A: Agent Capability Registry (registration, validation, versioning, audit logging)
 * Section B: Deterministic Eligibility & Capability Validation Engine (11 deterministic checks)
 * Section C: Deterministic Assignment Engine & Ranking (load balancing, tie-breaking, plan bindings)
 * Section D: Governed Delegation & Handoffs (anti-tamper, cycle rejection, non-transferable authority)
 * Section E: Security Boundaries, Multi-Tenant Isolation & Concurrency
 * Section F: Full HTTP API Endpoints End-to-End
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { prisma } from "../src/lib/db";
import { nearToYocto } from "../src/lib/yocto";
import { AgentCapabilityRegistry } from "../src/lib/agents/capabilityRegistry";
import { AgentCapabilityValidator } from "../src/lib/agents/capabilityValidator";
import { TaskAssignmentEngine } from "../src/lib/agents/assignmentEngine";
import { GovernedDelegationManager } from "../src/lib/agents/delegationManager";
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
  console.log("   MANDATE — MILESTONE 13.3 AGENT ASSIGNMENT & DELEGATION SUITE  ");
  console.log("=================================================================\n");

  const timestamp = Date.now();
  const tenantAAccountId = `m13-3-tenant-a-${timestamp}.testnet`;
  const tenantBAccountId = `m13-3-tenant-b-${timestamp}.testnet`;

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
      name: "Verification Auditor",
      type: "security_auditor",
      userId: userA.id,
      status: "ACTIVE",
    },
  });

  const agentA4 = await prisma.agent.create({
    data: {
      name: "Suspended Agent",
      type: "operations_execution",
      userId: userA.id,
      status: "SUSPENDED",
    },
  });

  // Setup Test Agent for Tenant B (Cross-Tenant isolation test)
  const agentB1 = await prisma.agent.create({
    data: {
      name: "Tenant B Rogue Agent",
      type: "research_procurement",
      userId: userB.id,
      status: "ACTIVE",
    },
  });

  // 3. Setup Wallets & Mandate
  const walletA2 = await prisma.wallet.create({
    data: {
      walletId: `outlayer-w2-${timestamp}`,
      apiKey: `wk_test2_${timestamp}`,
      nearAccountId: `m13-3-wallet-a2-${timestamp}.testnet`,
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

  // 4. Setup Objective & Approved Plan for Tenant A
  const sampleSteps = [
    {
      stepId: "step-1-research",
      title: "Query Price Feeds & Protocol State",
      description: "Perform web search and data queries on market status",
      order: 1,
      status: "PENDING",
      taskType: "RESEARCH" as const,
      agentType: "research_procurement",
      dependencies: [],
      requiredTools: ["duckduckgo_search"],
      requiredCapabilities: ["web_browsing", "data_extraction"],
      riskClassification: "LOW" as const,
    },
    {
      stepId: "step-2-payment",
      title: "Disburse 0.005 NEAR Bounty to Auditor",
      description: "Transfer authorized bounty via NEAR testnet",
      order: 2,
      status: "PENDING",
      taskType: "PAYMENT" as const,
      agentType: "finance_treasury",
      dependencies: ["step-1-research"],
      requiredTools: ["near_rpc_reader"],
      requiredCapabilities: ["financial_execution"],
      riskClassification: "HIGH" as const,
      estimatedCostNear: "0.005",
      estimatedCostYocto: nearToYocto("0.005"),
    },
    {
      stepId: "step-3-verify",
      title: "Verify Testnet Settlement & State Invariants",
      description: "Confirm on-chain transaction hashes and balance state",
      order: 3,
      status: "PENDING",
      taskType: "VERIFICATION" as const,
      agentType: "security_auditor",
      dependencies: ["step-2-payment"],
      requiredTools: ["near_rpc_reader"],
      requiredCapabilities: ["audit_verification"],
      riskClassification: "MEDIUM" as const,
    },
  ];

  const planHash = computePlanContentHash({
    version: 1,
    steps: sampleSteps,
    estimatedCostYocto: nearToYocto("0.005"),
  });

  const objectiveA = await prisma.objective.create({
    data: {
      title: "Autonomous Bounty Research & Settlement",
      description: "Coordinate research, payment and verification",
      originalPrompt: "Research and settle bounty for auditor",
      category: "TREASURY_MANAGEMENT",
      status: "READY",
      version: 1,
      userId: userA.id,
      mandateId: mandateA.id,
    },
  });

  const planA = await prisma.objectivePlan.create({
    data: {
      objective: { connect: { id: objectiveA.id } },
      version: 1,
      summary: "Three-stage research, payment and verification DAG",
      status: "APPROVED",
      planHash: planHash,
      riskClassification: "HIGH",
      estimatedCostNear: "0.005",
      estimatedCostYocto: nearToYocto("0.005"),
      requiresApproval: true,
      steps: {
        create: sampleSteps.map((s) => ({
          stepId: s.stepId,
          objectiveId: objectiveA.id,
          title: s.title,
          description: s.description,
          order: s.order,
          status: s.status,
          taskType: s.taskType,
          agentType: s.agentType,
          dependenciesJson: JSON.stringify(s.dependencies),
          requiredToolsJson: JSON.stringify(s.requiredTools),
          requiredCapabilitiesJson: JSON.stringify(s.requiredCapabilities),
          riskClassification: s.riskClassification,
          estimatedCostNear: s.estimatedCostNear || null,
          estimatedCostYocto: s.estimatedCostYocto || null,
        })),
      },
    },
  });

  // Setup Objective for Tenant B
  const objectiveB = await prisma.objective.create({
    data: {
      title: "Tenant B Secret Objective",
      description: "Tenant B private tasks",
      originalPrompt: "Private objective",
      category: "GENERAL",
      status: "READY",
      version: 1,
      userId: userB.id,
    },
  });

  console.log("Test Environment Initialized successfully.\n");

  // =========================================================================
  // SECTION A: AGENT CAPABILITY REGISTRY
  // =========================================================================
  console.log("-----------------------------------------------------------------");
  console.log("SECTION A: AGENT CAPABILITY REGISTRY");
  console.log("-----------------------------------------------------------------");

  // A1. Valid Registration
  const capA1 = await AgentCapabilityRegistry.registerOrVerifyProfile({
    agentId: agentA1.id,
    userId: userA.id,
    supportedTaskTypes: ["RESEARCH", "ANALYSIS"],
    supportedTools: ["duckduckgo_search"],
    maxAuthorizedTaskRisk: "LOW",
  });

  assert(capA1.capabilityVersion === 1, "Capability profile initialized with version 1");
  assert(capA1.status === "ACTIVE", "Capability profile is active by default");
  assert(capA1.supportedTaskTypes.includes("RESEARCH"), "Profile includes RESEARCH category");

  // A2. Reject Invalid / Unregistered Tools
  let invalidToolRejected = false;
  try {
    await AgentCapabilityRegistry.registerOrVerifyProfile({
      agentId: agentA1.id,
      userId: userA.id,
      supportedTools: ["unregistered_malicious_tool_xyz"],
    });
  } catch (err: any) {
    invalidToolRejected = true;
    assert(err.message.includes("UNREGISTERED_TOOL"), "Rejected unregistered tool with descriptive UNREGISTERED_TOOL error");
  }
  assert(invalidToolRejected, "Invalid / unregistered tool strictly rejected");

  // A3. Register Executor Capability Profile (A2) with financial eligibility
  const capA2 = await AgentCapabilityRegistry.registerOrVerifyProfile({
    agentId: agentA2.id,
    userId: userA.id,
    supportedTaskTypes: ["PAYMENT", "EXECUTION"],
    supportedTools: ["near_rpc_reader"],
    maxAuthorizedTaskRisk: "HIGH",
    supportedNetworks: ["near:testnet"],
  });
  assert(capA2.financialEligibility === true, "Executor profile verified as financially eligible (holds OutLayer wallet and active mandate)");
  assert(capA2.supportedTaskTypes.includes("PAYMENT"), "Executor profile registered with PAYMENT capability");

  // A4. Register Verifier Capability Profile (A3)
  const capA3 = await AgentCapabilityRegistry.registerOrVerifyProfile({
    agentId: agentA3.id,
    userId: userA.id,
    supportedTaskTypes: ["VERIFICATION", "ANALYSIS"],
    supportedTools: ["near_rpc_reader"],
    maxAuthorizedTaskRisk: "MEDIUM",
  });
  assert(capA3.supportedTaskTypes.includes("VERIFICATION"), "Verifier profile registered");

  // A5. Anti-Tamper: Agents cannot modify their own capability profiles
  let agentSelfModificationRejected = false;
  try {
    await AgentCapabilityRegistry.registerOrVerifyProfile({
      agentId: agentA1.id,
      userId: userA.id,
      isAgentCaller: true, // Agent caller flag
    });
  } catch (err: any) {
    agentSelfModificationRejected = true;
    assert(err.message.includes("AGENT_ACTION_FORBIDDEN"), "AI Agent self-modification strictly blocked by boundary");
  }
  assert(agentSelfModificationRejected, "Agents forbidden from self-declaring capabilities");

  // A6. Version increment on update
  const capA1Updated = await AgentCapabilityRegistry.registerOrVerifyProfile({
    agentId: agentA1.id,
    userId: userA.id,
    supportedTaskTypes: ["RESEARCH", "ANALYSIS", "EXECUTION"],
    supportedTools: ["duckduckgo_search"],
    maxAuthorizedTaskRisk: "MEDIUM",
  });
  assert(capA1Updated.capabilityVersion === 2, "Capability profile version atomically incremented to 2 on update");

  // A7. Deactivate / Suspend Profile
  await AgentCapabilityRegistry.registerOrVerifyProfile({
    agentId: agentA4.id,
    userId: userA.id,
    supportedTaskTypes: ["EXECUTION"],
    supportedTools: ["generic_rest_client"],
    maxAuthorizedTaskRisk: "LOW",
  });
  const deactRes = await AgentCapabilityRegistry.deactivateProfile(agentA4.id, userA.id, "Agent marked suspended");
  assert(deactRes.status === "PAUSED", "Agent capability profile status updated to PAUSED");
  const a4Profile = await AgentCapabilityRegistry.getProfile(agentA4.id, userA.id);
  assert(a4Profile.status === "PAUSED", "Suspended agent profile retrieved as PAUSED");

  console.log("");

  // =========================================================================
  // SECTION B: DETERMINISTIC ELIGIBILITY & CAPABILITY VALIDATION ENGINE
  // =========================================================================
  console.log("-----------------------------------------------------------------");
  console.log("SECTION B: DETERMINISTIC ELIGIBILITY ENGINE");
  console.log("-----------------------------------------------------------------");

  const researchTaskReq = {
    taskId: sampleSteps[0].stepId,
    taskType: sampleSteps[0].taskType,
    requiredTools: sampleSteps[0].requiredTools,
    riskClassification: sampleSteps[0].riskClassification,
  };

  const paymentTaskReq = {
    taskId: sampleSteps[1].stepId,
    taskType: sampleSteps[1].taskType,
    requiredTools: sampleSteps[1].requiredTools,
    riskClassification: sampleSteps[1].riskClassification,
    estimatedCostYocto: sampleSteps[1].estimatedCostYocto,
  };

  const verifyTaskReq = {
    taskId: sampleSteps[2].stepId,
    taskType: sampleSteps[2].taskType,
    requiredTools: sampleSteps[2].requiredTools,
    riskClassification: sampleSteps[2].riskClassification,
  };

  // B1. Compatible Agent
  const elA1Research = await AgentCapabilityValidator.evaluateEligibility({
    agentId: agentA1.id,
    userId: userA.id,
    objectiveId: objectiveA.id,
    task: researchTaskReq,
  });
  assert(elA1Research.isEligible === true, "Research Specialist is ELIGIBLE for Research Task");
  assert(elA1Research.verdict === "ELIGIBLE", "Verdict is ELIGIBLE");

  // B2. Incompatible Task Category (Research agent cannot execute PAYMENT task)
  const elA1Payment = await AgentCapabilityValidator.evaluateEligibility({
    agentId: agentA1.id,
    userId: userA.id,
    objectiveId: objectiveA.id,
    task: paymentTaskReq,
  });
  assert(elA1Payment.isEligible === false, "Research Specialist is INELIGIBLE for Payment Task");
  assert(
    elA1Payment.verdict === "CAPABILITY_UNAVAILABLE" || elA1Payment.verdict === "INELIGIBLE",
    "Verdict is CAPABILITY_UNAVAILABLE / INELIGIBLE for category mismatch"
  );
  assert(elA1Payment.reasons.some((r) => r.toLowerCase().includes("task type")), "Includes task type failure reason");

  // B3. Missing Required Tool
  assert(elA1Payment.reasons.some((r) => r.includes("tool")), "Includes missing tool failure reason");

  // B4. Executor Eligible for Payment Task
  const elA2Payment = await AgentCapabilityValidator.evaluateEligibility({
    agentId: agentA2.id,
    userId: userA.id,
    objectiveId: objectiveA.id,
    task: paymentTaskReq,
    mandateId: mandateA.id,
  });
  assert(elA2Payment.isEligible === true, "Executor Specialist is ELIGIBLE for Payment Task");

  // B5. Inactive / Suspended Agent
  const elA4Research = await AgentCapabilityValidator.evaluateEligibility({
    agentId: agentA4.id,
    userId: userA.id,
    objectiveId: objectiveA.id,
    task: researchTaskReq,
  });
  assert(elA4Research.isEligible === false, "Suspended agent is INELIGIBLE");
  assert(elA4Research.reasons.some((r) => r.includes("status is")), "Reason flags inactive/suspended agent status");

  // B6. Forbidden Network
  const nonTestnetTaskReq = {
    ...researchTaskReq,
    requiredNetwork: "ethereum:mainnet",
  };
  const elNonTestnet = await AgentCapabilityValidator.evaluateEligibility({
    agentId: agentA1.id,
    userId: userA.id,
    objectiveId: objectiveA.id,
    task: nonTestnetTaskReq,
  });
  assert(elNonTestnet.isEligible === false, "Non-testnet network task is rejected");
  assert(elNonTestnet.verdict === "POLICY_DENIED", "Policy denies non-testnet network execution");

  console.log("");

  // =========================================================================
  // SECTION C: DETERMINISTIC ASSIGNMENT ENGINE & RANKING
  // =========================================================================
  console.log("-----------------------------------------------------------------");
  console.log("SECTION C: DETERMINISTIC ASSIGNMENT ENGINE & RANKING");
  console.log("-----------------------------------------------------------------");

  // C1. Assign Single Task Deterministically
  const assignResult1 = await TaskAssignmentEngine.assignTask({
    objectiveId: objectiveA.id,
    stepId: sampleSteps[0].stepId,
    userId: userA.id,
  });
  assert(assignResult1.success === true, "Task 1 deterministically assigned to eligible agent");
  assert(assignResult1.agentId === agentA1.id, "Research task assigned to Research Specialist");
  assert(Boolean(assignResult1.leaseToken?.startsWith("lease_")), "Cryptographic lease token generated");
  assert(new Date(assignResult1.leaseExpiresAt!) > new Date(), "Lease expiration set in the future");
  assert(assignResult1.planHash === planHash, "Assignment cryptographically bound to planHash");

  // C2. Multi-Agent Ranking & Tie-Breaking:
  // Register an additional Research agent A5 with same capabilities
  const agentA5 = await prisma.agent.create({
    data: {
      name: "Secondary Research Analyst",
      type: "research_procurement",
      userId: userA.id,
      status: "ACTIVE",
    },
  });
  await AgentCapabilityRegistry.registerOrVerifyProfile({
    agentId: agentA5.id,
    userId: userA.id,
    supportedTaskTypes: ["RESEARCH", "ANALYSIS"],
    supportedTools: ["duckduckgo_search"],
    maxAuthorizedTaskRisk: "LOW",
  });

  // Create a dummy research task 4
  const extraTask = {
    stepId: "step-4-extra-research",
    title: "Secondary Data Scraping",
    description: "Fetch extra logs",
    order: 4,
    status: "PENDING",
    taskType: "RESEARCH" as const,
    agentType: "research_procurement",
    dependencies: [],
    requiredTools: ["duckduckgo_search"],
    requiredCapabilities: ["web_browsing"],
    riskClassification: "LOW" as const,
  };
  await prisma.objectivePlanStep.create({
    data: {
      objectiveId: objectiveA.id,
      planId: planA.id,
      stepId: extraTask.stepId,
      title: extraTask.title,
      description: extraTask.description,
      order: extraTask.order,
      status: extraTask.status,
      taskType: extraTask.taskType,
      agentType: extraTask.agentType,
      dependenciesJson: JSON.stringify([]),
      requiredToolsJson: JSON.stringify(extraTask.requiredTools),
      requiredCapabilitiesJson: JSON.stringify(extraTask.requiredCapabilities),
      riskClassification: extraTask.riskClassification,
    },
  });

  // Since A1 already has 1 active assignment and A5 has 0 active assignments,
  // load-balancing ranking MUST assign to A5!
  const assignResult4 = await TaskAssignmentEngine.assignTask({
    objectiveId: objectiveA.id,
    stepId: extraTask.stepId,
    userId: userA.id,
  });
  assert(assignResult4.success === true, "Extra research task assigned successfully");
  assert(assignResult4.agentId === agentA5.id, "Load-balancing correctly picked agent A5 with lowest active assignment count (0 vs 1)");

  // C3. Assign Payment Task -> must assign to Executor A2
  const assignResult2 = await TaskAssignmentEngine.assignTask({
    objectiveId: objectiveA.id,
    stepId: sampleSteps[1].stepId,
    userId: userA.id,
  });
  assert(assignResult2.agentId === agentA2.id, "Payment task correctly assigned to Executor A2");

  // C4. Batch Assign Objective Tasks
  const batchAssign = await TaskAssignmentEngine.assignObjectivePlan(
    objectiveA.id,
    userA.id
  );
  assert(batchAssign.success === true, "Batch assignment executed");
  assert(batchAssign.assignments.length >= 3, "All tasks in objective plan assigned");

  // C5. Stale Plan Hash Rejection
  let staleHashRejected = false;
  try {
    await TaskAssignmentEngine.assignTask({
      objectiveId: objectiveA.id,
      stepId: sampleSteps[2].stepId,
      userId: userA.id,
      expectedPlanHash: "stale_or_tampered_plan_hash_000000000",
    });
  } catch (err: any) {
    staleHashRejected = true;
    assert(
      err.message.includes("PLAN_TAMPER_DETECTED") || err.message.includes("fingerprint"),
      "Stale plan hash rejected with integrity error"
    );
  }
  assert(staleHashRejected, "Assignment strictly rejects stale plan hash");

  console.log("");

  // =========================================================================
  // SECTION D: GOVERNED DELEGATION & HANDOFFS
  // =========================================================================
  console.log("-----------------------------------------------------------------");
  console.log("SECTION D: GOVERNED DELEGATION & HANDOFFS");
  console.log("-----------------------------------------------------------------");

  // D1. Valid Governed Task Delegation (A1 delegates step-1-research to A5)
  const delegationRes = await GovernedDelegationManager.requestDelegation({
    objectiveId: objectiveA.id,
    stepId: sampleSteps[0].stepId,
    sourceAgentId: agentA1.id,
    destinationAgentId: agentA5.id,
    userId: userA.id,
    reason: "Agent A1 experiencing high network latency; delegating research task to A5",
  });
  assert(delegationRes.success === true, "Governed delegation completed successfully");
  assert(delegationRes.newAssignment.agentId === agentA5.id, "New assignment belongs to delegatee agent A5");
  assert(delegationRes.handoff.status === "COMPLETED", "Agent handoff record created with COMPLETED status");

  // D2. Invariant Check: Financial authority remains non-transferable
  // Verify agent A5 does NOT have access to wallet A2 or mandate A
  const agentA5Wallet = await prisma.wallet.findFirst({ where: { agentId: agentA5.id } });
  assert(agentA5Wallet === null, "Delegation of task DID NOT transfer any wallet authority to agent A5");

  // D3. Unauthorized Delegation Rejection (agent A1 no longer holds the task lease)
  let unauthorizedDelegationRejected = false;
  try {
    await GovernedDelegationManager.requestDelegation({
      objectiveId: objectiveA.id,
      stepId: sampleSteps[0].stepId,
      sourceAgentId: agentA1.id, // A1 is no longer the assigned agent
      destinationAgentId: agentA3.id,
      userId: userA.id,
      reason: "Attempting delegation without holding active lease",
    });
  } catch (err: any) {
    unauthorizedDelegationRejected = true;
    assert(err.message.includes("does not hold active lease"), "Rejected delegation from agent not holding active lease");
  }
  assert(unauthorizedDelegationRejected, "Unauthorized delegation strictly rejected");

  // D4. Self-Delegation Rejection
  let selfDelegationRejected = false;
  try {
    await GovernedDelegationManager.requestDelegation({
      objectiveId: objectiveA.id,
      stepId: sampleSteps[0].stepId,
      sourceAgentId: agentA5.id,
      destinationAgentId: agentA5.id,
      userId: userA.id,
      reason: "Self delegation loop",
    });
  } catch (err: any) {
    selfDelegationRejected = true;
    assert(err.message.includes("SELF_DELEGATION_PROHIBITED"), "Rejected self-delegation");
  }
  assert(selfDelegationRejected, "Self-delegation strictly rejected");

  // D5. Delegation to Ineligible Agent Rejection
  // Trying to delegate payment task to Verifier A3 (who cannot do payments)
  let ineligibleDelegationRejected = false;
  try {
    await GovernedDelegationManager.requestDelegation({
      objectiveId: objectiveA.id,
      stepId: sampleSteps[1].stepId,
      sourceAgentId: agentA2.id,
      destinationAgentId: agentA3.id,
      userId: userA.id,
      reason: "Delegating financial payment to verifier",
    });
  } catch (err: any) {
    ineligibleDelegationRejected = true;
    assert(
      err.message.includes("DELEGATION_TARGET_INELIGIBLE") || err.message.includes("lacks required capabilities"),
      "Rejected delegation to ineligible agent"
    );
  }
  assert(ineligibleDelegationRejected, "Delegation to ineligible agent strictly rejected");

  // D6. Cyclic Delegation Prevention
  // A1 previously delegated step-1-research to A5 in D1. Now A5 attempting to delegate back to A1 is detected as a cycle!
  let cycleRejected = false;
  try {
    await GovernedDelegationManager.requestDelegation({
      objectiveId: objectiveA.id,
      stepId: sampleSteps[0].stepId,
      sourceAgentId: agentA5.id,
      destinationAgentId: agentA1.id,
      userId: userA.id,
      reason: "Ping pong cycle delegation back to original assignor",
    });
  } catch (err: any) {
    cycleRejected = true;
    assert(err.message.includes("CYCLIC_DELEGATION_REJECTED"), "Rejected circular delegation ping-pong");
  }
  assert(cycleRejected, "Circular delegation cycle strictly prevented");

  // D7. Delegation History Audit Retrieval
  const handoffHistory = await GovernedDelegationManager.getObjectiveHandoffs(objectiveA.id, userA.id);
  assert(handoffHistory.length >= 1, "Objective delegation audit history recorded all handoffs");

  console.log("");

  // =========================================================================
  // SECTION E: SECURITY BOUNDARIES, MULTI-TENANT ISOLATION & CONCURRENCY
  // =========================================================================
  console.log("-----------------------------------------------------------------");
  console.log("SECTION E: SECURITY, BOUNDARIES & CONCURRENCY");
  console.log("-----------------------------------------------------------------");

  // E1. Cross-Tenant Task Assignment Rejection
  let crossTenantAssignRejected = false;
  try {
    await TaskAssignmentEngine.assignTask({
      objectiveId: objectiveA.id,
      stepId: sampleSteps[0].stepId,
      userId: userB.id, // User B trying to mutate User A's objective
    });
  } catch (err: any) {
    crossTenantAssignRejected = true;
    assert(err.message.includes("not found") || err.message.includes("unauthorized"), "Cross-tenant objective assignment blocked");
  }
  assert(crossTenantAssignRejected, "Tenant B cannot assign tasks on Tenant A objective");

  // E2. Cross-Tenant Delegation Rejection
  let crossTenantDelegationRejected = false;
  try {
    await GovernedDelegationManager.requestDelegation({
      objectiveId: objectiveA.id,
      stepId: sampleSteps[0].stepId,
      sourceAgentId: agentA1.id,
      destinationAgentId: agentB1.id, // Rogue agent from Tenant B!
      userId: userA.id,
      reason: "Cross tenant delegation leak attempt",
    });
  } catch (err: any) {
    crossTenantDelegationRejected = true;
    assert(err.message.includes("same user") || err.message.includes("not eligible") || err.message.includes("unauthorized"), "Cross-tenant delegation to external agent blocked");
  }
  assert(crossTenantDelegationRejected, "Cross-tenant delegation strictly blocked");

  // E3. Cancelled Objective Rejects Assignment
  const cancelledObj = await prisma.objective.create({
    data: {
      title: "Cancelled Objective",
      description: "Cancelled immediately",
      originalPrompt: "Prompt",
      category: "GENERAL",
      status: "CANCELLED",
      version: 1,
      userId: userA.id,
    },
  });
  let cancelledObjAssignRejected = false;
  try {
    await TaskAssignmentEngine.assignTask({
      objectiveId: cancelledObj.id,
      stepId: "task-test",
      userId: userA.id,
    });
  } catch (err: any) {
    cancelledObjAssignRejected = true;
    assert(err.message.includes("terminal status") || err.message.includes("CANCELLED"), "Assignment on cancelled objective blocked");
  }
  assert(cancelledObjAssignRejected, "Assignment strictly prohibited on cancelled objectives");

  // E4. Monotonic Lease Token Fencing
  const a1Tasks = await TaskAssignmentEngine.getAgentAssignments(agentA1.id, userA.id);
  assert(Array.isArray(a1Tasks), "Retrieved assigned tasks for agent");
  for (const t of a1Tasks) {
    assert(t.leaseToken.length > 20, "Lease token has strong entropy");
    assert(t.status === "ASSIGNED" || t.status === "ACTIVE", "Active assignment lease verified");
  }

  console.log("");

  // =========================================================================
  // SECTION F: FULL HTTP API ENDPOINTS END-TO-END
  // =========================================================================
  console.log("-----------------------------------------------------------------");
  console.log("SECTION F: HTTP API ENDPOINTS VERIFICATION");
  console.log("-----------------------------------------------------------------");

  const authHeadersA = {
    "Content-Type": "application/json",
    "x-near-account": tenantAAccountId,
  };

  const authHeadersB = {
    "Content-Type": "application/json",
    "x-near-account": tenantBAccountId,
  };

  // F1. GET /api/agents/[id]/capabilities
  const resCapGet = await fetch(`${BASE_URL}/api/agents/${agentA1.id}/capabilities`, {
    headers: authHeadersA,
  });
  const dataCapGet = await resCapGet.json();
  assert(resCapGet.status === 200, "GET /api/agents/[id]/capabilities returned 200 OK");
  assert(dataCapGet.success === true, "Response success is true");
  assert(dataCapGet.profile.supportedTaskTypes.includes("RESEARCH"), "Response contains capability profile");

  // F2. POST /api/agents/[id]/capabilities (update)
  const resCapPost = await fetch(`${BASE_URL}/api/agents/${agentA1.id}/capabilities`, {
    method: "POST",
    headers: authHeadersA,
    body: JSON.stringify({
      supportedTaskTypes: ["RESEARCH", "ANALYSIS"],
      supportedTools: ["duckduckgo_search"],
      maxAuthorizedTaskRisk: "HIGH",
    }),
  });
  const dataCapPost = await resCapPost.json();
  if (resCapPost.status !== 200) {
    console.error("F2 Error:", resCapPost.status, dataCapPost);
  }
  assert(resCapPost.status === 200, "POST /api/agents/[id]/capabilities returned 200 OK");
  assert(dataCapPost.profile.capabilityVersion >= 3, "Capability profile version incremented via API");

  // F3. GET /api/agents/[id]/tasks
  const resTasks = await fetch(`${BASE_URL}/api/agents/${agentA1.id}/tasks`, {
    headers: authHeadersA,
  });
  const dataTasks = await resTasks.json();
  assert(resTasks.status === 200, "GET /api/agents/[id]/tasks returned 200 OK");
  assert(Array.isArray(dataTasks.tasks), "Returned task list for agent");

  // F4. POST /api/objectives/[id]/eligibility
  const resElig = await fetch(`${BASE_URL}/api/objectives/${objectiveA.id}/eligibility`, {
    method: "POST",
    headers: authHeadersA,
    body: JSON.stringify({ taskId: sampleSteps[1].stepId }),
  });
  const dataElig = await resElig.json();
  assert(resElig.status === 200, "POST /api/objectives/[id]/eligibility returned 200 OK");
  assert(dataElig.success === true, "Eligibility check succeeded");
  assert(Array.isArray(dataElig.reports), "Returned eligibility evaluations for all user agents");
  const a2Report = dataElig.reports.find((r: any) => r.agentId === agentA2.id);
  assert(a2Report?.isEligible === true, "API reports Executor A2 as eligible for payment task");

  // F5. GET /api/objectives/[id]/assignments
  const resAssignList = await fetch(`${BASE_URL}/api/objectives/${objectiveA.id}/assignments`, {
    headers: authHeadersA,
  });
  const dataAssignList = await resAssignList.json();
  assert(resAssignList.status === 200, "GET /api/objectives/[id]/assignments returned 200 OK");
  assert(dataAssignList.assignments.length > 0, "Returns active assignments list");

  // F6. POST /api/objectives/[id]/assign (assign single task)
  const resAssignPost = await fetch(`${BASE_URL}/api/objectives/${objectiveA.id}/assign`, {
    method: "POST",
    headers: authHeadersA,
    body: JSON.stringify({
      taskId: sampleSteps[2].stepId,
      preferredAgentId: agentA3.id,
    }),
  });
  const dataAssignPost = await resAssignPost.json();
  assert(resAssignPost.status === 200, "POST /api/objectives/[id]/assign returned 200 OK");
  assert(dataAssignPost.success === true, "Single task assign returned success");

  // F7. POST & GET /api/objectives/[id]/delegate
  const currentExtraAssignment = await prisma.agentAssignment.findFirst({
    where: { objectiveId: objectiveA.id, stepId: extraTask.stepId },
  });
  const sourceAgentForF7 = currentExtraAssignment?.agentId === agentA1.id ? agentA1 : agentA5;
  const destAgentForF7 = sourceAgentForF7.id === agentA1.id ? agentA5 : agentA1;

  const resDelegatePost = await fetch(`${BASE_URL}/api/objectives/${objectiveA.id}/delegate`, {
    method: "POST",
    headers: authHeadersA,
    body: JSON.stringify({
      fromAgentId: sourceAgentForF7.id,
      toAgentId: destAgentForF7.id,
      taskId: extraTask.stepId,
      reason: "Operational reassignment via HTTP API endpoint",
    }),
  });
  const dataDelegatePost = await resDelegatePost.json();
  if (resDelegatePost.status !== 200) {
    console.error("F7 Delegate Error:", resDelegatePost.status, dataDelegatePost);
  }
  assert(resDelegatePost.status === 200, "POST /api/objectives/[id]/delegate returned 200 OK");
  assert(dataDelegatePost.success === true, "Governed delegation succeeded via API");

  const resDelegateGet = await fetch(`${BASE_URL}/api/objectives/${objectiveA.id}/delegate`, {
    headers: authHeadersA,
  });
  const dataDelegateGet = await resDelegateGet.json();
  assert(resDelegateGet.status === 200, "GET /api/objectives/[id]/delegate returned 200 OK");
  assert(Array.isArray(dataDelegateGet.history), "Returned delegation history list");

  // F8. Cross-Tenant HTTP Access Control
  const resCrossTenant = await fetch(`${BASE_URL}/api/objectives/${objectiveA.id}/assignments`, {
    headers: authHeadersB, // Tenant B attempting to read Tenant A's objective assignments
  });
  assert(resCrossTenant.status === 404 || resCrossTenant.status === 403, "Cross-tenant objective access returns 404 Not Found or 403 Forbidden");

  console.log("\n=================================================================");
  console.log(`   TEST RESULTS: ${totalPassed} PASSED / ${totalFailed} FAILED    `);
  console.log("=================================================================\n");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution aborted with fatal error:", err);
  process.exit(1);
});
