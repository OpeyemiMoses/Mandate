import { prisma } from "../src/lib/db";
import { registerDefaultTools } from "../src/lib/tools";
import { agentRegistry } from "../src/lib/runtime/registry";
import { toolRegistry } from "../src/lib/tools/registry";
import {
  interpretObjective,
  classifyCategory,
  validateObjectiveAuthority,
  selectAgentForRequirement,
  generateObjectivePlan,
  executeObjectivePlan,
  pauseObjective,
  resumeObjective,
  cancelObjective,
  getObjectiveProgress,
  isValidObjectiveStatusTransition,
  isValidPlanStatusTransition,
  isValidStepStatusTransition,
  ObjectiveCategory,
  ObjectiveStatus,
  PlanStatus,
  StepStatus,
} from "../src/lib/objectives";
import { verifyAuditChain } from "../src/lib/auditLedger";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import { UniversalAgent } from "../src/lib/runtime/types";

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

async function main() {
  console.log("==================================================================");
  console.log("=== MANDATE MILESTONE 3: UNIVERSAL OBJECTIVE ENGINE TEST SUITE ===");
  console.log("==================================================================\n");

  // Ensure default tools are registered
  registerDefaultTools();

  // Test setup: Unique test run users
  const runId = Date.now().toString().slice(-6);
  const user1Near = `obj_alice_${runId}.testnet`;
  const user2Near = `obj_bob_${runId}.testnet`;

  const user1 = await prisma.user.upsert({
    where: { nearAccountId: user1Near },
    update: {},
    create: {
      nearAccountId: user1Near,
      displayName: "Alice Objective Owner",
      role: "OWNER",
    },
  });

  const user2 = await prisma.user.upsert({
    where: { nearAccountId: user2Near },
    update: {},
    create: {
      nearAccountId: user2Near,
      displayName: "Bob Foreign User",
      role: "MEMBER",
    },
  });

  // Setup an Agent for User 1
  const agent1 = await prisma.agent.create({
    data: {
      userId: user1.id,
      name: `Alice Specialist Agent ${runId}`,
      type: "research_procurement",
      status: "ACTIVE",
      configuration: JSON.stringify({
        model: "gemini-2.5-flash",
        capabilities: ["web_research", "financial_analysis", "procurement", "payment_proposals"],
      }),
    },
  });

  // Setup Dedicated OutLayer Custody Wallet for Agent 1
  const agentWallet1 = await prisma.wallet.create({
    data: {
      agentId: agent1.id,
      walletId: `outlayer_obj_${runId}`,
      apiKey: `wk_test_${runId}`,
      nearAccountId: `implicit_obj_${runId}.testnet`,
      network: "testnet",
      balanceYocto: nearToYocto("5.0"),
      onChainBalanceYocto: nearToYocto("5.0"),
      isInitialized: true,
      initializationStatus: "READY",
    },
  });

  // Setup Mandate for User 1
  const mandate1 = await prisma.mandate.create({
    data: {
      userId: user1.id,
      agentId: agent1.id,
      walletId: agentWallet1.id,
      name: `Alice Q4 Treasury Mandate ${runId}`,
      totalBudgetYocto: nearToYocto("5.0"),
      spentYocto: nearToYocto("0.5"),
      reservedYocto: nearToYocto("0.0"),
      perTxLimitYocto: nearToYocto("2.0"),
      approvalThresholdYocto: nearToYocto("1.0"),
      allowedRecipientsJson: JSON.stringify(["researcher.near", "oracle.testnet", "partner.near", "vendor.near", "custody.near"]),
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // ==========================================================================
  // CASE 1: Centralized Status Transition Validation
  // ==========================================================================
  console.log("Case 1: Centralized Status Transition Validation...");
  assert(isValidObjectiveStatusTransition("DRAFT", "NEEDS_CLARIFICATION"), 1, "DRAFT -> NEEDS_CLARIFICATION is valid");
  assert(isValidObjectiveStatusTransition("DRAFT", "AWAITING_USER_APPROVAL"), 1, "DRAFT -> AWAITING_USER_APPROVAL is valid");
  assert(isValidObjectiveStatusTransition("AWAITING_USER_APPROVAL", "ACTIVE"), 1, "AWAITING_USER_APPROVAL -> ACTIVE is valid");
  assert(isValidObjectiveStatusTransition("ACTIVE", "PAUSED"), 1, "ACTIVE -> PAUSED is valid");
  assert(isValidObjectiveStatusTransition("PAUSED", "ACTIVE"), 1, "PAUSED -> ACTIVE is valid");
  assert(isValidObjectiveStatusTransition("ACTIVE", "COMPLETED"), 1, "ACTIVE -> COMPLETED is valid");
  assert(isValidObjectiveStatusTransition("ACTIVE", "CANCELLED"), 1, "ACTIVE -> CANCELLED is valid");
  assert(!isValidObjectiveStatusTransition("COMPLETED", "ACTIVE"), 1, "COMPLETED -> ACTIVE is rejected (terminal state)");
  assert(!isValidObjectiveStatusTransition("DRAFT", "COMPLETED"), 1, "DRAFT -> COMPLETED directly is rejected");
  assert(isValidPlanStatusTransition("DRAFT", "PENDING_APPROVAL"), 1, "Plan DRAFT -> PENDING_APPROVAL is valid");
  assert(!isValidPlanStatusTransition("SUPERSEDED", "ACTIVE"), 1, "SUPERSEDED plan cannot become ACTIVE");
  assert(isValidStepStatusTransition("PENDING", "RUNNING"), 1, "Step PENDING -> RUNNING is valid");
  assert(!isValidStepStatusTransition("COMPLETED", "RUNNING"), 1, "Step COMPLETED cannot revert to RUNNING");

  // ==========================================================================
  // CASE 2: Natural-Language Objective Interpretation & Structured Extraction
  // ==========================================================================
  console.log("\nCase 2: Natural-Language Objective Interpretation & Goal Extraction...");
  const prompt1 = "Find best RPC provider in NEAR ecosystem under 1.5 NEAR, evaluate latency, and procure 1 month subscription from vendor.near before next week";
  const interpretation1 = interpretObjective({
    prompt: prompt1,
    constraints: { maxBudgetNear: "1.5" },
    existingMandateId: mandate1.id,
  });

  assert(interpretation1.category === "PROCUREMENT", 2, "Correctly classified prompt category as PROCUREMENT", `Category: ${interpretation1.category}`);
  assert(interpretation1.structuredGoal.outcome.length > 5, 2, "Extracted primary outcome", interpretation1.structuredGoal.outcome);
  assert(interpretation1.structuredGoal.entities.length > 0, 2, "Extracted target entities", JSON.stringify(interpretation1.structuredGoal.entities));
  assert(interpretation1.structuredGoal.budgetConstraints.maxNear === "1.5", 2, "Parsed max budget constraint (1.5 NEAR)");
  assert(interpretation1.structuredGoal.missingInformation.length === 0, 2, "Well-formed prompt detected zero missing information");
  assert(interpretation1.structuredGoal.reasonableAssumptions.length > 0, 2, "Extracted reasonable operational assumptions", interpretation1.structuredGoal.reasonableAssumptions[0]);

  // ==========================================================================
  // CASE 3: Missing Information Detection & NEEDS_CLARIFICATION State
  // ==========================================================================
  console.log("\nCase 3: Missing Information Detection & NEEDS_CLARIFICATION State...");
  const ambiguousPrompt = "xyz";
  const interpretation2 = interpretObjective({ prompt: ambiguousPrompt });

  assert(interpretation2.status === "NEEDS_CLARIFICATION", 3, "Flagged status as NEEDS_CLARIFICATION for vague prompt", interpretation2.clarificationMessage);
  
  // Create objective with ambiguous prompt
  const draftObj = await prisma.objective.create({
    data: {
      userId: user1.id,
      title: interpretation2.title,
      originalPrompt: ambiguousPrompt,
      category: interpretation2.category,
      status: "NEEDS_CLARIFICATION",
      priority: "MEDIUM",
      structuredGoalJson: JSON.stringify(interpretation2.structuredGoal),
    },
  });

  const updatedDraft = await prisma.objective.findUnique({ where: { id: draftObj.id } });
  assert(updatedDraft?.status === "NEEDS_CLARIFICATION", 3, "Objective persisted in NEEDS_CLARIFICATION status");

  // ==========================================================================
  // CASE 4: Extensible Category Classification
  // ==========================================================================
  console.log("\nCase 4: Category Classification across multiple domains...");
  const catResearch = classifyCategory("Conduct market intelligence on NEAR validators and summarize uptime");
  const catProcure = classifyCategory("Buy 100 API credits from service.near and verify receipt");
  const catTreasury = classifyCategory("Rebalance treasury portfolio allocation and stake 10 NEAR with validator");
  const catFinance = classifyCategory("Audit financial ledger and reconcile unconfirmed payment proposals");
  const catOps = classifyCategory("Run batch data synchronization and automated maintenance operations");
  const catCustom = classifyCategory("Perform specialized algorithm calculations");

  assert(catResearch === "RESEARCH", 4, "Classified research prompt as RESEARCH", catResearch);
  assert(catProcure === "PROCUREMENT", 4, "Classified purchase prompt as PROCUREMENT", catProcure);
  assert(catTreasury === "TREASURY", 4, "Classified treasury prompt as TREASURY", catTreasury);
  assert(catFinance === "FINANCE", 4, "Classified audit/financial prompt as FINANCE", catFinance);
  assert(catOps === "OPERATIONS", 4, "Classified deployment/ops prompt as OPERATIONS", catOps);
  assert(catCustom === "CUSTOM", 4, "Classified non-standard prompt as CUSTOM", catCustom);

  // ==========================================================================
  // CASE 5: Constraint & Financial Authority Enforcement (Zero Auto-Mandates)
  // ==========================================================================
  console.log("\nCase 5: Constraint & Financial Authority Enforcement (Zero auto-mandates)...");
  // 5a. Within mandate budget (available budget is 5.0 - 0.5 = 4.5 NEAR)
  const authCheckPass = await validateObjectiveAuthority({
    userId: user1.id,
    mandateId: mandate1.id,
    constraints: { maxBudgetNear: "1.0" },
    requestedRecipients: ["partner.near"],
  });
  assert(authCheckPass.isValid, 5, "Authority check passes when budget & recipients conform to mandate", `Available: ${authCheckPass.mandate?.availableBudgetNear} NEAR`);

  // 5b. Overdraft: requested budget exceeds available budget (available is 4.5 NEAR, request 10.0 NEAR)
  const authCheckFail = await validateObjectiveAuthority({
    userId: user1.id,
    mandateId: mandate1.id,
    constraints: { maxBudgetNear: "10.0" },
  });
  assert(!authCheckFail.isValid, 5, "Authority check fails when requested budget exceeds mandate available budget", authCheckFail.mismatches.join("; "));

  // 5c. Recipient restriction: unauthorized recipient
  const authCheckRecipientFail = await validateObjectiveAuthority({
    userId: user1.id,
    mandateId: mandate1.id,
    constraints: { maxBudgetNear: "0.5" },
    requestedRecipients: ["hacker.near"],
  });
  assert(!authCheckRecipientFail.isValid, 5, "Authority check fails when requested recipient is not in mandate allowed list", authCheckRecipientFail.mismatches.join("; "));

  // 5d. Mandate records in DB are immutable to objective engine
  const mandateBefore = await prisma.mandate.findUnique({ where: { id: mandate1.id } });
  assert(mandateBefore?.totalBudgetYocto === nearToYocto("5.0"), 5, "Mandate total budget remains strictly untouched (immutable to objective engine)");

  // ==========================================================================
  // CASE 6: Verifiable Success Criteria Generation & Verification
  // ==========================================================================
  console.log("\nCase 6: Verifiable Success Criteria Generation & Verification...");
  const obj1 = await prisma.objective.create({
    data: {
      userId: user1.id,
      mandateId: mandate1.id,
      title: "Evaluate and Procure NEAR RPC Service",
      originalPrompt: prompt1,
      category: "PROCUREMENT",
      status: "DRAFT",
      priority: "HIGH",
      structuredGoalJson: JSON.stringify(interpretation1.structuredGoal),
      constraintsJson: JSON.stringify({ maxBudgetNear: "1.5" }),
    },
  });

  // Generate Plan with Success Criteria
  const planResult = await generateObjectivePlan({
    objectiveId: obj1.id,
    userId: user1.id,
    title: obj1.title,
    category: obj1.category,
    structuredGoal: interpretation1.structuredGoal,
    constraints: { maxBudgetNear: "1.5" },
    mandateId: mandate1.id,
  });
  assert(!!planResult.planId, 6, "Generated structured objective plan successfully", `Plan ID: ${planResult.planId}`);

  const criteria = await prisma.objectiveSuccessCriteria.findMany({
    where: { objectiveId: obj1.id },
  });
  assert(criteria.length >= 2, 6, "Generated verifiable success criteria checklist", `Count: ${criteria.length}`);
  const hasVerifiableType = criteria.some((c) => ["NUMERIC", "BOOLEAN", "EVENT_BASED", "EVIDENCE_BASED", "USER_CONFIRMED"].includes(c.measurementType));
  assert(hasVerifiableType, 6, "Success criteria include verifiable typed validations", criteria.map((c) => `${c.description} [${c.measurementType}]`).join(", "));

  // ==========================================================================
  // CASE 7: Objective Planning Engine (DAG Step Dependencies, Risk, Costs)
  // ==========================================================================
  console.log("\nCase 7: Objective Planning Engine (DAG Step Dependencies, Risk, Costs)...");
  const plan = await prisma.objectivePlan.findUnique({
    where: { id: planResult.planId },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  assert(!!plan, 7, "Retrieved generated plan from database");
  assert(plan!.version === 1, 7, "Plan starts at version 1");
  assert(plan!.status === "PENDING_APPROVAL", 7, "Plan is placed in PENDING_APPROVAL status");
  assert(plan!.steps.length >= 2, 7, "Plan generated multiple sequential/DAG steps", `Steps count: ${plan!.steps.length}`);
  assert(typeof plan!.estimatedCostNear === "string", 7, "Plan includes estimated financial cost", `${plan!.estimatedCostNear} NEAR`);
  assert(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(plan!.riskClassification), 7, "Plan includes deterministic risk classification", `Risk: ${plan!.riskClassification}`);

  // Verify DAG dependencies
  const step2 = plan!.steps[1];
  const step2Deps = JSON.parse(step2.dependenciesJson || "[]");
  assert(step2Deps.length > 0, 7, "Step 2 declares explicit dependency on preceding step (DAG resolution)", `Dependencies: ${JSON.stringify(step2Deps)}`);

  // ==========================================================================
  // CASE 8: Agent Selection Service (Matches capabilities & reports missing)
  // ==========================================================================
  console.log("\nCase 8: Agent Selection Service...");
  // 8a. Match existing agent
  const agentMatch = await selectAgentForRequirement({
    userId: user1.id,
    requirement: { requiredCapabilities: ["web_research"] },
    mandateId: mandate1.id,
  });
  assert(agentMatch.matched, 8, "Matched existing agent for web_research", `Agent: ${agentMatch.selectedAgent?.name}`);

  // 8b. Honest reporting when no agent has required capabilities
  const missingAgentMatch = await selectAgentForRequirement({
    userId: user1.id,
    requirement: { requiredCapabilities: ["quantum_teleportation", "supercomputing_cluster"] },
    mandateId: mandate1.id,
  });
  assert(!missingAgentMatch.matched, 8, "Honest reporting when agent capabilities are missing (matched=false)");
  assert(missingAgentMatch.missingCapabilities.includes("quantum_teleportation"), 8, "Explicitly lists missing capability names", missingAgentMatch.missingCapabilities.join(", "));

  // ==========================================================================
  // CASE 9: Tool Availability Validation via Universal Tool Registry
  // ==========================================================================
  console.log("\nCase 9: Tool Availability Validation via Universal Tool Registry...");
  const registeredTools = toolRegistry.list();
  assert(registeredTools.length >= 2, 9, "Tool Registry exposes registered tools", registeredTools.map((t) => t.id).join(", "));
  
  // Verify plan step tools exist in registry
  for (const step of plan!.steps) {
    const requiredTools: string[] = JSON.parse(step.requiredToolsJson || "[]");
    for (const toolId of requiredTools) {
      const toolDef = toolRegistry.get(toolId);
      assert(!!toolDef, 9, `Step "${step.title}" references valid registered tool "${toolId}"`);
    }
  }

  // ==========================================================================
  // CASE 10: Version-Bound Plan Approval & Rejection Flow
  // ==========================================================================
  console.log("\nCase 10: Version-Bound Plan Approval & Rejection Flow...");
  // Cannot execute unapproved plan
  let unapprovedFailed = false;
  try {
    await executeObjectivePlan({ objectiveId: obj1.id, userId: user1.id });
  } catch (err: any) {
    if (err.message.includes("APPROVED")) unapprovedFailed = true;
  }
  assert(unapprovedFailed, 10, "Execution rejected when plan is not yet approved by user");

  // Valid User Approval for Plan Version 1
  const approvalRecord = await prisma.objectivePlanApproval.create({
    data: {
      planId: plan!.id,
      version: plan!.version,
      userId: user1.id,
      decision: "APPROVED",
      comment: "Approved execution of RPC procurement plan",
    },
  });
  await prisma.objectivePlan.update({
    where: { id: plan!.id },
    data: { status: "APPROVED" },
  });
  await prisma.objective.update({
    where: { id: obj1.id },
    data: { status: "AWAITING_USER_APPROVAL" },
  });

  assert(!!approvalRecord.id, 10, "Recorded persistent ObjectivePlanApproval record", `Approval ID: ${approvalRecord.id}`);

  // ==========================================================================
  // CASE 11: Plan Execution via Universal Agent Runtime
  // ==========================================================================
  console.log("\nCase 11: Plan Execution via Universal Agent Runtime...");
  assert(agentRegistry.has("research_procurement"), 11, "Agent Registry contains registered research_procurement agent");

  const executionResult = await executeObjectivePlan({ objectiveId: obj1.id, userId: user1.id });
  if (executionResult.error) {
    console.log("     ↳ Execution error:", executionResult.error);
  }
  assert(executionResult.totalSteps > 0, 11, "Objective plan execution triggered through Universal Agent Runtime", `Steps total: ${executionResult.totalSteps}, Status: ${executionResult.status}`);

  // Verify steps transitioned
  const postExecSteps = await prisma.objectivePlanStep.findMany({
    where: { planId: plan!.id },
    orderBy: { order: "asc" },
  });
  const completedOrInProgress = postExecSteps.some((s) => s.status === "COMPLETED" || s.status === "RUNNING");
  assert(completedOrInProgress, 11, "DAG steps executed and transitioned to COMPLETED/RUNNING status");

  // ==========================================================================
  // CASE 12: Real Progress Tracking from Step Completion
  // ==========================================================================
  console.log("\nCase 12: Real Progress Tracking from Step Completion...");
  // Mark all steps completed to test full verified completion progress
  await prisma.objectivePlanStep.updateMany({
    where: { planId: plan!.id },
    data: { status: "COMPLETED" },
  });
  // Mark success criteria verified
  await prisma.objectiveSuccessCriteria.updateMany({
    where: { objectiveId: obj1.id },
    data: { currentState: "MET", lastEvaluatedAt: new Date(), evidenceJson: JSON.stringify({ verified: true }) },
  });

  const progress = await getObjectiveProgress(obj1.id, user1.id);
  assert(progress.stepsTotal === postExecSteps.length, 12, "Reported accurate total steps count", `Steps: ${progress.stepsTotal}`);
  assert(progress.stepsCompleted === postExecSteps.length, 12, "Reported accurate completed steps count", `Completed: ${progress.stepsCompleted}`);
  assert(progress.progressPercent === 100, 12, "Calculated verified progress percent at 100%", `Progress: ${progress.progressPercent}%`);

  // ==========================================================================
  // CASE 13: Dynamic Plan Re-Evaluation & Versioning (v1 -> v2)
  // ==========================================================================
  console.log("\nCase 13: Dynamic Plan Re-Evaluation & Versioning (v1 -> v2)...");
  // Create another objective to test dynamic re-planning
  const dynamicObj = await prisma.objective.create({
    data: {
      userId: user1.id,
      mandateId: mandate1.id,
      title: "Dynamic Re-planning Target",
      originalPrompt: "Procure decentralized storage capacity",
      category: "PROCUREMENT",
      status: "DRAFT",
      priority: "MEDIUM",
      structuredGoalJson: JSON.stringify(interpretation1.structuredGoal),
      constraintsJson: JSON.stringify({ maxBudgetNear: "1.0" }),
    },
  });

  const v1PlanRes = await generateObjectivePlan({
    objectiveId: dynamicObj.id,
    userId: user1.id,
    title: dynamicObj.title,
    category: dynamicObj.category,
    structuredGoal: interpretation1.structuredGoal,
    constraints: { maxBudgetNear: "1.0" },
    mandateId: mandate1.id,
  });
  assert(!!v1PlanRes.planId, 13, "Generated initial Plan v1");

  // Re-generate plan (simulating user refinement or environment shift)
  const v2PlanRes = await generateObjectivePlan({
    objectiveId: dynamicObj.id,
    userId: user1.id,
    title: dynamicObj.title,
    category: dynamicObj.category,
    structuredGoal: interpretation1.structuredGoal,
    constraints: { maxBudgetNear: "1.0" },
    mandateId: mandate1.id,
    reason: "Adjusted parameters after initial run",
  });
  assert(!!v2PlanRes.planId, 13, "Generated dynamic re-evaluated Plan v2", `New Plan ID: ${v2PlanRes.planId}`);

  const v1Plan = await prisma.objectivePlan.findUnique({ where: { id: v1PlanRes.planId } });
  const v2Plan = await prisma.objectivePlan.findUnique({ where: { id: v2PlanRes.planId } });

  assert(v1Plan?.status === "SUPERSEDED", 13, "Original Plan v1 is marked SUPERSEDED", `Status: ${v1Plan?.status}`);
  assert(v2Plan?.version === 2, 13, "New Plan has incremented version 2", `Version: ${v2Plan?.version}`);

  // ==========================================================================
  // CASE 14: Objective Lifecycle Status Transitions (Pause, Resume, Cancel)
  // ==========================================================================
  console.log("\nCase 14: Objective Lifecycle Status Transitions (Pause, Resume, Cancel)...");
  // Set objective to ACTIVE first
  await prisma.objective.update({
    where: { id: dynamicObj.id },
    data: { status: "ACTIVE" },
  });

  // Pause
  const pausedObj = await pauseObjective(dynamicObj.id, user1.id);
  assert(pausedObj.status === "PAUSED", 14, "Successfully paused active objective (status is PAUSED)");

  // Resume (requires plan to be APPROVED with recorded user approval)
  await prisma.objectivePlanApproval.create({
    data: {
      planId: v2PlanRes.planId,
      version: 2,
      userId: user1.id,
      decision: "APPROVED",
      comment: "Approved v2 before resume",
    },
  });
  await prisma.objectivePlan.update({
    where: { id: v2PlanRes.planId },
    data: { status: "APPROVED" },
  });
  const resumeRes = await resumeObjective(dynamicObj.id, user1.id);
  assert(resumeRes.status === "ACTIVE" || resumeRes.status === "COMPLETED", 14, "Successfully resumed paused objective", `Status: ${resumeRes.status}`);

  // Cancel
  const cancelledObj = await cancelObjective(dynamicObj.id, user1.id);
  assert(cancelledObj.status === "CANCELLED", 14, "Successfully cancelled objective (status is CANCELLED)");

  // ==========================================================================
  // CASE 15: Multi-User Isolation Boundary Enforcement
  // ==========================================================================
  console.log("\nCase 15: Multi-User Isolation Boundary Enforcement...");
  // User 2 (Bob) attempts to pause Alice's objective
  let bobPauseBlocked = false;
  try {
    await pauseObjective(obj1.id, user2.id);
  } catch (err: any) {
    if (err.message.includes("not found") || err.message.includes("unauthorized")) bobPauseBlocked = true;
  }
  assert(bobPauseBlocked, 15, "Bob blocked from pausing Alice's objective (User isolation)");

  // Bob attempts to cancel Alice's objective
  let bobCancelBlocked = false;
  try {
    await cancelObjective(obj1.id, user2.id);
  } catch (err: any) {
    if (err.message.includes("not found") || err.message.includes("unauthorized")) bobCancelBlocked = true;
  }
  assert(bobCancelBlocked, 15, "Bob blocked from cancelling Alice's objective");

  // Bob attempts to view progress of Alice's objective
  let bobViewBlocked = false;
  try {
    await getObjectiveProgress(obj1.id, user2.id);
  } catch (err: any) {
    if (err.message.includes("not found") || err.message.includes("unauthorized")) bobViewBlocked = true;
  }
  assert(bobViewBlocked, 15, "Bob blocked from reading progress of Alice's objective");

  // ==========================================================================
  // CASE 16: Cryptographic Audit Ledger Integration & Hash Chain Integrity
  // ==========================================================================
  console.log("\nCase 16: Cryptographic Audit Ledger Integration & Hash Chain...");
  // Check that objective events were created
  const objEvents = await prisma.objectiveEvent.findMany({
    where: { objectiveId: obj1.id },
  });
  assert(objEvents.length >= 2, 16, "Lifecycle events persisted to ObjectiveEvent table", `Count: ${objEvents.length}`);

  // Verify hash chain of global audit ledger for user1
  const auditVerification = await verifyAuditChain(user1.id);
  assert(auditVerification.valid, 16, "Audit ledger SHA-256 cryptographic hash chain is valid and uncorrupted", `Entries verified: ${auditVerification.count}`);

  // Check that audit ledger contains objective entries
  const objAuditEntries = await prisma.auditLog.findMany({
    where: {
      userId: user1.id,
      eventType: { in: ["OBJECTIVE_CREATED", "OBJECTIVE_PLAN_GENERATED", "OBJECTIVE_PLAN_APPROVED", "OBJECTIVE_EXECUTION_STARTED"] },
    },
  });
  assert(objAuditEntries.length >= 1, 16, "Objective lifecycle transitions dual-dispatched to tamper-evident audit ledger", `Ledger entries: ${objAuditEntries.length}`);

  // ==========================================================================
  // CASE 17: HTTP REST API End-to-End Suite
  // ==========================================================================
  console.log("\nCase 17: HTTP REST API End-to-End Suite...");
  // 17a. POST /api/objectives
  const createRes = await fetch(`${BASE_URL}/api/objectives`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-near-account": user1Near,
    },
    body: JSON.stringify({
      prompt: "Research NEAR restaking yields and prepare comparison report",
      priority: "HIGH",
      mandateId: mandate1.id,
      autoPlan: true,
    }),
  });
  assert(createRes.status === 201, 17, "POST /api/objectives creates new objective with HTTP 201", `Status: ${createRes.status}`);
  const createData = await createRes.json();
  const apiObjId = createData.objective.id;
  assert(!!apiObjId, 17, "Created objective returned valid ID", apiObjId);

  // 17b. GET /api/objectives
  const listRes = await fetch(`${BASE_URL}/api/objectives`, {
    headers: { "x-near-account": user1Near },
  });
  assert(listRes.status === 200, 17, "GET /api/objectives returns list with HTTP 200");
  const listData = await listRes.json();
  assert(listData.objectives.some((o: any) => o.id === apiObjId), 17, "Newly created objective present in list response");

  // 17c. GET /api/objectives/[id]
  const getRes = await fetch(`${BASE_URL}/api/objectives/${apiObjId}`, {
    headers: { "x-near-account": user1Near },
  });
  assert(getRes.status === 200, 17, `GET /api/objectives/${apiObjId} returns objective detail`);
  const getData = await getRes.json();
  assert(getData.objective.title.includes("NEAR") || getData.objective.title.length > 0, 17, "Retrieved objective title", getData.objective.title);

  // 17d. POST /api/objectives/[id]/plan
  const planReqRes = await fetch(`${BASE_URL}/api/objectives/${apiObjId}/plan`, {
    method: "POST",
    headers: { "x-near-account": user1Near },
  });
  assert(planReqRes.status === 201 || planReqRes.status === 200, 17, "POST /api/objectives/[id]/plan generates plan with HTTP 201/200");
  const planReqData = await planReqRes.json();
  const apiPlanId = planReqData.plan?.planId || planReqData.planId;
  assert(!!apiPlanId, 17, "Plan endpoint returned plan ID", apiPlanId);

  // 17e. GET /api/objectives/[id]/plan
  const getPlanRes = await fetch(`${BASE_URL}/api/objectives/${apiObjId}/plan`, {
    headers: { "x-near-account": user1Near },
  });
  assert(getPlanRes.status === 200, 17, "GET /api/objectives/[id]/plan returns plan details with HTTP 200");
  const getPlanData = await getPlanRes.json();
  assert(getPlanData.plan.id === apiPlanId, 17, "Plan detail matches requested plan");

  // 17f. POST /api/objectives/[id]/approve
  const approveRes = await fetch(`${BASE_URL}/api/objectives/${apiObjId}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-near-account": user1Near,
    },
    body: JSON.stringify({
      planId: apiPlanId,
      version: getPlanData.plan.version,
      comments: "Approved via REST API",
    }),
  });
  assert(approveRes.status === 200, 17, "POST /api/objectives/[id]/approve approves plan with HTTP 200");

  // 17g. POST /api/objectives/[id]/execute
  const execRes = await fetch(`${BASE_URL}/api/objectives/${apiObjId}/execute`, {
    method: "POST",
    headers: { "x-near-account": user1Near },
  });
  assert(execRes.status === 200, 17, "POST /api/objectives/[id]/execute triggers execution with HTTP 200");

  // 17h. POST /api/objectives/[id]/pause & /resume on an active objective
  const pauseTestObj = await prisma.objective.create({
    data: {
      userId: user1.id,
      title: "API Pause Resume Test Target",
      originalPrompt: "Test pausing and resuming via REST API",
      status: "ACTIVE",
      priority: "LOW",
    },
  });
  const pauseTestPlan = await prisma.objectivePlan.create({
    data: {
      objectiveId: pauseTestObj.id,
      version: 1,
      summary: "Test plan for pause/resume",
      status: "APPROVED",
    },
  });
  await prisma.objectivePlanApproval.create({
    data: {
      planId: pauseTestPlan.id,
      version: 1,
      userId: user1.id,
      decision: "APPROVED",
      comment: "Approved test plan",
    },
  });

  const pauseApiRes = await fetch(`${BASE_URL}/api/objectives/${pauseTestObj.id}/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-near-account": user1Near },
    body: JSON.stringify({ reason: "Testing pause API" }),
  });
  assert(pauseApiRes.status === 200, 17, "POST /api/objectives/[id]/pause pauses objective with HTTP 200");

  const resumeApiRes = await fetch(`${BASE_URL}/api/objectives/${pauseTestObj.id}/resume`, {
    method: "POST",
    headers: { "x-near-account": user1Near },
  });
  assert(resumeApiRes.status === 200, 17, "POST /api/objectives/[id]/resume resumes objective with HTTP 200");

  // 17i. GET /api/objectives/[id]/progress
  const progRes = await fetch(`${BASE_URL}/api/objectives/${apiObjId}/progress`, {
    headers: { "x-near-account": user1Near },
  });
  assert(progRes.status === 200, 17, "GET /api/objectives/[id]/progress returns progress with HTTP 200");
  const progData = await progRes.json();
  assert(typeof progData.progress.progressPercent === "number", 17, `Progress percentage returned: ${progData.progress.progressPercent}%`);

  // 17j. GET /api/objectives/[id]/events
  const eventsRes = await fetch(`${BASE_URL}/api/objectives/${apiObjId}/events`, {
    headers: { "x-near-account": user1Near },
  });
  assert(eventsRes.status === 200, 17, "GET /api/objectives/[id]/events returns event log with HTTP 200");
  const eventsData = await eventsRes.json();
  assert(eventsData.events.length >= 1, 17, "Lifecycle events present in events API endpoint", `Events: ${eventsData.events.length}`);

  // 17k. User isolation via API: Bob attempts to GET Alice's objective
  const foreignGet = await fetch(`${BASE_URL}/api/objectives/${apiObjId}`, {
    headers: { "x-near-account": user2Near },
  });
  assert(foreignGet.status === 404, 17, "Foreign user (Bob) receives 404 when attempting to access Alice's objective via REST API");

  console.log("\n==================================================================");
  console.log("=== ALL 17 TEST CASES IN MILESTONE 3 SUITE PASSED SUCCESSFULLY! ===");
  console.log("==================================================================\n");
}

main()
  .catch((err) => {
    console.error("Fatal test error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
