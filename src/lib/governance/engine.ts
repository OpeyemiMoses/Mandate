import crypto from "crypto";
import { prisma } from "@/lib/db";
import {
  PolicyEvaluationContext,
  PolicyEvaluationResult,
  PolicyDecisionOutcome,
  PolicyCheckResult,
  PolicyRuleDefinition,
  GovernanceRiskLevel,
} from "./types";
import { classifyOperationRisk } from "./risk";
import { evaluateRule } from "./rules";
import { computeActionPayloadHash } from "./approvalManager";
import { recordAuditEvent } from "@/lib/auditLedger";

export class PolicyEngine {
  /**
   * Deterministic, centralized policy evaluation entrypoint.
   * Fail-Closed: any error or unhandled state defaults strictly to DENY.
   */
  public static async evaluate(
    context: PolicyEvaluationContext
  ): Promise<PolicyEvaluationResult> {
    const evaluationId = `eval_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const now = context.now || new Date();
    const checks: PolicyCheckResult[] = [];
    const reasonCodes: string[] = [];
    const matchedPolicyIds: string[] = [];
    const policyVersions: Record<string, number> = {};

    try {
      // 1. Risk Assessment
      const risk = classifyOperationRisk(context);
      reasonCodes.push(...risk.reasonCodes);

      // 2. Load Active Policies for User
      // Query system-level policies as well as user policies
      // Precedence: isSystem DESC, priority ASC (lower number = higher priority), createdAt ASC
      const policies = await prisma.governancePolicy.findMany({
        where: {
          OR: [
            { isSystem: true, status: "ACTIVE" },
            { userId: context.userId, status: "ACTIVE" },
          ],
        },
        include: {
          rules: {
            where: { isEnforced: true },
            orderBy: { order: "asc" },
          },
          exceptions: {
            where: {
              userId: context.userId,
              status: "ACTIVE",
              expiresAt: { gt: now },
            },
          },
        },
        orderBy: [
          { isSystem: "desc" },
          { priority: "asc" },
          { createdAt: "asc" },
        ],
      });

      // Filter out policies that have expired or been revoked
      const activePolicies = policies.filter((p) => {
        if (p.status !== "ACTIVE") return false;
        if (p.revokedAt) return false;
        if (p.expiresAt && now > p.expiresAt) return false;
        return true;
      });

      // 3. Evaluate Policies against Context Scope
      let finalDecision: PolicyDecisionOutcome = "ALLOW";
      let requireApproval = false;
      let approvalReason: string | undefined;
      let approvalThresholdYocto: string | undefined;
      const applicableLimits: Record<string, any> = {};

      for (const policy of activePolicies) {
        // Check scope applicability
        const applies = PolicyEngine.isPolicyApplicable(policy, context);
        if (!applies) continue;

        // Check if there is an active exception for this policy
        const hasException = policy.exceptions.some((ex) => {
          if (ex.agentId && context.agentId && ex.agentId !== context.agentId) return false;
          if (ex.resource && context.resource && ex.resource !== context.resource) return false;
          return true;
        });

        // System policies CANNOT have exceptions
        if (hasException && !policy.isSystem) {
          checks.push({
            policyId: policy.id,
            policyName: policy.name,
            passed: true,
            message: `Policy exception active for "${policy.name}"`,
          });
          continue;
        }

        matchedPolicyIds.push(policy.id);
        policyVersions[policy.id] = policy.version;

        // Evaluate all rules in this policy
        for (const dbRule of policy.rules) {
          let parsedValue: unknown;
          try {
            parsedValue = JSON.parse(dbRule.valueJson);
          } catch {
            parsedValue = dbRule.valueJson;
          }

          const ruleDef: PolicyRuleDefinition = {
            id: dbRule.id,
            ruleType: dbRule.ruleType as any,
            operator: dbRule.operator as any,
            field: dbRule.field,
            value: parsedValue,
            action: dbRule.action as any,
            description: dbRule.description || undefined,
            isEnforced: dbRule.isEnforced,
          };

          const check = evaluateRule(ruleDef, context);
          check.policyId = policy.id;
          check.policyName = policy.name;
          checks.push(check);

          if (!check.passed) {
            reasonCodes.push(`RULE_${dbRule.ruleType}_TRIGGERED`);

            // Merge decision with precedence: DENY > ESCALATE > REQUIRE_APPROVAL > ALLOW_WITH_LIMITS > ALLOW
            if (check.action === "DENY") {
              finalDecision = "DENY";
            } else if (check.action === "ESCALATE") {
              if (finalDecision !== "DENY") {
                finalDecision = "ESCALATE";
              }
            } else if (check.action === "REQUIRE_APPROVAL") {
              requireApproval = true;
              approvalReason = check.message;
              if (dbRule.field.toLowerCase().includes("amount")) {
                approvalThresholdYocto = String(parsedValue);
              }
              if (finalDecision !== "DENY" && finalDecision !== "ESCALATE") {
                finalDecision = "REQUIRE_APPROVAL";
              }
            } else if (check.action === "LIMIT") {
              if (finalDecision === "ALLOW") {
                finalDecision = "ALLOW_WITH_LIMITS";
              }
              applicableLimits[dbRule.field] = parsedValue;
            }
          }
        }
      }

      // 4. Critical Risk Escalation Gate
      // If operation risk is CRITICAL and no explicit rule denied it, require human approval or escalation
      if (risk.riskLevel === "CRITICAL" && finalDecision === "ALLOW") {
        finalDecision = "REQUIRE_APPROVAL";
        requireApproval = true;
        approvalReason = "System Guardrail: Critical-risk operations mandate explicit human approval.";
        reasonCodes.push("CRITICAL_RISK_MANDATORY_APPROVAL");
      }

      // 5. Build Human Explanation
      let explanation = "";
      switch (finalDecision) {
        case "ALLOW":
          explanation = "Operation verified against all applicable policies. Authorized to proceed.";
          break;
        case "ALLOW_WITH_LIMITS":
          explanation = "Operation approved subject to enforced parameter boundaries.";
          break;
        case "REQUIRE_APPROVAL":
          explanation = approvalReason || "Operation requires explicit human authorization before execution.";
          break;
        case "ESCALATE":
          explanation = "Operation triggered high-risk governance flags and has been escalated to administration.";
          break;
        case "DENY":
          explanation = checks.find((c) => !c.passed && c.action === "DENY")?.message || "Operation denied by policy rules.";
          break;
      }

      // Compute Action Payload Hash for approval binding
      const actionPayloadHash = computeActionPayloadHash({
        operation: context.operation,
        recipient: context.recipient,
        amountYocto: context.amountYocto,
        toolId: context.toolId,
        mandateId: context.mandateId,
        parameters: context.parameters,
        policyId: matchedPolicyIds[0],
        policyVersion: matchedPolicyIds[0] ? policyVersions[matchedPolicyIds[0]] : 1,
      });

      const result: PolicyEvaluationResult = {
        evaluationId,
        decision: finalDecision,
        riskLevel: risk.riskLevel,
        allowed: finalDecision === "ALLOW" || finalDecision === "ALLOW_WITH_LIMITS",
        requiresApproval: requireApproval || finalDecision === "REQUIRE_APPROVAL",
        reasonCodes: Array.from(new Set(reasonCodes)),
        humanExplanation: explanation,
        matchedPolicyIds,
        policyVersions,
        applicableLimits,
        approvalRequirements: {
          required: requireApproval || finalDecision === "REQUIRE_APPROVAL",
          reason: approvalReason,
          thresholdYocto: approvalThresholdYocto,
          actionPayloadHash,
          expiresInSeconds: 3600, // 1 hour approval TTL
        },
        checks,
        timestamp: now.toISOString(),
        isSimulated: Boolean(context.isSimulated),
      };

      // 6. Persistence & Compliance Tracking (unless skipped or simulated)
      if (!context.skipPersistence && !context.isSimulated) {
        await PolicyEngine.persistEvaluation(context, result);
      }

      return result;
    } catch (err: any) {
      // FAIL CLOSED: On engine failure, strictly DENY
      const failClosedResult: PolicyEvaluationResult = {
        evaluationId,
        decision: "DENY",
        riskLevel: "CRITICAL",
        allowed: false,
        requiresApproval: false,
        reasonCodes: ["POLICY_ENGINE_FAIL_CLOSED", err.message || "UNKNOWN_ERROR"],
        humanExplanation: `Fail-closed enforcement: Policy evaluation failed (${err.message}). Operation denied.`,
        matchedPolicyIds: [],
        policyVersions: {},
        applicableLimits: {},
        approvalRequirements: { required: false },
        checks: [
          {
            passed: false,
            action: "DENY",
            message: `Evaluation engine exception: ${err.message}`,
          },
        ],
        timestamp: now.toISOString(),
        isSimulated: Boolean(context.isSimulated),
      };

      if (!context.skipPersistence && !context.isSimulated) {
        try {
          await PolicyEngine.persistEvaluation(context, failClosedResult);
        } catch {}
      }

      return failClosedResult;
    }
  }

  /**
   * Evaluates if a policy applies to a given context based on scope and targetId
   */
  private static isPolicyApplicable(policy: any, context: PolicyEvaluationContext): boolean {
    if (policy.scope === "USER") {
      return !policy.targetId || policy.targetId === context.userId;
    }
    if (policy.scope === "AGENT") {
      return !policy.targetId || policy.targetId === context.agentId;
    }
    if (policy.scope === "OBJECTIVE") {
      return !policy.targetId || policy.targetId === context.objectiveId;
    }
    if (policy.scope === "COORDINATION_RUN") {
      return !policy.targetId || policy.targetId === context.coordinationRunId;
    }
    if (policy.scope === "MANDATE") {
      return !policy.targetId || policy.targetId === context.mandateId;
    }
    if (policy.scope === "TOOL") {
      return !policy.targetId || policy.targetId === context.toolId;
    }
    if (policy.scope === "INTEGRATION") {
      return !policy.targetId || policy.targetId === context.resource;
    }
    return true;
  }

  /**
   * Persists evaluation records, violations, and cryptographic audit ledger events
   */
  private static async persistEvaluation(
    context: PolicyEvaluationContext,
    result: PolicyEvaluationResult
  ): Promise<void> {
    try {
      // 1. Record PolicyEvaluation
      await prisma.policyEvaluation.create({
        data: {
          evaluationId: result.evaluationId,
          userId: context.userId,
          agentId: context.agentId || null,
          objectiveId: context.objectiveId || null,
          coordinationRunId: context.coordinationRunId || null,
          mandateId: context.mandateId || null,
          toolId: context.toolId || null,
          operation: context.operation || null,
          resource: context.resource || null,
          decision: result.decision,
          riskLevel: result.riskLevel,
          reasonCodesJson: JSON.stringify(result.reasonCodes),
          matchedPolicyIdsJson: JSON.stringify(result.matchedPolicyIds),
          policyVersionsJson: JSON.stringify(result.policyVersions),
          applicableLimitsJson: JSON.stringify(result.applicableLimits),
          approvalRequirementsJson: JSON.stringify(result.approvalRequirements),
          evidenceJson: JSON.stringify(result.checks),
          contextJson: JSON.stringify({
            operation: context.operation,
            recipient: context.recipient,
            amountYocto: context.amountYocto,
            toolId: context.toolId,
          }),
          isSimulated: result.isSimulated,
          policyId: result.matchedPolicyIds[0] || null,
        },
      });

      // 2. If DENY or ESCALATE, record in PolicyViolation
      if (result.decision === "DENY" || result.decision === "ESCALATE") {
        const primaryPolicyId = result.matchedPolicyIds[0];
        if (primaryPolicyId) {
          await prisma.policyViolation.create({
            data: {
              userId: context.userId,
              policyId: primaryPolicyId,
              agentId: context.agentId || null,
              objectiveId: context.objectiveId || null,
              coordinationRunId: context.coordinationRunId || null,
              toolId: context.toolId || null,
              operation: context.operation || null,
              severity: result.riskLevel,
              actionAttempted: context.operation || context.toolId || "unspecified_operation",
              violationReason: result.humanExplanation,
              contextJson: JSON.stringify({
                recipient: context.recipient,
                amountYocto: context.amountYocto,
                reasons: result.reasonCodes,
              }),
              escalated: result.decision === "ESCALATE",
            },
          });
        }
      }

      // 3. Cryptographic Audit Ledger Entry (Phase 10 Compliance Evidence)
      await recordAuditEvent({
        userId: context.userId,
        eventType: `GOVERNANCE_EVALUATION_${result.decision}`,
        verdict: result.decision,
        reasonCode: result.reasonCodes[0] || "POLICY_EVALUATION",
        description: `Policy evaluation: ${result.decision} (${result.humanExplanation})`,
        details: {
          evaluationId: result.evaluationId,
          riskLevel: result.riskLevel,
          matchedPolicyIds: result.matchedPolicyIds,
          policyVersions: result.policyVersions,
          operation: context.operation,
          recipient: context.recipient,
          amountYocto: context.amountYocto,
          reasonCodes: result.reasonCodes,
        },
        agentId: context.agentId || undefined,
        mandateId: context.mandateId || undefined,
      });
    } catch (e) {
      console.error("[PolicyEngine] Telemetry persistence warning:", e);
    }
  }
}

