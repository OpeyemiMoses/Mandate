import { z } from "zod";
import crypto from "crypto";

export type ObjectiveStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PLANNING"
  | "READY"
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "REQUIRES_INTERVENTION"
  // Legacy statuses for backward compatibility
  | "NEEDS_CLARIFICATION"
  | "AWAITING_USER_APPROVAL"
  | "BLOCKED"
  | "ARCHIVED";

export type ActorRole = "USER" | "AGENT" | "SYSTEM" | "OPERATOR";

export type ObjectivePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ObjectiveCategory =
  | "RESEARCH"
  | "FINANCE"
  | "TREASURY"
  | "PROCUREMENT"
  | "OPERATIONS"
  | "COMMERCE"
  | "COMMUNICATION"
  | "MONITORING"
  | "DEVELOPMENT"
  | "CUSTOM";

export type PlanStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED"
  | "ACTIVE"
  | "COMPLETED"
  | "FAILED";

export type StepStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "BLOCKED"
  | "SKIPPED";

export type MeasurementType =
  | "NUMERIC"
  | "BOOLEAN"
  | "EVENT_BASED"
  | "EVIDENCE_BASED"
  | "TIME_BASED"
  | "USER_CONFIRMED";

export type VerificationMethod =
  | "TOOL_RESULT"
  | "ON_CHAIN_VERIFICATION"
  | "EXTERNAL_EVIDENCE"
  | "USER_CONFIRMATION";

export type CriteriaStatus = "MET" | "NOT_MET" | "PARTIALLY_MET" | "FAILED";

export type TaskType =
  | "RESEARCH"
  | "ANALYSIS"
  | "EXECUTION"
  | "PAYMENT"
  | "VERIFICATION";

export type TaskFailureHandling =
  | "FAIL_CLOSED"
  | "RETRY_WITH_BACKOFF"
  | "SKIP_OPTIONAL"
  | "ESCALATE_TO_HUMAN";

export interface ClarificationQuestion {
  id: string;
  question: string;
  options?: string[];
  field: string;
  reason: string;
}

/**
 * Structured Goal Extracted by Objective Interpreter / Understanding Service
 */
export interface StructuredGoal {
  outcome: string;
  scope: string;
  entities: string[];
  timeHorizon: string;
  budgetConstraints: {
    maxNear?: string;
    maxBudgetYocto?: string;
    preferredCapPerTx?: string;
    preferredCapPerTxYocto?: string;
    currency?: string;
  };
  spendingPreferences: string[];
  restrictions: string[];
  requiredCapabilities: string[];
  requiredTools: string[];
  successConditions: string[];
  monitoringRequirements: string[];
  recurringRequirements: string[];
  approvalRequirements: string[];
  explicitInstructions: string[];
  reasonableAssumptions: string[];
  missingInformation: string[];
  unfulfillableRequirements: string[];
  clarificationQuestions?: ClarificationQuestion[];
}

/**
 * Normalized Objective Understanding Output
 */
export interface StructuredObjectiveUnderstanding {
  intent: string;
  category: ObjectiveCategory;
  desiredDeliverables: string[];
  successCriteria: SuccessCriterionDefinition[];
  requiredCapabilities: string[];
  requiredTools: string[];
  financialRestrictions: {
    maxNear?: string;
    maxBudgetYocto?: string;
    preferredCapPerTxNear?: string;
    preferredCapPerTxYocto?: string;
    currency: "NEAR";
  };
  assumptions: string[];
  missingInformation: string[];
  unfulfillableRequirements: string[];
  clarificationQuestions: ClarificationQuestion[];
  needsClarification: boolean;
}

/**
 * Objective-Level Operational & Financial Constraints
 */
export interface ObjectiveConstraints {
  maxBudgetNear?: string;
  maxBudgetYocto?: string;
  deadline?: string;
  deadlineAt?: string;
  frequency?: string;
  requiredQuality?: string;
  preferredProviders?: string[];
  allowedResources?: string[];
  excludedResources?: string[];
  operationalRestrictions?: string[];
}

/**
 * Objective Status Transition Request Parameters
 */
export interface ObjectiveTransitionParams {
  objectiveId: string;
  targetStatus: ObjectiveStatus;
  actorId: string;
  actorRole: ActorRole;
  isAgent?: boolean;
  reason?: string;
  expectedVersion?: number;
  metadata?: Record<string, unknown>;
  skipCriteriaValidation?: boolean;
}

/**
 * Objective Status Transition Result
 */
export interface ObjectiveTransitionResult {
  success: boolean;
  objectiveId: string;
  previousStatus: ObjectiveStatus;
  newStatus: ObjectiveStatus;
  version: number;
  transitionedAt: string;
  actorId: string;
  actorRole: ActorRole;
  reason: string;
}

/**
 * Plan Step Definition
 */
export interface PlanStepDefinition {
  stepId: string;
  title: string;
  description: string;
  order: number;
  taskType?: TaskType;
  agentType: string;
  assignedAgentId?: string;
  requiredCapabilities: string[];
  requiredTools: string[];
  dependencies: string[];
  preconditions: string[];
  completionConditions: string[];
  riskClassification: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estimatedCostNear?: string;
  estimatedCostYocto?: string;
  failureHandling: TaskFailureHandling | string;
}

/**
 * Success Criterion Definition
 */
export interface SuccessCriterionDefinition {
  criterionId: string;
  description: string;
  measurementType: MeasurementType;
  target: string;
  verificationMethod: VerificationMethod;
}

/**
 * Objective Status Transition Rules (Milestone 13.1 Deterministic State Machine)
 */
export const VALID_OBJECTIVE_TRANSITIONS: Record<ObjectiveStatus, ObjectiveStatus[]> = {
  DRAFT: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["PLANNING", "PAUSED", "CANCELLED"],
  PLANNING: ["READY", "AWAITING_APPROVAL", "FAILED", "PAUSED", "CANCELLED"],
  AWAITING_APPROVAL: ["READY", "RUNNING", "PLANNING", "CANCELLED", "PAUSED"],
  READY: ["RUNNING", "PAUSED", "CANCELLED"],
  RUNNING: ["COMPLETED", "REQUIRES_INTERVENTION", "FAILED", "PAUSED", "CANCELLED", "AWAITING_APPROVAL"],
  REQUIRES_INTERVENTION: ["RUNNING", "PAUSED", "FAILED", "CANCELLED"],
  PAUSED: ["ACTIVE", "PLANNING", "READY", "RUNNING", "REQUIRES_INTERVENTION", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  // Legacy compatibility mappings
  NEEDS_CLARIFICATION: ["DRAFT", "ACTIVE", "CANCELLED"],
  AWAITING_USER_APPROVAL: ["ACTIVE", "READY", "DRAFT", "CANCELLED"],
  BLOCKED: ["REQUIRES_INTERVENTION", "PAUSED", "FAILED", "CANCELLED"],
  ARCHIVED: [],
};

export function isValidObjectiveStatusTransition(
  from: ObjectiveStatus,
  to: ObjectiveStatus
): boolean {
  if (from === to) return true;
  return VALID_OBJECTIVE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Plan Status Transition Rules
 */
export const VALID_PLAN_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "APPROVED", "REJECTED", "SUPERSEDED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "SUPERSEDED"],
  APPROVED: ["ACTIVE", "SUPERSEDED", "FAILED"],
  REJECTED: ["DRAFT", "SUPERSEDED"],
  ACTIVE: ["COMPLETED", "FAILED", "SUPERSEDED"],
  COMPLETED: [],
  FAILED: ["SUPERSEDED"],
  SUPERSEDED: [],
};

export function isValidPlanStatusTransition(from: PlanStatus, to: PlanStatus): boolean {
  if (from === to) return true;
  return VALID_PLAN_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Step Status Transition Rules
 */
export const VALID_STEP_TRANSITIONS: Record<StepStatus, StepStatus[]> = {
  PENDING: ["READY", "RUNNING", "SKIPPED", "BLOCKED"],
  READY: ["RUNNING", "BLOCKED", "SKIPPED"],
  RUNNING: ["COMPLETED", "FAILED", "BLOCKED", "WAITING_APPROVAL"],
  WAITING_APPROVAL: ["RUNNING", "BLOCKED", "SKIPPED"],
  BLOCKED: ["READY", "PENDING", "FAILED"],
  COMPLETED: [],
  FAILED: ["PENDING", "READY"],
  SKIPPED: [],
};

export function isValidStepStatusTransition(from: StepStatus, to: StepStatus): boolean {
  if (from === to) return true;
  return VALID_STEP_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Computes a deterministic cryptographic SHA-256 content fingerprint for an Objective Plan.
 * Binds approval security directly to the step definitions, tools, dependencies, and constraints.
 */
export function computePlanContentHash(plan: {
  version: number;
  steps: Array<{
    stepId: string;
    title: string;
    taskType?: string;
    agentType: string;
    requiredCapabilities?: string[];
    requiredTools?: string[];
    dependencies?: string[];
    riskClassification?: string;
    estimatedCostNear?: string | null;
    estimatedCostYocto?: string | null;
  }>;
  constraints?: Record<string, any>;
}): string {
  const canonicalSteps = plan.steps
    .map((s) => ({
      stepId: s.stepId,
      title: s.title,
      taskType: s.taskType || "EXECUTION",
      agentType: s.agentType,
      requiredCapabilities: [...(s.requiredCapabilities || [])].sort(),
      requiredTools: [...(s.requiredTools || [])].sort(),
      dependencies: [...(s.dependencies || [])].sort(),
      riskClassification: s.riskClassification || "LOW",
      estimatedCostNear: s.estimatedCostNear || null,
      estimatedCostYocto: s.estimatedCostYocto || null,
    }))
    .sort((a, b) => a.stepId.localeCompare(b.stepId));

  const canonicalPayload = JSON.stringify({
    version: plan.version,
    steps: canonicalSteps,
    constraints: plan.constraints || {},
  });

  return crypto.createHash("sha256").update(canonicalPayload).digest("hex");
}
