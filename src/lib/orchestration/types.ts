/**
 * MANDATE — MILESTONE 13.4: MULTI-AGENT ORCHESTRATION & TASK LIFECYCLE TYPES
 *
 * Formal type definitions, state machines, permitted transitions, and schema contracts
 * for dependency-aware orchestration, task lifecycle management, and output verification.
 */

export type OrchestrationTaskStatus =
  | "PENDING"
  | "BLOCKED"
  | "READY"
  | "ASSIGNED"
  | "QUEUED"
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "RETRY_PENDING"
  | "CANCELLED"
  | "REQUIRES_INTERVENTION";

export type TaskActorRole = "USER" | "AGENT" | "SYSTEM" | "WORKER";

export type VerificationStatus =
  | "UNVERIFIED"
  | "AGENT_REPORTED"
  | "SYSTEM_VALIDATED"
  | "INDEPENDENTLY_VERIFIED"
  | "REJECTED";

export type FailureStageType =
  | "PRE_DISPATCH"
  | "EXECUTION"
  | "TOOL_INVOCATION"
  | "VERIFICATION"
  | "TIMEOUT"
  | "LEASE_EXPIRED"
  | "WORKER_CRASH"
  | "AMBIGUOUS_DISPATCH"
  | "POLICY_DENIED";

/**
 * Permitted Task State Transitions
 * Guarantees deterministic progress, rejects illegal backward transitions,
 * and enforces failure/approval workflows.
 */
export const PERMITTED_TASK_TRANSITIONS: Record<OrchestrationTaskStatus, OrchestrationTaskStatus[]> = {
  PENDING: ["BLOCKED", "READY", "CANCELLED"],
  BLOCKED: ["READY", "CANCELLED", "REQUIRES_INTERVENTION"],
  READY: ["ASSIGNED", "QUEUED", "BLOCKED", "CANCELLED"],
  ASSIGNED: ["QUEUED", "RUNNING", "READY", "CANCELLED", "REQUIRES_INTERVENTION"],
  QUEUED: ["RUNNING", "RETRY_PENDING", "FAILED", "CANCELLED", "REQUIRES_INTERVENTION"],
  RUNNING: [
    "AWAITING_APPROVAL",
    "COMPLETED",
    "FAILED",
    "RETRY_PENDING",
    "REQUIRES_INTERVENTION",
    "CANCELLED",
  ],
  AWAITING_APPROVAL: [
    "RUNNING",
    "COMPLETED",
    "RETRY_PENDING",
    "FAILED",
    "CANCELLED",
    "REQUIRES_INTERVENTION",
  ],
  RETRY_PENDING: ["QUEUED", "READY", "FAILED", "CANCELLED", "REQUIRES_INTERVENTION"],
  REQUIRES_INTERVENTION: ["READY", "QUEUED", "RUNNING", "FAILED", "CANCELLED"],
  COMPLETED: [], // Terminal
  FAILED: ["RETRY_PENDING", "READY", "REQUIRES_INTERVENTION"], // Recovery / intervention reset
  CANCELLED: [], // Terminal
};

export function isValidTaskStatusTransition(
  from: OrchestrationTaskStatus,
  to: OrchestrationTaskStatus
): boolean {
  if (from === to) return true;
  const allowed = PERMITTED_TASK_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

/**
 * Constrained Execution Context for Dispatched Agent Tasks
 * Invariant: Never contains private keys, signing credentials, internal auth secrets,
 * other tenants' data, or unrestricted mandate authority.
 */
export interface ConstrainedExecutionContext {
  objectiveId: string;
  stepId: string;
  taskTitle: string;
  taskType: string;
  agentId: string;
  assignmentId: string;
  planVersion: number;
  planHash: string;
  taskInput: Record<string, any>;
  dependencyResults: Record<string, any>; // Read-only upstream outputs
  authorizedTools: string[];
  policyVersion: number;
  capabilityVersion: number;
  executionDeadline: string; // ISO 8601
  leaseGeneration: number;
  leaseToken: string;
}

export interface TaskTransitionParams {
  objectiveId: string;
  planId: string;
  stepId: string;
  targetStatus: OrchestrationTaskStatus;
  actorId: string;
  actorRole: TaskActorRole;
  expectedVersion?: number;
  expectedLeaseGeneration?: number;
  expectedLeaseToken?: string;
  reason: string;
  verificationStatus?: VerificationStatus;
  resultFingerprint?: string;
  output?: Record<string, any>;
  errorDetails?: string;
  failureStage?: FailureStageType;
  metadata?: Record<string, any>;
}

export interface TaskTransitionResult {
  success: boolean;
  stepId: string;
  previousStatus: OrchestrationTaskStatus;
  newStatus: OrchestrationTaskStatus;
  version: number;
  transitionedAt: string;
  actorId: string;
  actorRole: TaskActorRole;
  reason: string;
}

export interface StructuredTaskResult {
  stepId: string;
  agentId: string;
  executionAttempt: number;
  status: "COMPLETED" | "FAILED" | "REJECTED";
  structuredOutput: Record<string, any>;
  evidenceReferences: string[];
  toolExecutions: Array<{
    toolId: string;
    paramsHash: string;
    executedAt: string;
    success: boolean;
  }>;
  resultFingerprint: string;
  verificationStatus: VerificationStatus;
  verifiedBy?: string;
  verificationDetails?: Record<string, any>;
  errorDetails?: string;
  startedAt: string;
  completedAt: string;
}

export interface SchedulerReadinessResult {
  objectiveId: string;
  planId: string;
  planVersion: number;
  planHash: string;
  readyTasks: Array<{
    stepId: string;
    title: string;
    taskType: string;
    agentType: string;
    assignedAgentId?: string;
    dependencies: string[];
    priority: number;
    order: number;
    executionLevel: number;
  }>;
  blockedTasks: Array<{
    stepId: string;
    title: string;
    unmetDependencies: string[];
    failedDependencies: string[];
  }>;
  executingTasks: string[];
  completedTasks: string[];
  failedTasks: string[];
  isAcyclic: boolean;
}

export interface ObjectiveProgressMetrics {
  totalTasks: number;
  pendingTasks: number;
  blockedTasks: number;
  assignedTasks: number;
  queuedTasks: number;
  runningTasks: number;
  awaitingApprovalTasks: number;
  completedTasks: number;
  failedTasks: number;
  retryingTasks: number;
  cancelledTasks: number;
  requiringInterventionTasks: number;
  progressPercent: number;
  isComplete: boolean;
  successCriteriaMet: number;
  totalSuccessCriteria: number;
}

