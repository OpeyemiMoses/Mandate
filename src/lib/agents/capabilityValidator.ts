import { prisma } from "@/lib/db";
import { toolRegistry, registerDefaultTools } from "@/lib/tools";
import { TaskType } from "@/lib/objectives/types";
import { AgentCapabilityRegistry, CapabilityProfileData } from "./capabilityRegistry";
import { PolicyEngine } from "@/lib/governance/engine";

registerDefaultTools();

export type EligibilityVerdict =
  | "ELIGIBLE"
  | "INELIGIBLE"
  | "REQUIRES_APPROVAL"
  | "CAPABILITY_UNAVAILABLE"
  | "POLICY_DENIED";

export interface TaskEligibilityRequirement {
  taskId: string;
  stepId?: string;
  title: string;
  taskType: TaskType;
  requiredCapabilities?: string[];
  requiredTools?: string[];
  requiredIntegrations?: string[];
  network?: string;
  requiredNetwork?: string;
  riskClassification?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estimatedCostNear?: string;
  estimatedCostYocto?: string;
  financialRequired?: boolean;
}

export interface EvaluateEligibilityParams {
  agentId: string;
  userId: string;
  objectiveId: string;
  task: TaskEligibilityRequirement;
  mandateId?: string | null;
}

export interface EligibilityResult {
  verdict: EligibilityVerdict;
  isEligible: boolean;
  agentId: string;
  taskId: string;
  capabilityVersion: number;
  checks: {
    taskTypeCompatible: boolean;
    toolsAvailable: boolean;
    integrationsAvailable: boolean;
    networkCompatible: boolean;
    agentStatusActive: boolean;
    tenantOwnershipValid: boolean;
    objectiveAccessValid: boolean;
    policyPermitted: boolean;
    riskAuthorized: boolean;
    financialAuthorized: boolean;
    capabilityVersionValid: boolean;
  };
  reasons: string[];
  failureCodes: string[];
  metadata?: Record<string, any>;
}

const RISK_HIERARCHY: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * Deterministic Capability Validation Engine
 * Evaluates 11 security and capability criteria to determine agent eligibility for a task.
 * Fail-Closed: Never assumes capabilities from names or descriptions.
 */
export class AgentCapabilityValidator {
  /**
   * Deterministically evaluate agent eligibility against a task requirement
   */
  public static async evaluateEligibility(
    params: EvaluateEligibilityParams
  ): Promise<EligibilityResult> {
    const { agentId, userId, objectiveId, task, mandateId } = params;

    const reasons: string[] = [];
    const failureCodes: string[] = [];

    // 1. Fetch Agent & Profile with Tenant Ownership Verification (Check 6 & 7)
    let profile: CapabilityProfileData | null = null;
    let agent: any = null;

    try {
      profile = await AgentCapabilityRegistry.getProfile(agentId, userId);
      agent = await prisma.agent.findFirst({
        where: { id: agentId, userId },
        include: {
          wallet: true,
          mandates: { where: { status: "ACTIVE" } },
        },
      });
    } catch (e: any) {
      return {
        verdict: "INELIGIBLE",
        isEligible: false,
        agentId,
        taskId: task.taskId,
        capabilityVersion: 0,
        checks: {
          taskTypeCompatible: false,
          toolsAvailable: false,
          integrationsAvailable: false,
          networkCompatible: false,
          agentStatusActive: false,
          tenantOwnershipValid: false,
          objectiveAccessValid: false,
          policyPermitted: false,
          riskAuthorized: false,
          financialAuthorized: false,
          capabilityVersionValid: false,
        },
        reasons: [`Tenant or Agent authorization error: ${e.message}`],
        failureCodes: ["TENANT_MISMATCH_OR_AGENT_NOT_FOUND"],
      };
    }

    const tenantOwnershipValid = Boolean(agent && agent.userId === userId);
    if (!tenantOwnershipValid) {
      reasons.push(`Agent does not belong to the authenticated tenant.`);
      failureCodes.push("CROSS_TENANT_VIOLATION");
    }

    // Verify Objective ownership (Check 7)
    const objective = await prisma.objective.findFirst({
      where: { id: objectiveId, userId },
    });
    const objectiveAccessValid = Boolean(objective);
    if (!objectiveAccessValid) {
      reasons.push(`Objective "${objectiveId}" does not exist or does not belong to user.`);
      failureCodes.push("OBJECTIVE_ACCESS_DENIED");
    }

    // 2. Check 1: Task Type Compatibility
    const taskTypeCompatible = profile.supportedTaskTypes.includes(task.taskType);
    if (!taskTypeCompatible) {
      reasons.push(
        `Agent type "${profile.agentType}" does not support task type "${task.taskType}". Supported: [${profile.supportedTaskTypes.join(", ")}]`
      );
      failureCodes.push("INCOMPATIBLE_TASK_TYPE");
    }

    // 3. Check 2: Required Tool Availability
    const agentTools = new Set(profile.supportedTools);
    const missingTools: string[] = [];
    for (const toolId of task.requiredTools || []) {
      if (!agentTools.has(toolId) || !toolRegistry.has(toolId)) {
        missingTools.push(toolId);
      }
    }
    const toolsAvailable = missingTools.length === 0;
    if (!toolsAvailable) {
      reasons.push(`Agent lacks required registered tools: [${missingTools.join(", ")}]`);
      failureCodes.push("MISSING_REQUIRED_TOOLS");
    }

    // 4. Check 3: Integration Availability
    const agentIntegrations = new Set(profile.supportedIntegrations);
    const missingIntegrations: string[] = [];
    for (const integ of task.requiredIntegrations || []) {
      if (!agentIntegrations.has(integ)) {
        missingIntegrations.push(integ);
      }
    }
    const integrationsAvailable = missingIntegrations.length === 0;
    if (!integrationsAvailable) {
      reasons.push(`Missing required integrations: [${missingIntegrations.join(", ")}]`);
      failureCodes.push("MISSING_INTEGRATIONS");
    }

    // 5. Check 4: Network Compatibility
    const targetNetwork = task.network || task.requiredNetwork || "near:testnet";
    const networkCompatible = profile.supportedNetworks.includes(targetNetwork) && targetNetwork.includes("testnet");
    if (!networkCompatible) {
      reasons.push(`Network "${targetNetwork}" is incompatible with agent supported networks.`);
      failureCodes.push("GOVERNANCE_POLICY_DENIAL");
    }

    // 6. Check 5: Agent Operational Status
    const agentStatusActive = agent.status === "ACTIVE" && profile.status === "ACTIVE";
    if (!agentStatusActive) {
      reasons.push(`Agent status is "${agent.status}" (profile status: "${profile.status}"). Only ACTIVE agents are eligible.`);
      failureCodes.push("AGENT_INACTIVE_OR_SUSPENDED");
    }

    // 7. Check 9: Risk Classification
    const taskRisk = task.riskClassification || "LOW";
    const agentMaxRisk = profile.maxAuthorizedTaskRisk || "MEDIUM";
    const riskAuthorized = (RISK_HIERARCHY[taskRisk] || 1) <= (RISK_HIERARCHY[agentMaxRisk] || 2);
    if (!riskAuthorized) {
      reasons.push(`Task risk level (${taskRisk}) exceeds agent maximum authorized risk threshold (${agentMaxRisk}).`);
      failureCodes.push("RISK_THRESHOLD_EXCEEDED");
    }

    // 8. Check 10: Financial Operation Restrictions
    const isFinancial = task.taskType === "PAYMENT" || Boolean(task.financialRequired) || Boolean(task.estimatedCostNear && parseFloat(task.estimatedCostNear) > 0);
    let financialAuthorized = true;

    if (isFinancial) {
      const hasWallet = Boolean(agent.wallet && agent.wallet.nearAccountId);
      const effectiveMandateId = mandateId || objective?.mandateId;
      const hasMandate = Boolean(effectiveMandateId && agent.mandates.some((m: any) => m.id === effectiveMandateId && m.status === "ACTIVE"));

      if (!profile.financialEligibility || !hasWallet || !hasMandate) {
        financialAuthorized = false;
        reasons.push(`Financial task requires an active OutLayer TEE wallet and an ACTIVE bound spending mandate.`);
        failureCodes.push("FINANCIAL_RESTRICTION_FAILED");
      }
    }

    // 9. Check 11: Capability Version Validity
    const capabilityVersionValid = profile.capabilityVersion > 0;
    if (!capabilityVersionValid) {
      reasons.push(`Invalid capability profile version.`);
      failureCodes.push("INVALID_CAPABILITY_VERSION");
    }

    // 10. Check 8: Governance Policy Permissions
    let policyPermitted = true;
    try {
      const govResult = await PolicyEngine.evaluate({
        userId,
        agentId,
        objectiveId,
        operation: task.taskType === "PAYMENT" ? "financial_execution" : "task_execution",
        resource: task.taskId,
        parameters: { taskType: task.taskType, risk: taskRisk },
      });

      if (!govResult.allowed) {
        policyPermitted = false;
        reasons.push(`Governance Policy Denied: ${govResult.humanExplanation}`);
        failureCodes.push("GOVERNANCE_POLICY_DENIAL");
      }
    } catch {
      // If governance evaluation encounters unhandled exception, fail-closed
      policyPermitted = false;
      reasons.push("Governance Policy evaluation failed.");
      failureCodes.push("GOVERNANCE_ERROR");
    }

    const checks = {
      taskTypeCompatible,
      toolsAvailable,
      integrationsAvailable,
      networkCompatible,
      agentStatusActive,
      tenantOwnershipValid,
      objectiveAccessValid,
      policyPermitted,
      riskAuthorized,
      financialAuthorized,
      capabilityVersionValid,
    };

    const allPassed = Object.values(checks).every(Boolean);

    // Determine structured verdict
    let verdict: EligibilityVerdict = "ELIGIBLE";
    if (!allPassed) {
      if (failureCodes.includes("GOVERNANCE_POLICY_DENIAL")) {
        verdict = "POLICY_DENIED";
      } else if (failureCodes.includes("MISSING_REQUIRED_TOOLS") || failureCodes.includes("INCOMPATIBLE_TASK_TYPE")) {
        verdict = "CAPABILITY_UNAVAILABLE";
      } else if (taskRisk === "HIGH" || taskRisk === "CRITICAL" || isFinancial) {
        verdict = "REQUIRES_APPROVAL";
      } else {
        verdict = "INELIGIBLE";
      }
    }

    return {
      verdict,
      isEligible: allPassed,
      agentId,
      taskId: task.taskId,
      capabilityVersion: profile.capabilityVersion,
      checks,
      reasons,
      failureCodes,
      metadata: {
        agentName: agent.name,
        agentType: agent.type,
        taskType: task.taskType,
        isFinancial,
      },
    };
  }
}
