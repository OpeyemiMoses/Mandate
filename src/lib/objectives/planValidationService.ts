import { prisma } from "@/lib/db";
import { toolRegistry } from "@/lib/tools";
import { agentRegistry } from "@/lib/runtime/registry";
import { ObjectiveDAGService } from "./dagService";
import {
  ObjectiveConstraints,
  PlanStepDefinition,
  SuccessCriterionDefinition,
  TaskType,
} from "./types";
import { nearToYoctoBigIntStr } from "./understandingService";

export interface PlanValidationContext {
  userId: string;
  objectiveId: string;
  title: string;
  category: string;
  deliverables?: string[];
  successCriteria?: SuccessCriterionDefinition[];
  steps: PlanStepDefinition[];
  constraints?: ObjectiveConstraints;
  mandateId?: string | null;
  proposedPlanHash?: string;
}

export interface TierValidationResult {
  passed: boolean;
  tier: "OBJECTIVE" | "MANDATE" | "TASK" | "SECURITY" | "RISK";
  errors: string[];
  warnings: string[];
  metadata?: Record<string, any>;
}

export interface PlanValidationReport {
  isValid: boolean;
  overallRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  requiresApproval: boolean;
  totalCostYocto: string;
  totalCostNear: string;
  tierResults: {
    objective: TierValidationResult;
    mandate: TierValidationResult;
    task: TierValidationResult;
    security: TierValidationResult;
    risk: TierValidationResult;
  };
  errors: string[];
  warnings: string[];
  executionLevels: string[][];
  topologicalOrder: string[];
}

const VALID_TASK_TYPES: TaskType[] = [
  "RESEARCH",
  "ANALYSIS",
  "EXECUTION",
  "PAYMENT",
  "VERIFICATION",
];

const VALID_FAILURE_STRATEGIES = [
  "FAIL_CLOSED",
  "RETRY_WITH_BACKOFF",
  "SKIP_OPTIONAL",
  "ESCALATE_TO_HUMAN",
];

const ONE_NEAR_YOCTO = BigInt("1000000000000000000000000");

/**
 * Deterministic 5-Tier Objective Plan Validation Service
 * Enforces strict multi-tier invariants across Objective, Mandate, Task DAG,
 * Security & Anti-Tamper, and Risk policies.
 */
export class ObjectivePlanValidationService {
  /**
   * Validate a plan against all 5 deterministic validation tiers
   */
  public static async validatePlan(context: PlanValidationContext): Promise<PlanValidationReport> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // TIER 1: OBJECTIVE TIER
    const objectiveTier = this.validateObjectiveTier(context);
    errors.push(...objectiveTier.errors);
    warnings.push(...objectiveTier.warnings);

    // TIER 3: TASK & DAG TIER (Run DAG first to calculate topological ordering and level structure)
    const taskTier = this.validateTaskTier(context);
    errors.push(...taskTier.errors);
    warnings.push(...taskTier.warnings);

    // TIER 2: MANDATE TIER
    const mandateTier = await this.validateMandateTier(context);
    errors.push(...mandateTier.errors);
    warnings.push(...mandateTier.warnings);

    // TIER 4: SECURITY & ANTI-TAMPER TIER
    const securityTier = this.validateSecurityTier(context, mandateTier.metadata);
    errors.push(...securityTier.errors);
    warnings.push(...securityTier.warnings);

    // TIER 5: RISK TIER
    const riskTier = this.validateRiskTier(context, mandateTier.metadata);
    errors.push(...riskTier.errors);
    warnings.push(...riskTier.warnings);

    const isValid = errors.length === 0;
    const overallRisk = riskTier.metadata?.overallRisk || "LOW";
    const requiresApproval = riskTier.metadata?.requiresApproval ?? true;
    const totalCostYocto = mandateTier.metadata?.totalCostYocto || "0";
    const totalCostNear = mandateTier.metadata?.totalCostNear || "0";
    const executionLevels = taskTier.metadata?.executionLevels || [];
    const topologicalOrder = taskTier.metadata?.topologicalOrder || [];

    return {
      isValid,
      overallRisk,
      requiresApproval,
      totalCostYocto,
      totalCostNear,
      tierResults: {
        objective: objectiveTier,
        mandate: mandateTier,
        task: taskTier,
        security: securityTier,
        risk: riskTier,
      },
      errors,
      warnings,
      executionLevels,
      topologicalOrder,
    };
  }

  /**
   * Tier 1: Objective Structure Validation
   */
  private static validateObjectiveTier(context: PlanValidationContext): TierValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!context.title || context.title.trim().length === 0) {
      errors.push("Objective title is required and cannot be empty.");
    }

    if (!context.category || context.category.trim().length === 0) {
      errors.push("Objective category is required.");
    }

    if (!context.deliverables || context.deliverables.length === 0) {
      errors.push("At least one desired deliverable must be specified.");
    }

    if (!context.successCriteria || context.successCriteria.length === 0) {
      errors.push("At least one measurable success criterion is required.");
    } else {
      for (const crit of context.successCriteria) {
        if (!crit.criterionId || !crit.description || !crit.verificationMethod) {
          errors.push(`Malformed success criterion: missing id, description, or verificationMethod.`);
        }
      }
    }

    return {
      passed: errors.length === 0,
      tier: "OBJECTIVE",
      errors,
      warnings,
    };
  }

  /**
   * Tier 2: Mandate Authority & Financial Validation
   */
  private static async validateMandateTier(
    context: PlanValidationContext
  ): Promise<TierValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Sum total cost across all tasks using strict BigInt
    let totalPlanCostYocto = BigInt(0);
    const proposedRecipients: string[] = [];

    for (const step of context.steps) {
      let stepYocto = BigInt(0);
      if (step.estimatedCostYocto) {
        stepYocto = BigInt(step.estimatedCostYocto);
      } else if (step.estimatedCostNear) {
        stepYocto = BigInt(nearToYoctoBigIntStr(step.estimatedCostNear));
      }

      totalPlanCostYocto += stepYocto;

      // Extract recipient if present in preconditions or title/description
      const recipientMatch = `${step.title} ${step.description} ${(step.preconditions || []).join(" ")}`.match(/0x[a-fA-F0-9]{40}|[a-z0-9._-]+\.testnet|[a-z0-9._-]+\.near/);
      if (recipientMatch) {
        proposedRecipients.push(recipientMatch[0]);
      }
    }

    const hasFinancialTasks = totalPlanCostYocto > BigInt(0) || context.steps.some((s) => s.taskType === "PAYMENT");

    let totalCostNear = "0";
    if (totalPlanCostYocto > BigInt(0)) {
      const whole = totalPlanCostYocto / ONE_NEAR_YOCTO;
      const frac = (totalPlanCostYocto % ONE_NEAR_YOCTO).toString().padStart(24, "0").slice(0, 6);
      totalCostNear = `${whole}.${frac}`;
    }

    // If financial actions are planned, mandate is strictly required
    if (hasFinancialTasks) {
      if (!context.mandateId) {
        errors.push("Financial tasks or spending planned, but no linked Mandate was provided.");
        return {
          passed: false,
          tier: "MANDATE",
          errors,
          warnings,
          metadata: { totalCostYocto: totalPlanCostYocto.toString(), totalCostNear },
        };
      }

      const mandate = await prisma.mandate.findFirst({
        where: { id: context.mandateId, userId: context.userId },
      });

      if (!mandate) {
        errors.push(`Mandate "${context.mandateId}" not found or unauthorized for user "${context.userId}".`);
        return {
          passed: false,
          tier: "MANDATE",
          errors,
          warnings,
          metadata: { totalCostYocto: totalPlanCostYocto.toString(), totalCostNear },
        };
      }

      // Check Mandate Status
      if (mandate.status !== "ACTIVE") {
        errors.push(`Mandate "${mandate.name}" is in "${mandate.status}" status. Only ACTIVE mandates permit planning.`);
      }

      // Check Mandate Expiration
      if (mandate.expiresAt && new Date(mandate.expiresAt).getTime() < Date.now()) {
        errors.push(`Mandate "${mandate.name}" expired at ${mandate.expiresAt.toISOString()}.`);
      }

      // Check Mandate Budget Ceiling
      const totalBudgetYocto = BigInt(mandate.totalBudgetYocto || "0");
      const spentBudgetYocto = BigInt(mandate.spentYocto || "0");
      const reservedBudgetYocto = BigInt(mandate.reservedYocto || "0");
      const remainingBudgetYocto = totalBudgetYocto - spentBudgetYocto - reservedBudgetYocto;

      if (totalPlanCostYocto > totalBudgetYocto) {
        errors.push(
          `Plan estimated cost (${totalCostNear} NEAR / ${totalPlanCostYocto.toString()} yoctoNEAR) ` +
            `exceeds mandate total budget (${mandate.totalBudgetYocto} yoctoNEAR).`
        );
      } else if (totalPlanCostYocto > remainingBudgetYocto) {
        errors.push(
          `Plan estimated cost (${totalPlanCostYocto.toString()} yoctoNEAR) ` +
            `exceeds mandate remaining available budget (${remainingBudgetYocto.toString()} yoctoNEAR).`
        );
      }

      // Check Recipient Allowlist
      let allowedRecipients: string[] = [];
      try {
        allowedRecipients = JSON.parse(mandate.allowedRecipientsJson || "[]");
      } catch {}

      if (allowedRecipients.length > 0) {
        for (const recipient of proposedRecipients) {
          if (!allowedRecipients.includes(recipient)) {
            errors.push(`Proposed recipient "${recipient}" is not permitted by mandate allowed recipients list.`);
          }
        }
      }

      return {
        passed: errors.length === 0,
        tier: "MANDATE",
        errors,
        warnings,
        metadata: {
          mandateId: mandate.id,
          totalBudgetYocto: totalBudgetYocto.toString(),
          remainingBudgetYocto: remainingBudgetYocto.toString(),
          totalCostYocto: totalPlanCostYocto.toString(),
          totalCostNear,
          hasFinancialTasks,
        },
      };
    }

    return {
      passed: true,
      tier: "MANDATE",
      errors,
      warnings,
      metadata: {
        totalCostYocto: "0",
        totalCostNear: "0",
        hasFinancialTasks: false,
      },
    };
  }

  /**
   * Tier 3: Task & DAG Structure Validation
   */
  private static validateTaskTier(context: PlanValidationContext): TierValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!context.steps || context.steps.length === 0) {
      errors.push("Plan must contain at least one task step.");
      return {
        passed: false,
        tier: "TASK",
        errors,
        warnings,
      };
    }

    // 1. Task Definitions Validation
    for (const step of context.steps) {
      if (!step.stepId || step.stepId.trim().length === 0) {
        errors.push(`Task step missing required stepId identifier.`);
      }

      if (!step.title || step.title.trim().length === 0) {
        errors.push(`Task "${step.stepId || "unidentified"}" missing required title.`);
      }

      const taskType = (step.taskType || "EXECUTION") as TaskType;
      if (!VALID_TASK_TYPES.includes(taskType)) {
        errors.push(
          `Task "${step.stepId}" specifies invalid taskType "${taskType}". Allowed: ${VALID_TASK_TYPES.join(", ")}`
        );
      }

      // Verify Failure Strategy
      if (step.failureHandling && !VALID_FAILURE_STRATEGIES.includes(step.failureHandling)) {
        errors.push(
          `Task "${step.stepId}" specifies invalid failureHandling "${step.failureHandling}". Allowed: ${VALID_FAILURE_STRATEGIES.join(", ")}`
        );
      }

      // Verify Required Tools against ToolRegistry
      for (const toolId of step.requiredTools || []) {
        if (!toolRegistry.has(toolId)) {
          errors.push(
            `Task "${step.stepId}" requires unregistered tool "${toolId}". Fabrication of tools is strictly prohibited.`
          );
        }
      }
    }

    // 2. DAG Validation via Kahn's Algorithm
    const dagResult = ObjectiveDAGService.validateAndOrder(
      context.steps.map((s) => ({
        stepId: s.stepId,
        title: s.title,
        taskType: s.taskType,
        order: s.order,
        dependencies: s.dependencies || [],
        riskClassification: s.riskClassification,
        estimatedCostNear: s.estimatedCostNear,
        estimatedCostYocto: s.estimatedCostYocto,
      }))
    );

    if (!dagResult.valid) {
      errors.push(`DAG Dependency Validation Failed: ${dagResult.error}`);
    }

    return {
      passed: errors.length === 0,
      tier: "TASK",
      errors,
      warnings,
      metadata: {
        executionLevels: dagResult.executionLevels,
        topologicalOrder: dagResult.topologicalOrder,
        cyclePath: dagResult.cyclePath,
      },
    };
  }

  /**
   * Tier 4: Security & Anti-Tamper Validation
   */
  private static validateSecurityTier(
    context: PlanValidationContext,
    mandateMetadata?: Record<string, any>
  ): TierValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Anti-Tamper: Prevent arbitrary spending authorization
    const totalCostYocto = BigInt(mandateMetadata?.totalCostYocto || "0");
    const remainingYocto = BigInt(mandateMetadata?.remainingBudgetYocto || "0");

    if (mandateMetadata?.hasFinancialTasks && totalCostYocto > remainingYocto) {
      errors.push("Security Boundary Violation: Plan attempts to authorize spending beyond available mandate reserves.");
    }

    // 2. Prevent unfirewalled payment operations
    const paymentSteps = context.steps.filter((s) => s.taskType === "PAYMENT");
    for (const pStep of paymentSteps) {
      if (!pStep.completionConditions || pStep.completionConditions.length === 0) {
        warnings.push(`Payment task "${pStep.stepId}" should have verifiable completion conditions.`);
      }
      // Ensure payment step has dependency on prior research or benchmark
      if (context.steps.length > 1 && (!pStep.dependencies || pStep.dependencies.length === 0)) {
        errors.push(`Security Policy: Financial transfer task "${pStep.stepId}" must depend on prior research or authorization.`);
      }
    }

    // 3. Verify order of Verification steps
    const verificationSteps = context.steps.filter((s) => s.taskType === "VERIFICATION");
    for (const vStep of verificationSteps) {
      if (context.steps.length > 1 && (!vStep.dependencies || vStep.dependencies.length === 0)) {
        warnings.push(`Verification task "${vStep.stepId}" has no upstream dependencies.`);
      }
    }

    return {
      passed: errors.length === 0,
      tier: "SECURITY",
      errors,
      warnings,
    };
  }

  /**
   * Tier 5: Risk Classification & Approval Enforcement
   */
  private static validateRiskTier(
    context: PlanValidationContext,
    mandateMetadata?: Record<string, any>
  ): TierValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    let overallRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";

    const hasCritical = context.steps.some((s) => s.riskClassification === "CRITICAL");
    const hasHigh = context.steps.some((s) => s.riskClassification === "HIGH");
    const hasMedium = context.steps.some((s) => s.riskClassification === "MEDIUM");
    const hasFinancial = Boolean(mandateMetadata?.hasFinancialTasks) || context.steps.some((s) => s.taskType === "PAYMENT");

    if (hasCritical) {
      overallRisk = "CRITICAL";
    } else if (hasHigh) {
      overallRisk = "HIGH";
    } else if (hasMedium || hasFinancial) {
      overallRisk = "MEDIUM";
    }

    // If financial or high/critical risk, mandatory human approval is enforced
    const requiresApproval = overallRisk === "HIGH" || overallRisk === "CRITICAL" || hasFinancial;

    return {
      passed: true,
      tier: "RISK",
      errors,
      warnings,
      metadata: {
        overallRisk,
        requiresApproval,
      },
    };
  }
}
