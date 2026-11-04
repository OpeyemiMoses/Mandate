import { z } from "zod";

/**
 * Universal Agent Runtime - Types & Contracts
 */

export type ExecutionStatus =
  | "QUEUED"
  | "INITIALIZING"
  | "RUNNING"
  | "PAUSE_REQUESTED"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "WAITING_FOR_APPROVAL";

export const VALID_EXECUTION_STATUSES: ExecutionStatus[] = [
  "QUEUED",
  "INITIALIZING",
  "RUNNING",
  "PAUSE_REQUESTED",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "WAITING_FOR_APPROVAL",
];

/**
 * Central State Transition Matrix
 * Enforces deterministic lifecycle progression and rejects invalid transitions.
 */
export const VALID_STATUS_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  QUEUED: ["INITIALIZING", "CANCEL_REQUESTED", "CANCELLED", "FAILED"],
  INITIALIZING: ["RUNNING", "CANCEL_REQUESTED", "CANCELLED", "FAILED"],
  RUNNING: [
    "PAUSE_REQUESTED",
    "PAUSED",
    "WAITING_FOR_APPROVAL",
    "COMPLETED",
    "FAILED",
    "CANCEL_REQUESTED",
    "CANCELLED",
  ],
  PAUSE_REQUESTED: ["PAUSED", "RUNNING", "FAILED", "CANCEL_REQUESTED", "CANCELLED"],
  PAUSED: ["RUNNING", "CANCEL_REQUESTED", "CANCELLED", "FAILED"],
  WAITING_FOR_APPROVAL: ["RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [], // Terminal state
  FAILED: ["QUEUED"], // Bounded retries may re-queue
  CANCEL_REQUESTED: ["CANCELLED", "FAILED"],
  CANCELLED: [], // Terminal state
};

export function isValidTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  if (from === to) return true;
  const allowed = VALID_STATUS_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

export function isTerminalStatus(status: ExecutionStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export function isPausedOrRequesting(status: ExecutionStatus): boolean {
  return status === "PAUSE_REQUESTED" || status === "PAUSED";
}

export function isCancellationOrRequesting(status: ExecutionStatus): boolean {
  return status === "CANCEL_REQUESTED" || status === "CANCELLED";
}

/**
 * Agent Capabilities
 */
export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  category:
    | "research"
    | "procurement"
    | "analytics"
    | "financial"
    | "utility"
    | "security"
    | "operations"
    | "treasury"
    | "compliance"
    | "monitoring"
    | "communication";
  requiresMandate: boolean;
}

/**
 * Proposed Financial or Operational Action from Agent
 */
export interface ProposedAction {
  id: string;
  type: "PAYMENT" | "DEPOSIT" | "CONTRACT_CALL" | "NOTIFICATION";
  recipient?: string;
  amountNear?: string;
  amountYocto?: string;
  purpose: string;
  evidenceUrl?: string;
  policyVerdict?: "ALLOW" | "REQUIRES_APPROVAL" | "BLOCK";
  approvalId?: string;
  txHash?: string;
}

/**
 * Structured Agent Execution Result
 */
export interface AgentExecutionResult {
  status: ExecutionStatus;
  summary: string;
  output: Record<string, unknown>;
  proposedActions: ProposedAction[];
  evidence: Record<string, unknown>[];
  errors: string[];
  startedAt: string;
  completedAt: string;
}

import { AgentToolContext } from "@/lib/tools/types";

/**
 * Execution Context passed into the agent implementation
 */
export interface AgentExecutionContext {
  executionId: string;
  agentId: string;
  agentName: string;
  agentType: string;
  userId: string;
  ownerNearAccountId: string;
  mandateId?: string;
  input: Record<string, unknown> | string;
  context: Record<string, unknown>;
  capabilities: string[];
  cancellationSignal?: AbortSignal;
  currentStep?: string;
  retryCount: number;

  tools: AgentToolContext;

  emitEvent: (
    eventType: string,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
  updateStep: (
    step: string,
    contextPatch?: Record<string, unknown>
  ) => Promise<void>;
  checkAborted: () => boolean;
}

/**
 * Universal Agent Interface
 * Every registered specialist agent must implement this contract.
 */
export interface UniversalAgent {
  readonly type: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;

  getCapabilities(): AgentCapability[];
  validateConfig(config: Record<string, unknown>): {
    valid: boolean;
    errors?: string[];
  };
  initialize(context: AgentExecutionContext): Promise<void>;
  execute(
    context: AgentExecutionContext,
    signal?: AbortSignal
  ): Promise<AgentExecutionResult>;
  pause(executionId: string): Promise<boolean>;
  resume(executionId: string): Promise<boolean>;
  cancel(executionId: string): Promise<boolean>;
  getStatus(executionId: string): Promise<ExecutionStatus>;
}

/**
 * Runtime Event Payload
 */
export interface RuntimeEventPayload {
  id: string;
  executionId: string;
  agentId: string;
  userId: string;
  eventType: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

/**
 * Execution Request Parameters
 */
export interface StartExecutionParams {
  agentId: string;
  userId: string;
  input: Record<string, unknown> | string;
  mandateId?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
}

