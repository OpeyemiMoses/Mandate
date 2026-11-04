/**
 * MANDATE — MILESTONE 6: UNIVERSAL MULTI-AGENT COORDINATION TYPES
 * 
 * Formal type definitions, state machines, and schema contracts for
 * multi-agent workflow coordination, shared context, and authority.
 */

export type CoordinationRunStatus =
  | "PENDING"
  | "PLANNING"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type CoordinationTaskStatus =
  | "PENDING"
  | "READY"
  | "ASSIGNED"
  | "RUNNING"
  | "WAITING_HANDOFF"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "BLOCKED"
  | "CANCELLED";

export type AgentAssignmentStatus =
  | "ASSIGNED"
  | "ACTIVE"
  | "REASSIGNED"
  | "RELEASED"
  | "FAILED";

export type AgentHandoffStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "COMPLETED"
  | "FAILED";

export interface CoordinationTaskDefinition {
  stepId: string;
  title: string;
  description?: string;
  order: number;
  priority?: number; // Lower integer = higher priority (e.g., 10 > 100)
  agentType: string;
  requiredCapabilities: string[];
  requiredTools?: string[];
  dependencies: string[]; // stepIds that must be COMPLETED
  financialRequired?: boolean;
  estimatedCostNear?: string;
  input?: Record<string, any>;
}

export interface CoordinationWorkflowPlan {
  runId: string;
  objectiveId: string;
  planId: string;
  planVersion: number;
  tasks: CoordinationTaskDefinition[];
  concurrencyLimit: number;
  metadata?: Record<string, any>;
}

export interface SharedArtifactRecord {
  id: string;
  runId: string;
  objectiveId: string;
  artifactId: string;
  version: number;
  title: string;
  contentType: string;
  data: Record<string, any>;
  dataHash: string;
  producingAgentId: string;
  producingTaskId?: string | null;
  evidenceReferences: string[];
  allowedReaderAgentTypes: string[];
  allowedWriterAgentTypes: string[];
  isSealed: boolean;
  createdAt: string;
}

export interface HandoffPayload {
  sourceAgentId: string;
  destinationAgentId: string;
  objectiveId: string;
  taskId: string;
  targetTaskId?: string;
  outputReference: string;
  structuredPayload: Record<string, any>;
  schemaVersion: string;
  evidenceReferences: string[];
  idempotencyKey?: string;
}

export interface TaskLeaseRecord {
  id: string;
  taskId: string;
  runId: string;
  workerId: string;
  leaseToken: string;
  acquiredAt: Date;
  expiresAt: Date;
  heartbeatCount: number;
  isReleased: boolean;
}

/**
 * Valid state transitions for a CoordinationRun
 */
export const VALID_RUN_TRANSITIONS: Record<CoordinationRunStatus, CoordinationRunStatus[]> = {
  PENDING: ["PLANNING", "ACTIVE", "CANCELLED"],
  PLANNING: ["ACTIVE", "FAILED", "CANCELLED"],
  ACTIVE: ["PAUSED", "COMPLETED", "FAILED", "CANCELLED"],
  PAUSED: ["ACTIVE", "CANCELLED"],
  COMPLETED: [],
  FAILED: ["PLANNING", "ACTIVE"], // Allow recovery retry
  CANCELLED: [],
};

/**
 * Valid state transitions for a CoordinationTask
 */
export const VALID_TASK_TRANSITIONS: Record<CoordinationTaskStatus, CoordinationTaskStatus[]> = {
  PENDING: ["READY", "BLOCKED", "CANCELLED"],
  READY: ["ASSIGNED", "RUNNING", "BLOCKED", "CANCELLED"],
  ASSIGNED: ["RUNNING", "READY", "FAILED", "CANCELLED"],
  RUNNING: ["WAITING_HANDOFF", "WAITING_APPROVAL", "COMPLETED", "FAILED", "READY", "CANCELLED"],
  WAITING_HANDOFF: ["COMPLETED", "FAILED", "CANCELLED"],
  WAITING_APPROVAL: ["RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: ["READY", "BLOCKED"], // Retry or reassignment resets to READY
  BLOCKED: ["READY", "CANCELLED"], // Unblocked when dependency succeeds
  CANCELLED: [],
};

/**
 * Valid state transitions for an AgentHandoff
 */
export const VALID_HANDOFF_TRANSITIONS: Record<AgentHandoffStatus, AgentHandoffStatus[]> = {
  PENDING: ["ACCEPTED", "REJECTED", "FAILED"],
  ACCEPTED: ["COMPLETED", "FAILED"],
  REJECTED: [],
  COMPLETED: [],
  FAILED: [],
};

export function isValidRunTransition(from: CoordinationRunStatus, to: CoordinationRunStatus): boolean {
  return VALID_RUN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isValidTaskTransition(from: CoordinationTaskStatus, to: CoordinationTaskStatus): boolean {
  return VALID_TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isValidHandoffTransition(from: AgentHandoffStatus, to: AgentHandoffStatus): boolean {
  return VALID_HANDOFF_TRANSITIONS[from]?.includes(to) ?? false;
}

