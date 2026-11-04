import { PolicyEvaluationContext, GovernanceRiskLevel } from "./types";
import { yoctoToNear } from "@/lib/yocto";

export interface RiskAssessmentResult {
  riskLevel: GovernanceRiskLevel;
  score: number; // 0 to 100
  reasonCodes: string[];
  reasons: string[];
  factors: {
    financialExposure: GovernanceRiskLevel;
    operationType: GovernanceRiskLevel;
    resourceSensitivity: GovernanceRiskLevel;
    authorityScope: GovernanceRiskLevel;
  };
}

// Fixed critical operations that can NEVER be downgraded below CRITICAL
const SYSTEM_CRITICAL_OPERATIONS = new Set([
  "wallet_withdraw",
  "withdraw_funds",
  "export_private_key",
  "rotate_custody_key",
  "override_policy",
  "grant_full_authority",
  "revoke_all_mandates",
  "delete_audit_trail",
]);

// High risk operations
const HIGH_RISK_OPERATIONS = new Set([
  "disburse_funds",
  "execute_payment",
  "transfer",
  "outlayer_transfer",
  "delete_connection",
  "revoke_credentials",
  "rotate_credentials",
  "batch_payout",
]);

// Medium risk operations
const MEDIUM_RISK_OPERATIONS = new Set([
  "send_message",
  "post_notification",
  "create_repo",
  "write_artifact",
  "modify_plan",
  "connect_service",
  "reassign_agent",
]);

/**
 * Deterministic operation-level risk assessment service.
 * Never relies solely on an agent's declared risk level.
 * Prevents user-level downgrade of system-defined critical restrictions.
 */
export function classifyOperationRisk(context: PolicyEvaluationContext): RiskAssessmentResult {
  const reasons: string[] = [];
  const reasonCodes: string[] = [];
  let score = 10; // Default baseline score for normal low-risk actions

  const opName = (context.operation || "").toLowerCase().trim();
  const toolId = (context.toolId || "").toLowerCase().trim();

  // 1. Operation Type Assessment
  let operationTypeRisk: GovernanceRiskLevel = "LOW";
  if (SYSTEM_CRITICAL_OPERATIONS.has(opName) || opName.includes("withdraw") || opName.includes("private_key")) {
    operationTypeRisk = "CRITICAL";
    score = Math.max(score, 95);
    reasonCodes.push("CRITICAL_OPERATION_TYPE");
    reasons.push(`Operation "${context.operation}" is classified as system-critical custody or authority mutation.`);
  } else if (HIGH_RISK_OPERATIONS.has(opName) || toolId.includes("transfer") || toolId.includes("payment")) {
    operationTypeRisk = "HIGH";
    score = Math.max(score, 70);
    reasonCodes.push("HIGH_RISK_OPERATION_TYPE");
    reasons.push(`Operation "${context.operation}" performs high-risk state mutation or fund movement.`);
  } else if (MEDIUM_RISK_OPERATIONS.has(opName) || opName.includes("send") || opName.includes("write")) {
    operationTypeRisk = "MEDIUM";
    score = Math.max(score, 40);
    reasonCodes.push("MEDIUM_RISK_OPERATION_TYPE");
    reasons.push(`Operation "${context.operation}" mutates external systems or public communication channels.`);
  }

  // 2. Financial Exposure Assessment
  let financialRisk: GovernanceRiskLevel = "LOW";
  if (context.amountYocto) {
    try {
      const amountBigInt = BigInt(context.amountYocto);
      if (amountBigInt > BigInt(0)) {
        const nearFloat = parseFloat(yoctoToNear(context.amountYocto));
        if (nearFloat >= 10.0) {
          financialRisk = "CRITICAL";
          score = Math.max(score, 90);
          reasonCodes.push("FINANCIAL_EXPOSURE_CRITICAL");
          reasons.push(`Financial exposure of ${nearFloat} NEAR exceeds critical threshold (>= 10 NEAR).`);
        } else if (nearFloat >= 2.0) {
          financialRisk = "HIGH";
          score = Math.max(score, 75);
          reasonCodes.push("FINANCIAL_EXPOSURE_HIGH");
          reasons.push(`Financial exposure of ${nearFloat} NEAR exceeds high threshold (>= 2 NEAR).`);
        } else if (nearFloat >= 0.25) {
          financialRisk = "MEDIUM";
          score = Math.max(score, 45);
          reasonCodes.push("FINANCIAL_EXPOSURE_MEDIUM");
          reasons.push(`Financial exposure of ${nearFloat} NEAR exceeds standard autonomous threshold.`);
        } else {
          financialRisk = "LOW";
          score = Math.max(score, 20);
        }
      }
    } catch {
      financialRisk = "HIGH";
      score = Math.max(score, 80);
      reasonCodes.push("MALFORMED_FINANCIAL_AMOUNT");
      reasons.push("Proposed financial amount is unparseable or malformed.");
    }
  }

  // 3. Resource Sensitivity
  let resourceRisk: GovernanceRiskLevel = "LOW";
  const resource = (context.resource || "").toLowerCase().trim();
  if (
    resource.includes("secret") ||
    resource.includes("credential") ||
    resource.includes("private_key")
  ) {
    resourceRisk = "CRITICAL";
    score = Math.max(score, 90);
    reasonCodes.push("SENSITIVE_RESOURCE_TARGET");
    reasons.push(`Target resource "${context.resource}" contains sensitive cryptographic credentials or secrets.`);
  } else if (resource.includes("vault") || resource.includes("wallet") || resource.includes("mandate")) {
    resourceRisk = "HIGH";
    score = Math.max(score, 65);
    reasonCodes.push("HIGH_IMPACT_RESOURCE");
    reasons.push(`Target resource "${context.resource}" interacts with financial custody vault or mandate.`);
  } else if (resource.includes("policy") || resource.includes("production")) {
    resourceRisk = "HIGH";
    score = Math.max(score, 65);
    reasonCodes.push("HIGH_IMPACT_RESOURCE");
    reasons.push(`Target resource "${context.resource}" controls organizational policy or financial authority.`);
  }

  // 4. Authority Scope
  let scopeRisk: GovernanceRiskLevel = "LOW";
  if (context.coordinationRunId && !context.mandateId) {
    scopeRisk = "MEDIUM";
    score = Math.max(score, 35);
    reasonCodes.push("MULTI_AGENT_UNBOUND_MANDATE");
    reasons.push("Multi-agent task running without directly linked active mandate.");
  }

  // Overall risk resolution: highest individual factor sets the ceiling
  let overallRisk: GovernanceRiskLevel = "LOW";
  if (
    operationTypeRisk === "CRITICAL" ||
    financialRisk === "CRITICAL" ||
    resourceRisk === "CRITICAL" ||
    score >= 85
  ) {
    overallRisk = "CRITICAL";
  } else if (
    operationTypeRisk === "HIGH" ||
    financialRisk === "HIGH" ||
    resourceRisk === "HIGH" ||
    score >= 60
  ) {
    overallRisk = "HIGH";
  } else if (
    operationTypeRisk === "MEDIUM" ||
    financialRisk === "MEDIUM" ||
    scopeRisk === "MEDIUM" ||
    score >= 35
  ) {
    overallRisk = "MEDIUM";
  }

  if (reasons.length === 0) {
    reasons.push("Standard read-only or low-risk operational procedure.");
    reasonCodes.push("STANDARD_LOW_RISK");
  }

  return {
    riskLevel: overallRisk,
    score,
    reasonCodes,
    reasons,
    factors: {
      financialExposure: financialRisk,
      operationType: operationTypeRisk,
      resourceSensitivity: resourceRisk,
      authorityScope: scopeRisk,
    },
  };
}
