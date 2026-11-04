import {
  UniversalCapability,
  CapabilityRequirement,
  CapabilityMatchResult,
  CoverageStatus,
  RiskClassification,
  PermissionLevel,
} from "./types";
import { evaluateCapabilityPermission } from "./permissionMapper";

/**
 * Capability Matching Engine
 *
 * Evaluates functional compatibility, operation schemas, permission checks,
 * financial authority constraints, and operational health.
 *
 * Match score (0.0 - 1.0) serves strictly as a ranking aid, NOT an authorization decision.
 */
export async function matchCapabilities(params: {
  userId: string;
  requirements: CapabilityRequirement[];
  discoveredCapabilities: UniversalCapability[];
  agentId?: string;
  hasActiveMandate?: boolean;
}): Promise<CapabilityMatchResult[]> {
  const {
    userId,
    requirements,
    discoveredCapabilities,
    agentId,
    hasActiveMandate = false,
  } = params;

  const matches: CapabilityMatchResult[] = [];

  for (const req of requirements) {
    const candidates: Array<{
      capability: UniversalCapability;
      score: number;
      reason: string;
      matchedOps: string[];
    }> = [];

    const reqNameLower = req.name.toLowerCase();
    const reqOpLower = (req.operation || req.name).toLowerCase();

    for (const cap of discoveredCapabilities) {
      let score = 0.0;
      const matchedOps: string[] = [];
      const reasons: string[] = [];

      // 1. Exact operation name match
      const exactOp = cap.operations.find(
        (op) =>
          op.name.toLowerCase() === reqOpLower ||
          op.name.toLowerCase().includes(reqOpLower) ||
          reqOpLower.includes(op.name.toLowerCase())
      );

      if (exactOp) {
        score += 0.5;
        matchedOps.push(exactOp.name);
        reasons.push(`Direct operation match on "${exactOp.name}"`);
      }

      // 2. Category match
      if (req.category && cap.category === req.category) {
        score += 0.3;
        reasons.push(`Category alignment (${cap.category})`);
      } else if (!req.category) {
        // Neutral category boost
        score += 0.15;
      }

      // 3. Keyword / semantic relevance
      const capText = `${cap.name} ${cap.description} ${cap.operations.map((o) => o.name).join(" ")}`.toLowerCase();
      if (
        capText.includes(reqNameLower) ||
        reqNameLower.split(" ").some((w) => w.length > 3 && capText.includes(w))
      ) {
        score += 0.2;
        reasons.push("Functional descriptor alignment");
      }

      // 4. Required agent type match
      if (req.requiredAgentType && cap.agentType === req.requiredAgentType) {
        score += 0.3;
        reasons.push(`Target agent type match (${req.requiredAgentType})`);
      }

      // 5. Health penalties
      if (cap.status === "DEGRADED") {
        score -= 0.15;
        reasons.push("Capability is currently degraded");
      } else if (cap.status === "UNAVAILABLE" || cap.status === "DISABLED") {
        score -= 0.4;
        reasons.push(`Capability is ${cap.status.toLowerCase()}`);
      } else if (cap.status === "AUTH_REQUIRED") {
        score -= 0.2;
        reasons.push("Authentication / integration credentials required");
      }

      const normalizedScore = Math.max(0.0, Math.min(1.0, score));

      if (normalizedScore > 0.3 || exactOp) {
        candidates.push({
          capability: cap,
          score: normalizedScore,
          reason: reasons.join("; ") || "Compatible capability discovered",
          matchedOps: matchedOps.length > 0 ? matchedOps : [cap.operations[0]?.name || "default"],
        });
      }
    }

    // Sort by match score descending
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      // Missing capability - cannot be fulfilled
      matches.push({
        requirementId: req.id,
        capabilityId: "unsupported",
        capabilityName: req.name,
        category: req.category || "EXTERNAL_INTEGRATION",
        matchScore: 0.0,
        matchReason: `No registered tool or agent capability matches "${req.name}".`,
        coverageStatus: "MISSING",
        permissionStatus: "DENIED",
        riskClassification: "LOW",
        operationsMatched: [],
        missingRequirements: [req.name],
      });
      continue;
    }

    // Top candidate
    const best = candidates[0];
    const topCap = best.capability;

    // Find operation risk and required permission
    const matchedOp = topCap.operations.find((o) => best.matchedOps.includes(o.name)) || topCap.operations[0];
    const reqPerm: PermissionLevel = req.requiredPermission || matchedOp?.permissionLevel || "READ";
    const riskClass: RiskClassification = matchedOp?.riskClassification || "LOW";

    // Permission evaluation
    const permResult = await evaluateCapabilityPermission({
      userId,
      agentId,
      toolId: topCap.toolId,
      requiredPermission: reqPerm,
      riskClassification: riskClass,
      hasActiveMandate,
    });

    let coverageStatus: CoverageStatus = "COVERED";

    if (topCap.status === "AUTH_REQUIRED") {
      coverageStatus = "AUTH_REQUIRED";
    } else if (topCap.status === "DISABLED" || permResult.status === "DENIED") {
      coverageStatus = "BLOCKED";
    } else if (permResult.requiresUserApproval || riskClass === "CRITICAL") {
      coverageStatus = "USER_ACTION_REQUIRED";
    } else if (topCap.status === "DEGRADED" || best.score < 0.6) {
      coverageStatus = "PARTIALLY_COVERED";
    }

    matches.push({
      requirementId: req.id,
      capabilityId: topCap.id,
      capabilityName: topCap.name,
      category: topCap.category,
      toolId: topCap.toolId,
      agentId,
      integrationId: topCap.integrationConnectionId,
      matchScore: Math.round(best.score * 100) / 100,
      matchReason: best.reason,
      coverageStatus,
      permissionStatus: permResult.status,
      riskClassification: riskClass,
      operationsMatched: best.matchedOps,
    });
  }

  return matches;
}

