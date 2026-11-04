/**
 * Universal Policy & Compliance Governance Layer - Types & Contracts
 * Core Principle: "Every agent can act only within authority that Mandate can prove, enforce and audit."
 */

export type PolicyDecisionOutcome =
  | "ALLOW"
  | "ALLOW_WITH_LIMITS"
  | "REQUIRE_APPROVAL"
  | "DENY"
  | "ESCALATE";

export type GovernanceRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type PolicyScope =
  | "USER"
  | "AGENT"
  | "OBJECTIVE"
  | "COORDINATION_RUN"
  | "MANDATE"
  | "INTEGRATION"
  | "TOOL"
  | "RESOURCE";

export type PolicyStatus = "ACTIVE" | "SUSPENDED" | "EXPIRED" | "REVOKED";

export type PolicyRuleType =
  | "CAPABILITY_RESTRICTION"
  | "ALLOWED_TOOLS"
  | "DENIED_TOOLS"
  | "ALLOWED_INTEGRATIONS"
  | "ALLOWED_OPERATIONS"
  | "RECIPIENT_ALLOWLIST"
  | "RECIPIENT_BLOCKLIST"
  | "SPENDING_THRESHOLD"
  | "TRANSACTION_LIMIT"
  | "FREQUENCY_LIMIT"
  | "TIME_WINDOW"
  | "OBJECTIVE_RESTRICTION"
  | "COORDINATION_RESTRICTION"
  | "REQUIRED_EVIDENCE"
  | "APPROVAL_REQUIREMENT"
  | "PROHIBITED_ACTION";

export type RuleOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "IN"
  | "NOT_IN"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "GREATER_THAN_OR_EQUALS"
  | "LESS_THAN_OR_EQUALS"
  | "BETWEEN"
  | "CONTAINS"
  | "STARTS_WITH"
  | "ENDS_WITH";

export type RuleAction =
  | "ALLOW"
  | "DENY"
  | "REQUIRE_APPROVAL"
  | "LIMIT"
  | "ESCALATE";

export interface PolicyRuleDefinition {
  id?: string;
  ruleType: PolicyRuleType;
  operator: RuleOperator;
  field: string;
  value: unknown;
  action: RuleAction;
  description?: string;
  isEnforced?: boolean;
  order?: number;
}

export interface PolicyEvaluationContext {
  userId: string;
  agentId?: string;
  agentType?: string;
  capabilities?: string[];
  objectiveId?: string;
  coordinationRunId?: string;
  mandateId?: string;
  toolId?: string;
  operation?: string;
  recipient?: string;
  amountYocto?: string;
  resource?: string;
  evidence?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  now?: Date;
  isSimulated?: boolean;
  skipPersistence?: boolean;
  idempotencyKey?: string;
}

export interface PolicyCheckResult {
  ruleId?: string;
  policyId?: string;
  policyName?: string;
  ruleType?: string;
  passed: boolean;
  action?: RuleAction;
  message: string;
  field?: string;
  actualValue?: unknown;
  expectedValue?: unknown;
}

export interface PolicyEvaluationResult {
  evaluationId: string;
  decision: PolicyDecisionOutcome;
  riskLevel: GovernanceRiskLevel;
  allowed: boolean;
  requiresApproval: boolean;
  reasonCodes: string[];
  humanExplanation: string;
  matchedPolicyIds: string[];
  policyVersions: Record<string, number>;
  applicableLimits: {
    maxAmountYocto?: string;
    allowedRecipients?: string[];
    allowedOperations?: string[];
    allowedTools?: string[];
    [key: string]: unknown;
  };
  approvalRequirements: {
    required: boolean;
    reason?: string;
    thresholdYocto?: string;
    approverRole?: string;
    actionPayloadHash?: string;
    expiresInSeconds?: number;
  };
  checks: PolicyCheckResult[];
  timestamp: string;
  isSimulated: boolean;
}

export interface PolicyTemplateDefinition {
  id: string;
  name: string;
  description: string;
  scope: PolicyScope;
  targetCategory?: string;
  riskLevel: GovernanceRiskLevel;
  rules: Omit<PolicyRuleDefinition, "id">[];
}

