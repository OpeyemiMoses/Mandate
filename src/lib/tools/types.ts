import { z } from "zod";

export type ToolCategory =
  | "DISCOVERY"
  | "RESEARCH"
  | "COMMUNICATION"
  | "BLOCKCHAIN"
  | "EXTERNAL_APIS"
  | "MCP"
  | "MONITORING";

export type ToolPermissionLevel =
  | "READ"
  | "PROPOSE"
  | "RESTRICTED_EXECUTION"
  | "USER_ONLY";

export type RiskClassification =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type ExecutionType =
  | "INTERNAL"
  | "REST"
  | "MCP"
  | "WEBHOOK";

export type AuthenticationType =
  | "NONE"
  | "USER_CONNECTION"
  | "API_KEY"
  | "BEARER_TOKEN"
  | "BASIC"
  | "OAUTH";

export type AvailabilityStatus =
  | "ACTIVE"
  | "DEPRECATED"
  | "DISABLED"
  | "MAINTENANCE";

/**
 * Granular operation within a tool
 */
export interface ToolOperation {
  id: string;
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  outputSchema: z.ZodType<any>;
  requiredPermission: ToolPermissionLevel;
  riskClassification: RiskClassification;
  idempotent: boolean;
}

export interface ToolRetryPolicy {
  maxRetries: number;
  backoffMs: number;
  retryableErrors?: string[];
}

export interface ToolRateLimits {
  maxRequestsPerMinute: number;
  maxConcurrent: number;
}

/**
 * Universal Tool Definition Contract
 */
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  version: string;
  executionType: ExecutionType;
  authenticationRequirements: AuthenticationType;
  timeoutMs: number;
  retryPolicy: ToolRetryPolicy;
  rateLimits: ToolRateLimits;
  availabilityStatus: AvailabilityStatus;
  supportedAgentTypes: string[]; // ["*"] or specific types
  ownerOrProvider: string;
  metadata?: Record<string, unknown>;
  operations: Record<string, ToolOperation>;
}

/**
 * Summary for machine-readable discovery by agents
 */
export interface ToolSummary {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  version: string;
  executionType: ExecutionType;
  availabilityStatus: AvailabilityStatus;
  operations: Array<{
    id: string;
    name: string;
    description: string;
    requiredPermission: ToolPermissionLevel;
    riskClassification: RiskClassification;
  }>;
}

/**
 * Parameters for executing a tool operation
 */
export interface ToolInvocationParams {
  invocationId?: string;
  agentId: string;
  userId: string;
  executionId?: string;
  toolId: string;
  operation: string;
  params: Record<string, unknown>;
  connectionId?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/**
 * Normalized tool execution result returned to agents
 */
export interface ToolExecutionResult {
  success: boolean;
  invocationId: string;
  toolId: string;
  operation: string;
  data?: any;
  error?: string;
  durationMs: number;
  permissionDecision?: string;
  riskClassification?: RiskClassification;
  cached?: boolean;
}

/**
 * Tool Context exposed to agents through AgentExecutionContext
 */
export interface AgentToolContext {
  listTools: () => Promise<ToolSummary[]>;
  getTool: (toolId: string) => Promise<ToolSummary | null>;
  invokeTool: (
    toolId: string,
    operation: string,
    params: Record<string, unknown>,
    idempotencyKey?: string
  ) => Promise<ToolExecutionResult>;
}

