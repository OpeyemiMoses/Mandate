import { prisma } from "../src/lib/db";
import { registerDefaultTools } from "../src/lib/tools";
import { agentRegistry } from "../src/lib/runtime/registry";
import { toolRegistry } from "../src/lib/tools/registry";
import {
  interpretObjective,
  generateObjectivePlan,
  executeObjectivePlan,
  computePlanContentHash,
  reserveMandateBudgetAtomic,
  releaseMandateBudgetAtomic,
  evaluateObjectiveSuccessCriteria,
} from "../src/lib/objectives";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import crypto from "crypto";

function assert(condition: boolean, testNum: number, label: string, details?: string) {
  if (condition) {
    console.log(`  ✓ Area ${testNum} PASS: ${label}`);
    if (details) console.log(`     ↳ ${details}`);
  } else {
    console.error(`  ✗ Area ${testNum} FAIL: ${label}`);
    if (details) console.error(`     ↳ Details: ${details}`);
    process.exit(1);
  }
}

async function main() {
  console.log("==================================================================");
  console.log("=== MANDATE: 5 CRITICAL FINANCIAL & OPERATIONAL CHECKS ===========");
  console.log("==================================================================\n");

  registerDefaultTools();

  const runId = Date.now().toString().slice(-6);
  const testUserNear = `audit_verify_${runId}.testnet`;

  // Create isolated user
  const user = await prisma.user.upsert({
    where: { nearAccountId: testUserNear },
    update: {},
    create: {
      nearAccountId: testUserNear,
      displayName: "Security Auditor",
      role: "OWNER",
    },
  });

  // Create agent
  const agent = await prisma.agent.create({
    data: {
      userId: user.id,
      name: `Auditor Specialist ${runId}`,
      type: "research_procurement",
      status: "ACTIVE",
    },
  });

  // Create custody wallet
  const wallet = await prisma.wallet.create({
    data: {
      agentId: agent.id,
      walletId: `outlayer_audit_${runId}`,
      apiKey: `wk_audit_${runId}`,
      nearAccountId: `implicit_audit_${runId}.testnet`,
      balanceYocto: nearToYocto("10.0"),
      onChainBalanceYocto: nearToYocto("10.0"),
      isInitialized: true,
      initializationStatus: "READY",
    },
  });

  // Create shared mandate (1.0 NEAR total budget)
  const sharedMandate = await prisma.mandate.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      walletId: wallet.id,
      name: `Auditor Strict 1.0 NEAR Mandate ${runId}`,
      totalBudgetYocto: nearToYocto("1.0"),
      spentYocto: nearToYocto("0.0"),
      reservedYocto: nearToYocto("0.0"),
      perTxLimitYocto: nearToYocto("1.0"),
      approvalThresholdYocto: nearToYocto("0.05"),
      allowedRecipientsJson: JSON.stringify(["researcher.near", "oracle.testnet", "partner.near"]),
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // ==========================================================================
  // CHECK 1: DAG Execution Correctness
  // "A step must never execute before all dependencies are verified as complete.
  // Failed or blocked dependencies must stop downstream execution."
  // ==========================================================================
  console.log("--- 1. DAG EXECUTION CORRECTNESS ---");
  const obj1 = await prisma.objective.create({
    data: {
      userId: user.id,
      title: "DAG Dependency Test Target",
      originalPrompt: "Test multi-step dependency DAG execution failure propagation",
      status: "DRAFT",
    },
  });

  // Manually construct a 3-step DAG plan:
  // Step 1: fails
  // Step 2: depends on Step 1
  // Step 3: depends on Step 2
  const plan1 = await prisma.objectivePlan.create({
    data: {
      objectiveId: obj1.id,
      version: 1,
      summary: "3-step sequential DAG",
      status: "APPROVED",
      steps: {
        create: [
          {
            stepId: "step_dag_1",
            objectiveId: obj1.id,
            title: "Prerequisite Step 1",
            description: "Step 1 that will intentionally fail",
            order: 1,
            status: "PENDING",
            agentType: "research_procurement",
            dependenciesJson: "[]",
          },
          {
            stepId: "step_dag_2",
            objectiveId: obj1.id,
            title: "Dependent Step 2",
            description: "Step 2 depending on Step 1",
            order: 2,
            status: "PENDING",
            agentType: "research_procurement",
            dependenciesJson: JSON.stringify(["step_dag_1"]),
          },
          {
            stepId: "step_dag_3",
            objectiveId: obj1.id,
            title: "Downstream Step 3",
            description: "Step 3 depending on Step 2",
            order: 3,
            status: "PENDING",
            agentType: "research_procurement",
            dependenciesJson: JSON.stringify(["step_dag_2"]),
          },
        ],
      },
    },
  });

  // Create approval record
  await prisma.objectivePlanApproval.create({
    data: {
      planId: plan1.id,
      version: 1,
      userId: user.id,
      decision: "APPROVED",
    },
  });

  // Simulate Step 1 having failed
  await prisma.objectivePlanStep.updateMany({
    where: { planId: plan1.id, stepId: "step_dag_1" },
    data: { status: "FAILED", errorDetails: "Simulated network timeout during step 1 execution" },
  });

  // Attempt to execute plan
  const execDagResult = await executeObjectivePlan({ objectiveId: obj1.id, userId: user.id });

  const postDagSteps = await prisma.objectivePlanStep.findMany({
    where: { planId: plan1.id },
    orderBy: { order: "asc" },
  });

  const step1 = postDagSteps.find((s) => s.stepId === "step_dag_1");
  const step2 = postDagSteps.find((s) => s.stepId === "step_dag_2");
  const step3 = postDagSteps.find((s) => s.stepId === "step_dag_3");

  assert(step1?.status === "FAILED", 1, "Prerequisite Step 1 is in FAILED state");
  assert(step2?.status === "BLOCKED", 1, "Downstream Step 2 is explicitly marked BLOCKED due to failed dependency", step2?.errorDetails || undefined);
  assert(step3?.status === "PENDING" || step3?.status === "BLOCKED", 1, "Step 3 was NEVER executed (status not RUNNING or COMPLETED)");
  assert(execDagResult.status === "BLOCKED" || execDagResult.status === "FAILED", 1, "Objective execution halted and transitioned to BLOCKED/FAILED", `Status: ${execDagResult.status}`);
  console.log("  ✓ DAG Correctness: Downstream steps completely protected from executing when prerequisites fail.\n");

  // ==========================================================================
  // CHECK 2: Plan Re-Evaluation
  // "Completed steps must remain completed, but changed steps must not inherit old approvals."
  // ==========================================================================
  console.log("--- 2. PLAN RE-EVALUATION ---");
  const obj2 = await prisma.objective.create({
    data: {
      userId: user.id,
      mandateId: sharedMandate.id,
      title: "Plan Re-evaluation Target",
      originalPrompt: "Procure decentralized compute cluster",
      category: "PROCUREMENT",
      status: "DRAFT",
    },
  });

  const structuredGoal = {
    outcome: "Procure decentralized compute cluster",
    scope: "Procurement",
    entities: ["vendor.near"],
    timeHorizon: "1 week",
    budgetConstraints: { maxNear: "0.5" },
    spendingPreferences: [],
    restrictions: [],
    requiredCapabilities: ["web_research", "provider_benchmarking", "procurement_proposal"],
    requiredTools: ["duckduckgo_search"],
    successConditions: ["Benchmark providers"],
    monitoringRequirements: [],
    recurringRequirements: [],
    approvalRequirements: [],
    explicitInstructions: [],
    reasonableAssumptions: [],
    missingInformation: [],
    unfulfillableRequirements: [],
  };

  // Generate Plan v1
  const v1Result = await generateObjectivePlan({
    objectiveId: obj2.id,
    userId: user.id,
    title: obj2.title,
    category: obj2.category,
    structuredGoal,
    constraints: { maxBudgetNear: "0.5" },
    mandateId: sharedMandate.id,
  });

  // Approve Plan v1
  await prisma.objectivePlanApproval.create({
    data: {
      planId: v1Result.planId,
      version: 1,
      userId: user.id,
      decision: "APPROVED",
      comment: "Approved v1",
    },
  });
  await prisma.objectivePlan.update({
    where: { id: v1Result.planId },
    data: { status: "APPROVED" },
  });

  // Simulate Step 1 (Research) being COMPLETED in v1
  const v1Step1 = await prisma.objectivePlanStep.findFirst({
    where: { planId: v1Result.planId, stepId: "step_1_research" },
  });
  const mockExecutionId = `exec_completed_${runId}`;
  await prisma.objectivePlanStep.update({
    where: { id: v1Step1!.id },
    data: {
      status: "COMPLETED",
      executionId: mockExecutionId,
      outputJson: JSON.stringify({ verifiedProviders: 3, latencyMs: 120 }),
      completedAt: new Date(),
    },
  });

  // Trigger Plan Re-Evaluation to generate Plan v2
  const v2Result = await generateObjectivePlan({
    objectiveId: obj2.id,
    userId: user.id,
    title: obj2.title,
    category: obj2.category,
    structuredGoal,
    constraints: { maxBudgetNear: "0.5" },
    mandateId: sharedMandate.id,
    reason: "User adjusted parameters for v2",
  });

  const v1PlanDb = await prisma.objectivePlan.findUnique({ where: { id: v1Result.planId } });
  const v2PlanDb = await prisma.objectivePlan.findUnique({
    where: { id: v2Result.planId },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  assert(v1PlanDb?.status === "SUPERSEDED", 2, "Original Plan v1 is safely marked SUPERSEDED");
  assert(v2PlanDb?.version === 2, 2, "Re-evaluated plan incremented to Version 2");
  assert(v2PlanDb?.status === "PENDING_APPROVAL", 2, "Plan v2 is strictly in PENDING_APPROVAL status (does NOT inherit v1 approval)");

  // Check that Step 1 remained COMPLETED in v2!
  const v2Step1 = v2PlanDb!.steps.find((s) => s.stepId === "step_1_research");
  const v2Step2 = v2PlanDb!.steps.find((s) => s.stepId === "step_2_benchmark");

  assert(v2Step1?.status === "COMPLETED", 2, "Completed step remains COMPLETED in v2 without re-executing", `Status: ${v2Step1?.status}`);
  assert(v2Step1?.executionId === mockExecutionId, 2, "Completed step in v2 retains original executionId and evidence");
  assert(v2Step2?.status === "PENDING", 2, "Uncompleted step in v2 remains PENDING");

  // Attempt to execute v2 WITHOUT approval: Must fail!
  let v2UnapprovedBlocked = false;
  try {
    await executeObjectivePlan({ objectiveId: obj2.id, userId: user.id });
  } catch (err: any) {
    if (err.message.includes("APPROVED") || err.message.includes("approval")) {
      v2UnapprovedBlocked = true;
    }
  }
  assert(v2UnapprovedBlocked, 2, "Execution of re-evaluated Plan v2 is strictly blocked before user approval is granted");
  console.log("  ✓ Plan Re-evaluation: Completed steps preserved, changed steps require new approval.\n");

  // ==========================================================================
  // CHECK 3: Approval Security
  // "Approval must bind to the exact plan version and its contents, not merely a version label."
  // ==========================================================================
  console.log("--- 3. APPROVAL SECURITY & CONTENT HASH INTEGRITY ---");
  const obj3 = await prisma.objective.create({
    data: {
      userId: user.id,
      mandateId: sharedMandate.id,
      title: "Approval Security Target",
      originalPrompt: "Audit smart contracts with automated analyzer",
      category: "RESEARCH",
      status: "DRAFT",
    },
  });

  const plan3Res = await generateObjectivePlan({
    objectiveId: obj3.id,
    userId: user.id,
    title: obj3.title,
    category: obj3.category,
    structuredGoal,
    constraints: { maxBudgetNear: "0.2" },
    mandateId: sharedMandate.id,
  });

  const plan3Db = await prisma.objectivePlan.findUnique({
    where: { id: plan3Res.planId },
    include: { steps: true },
  });

  // Calculate genuine content hash
  const authenticHash = computePlanContentHash({
    version: plan3Db!.version,
    steps: plan3Db!.steps.map((s) => ({
      stepId: s.stepId,
      title: s.title,
      agentType: s.agentType,
      requiredTools: JSON.parse(s.requiredToolsJson || "[]"),
      dependencies: JSON.parse(s.dependenciesJson || "[]"),
      riskClassification: s.riskClassification,
      estimatedCostNear: s.estimatedCostNear,
    })),
    constraints: { maxBudgetNear: "0.2" },
  });

  // Record approval with authentic content hash
  await prisma.objectivePlanApproval.create({
    data: {
      planId: plan3Db!.id,
      version: plan3Db!.version,
      userId: user.id,
      decision: "APPROVED",
      constraintsJson: JSON.stringify({ planContentHash: authenticHash, maxBudgetNear: "0.2" }),
    },
  });
  await prisma.objectivePlan.update({
    where: { id: plan3Db!.id },
    data: { status: "APPROVED" },
  });

  // Tamper with the plan in the database (e.g. attacker modifies step definition or injects an unapproved tool)
  await prisma.objectivePlanStep.updateMany({
    where: { planId: plan3Db!.id, order: 1 },
    data: { title: "TAMPERED: Maliciously altered step definition", requiredToolsJson: JSON.stringify(["duckduckgo_search", "unauthorized_exploit_tool"]) },
  });

  // Attempt execution: Must detect content hash tampering and fail closed!
  let tamperDetected = false;
  try {
    await executeObjectivePlan({ objectiveId: obj3.id, userId: user.id });
  } catch (err: any) {
    if (err.message.includes("integrity violation") || err.message.includes("contents have changed")) {
      tamperDetected = true;
    }
  }
  assert(tamperDetected, 3, "Execution rejected when plan contents are tampered with post-approval", "Caught plan content hash mismatch");
  console.log("  ✓ Approval Security: Cryptographic content hash binds approval strictly to exact plan payload.\n");

  // ==========================================================================
  // CHECK 4: Budget Concurrency
  // "Two objectives sharing one mandate must not reserve or spend the same available budget simultaneously."
  // ==========================================================================
  console.log("--- 4. BUDGET CONCURRENCY & RACE CONDITION PROTECTION ---");
  // sharedMandate has totalBudgetYocto = 1.0 NEAR, spent = 0, reserved = 0.
  // We fire two parallel requests each trying to reserve 0.8 NEAR.
  // 0.8 + 0.8 = 1.6 NEAR > 1.0 NEAR available.
  // EXACTLY ONE must succeed; the second MUST be rejected.
  const reqAAmountYocto = nearToYocto("0.8");
  const reqBAmountYocto = nearToYocto("0.8");

  const [resA, resB] = await Promise.all([
    reserveMandateBudgetAtomic({
      mandateId: sharedMandate.id,
      amountYocto: reqAAmountYocto,
      objectiveId: "obj_competing_A",
    }),
    reserveMandateBudgetAtomic({
      mandateId: sharedMandate.id,
      amountYocto: reqBAmountYocto,
      objectiveId: "obj_competing_B",
    }),
  ]);

  const oneSucceeded = (resA.success && !resB.success) || (!resA.success && resB.success);
  assert(oneSucceeded, 4, "Concurrent budget conflict correctly resolved: Exactly one reservation succeeded", `ResA: ${resA.success ? "GRANTED" : resA.reason}, ResB: ${resB.success ? "GRANTED" : resB.reason}`);

  const postConcurrencyMandate = await prisma.mandate.findUnique({
    where: { id: sharedMandate.id },
  });
  const finalReservedNear = yoctoToNear(postConcurrencyMandate!.reservedYocto, 3);
  assert(finalReservedNear === "0.800", 4, "Final mandate reserved balance is exactly 0.8 NEAR (never 1.6 NEAR)", `Reserved: ${finalReservedNear} NEAR`);

  // Release reservation back
  await releaseMandateBudgetAtomic({
    mandateId: sharedMandate.id,
    amountYocto: reqAAmountYocto,
  });
  const unreservedMandate = await prisma.mandate.findUnique({
    where: { id: sharedMandate.id },
  });
  assert(unreservedMandate?.reservedYocto === "0", 4, "Budget safely released back to available balance");
  console.log("  ✓ Budget Concurrency: Atomic mutex prevents double-spending across shared mandates.\n");

  // ==========================================================================
  // CHECK 5: Success Verification
  // "A tool returning success: true must not automatically mean the objective's real-world outcome has been achieved."
  // ==========================================================================
  console.log("--- 5. REAL-WORLD SUCCESS CRITERIA VERIFICATION ---");
  const obj5 = await prisma.objective.create({
    data: {
      userId: user.id,
      mandateId: sharedMandate.id,
      title: "Real-world Success Verification Target",
      originalPrompt: "Benchmark API latency under 1.0 NEAR",
      status: "ACTIVE",
    },
  });

  // Create two success criteria:
  // 1. NUMERIC: price must be <= 1.0 NEAR
  // 2. BOOLEAN / EVIDENCE_BASED: genuine candidate evidence required
  const crit1 = await prisma.objectiveSuccessCriteria.create({
    data: {
      objectiveId: obj5.id,
      criterionId: "crit_price_check",
      description: "Price is within 1.0 NEAR constraint",
      measurementType: "NUMERIC",
      target: "<= 1.0",
      verificationMethod: "TOOL_RESULT",
      currentState: "NOT_MET",
    },
  });

  const crit2 = await prisma.objectiveSuccessCriteria.create({
    data: {
      objectiveId: obj5.id,
      criterionId: "crit_genuine_results",
      description: "Non-empty verified external intelligence gathered",
      measurementType: "EVIDENCE_BASED",
      target: "true",
      verificationMethod: "TOOL_RESULT",
      currentState: "NOT_MET",
    },
  });

  // Case 5a: Tool returned success: true, BUT produced empty dummy data and price 2.5 NEAR (exceeds budget)
  const dummySuccessEvidence = {
    step_1: { success: true },
    recommendation: {
      amountNear: "2.5", // VIOLATES <= 1.0 NEAR
    },
    candidates: [], // EMPTY DUMMY
    sourceCount: 0,
  };

  const evalFailOutcome = await evaluateObjectiveSuccessCriteria({
    objectiveId: obj5.id,
    stepOutputs: dummySuccessEvidence,
  });

  assert(!evalFailOutcome.allMet, 5, "Objective rejected completion when real-world criteria failed despite tool success: true");
  const priceCritRes = evalFailOutcome.criteriaResults.find((c) => c.criterionId === "crit_price_check");
  const evidenceCritRes = evalFailOutcome.criteriaResults.find((c) => c.criterionId === "crit_genuine_results");

  assert(priceCritRes?.isMet === false && priceCritRes.status === "FAILED", 5, "Numeric criterion failed because 2.5 NEAR exceeds 1.0 NEAR target", priceCritRes?.reason);
  assert(evidenceCritRes?.isMet === false, 5, "Evidence criterion failed because candidates list was empty dummy payload", evidenceCritRes?.reason);

  // Case 5b: Genuine verified outcome satisfies both criteria
  const genuineEvidence = {
    recommendation: {
      selectedProviderName: "NearBlocks Explorer",
      amountNear: "0.08", // <= 1.0 NEAR
    },
    candidates: [
      { id: "nearblocks", name: "NearBlocks", priceNear: "0.08" },
      { id: "pikespeak", name: "Pikespeak", priceNear: "0.15" },
    ],
    sources: [{ url: "https://api-testnet.nearblocks.io/", title: "NearBlocks Indexer" }],
    verified: true,
  };

  const evalPassOutcome = await evaluateObjectiveSuccessCriteria({
    objectiveId: obj5.id,
    stepOutputs: genuineEvidence,
  });

  assert(evalPassOutcome.allMet, 5, "Objective successfully verified when real-world evidence satisfies all criteria", `Met: ${evalPassOutcome.metCount}/${evalPassOutcome.totalCount}`);
  console.log("  ✓ Success Verification: Real evidence and constraints evaluated, not merely tool syntactic return values.\n");

  console.log("==================================================================");
  console.log("=== ALL 5 CRITICAL CHECKS VERIFIED AND PASSED WITH 100% SUCCESS ==");
  console.log("==================================================================\n");
}

main()
  .catch((err) => {
    console.error("Fatal verification error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

