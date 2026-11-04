import { prisma } from "@/lib/db";
import { toolRegistry } from "@/lib/tools/registry";
import { agentRegistry } from "@/lib/runtime/registry";
import {
  computePlanContentHash,
  ObjectiveConstraints,
  PlanStepDefinition,
  StructuredGoal,
  SuccessCriterionDefinition,
  TaskType,
} from "./types";
import { selectAgentForRequirement } from "./agentSelector";
import { validateObjectiveAuthority } from "./authority";
import { ObjectiveDAGService } from "./dagService";
import {
  ObjectivePlanValidationService,
  PlanValidationReport,
} from "./planValidationService";
import {
  nearToYoctoBigIntStr,
  ObjectiveUnderstandingService,
} from "./understandingService";
import { ObjectiveLifecycleService } from "./lifecycleService";
import {
  discoverUniversalCapabilities,
  matchCapabilities,
  evaluateExecutionReadiness,
  CapabilityRequirement,
  ReadinessReport,
} from "@/lib/discovery";

export interface GeneratePlanParams {
  objectiveId: string;
  userId: string;
  title: string;
  category: string;
  structuredGoal?: StructuredGoal;
  constraints?: ObjectiveConstraints;
  mandateId?: string | null;
  previousPlanId?: string;
  reason?: string;
  customSteps?: PlanStepDefinition[];
}

export interface PlanGenerationResult {
  planId: string;
  version: number;
  contentHash: string;
  summary: string;
  riskClassification: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estimatedCostNear?: string;
  estimatedCostYocto?: string;
  requiresApproval: boolean;
  steps: PlanStepDefinition[];
  successCriteria: SuccessCriterionDefinition[];
  missingCapabilities: string[];
  missingTools: string[];
  isExecutable: boolean;
  warnings: string[];
  executionLevels: string[][];
  topologicalOrder: string[];
  validationReport?: PlanValidationReport;
}

/**
 * Autonomous Objective Planning & Task DAG Decomposition Engine
 * Core Principle: AI proposes. Mandate enforces. The user controls. OutLayer executes.
 *
 * Implements deterministic DAG planning, Kahn topological sorting, 5-tier validation,
 * BigInt yoctoNEAR accounting (with ZERO live spending during planning), canonical
 * SHA-256 fingerprinting, and lifecycle synchronization.
 */
export async function generateObjectivePlan(
  params: GeneratePlanParams
): Promise<PlanGenerationResult> {
  const {
    objectiveId,
    userId,
    title,
    category,
    constraints = {},
    mandateId,
    previousPlanId,
    customSteps,
  } = params;

  // 1. Fetch Objective and Verify Ownership
  const objective = await prisma.objective.findFirst({
    where: { id: objectiveId, userId },
  });

  if (!objective) {
    throw new Error(`Objective "${objectiveId}" not found or unauthorized for user "${userId}".`);
  }

  // Synchronize state machine: Ensure objective transitions to PLANNING if currently in DRAFT or ACTIVE
  if (objective.status === "DRAFT") {
    await ObjectiveLifecycleService.activateObjective({
      objectiveId,
      actorUserId: userId,
    });
  }
  if (objective.status === "ACTIVE" || objective.status === "DRAFT") {
    try {
      await ObjectiveLifecycleService.transitionStatus({
        objectiveId,
        targetStatus: "PLANNING",
        actorId: userId,
        actorRole: "USER",
        reason: "Autonomous plan generation initiated",
      });
    } catch (e: any) {
      console.warn(`[generateObjectivePlan] Transition to PLANNING notice:`, e?.message);
    }
  }

  // 2. Structured Understanding & Intent Normalization
  let structuredGoal = params.structuredGoal;
  if (!structuredGoal) {
    let rawPrompt = objective.title;
    try {
      if (objective.structuredGoalJson) {
        structuredGoal = JSON.parse(objective.structuredGoalJson);
      }
    } catch {}

    if (!structuredGoal) {
      const understanding = ObjectiveUnderstandingService.understand({
        prompt: rawPrompt,
        constraints,
        existingMandateId: mandateId || objective.mandateId || undefined,
        categoryOverride: category as any,
      });
      structuredGoal = ObjectiveUnderstandingService.toStructuredGoal(understanding);
    }
  }

  // 3. Determine Next Plan Version & Supersede Prior Plans
  let nextVersion = 1;
  const existingPlans = await prisma.objectivePlan.findMany({
    where: { objectiveId },
    orderBy: { version: "desc" },
    take: 1,
    include: { steps: true },
  });

  if (existingPlans.length > 0) {
    nextVersion = existingPlans[0].version + 1;
    // Supersede previous active/draft/pending plans
    await prisma.objectivePlan.updateMany({
      where: {
        objectiveId,
        status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE"] },
      },
      data: { status: "SUPERSEDED" },
    });
  }

  // 4. Formulate Steps Across All 5 Typed Categories
  // RESEARCH -> ANALYSIS -> EXECUTION -> PAYMENT -> VERIFICATION
  const steps: PlanStepDefinition[] = [];
  const missingCapabilities: string[] = [];
  const missingTools: string[] = [];
  const previousSteps = existingPlans[0]?.steps || [];

  if (customSteps && customSteps.length > 0) {
    steps.push(...customSteps);
  } else if (category === "PROCUREMENT" || structuredGoal?.requiredCapabilities.includes("procurement_proposal")) {
    const estCostNear = constraints.maxBudgetNear || structuredGoal?.budgetConstraints?.maxNear || "0.010";
    const estCostYocto = constraints.maxBudgetYocto || nearToYoctoBigIntStr(estCostNear);

    // Step 1: RESEARCH
    steps.push({
      stepId: "step_1_research",
      title: "Discover and Parse Candidate Provider Intelligence",
      description: "Queries DuckDuckGo and analyzes live web evidence for vendor offerings and verified pricing.",
      order: 1,
      taskType: "RESEARCH",
      agentType: "research_procurement",
      requiredCapabilities: ["web_research"],
      requiredTools: ["duckduckgo_search"],
      dependencies: [],
      preconditions: ["Network connectivity verified", "DuckDuckGo tool ACTIVE"],
      completionConditions: ["At least 1 candidate provider parsed with valid URL and pricing"],
      riskClassification: "LOW",
      failureHandling: "RETRY_WITH_BACKOFF",
    });

    // Step 2: ANALYSIS
    steps.push({
      stepId: "step_2_benchmark",
      title: "Compute Multi-Attribute Comparison & Ranking Matrix",
      description: "Generates multi-attribute comparison matrix (price, SLA, features) and produces winning recommendation.",
      order: 2,
      taskType: "ANALYSIS",
      agentType: "research_procurement",
      requiredCapabilities: ["provider_benchmarking"],
      requiredTools: [],
      dependencies: ["step_1_research"],
      preconditions: ["Candidate providers discovered in Step 1"],
      completionConditions: ["Winning candidate selected and ranking explanation formulated"],
      riskClassification: "LOW",
      failureHandling: "FAIL_CLOSED",
    });

    // Step 3: PAYMENT (PROPOSAL ONLY, ZERO DISPATCH OR RESERVATION DURING PLANNING)
    steps.push({
      stepId: "step_3_propose_payment",
      title: "Formulate Policy-Firewalled Spending Proposal",
      description: "Constructs atomic yoctoNEAR spending proposal submitted to Mandate deterministic policy engine.",
      order: 3,
      taskType: "PAYMENT",
      agentType: "research_procurement",
      requiredCapabilities: ["procurement_proposal"],
      requiredTools: ["near_rpc_reader"],
      dependencies: ["step_2_benchmark"],
      preconditions: ["Winning provider identified", "Mandate policy active"],
      completionConditions: ["Policy engine evaluation recorded with transaction reservation"],
      riskClassification: "MEDIUM",
      estimatedCostNear: estCostNear,
      estimatedCostYocto: estCostYocto,
      failureHandling: "FAIL_CLOSED",
    });

    // Step 4: VERIFICATION
    steps.push({
      stepId: "step_4_verify_delivery",
      title: "Verify Delivery & Proof of Receipt",
      description: "Audits RPC receipt finality or vendor credential delivery evidence.",
      order: 4,
      taskType: "VERIFICATION",
      agentType: "security_auditor",
      requiredCapabilities: ["web_research"],
      requiredTools: ["near_rpc_reader"],
      dependencies: ["step_3_propose_payment"],
      preconditions: ["Payment proposal submitted"],
      completionConditions: ["Receipt verified on-chain"],
      riskClassification: "LOW",
      failureHandling: "FAIL_CLOSED",
    });
  } else if (category === "TREASURY" || category === "FINANCE") {
    // Step 1: RESEARCH
    steps.push({
      stepId: "step_1_audit_rpc",
      title: "Query Live NEAR Testnet RPC Account State",
      description: "Retrieves atomic spendable balance and block finality for target NEAR accounts.",
      order: 1,
      taskType: "RESEARCH",
      agentType: "finance_treasury",
      requiredCapabilities: ["web_research"],
      requiredTools: ["near_rpc_reader"],
      dependencies: [],
      preconditions: ["NEAR testnet RPC endpoint responsive"],
      completionConditions: ["Account balance and block height confirmed"],
      riskClassification: "LOW",
      failureHandling: "RETRY_WITH_BACKOFF",
    });

    // Step 2: ANALYSIS
    steps.push({
      stepId: "step_2_reconciliation",
      title: "Reconcile Spendable Balance against Budget Ceilings",
      description: "Computes available liquidity against active mandate reservations.",
      order: 2,
      taskType: "ANALYSIS",
      agentType: "finance_treasury",
      requiredCapabilities: ["web_research"],
      requiredTools: [],
      dependencies: ["step_1_audit_rpc"],
      preconditions: ["Live account balance fetched"],
      completionConditions: ["Reconciliation ledger generated"],
      riskClassification: "LOW",
      failureHandling: "FAIL_CLOSED",
    });

    // Step 3: VERIFICATION
    steps.push({
      stepId: "step_3_audit_record",
      title: "Audit Finality & Ledger Integrity",
      description: "Appends audit log record to cryptographic hash chain.",
      order: 3,
      taskType: "VERIFICATION",
      agentType: "security_auditor",
      requiredCapabilities: ["web_research"],
      requiredTools: [],
      dependencies: ["step_2_reconciliation"],
      preconditions: ["Reconciliation complete"],
      completionConditions: ["Audit ledger updated"],
      riskClassification: "LOW",
      failureHandling: "FAIL_CLOSED",
    });
  } else {
    // General Research / Operations Workflow
    steps.push({
      stepId: "step_1_intel_gather",
      title: "Gather Intelligence from Verified Sources",
      description: `Retrieves and filters information to achieve: ${title}`,
      order: 1,
      taskType: "RESEARCH",
      agentType: "research_procurement",
      requiredCapabilities: ["web_research"],
      requiredTools: ["duckduckgo_search"],
      dependencies: [],
      preconditions: ["DuckDuckGo tool ACTIVE"],
      completionConditions: ["Intelligence gathered and summarized"],
      riskClassification: "LOW",
      failureHandling: "RETRY_WITH_BACKOFF",
    });

    steps.push({
      stepId: "step_2_synthesize",
      title: "Synthesize Findings & Formulate Structured Output",
      description: "Compiles collected data into structured evidence and validates achievement of success criteria.",
      order: 2,
      taskType: "ANALYSIS",
      agentType: "research_procurement",
      requiredCapabilities: ["provider_benchmarking"],
      requiredTools: [],
      dependencies: ["step_1_intel_gather"],
      preconditions: ["Data gathered in Step 1"],
      completionConditions: ["Structured output generated"],
      riskClassification: "LOW",
      failureHandling: "FAIL_CLOSED",
    });

    steps.push({
      stepId: "step_3_verify_outcomes",
      title: "Verify Outcome Criteria",
      description: "Checks synthesis output against defined objective deliverables.",
      order: 3,
      taskType: "VERIFICATION",
      agentType: "operations_execution",
      requiredCapabilities: ["web_research"],
      requiredTools: [],
      dependencies: ["step_2_synthesize"],
      preconditions: ["Synthesis complete"],
      completionConditions: ["Deliverables verified"],
      riskClassification: "LOW",
      failureHandling: "FAIL_CLOSED",
    });
  }

  // 5. Build Deliverables & Verifiable Success Criteria
  const deliverables = [
    `Deliverable for ${title}`,
    "Structured intelligence summary and execution proof",
  ];

  const successCriteria: SuccessCriterionDefinition[] = [];
  if (category === "PROCUREMENT") {
    successCriteria.push({
      criterionId: "crit_provider_evaluated",
      description: "At least 1 candidate provider benchmarked with verified pricing and capability matrix",
      measurementType: "BOOLEAN",
      target: "true",
      verificationMethod: "TOOL_RESULT",
    });
    successCriteria.push({
      criterionId: "crit_payment_proposal_submitted",
      description: "Deterministic payment proposal formulated and evaluated by Mandate policy firewall",
      measurementType: "EVENT_BASED",
      target: "POLICY_EVALUATION_RECORDED",
      verificationMethod: "EXTERNAL_EVIDENCE",
    });
  } else {
    successCriteria.push({
      criterionId: "crit_intel_verified",
      description: "External sources queried and verified for domain objective",
      measurementType: "BOOLEAN",
      target: "true",
      verificationMethod: "TOOL_RESULT",
    });
    successCriteria.push({
      criterionId: "crit_deliverable_produced",
      description: "Deliverables produced and validated by auditor",
      measurementType: "BOOLEAN",
      target: "true",
      verificationMethod: "EXTERNAL_EVIDENCE",
    });
  }

  // 6. Match Agents and Check Capability/Tool Existence
  for (const step of steps) {
    for (const toolId of step.requiredTools) {
      if (!toolRegistry.has(toolId)) {
        missingTools.push(toolId);
      }
    }

    try {
      const agentMatch = await selectAgentForRequirement({
        userId,
        requirement: {
          requiredCapabilities: step.requiredCapabilities,
          requiredTools: step.requiredTools,
          agentType: step.agentType,
        },
        mandateId: mandateId || objective.mandateId,
      });

      if (agentMatch.matched && agentMatch.selectedAgent) {
        step.assignedAgentId = agentMatch.selectedAgent.id;
      }
    } catch {
      // Non-blocking in planning stage
    }
  }

  // 7. Deterministic 5-Tier Validation (Fail Closed)
  const validationReport = await ObjectivePlanValidationService.validatePlan({
    userId,
    objectiveId,
    title,
    category,
    deliverables,
    successCriteria,
    steps,
    constraints,
    mandateId: mandateId || objective.mandateId,
  });

  if (!validationReport.isValid) {
    throw new Error(
      `Objective plan validation failed [5-Tier Guard]: ${validationReport.errors.join("; ")}`
    );
  }

  const { overallRisk, requiresApproval, executionLevels, topologicalOrder, totalCostNear, totalCostYocto } =
    validationReport;

  // 8. Compute Canonical SHA-256 Plan Hash (Immutability Fingerprint)
  const contentHash = computePlanContentHash({
    version: nextVersion,
    steps,
    constraints,
  });

  const summary = `Autonomous v${nextVersion} plan (${overallRisk} risk, ${steps.length} tasks across ${executionLevels.length} execution levels).`;
  const isExecutable = validationReport.isValid && missingCapabilities.length === 0 && missingTools.length === 0;

  // 9. Persist ObjectivePlan and Steps Atomically
  const planRecord = await prisma.objectivePlan.create({
    data: {
      objectiveId,
      version: nextVersion,
      summary,
      status: "PENDING_APPROVAL",
      riskClassification: overallRisk,
      estimatedCostNear: totalCostNear !== "0" ? totalCostNear : null,
      estimatedCostYocto: totalCostYocto !== "0" ? totalCostYocto : null,
      planHash: contentHash,
      requiresApproval,
      planJson: JSON.stringify({
        title,
        category,
        planHash: contentHash,
        version: nextVersion,
        riskClassification: overallRisk,
        requiresApproval,
        estimatedCostNear: totalCostNear,
        estimatedCostYocto: totalCostYocto,
        executionLevels,
        topologicalOrder,
        steps,
        successCriteria,
        constraints,
      }),
      steps: {
        create: steps.map((s) => ({
          stepId: s.stepId,
          objectiveId,
          title: s.title,
          description: s.description,
          order: s.order,
          taskType: s.taskType || "EXECUTION",
          status: "PENDING",
          agentType: s.agentType,
          assignedAgentId: s.assignedAgentId || null,
          requiredCapabilitiesJson: JSON.stringify(s.requiredCapabilities || []),
          requiredToolsJson: JSON.stringify(s.requiredTools || []),
          dependenciesJson: JSON.stringify(s.dependencies || []),
          preconditionsJson: JSON.stringify(s.preconditions || []),
          completionConditionsJson: JSON.stringify(s.completionConditions || []),
          riskClassification: s.riskClassification || "LOW",
          estimatedCostNear: s.estimatedCostNear || null,
          estimatedCostYocto: s.estimatedCostYocto || null,
        })),
      },
    },
  });

  // 10. Persist Success Criteria in Database
  for (const crit of successCriteria) {
    await prisma.objectiveSuccessCriteria.upsert({
      where: {
        objectiveId_criterionId: { objectiveId, criterionId: crit.criterionId },
      },
      update: {
        description: crit.description,
        measurementType: crit.measurementType,
        target: crit.target,
        verificationMethod: crit.verificationMethod,
      },
      create: {
        objectiveId,
        criterionId: crit.criterionId,
        description: crit.description,
        measurementType: crit.measurementType,
        target: crit.target,
        verificationMethod: crit.verificationMethod,
        currentState: "NOT_MET",
      },
    });
  }

  // 11. Lifecycle Transition Integration
  // If plan requires approval, transition to AWAITING_APPROVAL
  // If plan does not require approval, transition to READY
  const targetLifecycleStatus = requiresApproval ? "AWAITING_APPROVAL" : "READY";
  try {
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId,
      targetStatus: targetLifecycleStatus,
      actorId: userId,
      actorRole: "SYSTEM",
      reason: `Plan v${nextVersion} generated: ${requiresApproval ? "Awaiting human review" : "No approval required, ready for execution"}`,
      metadata: { planId: planRecord.id, planVersion: nextVersion, planHash: contentHash },
    });
  } catch (transErr: any) {
    console.warn(`[generateObjectivePlan] Lifecycle transition note:`, transErr?.message);
  }

  return {
    planId: planRecord.id,
    version: nextVersion,
    contentHash,
    summary,
    riskClassification: overallRisk,
    estimatedCostNear: totalCostNear !== "0" ? totalCostNear : undefined,
    estimatedCostYocto: totalCostYocto !== "0" ? totalCostYocto : undefined,
    requiresApproval,
    steps,
    successCriteria,
    missingCapabilities,
    missingTools,
    isExecutable,
    warnings: validationReport.warnings,
    executionLevels,
    topologicalOrder,
    validationReport,
  };
}

/**
 * Human Approval Action for an Objective Plan
 * Strictly bound to canonical planHash and version.
 * Transitions objective from AWAITING_APPROVAL -> READY.
 */
export async function approveObjectivePlan(params: {
  objectiveId: string;
  planId?: string;
  planVersion?: number;
  userId: string;
  expectedPlanHash?: string;
  comment?: string;
}): Promise<{ success: boolean; plan: any; objective: any }> {
  const { objectiveId, planId, planVersion, userId, expectedPlanHash, comment } = params;

  // 1. Fetch Objective & Plan
  const objective = await prisma.objective.findFirst({
    where: { id: objectiveId, userId },
  });

  if (!objective) {
    throw new Error(`Objective "${objectiveId}" not found or unauthorized for user "${userId}".`);
  }

  const plan = await prisma.objectivePlan.findFirst({
    where: planId
      ? { id: planId, objectiveId }
      : planVersion
      ? { objectiveId, version: planVersion }
      : { objectiveId, status: "PENDING_APPROVAL" },
    include: { steps: true },
  });

  if (!plan) {
    throw new Error(`Plan not found for objective "${objectiveId}" in pending approval state.`);
  }

  // 2. Anti-Tamper Verification: Verify Hash Binding
  if (expectedPlanHash && plan.planHash && plan.planHash !== expectedPlanHash) {
    throw new Error(
      `Plan tampering or modification detected: provided planHash "${expectedPlanHash}" does not match recorded planHash "${plan.planHash}". Approval rejected.`
    );
  }

  // 3. Record Approval Decision
  await prisma.objectivePlanApproval.create({
    data: {
      planId: plan.id,
      version: plan.version,
      userId,
      decision: "APPROVED",
      comment: comment || "Approved by user",
    },
  });

  // 4. Update Plan Status to APPROVED
  const updatedPlan = await prisma.objectivePlan.update({
    where: { id: plan.id },
    data: { status: "APPROVED" },
  });

  // 5. Deterministic CAS Lifecycle Transition: AWAITING_APPROVAL -> READY
  await ObjectiveLifecycleService.transitionStatus({
    objectiveId,
    targetStatus: "READY",
    actorId: userId,
    actorRole: "USER",
    reason: `User approved Plan v${plan.version} (hash: ${plan.planHash?.slice(0, 10)}...)`,
    metadata: { planId: plan.id, version: plan.version, planHash: plan.planHash },
  });

  const fullObjective = await prisma.objective.findUnique({ where: { id: objectiveId } });

  return {
    success: true,
    plan: updatedPlan,
    objective: fullObjective,
  };
}

/**
 * Human Rejection Action for an Objective Plan
 * Transitions plan to REJECTED and objective back to PLANNING or DRAFT.
 */
export async function rejectObjectivePlan(params: {
  objectiveId: string;
  planId?: string;
  planVersion?: number;
  userId: string;
  reason: string;
}): Promise<{ success: boolean; plan: any; objective: any }> {
  const { objectiveId, planId, planVersion, userId, reason } = params;

  const objective = await prisma.objective.findFirst({
    where: { id: objectiveId, userId },
  });

  if (!objective) {
    throw new Error(`Objective "${objectiveId}" not found or unauthorized for user "${userId}".`);
  }

  const plan = await prisma.objectivePlan.findFirst({
    where: planId
      ? { id: planId, objectiveId }
      : planVersion
      ? { objectiveId, version: planVersion }
      : { objectiveId, status: "PENDING_APPROVAL" },
  });

  if (!plan) {
    throw new Error(`Plan not found for objective "${objectiveId}".`);
  }

  // 1. Record Rejection Decision
  await prisma.objectivePlanApproval.create({
    data: {
      planId: plan.id,
      version: plan.version,
      userId,
      decision: "REJECTED",
      comment: reason,
    },
  });

  // 2. Mark Plan REJECTED
  const updatedPlan = await prisma.objectivePlan.update({
    where: { id: plan.id },
    data: { status: "REJECTED" },
  });

  // 3. Transition Objective back to PLANNING for revisions
  await ObjectiveLifecycleService.transitionStatus({
    objectiveId,
    targetStatus: "PLANNING",
    actorId: userId,
    actorRole: "USER",
    reason: `Plan v${plan.version} rejected by user: ${reason}`,
    metadata: { rejectedPlanId: plan.id, version: plan.version },
  });

  const fullObjective = await prisma.objective.findUnique({ where: { id: objectiveId } });

  return {
    success: true,
    plan: updatedPlan,
    objective: fullObjective,
  };
}

/**
 * Re-plan with revised constraints or user guidance
 */
export async function replanObjective(params: {
  objectiveId: string;
  userId: string;
  guidance?: string;
  revisedConstraints?: ObjectiveConstraints;
}): Promise<PlanGenerationResult> {
  const { objectiveId, userId, guidance, revisedConstraints } = params;

  const objective = await prisma.objective.findFirst({
    where: { id: objectiveId, userId },
    include: { mandate: true },
  });

  if (!objective) {
    throw new Error(`Objective "${objectiveId}" not found or unauthorized.`);
  }

  let baseConstraints: ObjectiveConstraints = {};
  try {
    baseConstraints = JSON.parse(objective.constraintsJson || "{}");
  } catch {}

  const mergedConstraints = {
    ...baseConstraints,
    ...(revisedConstraints || {}),
  };

  return await generateObjectivePlan({
    objectiveId,
    userId,
    title: objective.title,
    category: objective.category,
    constraints: mergedConstraints,
    mandateId: objective.mandateId,
    reason: guidance || "User requested plan revision",
  });
}

/**
 * Evaluate capability discovery and execution readiness for an objective.
 * Strictly READ-ONLY with respect to existing plans:
 * It does NOT mutate plan steps, approvals, or content hashes of existing approved plans.
 */
export async function evaluateObjectivePlanDiscovery(params: {
  objectiveId: string;
  userId: string;
  persistRecord?: boolean;
}): Promise<ReadinessReport> {
  const { objectiveId, userId, persistRecord = true } = params;

  const objective = await prisma.objective.findFirst({
    where: { id: objectiveId, userId },
    include: {
      plans: {
        orderBy: { version: "desc" },
        take: 1,
        include: { steps: { orderBy: { order: "asc" } } },
      },
      mandate: true,
    },
  });

  if (!objective) {
    throw new Error(`Objective "${objectiveId}" not found or unauthorized`);
  }

  const latestPlan = objective.plans[0];
  const steps = latestPlan?.steps || [];

  let constraints: ObjectiveConstraints = {};
  try {
    constraints = JSON.parse(objective.constraintsJson || "{}");
  } catch {}

  const authorityCheck = await validateObjectiveAuthority({
    userId,
    mandateId: objective.mandateId,
    constraints,
  });

  // Extract capability requirements from plan steps or from objective goal
  const requirements: CapabilityRequirement[] = [];

  if (steps.length > 0) {
    for (const step of steps) {
      let reqCaps: string[] = [];
      let reqTools: string[] = [];
      try {
        reqCaps = JSON.parse(step.requiredCapabilitiesJson || "[]");
        reqTools = JSON.parse(step.requiredToolsJson || "[]");
      } catch {}

      for (const cap of reqCaps) {
        requirements.push({
          id: `${step.stepId}_${cap}`,
          name: cap,
          operation: cap,
          requiredAgentType: step.agentType,
          requiredPermission:
            step.riskClassification === "MEDIUM" || step.riskClassification === "HIGH"
              ? "PROPOSE"
              : "READ",
        });
      }
      for (const toolId of reqTools) {
        requirements.push({
          id: `${step.stepId}_${toolId}`,
          name: toolId,
          operation: toolId,
          requiredPermission: "READ",
        });
      }
    }
  } else {
    let structuredGoal: StructuredGoal | null = null;
    try {
      structuredGoal = objective.structuredGoalJson
        ? JSON.parse(objective.structuredGoalJson)
        : null;
    } catch {}

    if (structuredGoal) {
      for (const cap of structuredGoal.requiredCapabilities || []) {
        requirements.push({
          id: `goal_${cap}`,
          name: cap,
          operation: cap,
          requiredPermission: "PROPOSE",
        });
      }
      for (const tool of structuredGoal.requiredTools || []) {
        requirements.push({
          id: `goal_${tool}`,
          name: tool,
          operation: tool,
          requiredPermission: "READ",
        });
      }
    }
  }

  // Discover capabilities
  const discovered = await discoverUniversalCapabilities({
    userId,
    category: objective.category as any,
  });

  // Match capabilities
  const matches = await matchCapabilities({
    userId,
    requirements,
    discoveredCapabilities: discovered,
    agentId: steps[0]?.assignedAgentId || undefined,
    hasActiveMandate: Boolean(objective.mandateId && authorityCheck.isValid),
  });

  // Evaluate execution readiness
  const report = await evaluateExecutionReadiness({
    userId,
    objectiveId,
    matches,
    hasMandateMismatch: !authorityCheck.isValid,
    mandateMismatchReason: authorityCheck.mismatches.join("; "),
    persistRecord,
  });

  return report;
}
