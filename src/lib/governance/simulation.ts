import { PolicyEngine } from "./engine";
import { PolicyEvaluationContext, PolicyEvaluationResult } from "./types";

export interface SimulationReport {
  simulated: true;
  evaluationId: string;
  decision: PolicyEvaluationResult["decision"];
  riskLevel: PolicyEvaluationResult["riskLevel"];
  allowed: boolean;
  requiresApproval: boolean;
  explanation: string;
  matchedPolicies: string[];
  matchedRules: {
    ruleType: string;
    passed: boolean;
    action?: string;
    message: string;
  }[];
  deniedConditions: string[];
  approvalRequirements: PolicyEvaluationResult["approvalRequirements"];
  applicableLimits: PolicyEvaluationResult["applicableLimits"];
  timestamp: string;
}

export class PolicySimulationService {
  /**
   * Evaluates a proposed operation in full simulation mode.
   * STRICT GUARANTEE: Never reserves budget, never calls external tools,
   * never sends messages, and never creates side effects.
   */
  public static async simulate(
    context: Omit<PolicyEvaluationContext, "isSimulated" | "skipPersistence">
  ): Promise<SimulationReport> {
    const evalResult = await PolicyEngine.evaluate({
      ...context,
      isSimulated: true,
      skipPersistence: true,
    });

    const deniedConditions = evalResult.checks
      .filter((c) => !c.passed)
      .map((c) => c.message);

    return {
      simulated: true,
      evaluationId: evalResult.evaluationId,
      decision: evalResult.decision,
      riskLevel: evalResult.riskLevel,
      allowed: evalResult.allowed,
      requiresApproval: evalResult.requiresApproval,
      explanation: evalResult.humanExplanation,
      matchedPolicies: evalResult.matchedPolicyIds,
      matchedRules: evalResult.checks.map((c) => ({
        ruleType: c.ruleType || "UNKNOWN_RULE",
        passed: c.passed,
        action: c.action,
        message: c.message,
      })),
      deniedConditions,
      approvalRequirements: evalResult.approvalRequirements,
      applicableLimits: evalResult.applicableLimits,
      timestamp: evalResult.timestamp,
    };
  }
}

