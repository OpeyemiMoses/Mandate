import { CoverageReport, CapabilityMatchResult } from "./types";

/**
 * Capability Coverage Analyzer
 *
 * Evaluates whether an objective's required capabilities are covered by
 * registered tools and active integrations.
 */
export function analyzeCapabilityCoverage(params: {
  objectiveId?: string;
  matches: CapabilityMatchResult[];
}): CoverageReport {
  const { objectiveId, matches } = params;

  if (matches.length === 0) {
    return {
      objectiveId,
      totalRequirements: 0,
      coveredCount: 0,
      partiallyCoveredCount: 0,
      missingCount: 0,
      blockedCount: 0,
      authRequiredCount: 0,
      coverageScore: 1.0,
      matches: [],
      unsupportedOperations: [],
      summary: "No external capabilities required for this objective.",
    };
  }

  let coveredCount = 0;
  let partiallyCoveredCount = 0;
  let missingCount = 0;
  let blockedCount = 0;
  let authRequiredCount = 0;
  const unsupportedOperations: string[] = [];

  for (const m of matches) {
    switch (m.coverageStatus) {
      case "COVERED":
      case "USER_ACTION_REQUIRED": // Covered functionally, but requires approval gate
        coveredCount++;
        break;
      case "PARTIALLY_COVERED":
        partiallyCoveredCount++;
        break;
      case "AUTH_REQUIRED":
        authRequiredCount++;
        unsupportedOperations.push(`${m.capabilityName} (Auth Required)`);
        break;
      case "BLOCKED":
        blockedCount++;
        unsupportedOperations.push(`${m.capabilityName} (Blocked)`);
        break;
      case "MISSING":
      default:
        missingCount++;
        unsupportedOperations.push(m.capabilityName);
        break;
    }
  }

  const totalRequirements = matches.length;
  // Weighted score
  const rawScore =
    (coveredCount * 1.0 + partiallyCoveredCount * 0.5 + authRequiredCount * 0.25) /
    totalRequirements;
  const coverageScore = Math.round(rawScore * 100) / 100;

  let summary = "";
  if (missingCount === 0 && blockedCount === 0 && authRequiredCount === 0) {
    summary = `All ${totalRequirements} required capabilities are fully discovered and supported.`;
  } else if (missingCount > 0) {
    summary = `${coveredCount}/${totalRequirements} capabilities covered. ${missingCount} required capability/operation(s) are missing from the registry: [${unsupportedOperations.join(", ")}].`;
  } else if (authRequiredCount > 0) {
    summary = `${coveredCount}/${totalRequirements} capabilities covered. ${authRequiredCount} integration(s) require credentials or authentication setup.`;
  } else if (blockedCount > 0) {
    summary = `Execution blocked: ${blockedCount} required capability/operation(s) denied or restricted by policy.`;
  } else {
    summary = `${coveredCount}/${totalRequirements} capabilities covered with partial support.`;
  }

  return {
    objectiveId,
    totalRequirements,
    coveredCount,
    partiallyCoveredCount,
    missingCount,
    blockedCount,
    authRequiredCount,
    coverageScore,
    matches,
    unsupportedOperations,
    summary,
  };
}

