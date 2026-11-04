/**
 * MANDATE — MILESTONE 13.2: AUTONOMOUS OBJECTIVE PLANNING & TASK DAG DECOMPOSITION TEST SUITE
 *
 * Verifies all phases of Milestone 13.2:
 * 1. Objective Understanding & Intent Normalization (deliverables, criteria, capabilities, yoctoNEAR)
 * 2. Ambiguity & Clarification Questions (no hallucinations)
 * 3. Task Decomposition across 5 typed categories (RESEARCH, ANALYSIS, EXECUTION, PAYMENT, VERIFICATION)
 * 4. Kahn Topological Sorting & DAG Validation (parallel levels, cycle detection with path, self-deps)
 * 5. Deterministic 5-Tier Plan Validation (Objective, Mandate, Task, Security, Risk)
 * 6. BigInt yoctoNEAR precision and zero fund reservations during planning
 * 7. Canonical SHA-256 Plan Fingerprinting & Immutability Checks
 * 8. Objective Lifecycle Synchronization (PLANNING -> AWAITING_APPROVAL -> READY)
 * 9. Anti-Tamper & Security Boundary Enforcements (Agents forbidden from bypassing approvals)
 * 10. Multi-Tenant Isolation (Strict user ownership)
 * 11. End-to-End Live HTTP API Endpoints (/plan, /validate, /graph, /approve, /reject, /replan)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { prisma } from "../src/lib/db";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import { ObjectiveUnderstandingService } from "../src/lib/objectives/understandingService";
import { ObjectiveDAGService } from "../src/lib/objectives/dagService";
import { ObjectivePlanValidationService } from "../src/lib/objectives/planValidationService";
import {
  generateObjectivePlan,
  approveObjectivePlan,
  rejectObjectivePlan,
  replanObjective,
} from "../src/lib/objectives/planner";
import { computePlanContentHash } from "../src/lib/objectives/types";
import { ObjectiveLifecycleService } from "../src/lib/objectives/lifecycleService";

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
  console.log("   MANDATE — MILESTONE 13.2 PLANNING & TASK DAG VERIFICATION     ");
  console.log("=================================================================\n");

  const timestamp = Date.now();
  const tenantAAccountId = `m13-2-tenant-a-${timestamp}.testnet`;
  const tenantBAccountId = `m13-2-tenant-b-${timestamp}.testnet`;

  // Setup test users
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

  // Setup test agent & wallet for user A
  const agentA = await prisma.agent.create({
    data: {
      name: "Procurement Specialist",
      type: "research_procurement",
      userId: userA.id,
    },
  });

  const walletA = await prisma.wallet.create({
    data: {
      walletId: `outlayer-w-${timestamp}`,
      apiKey: `wk_test_${timestamp}`,
      nearAccountId: `m13-2-agent-wallet-${timestamp}.testnet`,
      agentId: agentA.id,
      balanceYocto: nearToYocto("5.0"),
    },
  });

  // Setup active spending mandate for user A (Budget: 0.1 NEAR = 100000000000000000000000 yoctoNEAR)
  const mandateA = await prisma.mandate.create({
    data: {
      name: "Autonomous Testnet Procurement Mandate",
      userId: userA.id,
      walletId: walletA.id,
      agentId: agentA.id,
      totalBudgetYocto: nearToYocto("0.1"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.05"),
      approvalThresholdYocto: nearToYocto("0.02"),
      allowedRecipientsJson: JSON.stringify([
        "0x479253b82eb63eb36f140ecabf0237cc338084e7",
        "vendor.testnet",
      ]),
      expiresAt: new Date(Date.now() + 86400000 * 7),
      status: "ACTIVE",
    },
  });

  console.log("-----------------------------------------------------------------");
  console.log("BLOCK 1: OBJECTIVE UNDERSTANDING & INTENT NORMALIZATION");
  console.log("-----------------------------------------------------------------");

  // Scenario 1: Normalizing a clear procurement prompt
  const procPrompt = "Procure verified FastNEAR testnet RPC endpoint subscription with budget 0.05 NEAR";
  const procUnderstanding = ObjectiveUnderstandingService.understand({
    prompt: procPrompt,
    constraints: { maxBudgetNear: "0.05" },
    existingMandateId: mandateA.id,
  });

  assert(procUnderstanding.category === "PROCUREMENT", "Correctly classified category as PROCUREMENT");
  assert(procUnderstanding.desiredDeliverables.length >= 2, "Normalized concrete desired deliverables");
  assert(procUnderstanding.successCriteria.length >= 2, "Generated measurable success criteria definitions");
  assert(
    procUnderstanding.financialRestrictions.maxBudgetYocto === nearToYocto("0.05"),
    "Converted 0.05 NEAR to exact 24-decimal integer yoctoNEAR string"
  );
  assert(procUnderstanding.needsClarification === false, "Clear procurement prompt does not require clarification");

  // Scenario 2: Ambiguous and underspecified prompt
  const vagueUnderstanding = ObjectiveUnderstandingService.understand({
    prompt: "do something",
  });
  assert(vagueUnderstanding.needsClarification === true, "Flags ambiguous prompt 'do something' as needing clarification");
  assert(
    vagueUnderstanding.clarificationQuestions.length > 0,
    "Generates structured clarification questions without hallucinating missing details"
  );

  // Scenario 3: Unfulfillable multi-chain prompt
  const unfulfillableUnderstanding = ObjectiveUnderstandingService.understand({
    prompt: "Transfer 50 SOL on Solana mainnet",
  });
  assert(
    unfulfillableUnderstanding.unfulfillableRequirements.some((r) => r.includes("NEAR Protocol")),
    "Identifies unsupported networks (Solana/Mainnet) and flags as unfulfillable policy violation"
  );

  // Scenario 4: Sanitization
  const maliciousPrompt = "<script>alert('hack')</script>Benchmark candidate vendors <b>bold</b>";
  const sanitized = ObjectiveUnderstandingService.understand({ prompt: maliciousPrompt });
  assert(!sanitized.intent.includes("<script>"), "Strips script tags and malicious HTML safely");

  console.log("\n-----------------------------------------------------------------");
  console.log("BLOCK 2: KAHN TOPOLOGICAL SORTING & DAG VALIDATION ENGINE");
  console.log("-----------------------------------------------------------------");

  // Scenario 5: Valid Multi-Stage DAG
  const validTasks = [
    { stepId: "task_1", title: "Research", taskType: "RESEARCH", order: 1, dependencies: [] },
    { stepId: "task_2", title: "Benchmark", taskType: "ANALYSIS", order: 2, dependencies: ["task_1"] },
    { stepId: "task_3_a", title: "API Check", taskType: "EXECUTION", order: 3, dependencies: ["task_2"] },
    { stepId: "task_3_b", title: "Security Check", taskType: "ANALYSIS", order: 4, dependencies: ["task_2"] },
    { stepId: "task_4", title: "Verify Output", taskType: "VERIFICATION", order: 5, dependencies: ["task_3_a", "task_3_b"] },
  ];

  const validDag = ObjectiveDAGService.validateAndOrder(validTasks);
  assert(validDag.valid === true, "Kahn's algorithm validates valid DAG as acyclic");
  assert(validDag.executionLevels.length === 4, "Partitions tasks into 4 parallel execution levels");
  assert(
    validDag.executionLevels[2].includes("task_3_a") && validDag.executionLevels[2].includes("task_3_b"),
    "Identifies concurrent parallel execution tasks in Level 2"
  );
  assert(validDag.topologicalOrder.length === 5, "Produces deterministic topological execution order");

  // Scenario 6: Cycle Detection (A -> B -> A)
  const cyclicTasks = [
    { stepId: "step_a", title: "A", order: 1, dependencies: ["step_b"] },
    { stepId: "step_b", title: "B", order: 2, dependencies: ["step_a"] },
  ];
  const cycleResult = ObjectiveDAGService.validateAndOrder(cyclicTasks);
  assert(cycleResult.valid === false, "Detects cyclic dependency between step_a and step_b");
  assert(
    cycleResult.error?.includes("Cycle detected"),
    "Returns descriptive cycle detection error message"
  );
  assert(
    cycleResult.cyclePath?.includes("step_a") && cycleResult.cyclePath?.includes("step_b"),
    "Traces and reports exact cyclic dependency path"
  );

  // Scenario 7: Self-Dependency (A -> A)
  const selfDepTasks = [
    { stepId: "step_self", title: "Self Dependent", order: 1, dependencies: ["step_self"] },
  ];
  const selfResult = ObjectiveDAGService.validateAndOrder(selfDepTasks);
  assert(selfResult.valid === false, "Rejects self-dependency (task depending on itself)");
  assert(selfResult.error?.includes("Self-dependency"), "Returns explicit self-dependency rejection error");

  // Scenario 8: Non-Existent Dependency
  const missingDepTasks = [
    { stepId: "step_real", title: "Real Step", order: 1, dependencies: ["step_ghost"] },
  ];
  const missingResult = ObjectiveDAGService.validateAndOrder(missingDepTasks);
  assert(missingResult.valid === false, "Rejects dependency on non-existent stepId");
  assert(missingResult.error?.includes("non-existent step"), "Returns explicit missing dependency error");

  // Scenario 9: Duplicate Edge Declaration
  const duplicateEdgeTasks = [
    { stepId: "step_1", title: "Step 1", order: 1, dependencies: [] },
    { stepId: "step_2", title: "Step 2", order: 2, dependencies: ["step_1", "step_1"] },
  ];
  const dupResult = ObjectiveDAGService.validateAndOrder(duplicateEdgeTasks);
  assert(dupResult.valid === false, "Rejects duplicate dependency edge declarations");

  console.log("\n-----------------------------------------------------------------");
  console.log("BLOCK 3: DETERMINISTIC 5-TIER PLAN VALIDATION SERVICE");
  console.log("-----------------------------------------------------------------");

  // Scenario 10: Tier 1 (Objective Structure Failure)
  const tier1Fail = await ObjectivePlanValidationService.validatePlan({
    userId: userA.id,
    objectiveId: "obj_test",
    title: "", // Empty title
    category: "PROCUREMENT",
    deliverables: [],
    successCriteria: [],
    steps: validTasks.map((t) => ({ ...t, agentType: "research_procurement", requiredCapabilities: [], requiredTools: [], preconditions: [], completionConditions: [], riskClassification: "LOW", failureHandling: "FAIL_CLOSED" })),
  });
  assert(tier1Fail.isValid === false, "Tier 1: Rejects plan with empty title or missing deliverables");
  assert(tier1Fail.tierResults.objective.passed === false, "Tier 1 explicitly flagged as failed");

  // Scenario 11: Tier 2 (Mandate Missing for Financial Tasks)
  const tier2MissingMandate = await ObjectivePlanValidationService.validatePlan({
    userId: userA.id,
    objectiveId: "obj_test",
    title: "Financial Action Without Mandate",
    category: "PROCUREMENT",
    deliverables: ["Deliverable"],
    successCriteria: [{ criterionId: "c1", description: "check", measurementType: "BOOLEAN", target: "true", verificationMethod: "EXTERNAL_EVIDENCE" }],
    steps: [
      {
        stepId: "step_pay",
        title: "Disburse Payment",
        order: 1,
        taskType: "PAYMENT",
        agentType: "research_procurement",
        requiredCapabilities: ["procurement_proposal"],
        requiredTools: ["near_rpc_reader"],
        dependencies: [],
        preconditions: [],
        completionConditions: [],
        riskClassification: "HIGH",
        estimatedCostYocto: nearToYocto("0.01"),
        failureHandling: "FAIL_CLOSED",
      },
    ],
    mandateId: null, // No mandate provided!
  });
  assert(tier2MissingMandate.isValid === false, "Tier 2: Rejects financial tasks when no mandate is linked");

  // Scenario 12: Tier 2 (Budget Ceiling Exceeded in yoctoNEAR)
  const tier2BudgetExceeded = await ObjectivePlanValidationService.validatePlan({
    userId: userA.id,
    objectiveId: "obj_test",
    title: "Excessive Budget Plan",
    category: "PROCUREMENT",
    deliverables: ["Deliverable"],
    successCriteria: [{ criterionId: "c1", description: "check", measurementType: "BOOLEAN", target: "true", verificationMethod: "EXTERNAL_EVIDENCE" }],
    steps: [
      {
        stepId: "step_pay",
        title: "Disburse Payment",
        order: 1,
        taskType: "PAYMENT",
        agentType: "research_procurement",
        requiredCapabilities: ["procurement_proposal"],
        requiredTools: ["near_rpc_reader"],
        dependencies: [],
        preconditions: [],
        completionConditions: [],
        riskClassification: "HIGH",
        estimatedCostYocto: nearToYocto("0.5"), // Mandate limit is 0.1 NEAR!
        failureHandling: "FAIL_CLOSED",
      },
    ],
    mandateId: mandateA.id,
  });
  assert(tier2BudgetExceeded.isValid === false, "Tier 2: Rejects plan attempting to exceed mandate budget ceiling (0.5 NEAR > 0.1 NEAR)");

  // Scenario 13: Tier 2 (Recipient Allowlist Enforcement)
  const tier2DisallowedRecipient = await ObjectivePlanValidationService.validatePlan({
    userId: userA.id,
    objectiveId: "obj_test",
    title: "Unvetted Recipient Plan",
    category: "PROCUREMENT",
    deliverables: ["Deliverable"],
    successCriteria: [{ criterionId: "c1", description: "check", measurementType: "BOOLEAN", target: "true", verificationMethod: "EXTERNAL_EVIDENCE" }],
    steps: [
      {
        stepId: "step_pay",
        title: "Disburse Payment to untrusted.testnet",
        description: "Payment to untrusted.testnet",
        order: 1,
        taskType: "PAYMENT",
        agentType: "research_procurement",
        requiredCapabilities: ["procurement_proposal"],
        requiredTools: ["near_rpc_reader"],
        dependencies: [],
        preconditions: ["Recipient untrusted.testnet verified"],
        completionConditions: [],
        riskClassification: "HIGH",
        estimatedCostYocto: nearToYocto("0.01"),
        failureHandling: "FAIL_CLOSED",
      },
    ],
    mandateId: mandateA.id,
  });
  assert(tier2DisallowedRecipient.isValid === false, "Tier 2: Rejects payment step with non-allowlisted recipient 'untrusted.testnet'");

  // Scenario 14: Tier 3 (Task Failure - Unregistered Tool)
  const tier3FakeTool = await ObjectivePlanValidationService.validatePlan({
    userId: userA.id,
    objectiveId: "obj_test",
    title: "Fake Tool Plan",
    category: "RESEARCH",
    deliverables: ["Deliverable"],
    successCriteria: [{ criterionId: "c1", description: "check", measurementType: "BOOLEAN", target: "true", verificationMethod: "EXTERNAL_EVIDENCE" }],
    steps: [
      {
        stepId: "step_hack",
        title: "Fabricate Tool",
        order: 1,
        taskType: "RESEARCH",
        agentType: "research_procurement",
        requiredCapabilities: ["web_research"],
        requiredTools: ["non_existent_unregistered_tool_xyz"], // Fake tool
        dependencies: [],
        preconditions: [],
        completionConditions: [],
        riskClassification: "LOW",
        failureHandling: "FAIL_CLOSED",
      },
    ],
  });
  assert(tier3FakeTool.isValid === false, "Tier 3: Rejects plan specifying unregistered or hallucinated tools");

  // Scenario 15: Tier 4 (Security Policy - Unfirewalled Payment)
  const tier4UnfirewalledPayment = await ObjectivePlanValidationService.validatePlan({
    userId: userA.id,
    objectiveId: "obj_test",
    title: "Unfirewalled Payment Step",
    category: "PROCUREMENT",
    deliverables: ["Deliverable"],
    successCriteria: [{ criterionId: "c1", description: "check", measurementType: "BOOLEAN", target: "true", verificationMethod: "EXTERNAL_EVIDENCE" }],
    steps: [
      {
        stepId: "step_1_research",
        title: "Research Step",
        order: 1,
        taskType: "RESEARCH",
        agentType: "research_procurement",
        requiredCapabilities: ["web_research"],
        requiredTools: ["duckduckgo_search"],
        dependencies: [],
        preconditions: [],
        completionConditions: [],
        riskClassification: "LOW",
        failureHandling: "FAIL_CLOSED",
      },
      {
        stepId: "step_pay",
        title: "Direct Payment",
        description: "Payment without dependency",
        order: 2,
        taskType: "PAYMENT",
        agentType: "research_procurement",
        requiredCapabilities: ["procurement_proposal"],
        requiredTools: ["near_rpc_reader"],
        dependencies: [], // Unfirewalled! No dependency on research!
        preconditions: [],
        completionConditions: [],
        riskClassification: "HIGH",
        estimatedCostYocto: nearToYocto("0.01"),
        failureHandling: "FAIL_CLOSED",
      },
    ],
    mandateId: mandateA.id,
  });
  assert(tier4UnfirewalledPayment.isValid === false, "Tier 4: Rejects financial payment step lacking upstream verification dependencies");

  // Scenario 16: Tier 5 (Risk Evaluation & Mandatory Approval)
  const tier5ValidReport = await ObjectivePlanValidationService.validatePlan({
    userId: userA.id,
    objectiveId: "obj_test",
    title: "Valid Multi-Tier Plan",
    category: "PROCUREMENT",
    deliverables: ["Deliverable 1"],
    successCriteria: [{ criterionId: "c1", description: "check", measurementType: "BOOLEAN", target: "true", verificationMethod: "EXTERNAL_EVIDENCE" }],
    steps: [
      {
        stepId: "step_1_res",
        title: "Research Providers",
        order: 1,
        taskType: "RESEARCH",
        agentType: "research_procurement",
        requiredCapabilities: ["web_research"],
        requiredTools: ["duckduckgo_search"],
        dependencies: [],
        preconditions: [],
        completionConditions: ["Candidate identified"],
        riskClassification: "LOW",
        failureHandling: "FAIL_CLOSED",
      },
      {
        stepId: "step_2_pay",
        title: "Payment Proposal for 0x479253b82eb63eb36f140ecabf0237cc338084e7",
        description: "0x479253b82eb63eb36f140ecabf0237cc338084e7 subscription",
        order: 2,
        taskType: "PAYMENT",
        agentType: "research_procurement",
        requiredCapabilities: ["procurement_proposal"],
        requiredTools: ["near_rpc_reader"],
        dependencies: ["step_1_res"],
        preconditions: ["Winning provider identified"],
        completionConditions: ["Proposal evaluated"],
        riskClassification: "MEDIUM",
        estimatedCostNear: "0.010",
        estimatedCostYocto: nearToYocto("0.01"),
        failureHandling: "FAIL_CLOSED",
      },
      {
        stepId: "step_3_verify",
        title: "Audit Receipt",
        order: 3,
        taskType: "VERIFICATION",
        agentType: "security_auditor",
        requiredCapabilities: ["web_research"],
        requiredTools: ["near_rpc_reader"],
        dependencies: ["step_2_pay"],
        preconditions: [],
        completionConditions: [],
        riskClassification: "LOW",
        failureHandling: "FAIL_CLOSED",
      },
    ],
    mandateId: mandateA.id,
  });
  assert(tier5ValidReport.isValid === true, "All 5 tiers pass for well-formed, firewalled procurement plan");
  assert(tier5ValidReport.requiresApproval === true, "Mandatory human approval enforced for financial workflow");
  assert(tier5ValidReport.overallRisk === "MEDIUM", "Classified overall plan risk as MEDIUM");

  console.log("\n-----------------------------------------------------------------");
  console.log("BLOCK 4: CANONICAL SHA-256 PLAN FINGERPRINT & IMMUTABILITY");
  console.log("-----------------------------------------------------------------");

  // Scenario 17: Deterministic Content Fingerprint
  const sampleSteps = [
    { stepId: "s2", title: "Step B", taskType: "ANALYSIS", agentType: "research_procurement", dependencies: ["s1"] },
    { stepId: "s1", title: "Step A", taskType: "RESEARCH", agentType: "research_procurement", dependencies: [] },
  ];
  const hash1 = computePlanContentHash({ version: 1, steps: sampleSteps as any });
  const hash2 = computePlanContentHash({ version: 1, steps: [sampleSteps[1], sampleSteps[0]] as any }); // Reversed order
  assert(hash1 === hash2, "Canonical plan hash is deterministic regardless of step array ordering");

  // Scenario 18: Tamper Invalidation
  const tamperedSteps = [
    { stepId: "s1", title: "Step A (Altered)", taskType: "RESEARCH", agentType: "research_procurement", dependencies: [] },
    { stepId: "s2", title: "Step B", taskType: "ANALYSIS", agentType: "research_procurement", dependencies: ["s1"] },
  ];
  const hashTampered = computePlanContentHash({ version: 1, steps: tamperedSteps as any });
  assert(hash1 !== hashTampered, "Any mutation to step definitions or parameters invalidates SHA-256 fingerprint");

  console.log("\n-----------------------------------------------------------------");
  console.log("BLOCK 5: OBJECTIVE LIFECYCLE INTEGRATION & AGENT RESTRICTIONS");
  console.log("-----------------------------------------------------------------");

  // Scenario 19: Full Database Lifecycle Execution
  const liveObjective = await prisma.objective.create({
    data: {
      title: "Procure High-Performance NEAR Testnet RPC",
      description: "Autonomous procurement under spending mandate",
      originalPrompt: "Procure High-Performance NEAR Testnet RPC with budget 0.05 NEAR",
      userId: userA.id,
      mandateId: mandateA.id,
      category: "PROCUREMENT",
      status: "ACTIVE",
    },
  });

  // Generate autonomous plan through engine
  const planResult = await generateObjectivePlan({
    objectiveId: liveObjective.id,
    userId: userA.id,
    title: liveObjective.title,
    category: liveObjective.category,
    mandateId: mandateA.id,
  });

  assert(planResult.version === 1, "Generated plan version 1");
  assert(planResult.requiresApproval === true, "Plan requires human approval");
  assert(Boolean(planResult.contentHash), "Computed and attached canonical planHash");
  assert(planResult.executionLevels.length >= 2, "Partitions plan into execution levels");

  const objAfterPlan = await prisma.objective.findUnique({ where: { id: liveObjective.id } });
  assert(
    objAfterPlan?.status === "AWAITING_APPROVAL",
    "Lifecycle state successfully transitioned from ACTIVE -> PLANNING -> AWAITING_APPROVAL"
  );

  // Scenario 20: AI Agent forbidden from bypassing human approval
  let agentTransitionError: string | null = null;
  try {
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId: liveObjective.id,
      targetStatus: "READY",
      actorId: "agent_unauthorized",
      actorRole: "AGENT",
      isAgent: true,
      reason: "Agent attempting to self-approve plan",
    });
  } catch (err: any) {
    agentTransitionError = err.message;
  }
  assert(
    agentTransitionError?.includes("AGENT_ACTION_FORBIDDEN"),
    "Security Invariant Enforced: AI Agent is strictly prohibited from transitioning AWAITING_APPROVAL -> READY"
  );

  // Scenario 21: Tampered Hash Rejection on Approval
  let tamperedApprovalError: string | null = null;
  try {
    await approveObjectivePlan({
      objectiveId: liveObjective.id,
      planVersion: 1,
      userId: userA.id,
      expectedPlanHash: "0000000000000000000000000000000000000000000000000000000000000000", // Fake hash
    });
  } catch (err: any) {
    tamperedApprovalError = err.message;
  }
  assert(
    tamperedApprovalError?.includes("tampering or modification detected"),
    "Anti-Tamper Enforced: Approval rejected when expected planHash does not match recorded fingerprint"
  );

  // Scenario 22: Valid User Approval Transitions to READY
  const approvedResult = await approveObjectivePlan({
    objectiveId: liveObjective.id,
    planVersion: 1,
    userId: userA.id,
    expectedPlanHash: planResult.contentHash,
    comment: "Plan audited and approved by user",
  });
  assert(approvedResult.success === true, "User approval succeeded");
  assert(approvedResult.plan.status === "APPROVED", "Plan status updated to APPROVED");
  assert(approvedResult.objective.status === "READY", "Objective lifecycle state transitioned to READY");

  // Scenario 23: Rejection & Replanning
  // Create another objective to test rejection and replanning flow
  const objForReject = await prisma.objective.create({
    data: {
      title: "Data Indexing Procurement Objective",
      originalPrompt: "Procure specialized indexing node with budget 0.02 NEAR",
      userId: userA.id,
      mandateId: mandateA.id,
      category: "PROCUREMENT",
      status: "ACTIVE",
    },
  });
  const planForReject = await generateObjectivePlan({
    objectiveId: objForReject.id,
    userId: userA.id,
    title: objForReject.title,
    category: objForReject.category,
    mandateId: mandateA.id,
  });

  const rejectResult = await rejectObjectivePlan({
    objectiveId: objForReject.id,
    planVersion: planForReject.version,
    userId: userA.id,
    reason: "Need wider candidate coverage",
  });
  assert(rejectResult.plan.status === "REJECTED", "Plan marked REJECTED");
  assert(rejectResult.objective.status === "PLANNING", "Objective moved back to PLANNING for revisions");

  // Re-plan with revised guidance
  const replanned = await replanObjective({
    objectiveId: objForReject.id,
    userId: userA.id,
    guidance: "Include additional vendor candidates",
  });
  assert(replanned.version === 2, "Replanning increments plan version to 2");
  assert(replanned.contentHash !== planForReject.contentHash, "Generates new immutable planHash for v2");

  console.log("\n-----------------------------------------------------------------");
  console.log("BLOCK 6: MULTI-TENANT ISOLATION & ZERO FINANCIAL DISPATCH");
  console.log("-----------------------------------------------------------------");

  // Scenario 24: Cross-Tenant Plan Access Rejected
  let crossTenantError: string | null = null;
  try {
    await approveObjectivePlan({
      objectiveId: liveObjective.id,
      userId: userB.id, // User B attempting to approve User A's plan
      planVersion: 1,
    });
  } catch (err: any) {
    crossTenantError = err.message;
  }
  assert(
    crossTenantError?.includes("not found or unauthorized"),
    "Tenant Isolation Enforced: User B cannot approve or access User A's objective plan"
  );

  // Scenario 25: Zero Live Financial Spending or Reservation Invariant
  const mandateAfterPlanning = await prisma.mandate.findUnique({ where: { id: mandateA.id } });
  assert(
    mandateAfterPlanning?.reservedYocto === "0",
    "Zero Fund Reservation: Mandate reservedBudget remains 0 yoctoNEAR after planning"
  );
  assert(
    mandateAfterPlanning?.spentYocto === "0",
    "Zero Financial Execution: Mandate spentBudget remains 0 yoctoNEAR (no live transactions during M13.2)"
  );

  console.log("\n-----------------------------------------------------------------");
  console.log("BLOCK 7: END-TO-END HTTP API VERIFICATION");
  console.log("-----------------------------------------------------------------");

  // Create an objective via API or database for HTTP testing
  const apiObj = await prisma.objective.create({
    data: {
      title: "API-Driven Autonomous Procurement",
      originalPrompt: "API-Driven Autonomous Procurement for FastNEAR RPC",
      userId: userA.id,
      mandateId: mandateA.id,
      category: "PROCUREMENT",
      status: "ACTIVE",
    },
  });

  // 1. POST /api/objectives/[id]/plan
  const planRes = await fetch(`${BASE_URL}/api/objectives/${apiObj.id}/plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-near-account": userA.nearAccountId,
    },
    body: JSON.stringify({ reason: "HTTP autonomous planning verification" }),
  });
  const planJson = await planRes.json();
  assert(planRes.status === 201 && planJson.success === true, "HTTP POST /api/objectives/[id]/plan returns 201 Created");
  assert(Boolean(planJson.plan?.planId), "HTTP response contains planId");
  assert(Boolean(planJson.plan?.contentHash), "HTTP response contains canonical contentHash");
  assert(planJson.plan?.executionLevels?.length >= 2, "HTTP response includes DAG executionLevels");

  // 2. GET /api/objectives/[id]/graph
  const graphRes = await fetch(`${BASE_URL}/api/objectives/${apiObj.id}/graph`, {
    headers: { "x-near-account": userA.nearAccountId },
  });
  const graphJson = await graphRes.json();
  assert(graphRes.status === 200 && graphJson.success === true, "HTTP GET /api/objectives/[id]/graph returns 200 OK");
  assert(graphJson.graph?.isAcyclic === true, "Graph API confirms DAG is strictly acyclic");
  assert(graphJson.graph?.nodes?.length > 0, "Graph API returns nodes with taskType and execution level");
  assert(graphJson.graph?.edges?.length > 0, "Graph API returns directed dependency edges");

  // 3. POST /api/objectives/[id]/plan/validate
  const validateRes = await fetch(`${BASE_URL}/api/objectives/${apiObj.id}/plan/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-near-account": userA.nearAccountId,
    },
    body: JSON.stringify({}),
  });
  const validateJson = await validateRes.json();
  assert(validateRes.status === 200 && validateJson.success === true, "HTTP POST /api/objectives/[id]/plan/validate confirms 5-tier pass");

  // 4. POST /api/objectives/[id]/plan/approve
  const approveRes = await fetch(`${BASE_URL}/api/objectives/${apiObj.id}/plan/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-near-account": userA.nearAccountId,
    },
    body: JSON.stringify({
      version: planJson.plan.version,
      planHash: planJson.plan.contentHash,
      comment: "Approved via API",
    }),
  });
  const approveJson = await approveRes.json();
  assert(approveRes.status === 200 && approveJson.success === true, "HTTP POST /api/objectives/[id]/plan/approve returns 200 OK");
  assert(approveJson.objective?.status === "READY", "Objective state transitioned to READY via API approval");

  // 5. POST /api/objectives/[id]/plan/replan
  const replanRes = await fetch(`${BASE_URL}/api/objectives/${apiObj.id}/plan/replan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-near-account": userA.nearAccountId,
    },
    body: JSON.stringify({ guidance: "Increase criteria strictness" }),
  });
  const replanJson = await replanRes.json();
  assert(replanRes.status === 200 && replanJson.success === true, "HTTP POST /api/objectives/[id]/plan/replan generates v2");
  assert(replanJson.plan?.version === 2, "API replan increments version to 2");

  // Clean up test data
  try {
    await prisma.objectivePlanApproval.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.objectivePlanStep.deleteMany({ where: { objective: { userId: { in: [userA.id, userB.id] } } } });
    await prisma.objectivePlan.deleteMany({ where: { objective: { userId: { in: [userA.id, userB.id] } } } });
    await prisma.objectiveSuccessCriteria.deleteMany({ where: { objective: { userId: { in: [userA.id, userB.id] } } } });
    await prisma.objectiveEvent.deleteMany({ where: { objective: { userId: { in: [userA.id, userB.id] } } } });
    await prisma.objective.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.mandate.deleteMany({ where: { id: mandateA.id } });
    await prisma.wallet.deleteMany({ where: { id: walletA.id } });
    await prisma.agent.deleteMany({ where: { id: agentA.id } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  } catch (cleanErr) {
    // Non-fatal test cleanup
  }

  console.log("\n=================================================================");
  console.log(`MILESTONE 13.2 PLANNING & DAG VERIFICATION SUMMARY:`);
  console.log(`TOTAL CHECKS: ${totalPassed + totalFailed}`);
  console.log(`PASSED:       ${totalPassed}`);
  console.log(`FAILED:       ${totalFailed}`);
  console.log("=================================================================");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed with unhandled error:", err);
  process.exit(1);
});
