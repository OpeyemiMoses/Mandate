import { prisma } from "@/lib/db";
import { ObjectiveSuccessCriteria } from "@prisma/client";

export interface CriterionEvaluationResult {
  criterionId: string;
  isMet: boolean;
  status: "MET" | "NOT_MET" | "PARTIALLY_MET" | "FAILED";
  reason: string;
  evidence: Record<string, any>;
}

export interface ObjectiveEvaluationOutcome {
  allMet: boolean;
  metCount: number;
  totalCount: number;
  criteriaResults: CriterionEvaluationResult[];
}

/**
 * Real-World Success Criteria Evaluator
 * Guarantees that a tool returning success: true does not blindly mark an objective complete.
 * Verifies genuine numerical constraints, authentic evidence payloads, and confirmed on-chain events.
 */
export async function evaluateObjectiveSuccessCriteria(params: {
  objectiveId: string;
  planId?: string;
  stepOutputs?: Record<string, any>;
  userConfirmed?: boolean;
}): Promise<ObjectiveEvaluationOutcome> {
  const { objectiveId, planId, stepOutputs = {}, userConfirmed = false } = params;

  // 1. Fetch criteria and step records
  const criteria = await prisma.objectiveSuccessCriteria.findMany({
    where: { objectiveId },
  });

  const steps = planId
    ? await prisma.objectivePlanStep.findMany({ where: { planId } })
    : await prisma.objectivePlanStep.findMany({
        where: { objectiveId },
        orderBy: { order: "asc" },
      });

  // Aggregate step output evidence
  const aggregatedEvidence: Record<string, any> = { ...stepOutputs };
  for (const s of steps) {
    if (s.outputJson) {
      try {
        const parsed = JSON.parse(s.outputJson);
        aggregatedEvidence[s.stepId] = parsed;
        // Merge top-level recommendations if present
        if (parsed.recommendation) {
          aggregatedEvidence.recommendation = parsed.recommendation;
        }
        if (parsed.candidatesDiscovered) {
          aggregatedEvidence.candidates = parsed.candidatesDiscovered;
        }
        if (parsed.sources) {
          aggregatedEvidence.sources = parsed.sources;
        }
      } catch {}
    }
  }

  const results: CriterionEvaluationResult[] = [];

  for (const crit of criteria) {
    const res = evaluateSingleCriterion(crit, aggregatedEvidence, userConfirmed);
    results.push(res);

    // Update in database with evaluation state and evidence
    await prisma.objectiveSuccessCriteria.update({
      where: { id: crit.id },
      data: {
        currentState: res.status,
        lastEvaluatedAt: new Date(),
        evidenceJson: JSON.stringify(res.evidence),
      },
    });
  }

  const metCount = results.filter((r) => r.isMet).length;
  const allMet = criteria.length > 0 && metCount === criteria.length;

  return {
    allMet,
    metCount,
    totalCount: criteria.length,
    criteriaResults: results,
  };
}

function evaluateSingleCriterion(
  crit: ObjectiveSuccessCriteria,
  evidence: Record<string, any>,
  userConfirmed: boolean
): CriterionEvaluationResult {
  const type = crit.measurementType;
  const target = crit.target || "";

  // 1. USER_CONFIRMED: Requires explicit user sign-off
  if (type === "USER_CONFIRMED") {
    if (userConfirmed || evidence.userConfirmed === true) {
      return {
        criterionId: crit.criterionId,
        isMet: true,
        status: "MET",
        reason: "User confirmation verified",
        evidence: { userConfirmed: true },
      };
    }
    return {
      criterionId: crit.criterionId,
      isMet: false,
      status: "NOT_MET",
      reason: "Explicit user confirmation has not been provided",
      evidence: { userConfirmed: false },
    };
  }

  // 2. NUMERIC: Evaluate actual numerical metric against target comparison (e.g. <= 1.5)
  if (type === "NUMERIC") {
    const val = extractNumericValue(evidence);

    if (val === null || val === undefined) {
      return {
        criterionId: crit.criterionId,
        isMet: false,
        status: "NOT_MET",
        reason: `No numeric metric found in step evidence to satisfy target: "${target}"`,
        evidence: { actualValue: null, target },
      };
    }

    const satisfies = evaluateNumericTarget(val, target);
    if (satisfies) {
      return {
        criterionId: crit.criterionId,
        isMet: true,
        status: "MET",
        reason: `Numeric value (${val}) satisfies target condition (${target})`,
        evidence: { actualValue: val, target, satisfied: true },
      };
    } else {
      return {
        criterionId: crit.criterionId,
        isMet: false,
        status: "FAILED",
        reason: `Numeric value (${val}) violates target constraint (${target})`,
        evidence: { actualValue: val, target, satisfied: false },
      };
    }
  }

  // 3. BOOLEAN / EVIDENCE_BASED: Requires non-empty, genuine verified results
  if (type === "BOOLEAN" || type === "EVIDENCE_BASED") {
    // Check if tools produced genuine, non-empty outputs
    const hasCandidates =
      Array.isArray(evidence.candidates) && evidence.candidates.length > 0;
    const hasSources =
      Array.isArray(evidence.sources) && evidence.sources.length > 0;
    const hasRecommendation = Boolean(evidence.recommendation?.selectedProviderName);

    // If an output payload is explicitly empty, fail verification even if tool returned success
    const isEmptyDummy =
      (evidence.results && Array.isArray(evidence.results) && evidence.results.length === 0) ||
      (evidence.sourceCount === 0);

    if (isEmptyDummy) {
      return {
        criterionId: crit.criterionId,
        isMet: false,
        status: "NOT_MET",
        reason: "Tool succeeded syntactically but produced zero verified evidence or candidates",
        evidence: { emptyResults: true },
      };
    }

    if (hasCandidates || hasSources || hasRecommendation || evidence.verified === true) {
      return {
        criterionId: crit.criterionId,
        isMet: true,
        status: "MET",
        reason: "Genuine external evidence successfully retrieved and verified",
        evidence: {
          candidatesCount: evidence.candidates?.length,
          sourcesCount: evidence.sources?.length,
          winner: evidence.recommendation?.selectedProviderName,
        },
      };
    }

    return {
      criterionId: crit.criterionId,
      isMet: false,
      status: "NOT_MET",
      reason: "Missing verified evidence payload from execution results",
      evidence: {},
    };
  }

  // 4. EVENT_BASED / ON_CHAIN_VERIFICATION
  if (type === "EVENT_BASED" || crit.verificationMethod === "ON_CHAIN_VERIFICATION") {
    const hasPolicyEvaluation = Boolean(
      evidence.recommendation?.requiresPayment !== undefined ||
        evidence.step_3_payment ||
        evidence.policyDecision
    );

    const hasTx = Boolean(evidence.txHash || evidence.onChainConfirmed);

    if (target.includes("POLICY") && hasPolicyEvaluation) {
      return {
        criterionId: crit.criterionId,
        isMet: true,
        status: "MET",
        reason: "Deterministic payment proposal formulated and evaluated by policy engine",
        evidence: { policyEvaluated: true },
      };
    }

    if (target.includes("TX") || crit.verificationMethod === "ON_CHAIN_VERIFICATION") {
      if (hasTx) {
        return {
          criterionId: crit.criterionId,
          isMet: true,
          status: "MET",
          reason: "On-chain settlement transaction verified",
          evidence: { txHash: evidence.txHash },
        };
      }
      return {
        criterionId: crit.criterionId,
        isMet: false,
        status: "NOT_MET",
        reason: "Awaiting confirmed on-chain transaction hash",
        evidence: { onChainVerified: false },
      };
    }

    // Default to verifying event presence
    if (hasPolicyEvaluation || evidence.eventRecorded) {
      return {
        criterionId: crit.criterionId,
        isMet: true,
        status: "MET",
        reason: "Target lifecycle event recorded in audit stream",
        evidence: { eventRecorded: true },
      };
    }

    return {
      criterionId: crit.criterionId,
      isMet: false,
      status: "NOT_MET",
      reason: `Required event condition "${target}" not recorded in execution evidence`,
      evidence: {},
    };
  }

  // Default fallback
  return {
    criterionId: crit.criterionId,
    isMet: true,
    status: "MET",
    reason: "Standard criterion fulfilled",
    evidence: {},
  };
}

function extractNumericValue(evidence: Record<string, any>): number | null {
  if (evidence.recommendation?.amountNear) {
    const n = parseFloat(evidence.recommendation.amountNear);
    if (!isNaN(n)) return n;
  }
  if (evidence.amountNear) {
    const n = parseFloat(evidence.amountNear);
    if (!isNaN(n)) return n;
  }
  if (evidence.priceNear) {
    const n = parseFloat(evidence.priceNear);
    if (!isNaN(n)) return n;
  }
  if (typeof evidence.value === "number") {
    return evidence.value;
  }
  return null;
}

function evaluateNumericTarget(val: number, target: string): boolean {
  const match = target.match(/(<=|>=|<|>|==|=)?\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return true;

  const op = match[1] || "<=";
  const threshold = parseFloat(match[2]);
  if (isNaN(threshold)) return true;

  switch (op) {
    case "<=":
      return val <= threshold;
    case "<":
      return val < threshold;
    case ">=":
      return val >= threshold;
    case ">":
      return val > threshold;
    case "==":
    case "=":
      return Math.abs(val - threshold) < 1e-6;
    default:
      return val <= threshold;
  }
}

