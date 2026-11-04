/**
 * MANDATE — MILESTONE 4: UNIVERSAL DISCOVERY & CAPABILITY MATCHING TYPES
 *
 * Core Principle:
 * Discover capabilities. Match intelligently. Verify availability. Preserve authority boundaries.
 */

export type CapabilityCategory =
  | "INFORMATION_DISCOVERY"
  | "FINANCIAL_EXECUTION"
  | "COMMUNICATION"
  | "COMPUTE_ANALYSIS"
  | "SYSTEM_AUTOMATION"
  | "EXTERNAL_INTEGRATION";

export type CapabilityStatus =
  | "REGISTERED"
  | "AVAILABLE"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "DISABLED"
  | "AUTH_REQUIRED"
  | "PERMISSION_DENIED";

export type CoverageStatus =
  | "COVERED"
  | "PARTIALLY_COVERED"
  | "MISSING"
  | "BLOCKED"
  | "AUTH_REQUIRED"
  | "USER_ACTION_REQUIRED";

export type ExecutionReadiness =
  | "READY"
  | "READY_WITH_APPROVALS"
  | "NEEDS_CONFIGURATION"
  | "NEEDS_USER_INPUT"
  | "PARTIALLY_SUPPORTED"
  | "UNSUPPORTED"
  | "BLOCKED";

export type PermissionLevel =
  | "READ"
  | "PROPOSE"
  | "RESTRICTED_EXECUTION"
  | "USER_ONLY";

export type RiskClassification =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export interface OperationSchema {
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  riskClassification: RiskClassification;
  permissionLevel: PermissionLevel;
  estimatedCostYocto?: string;
}

export interface UniversalCapability {
  id: string; // Unique capability descriptor id e.g. "tool:near_rpc:view_account"
  name: string;
  description: string;
  category: CapabilityCategory;
  status: CapabilityStatus;
  providerId?: string;
  toolId?: string;
  agentType?: string;
  operations: OperationSchema[];
  requiredAuthType: "NONE" | "API_KEY" | "BEARER_TOKEN" | "BASIC" | "OAUTH";
  isHealthy: boolean;
  lastCheckedAt?: string;
  healthMessage?: string;
  integrationConnectionId?: string;
}

export interface CatalogIntegration {
  providerId: string;
  name: string;
  category: CapabilityCategory;
  description: string;
  authType: "NONE" | "API_KEY" | "BEARER_TOKEN" | "BASIC" | "OAUTH";
  docsUrl?: string;
  iconName?: string;
  defaultConfig?: Record<string, any>;
  supportedOperations: string[];
  requiredScopes?: string[];
}

export interface UserIntegrationState {
  catalog: CatalogIntegration;
  isSupported: boolean;
  isConfigured: boolean;
  isAuthenticated: boolean;
  isOperational: boolean;
  connectionId?: string;
  connectionName?: string;
  status?: string;
  lastVerifiedAt?: string;
  healthStatus?: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNCHECKED";
  errorMessage?: string;
}

export interface CapabilityRequirement {
  id: string;
  name: string;
  category?: CapabilityCategory;
  operation?: string;
  description?: string;
  requiredPermission?: PermissionLevel;
  estimatedCostNear?: string;
  requiredAgentType?: string;
}

export interface CapabilityMatchResult {
  requirementId: string;
  capabilityId: string;
  capabilityName: string;
  category: CapabilityCategory;
  toolId?: string;
  agentId?: string;
  integrationId?: string;
  matchScore: number; // 0.0 to 1.0 (ranking aid, not authorization decision)
  matchReason: string;
  coverageStatus: CoverageStatus;
  permissionStatus: "GRANTED" | "ELEVATION_REQUIRED" | "USER_APPROVAL_REQUIRED" | "DENIED";
  riskClassification: RiskClassification;
  operationsMatched: string[];
  missingRequirements?: string[];
}

export interface CoverageReport {
  objectiveId?: string;
  totalRequirements: number;
  coveredCount: number;
  partiallyCoveredCount: number;
  missingCount: number;
  blockedCount: number;
  authRequiredCount: number;
  coverageScore: number; // 0.0 to 1.0
  matches: CapabilityMatchResult[];
  unsupportedOperations: string[];
  summary: string;
}

export interface ReadinessReport {
  objectiveId?: string;
  overallReadiness: ExecutionReadiness;
  canExecute: boolean;
  coverageScore: number;
  coverageReport: CoverageReport;
  approvalRequirements: string[];
  configurationRequirements: string[];
  userInputRequirements: string[];
  blockingReasons: string[];
  recommendedActions: string[];
}

