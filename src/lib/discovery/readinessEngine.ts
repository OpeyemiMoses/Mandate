import { prisma } from "@/lib/db";
import {
  ReadinessReport,
  ExecutionReadiness,
  CapabilityMatchResult,
} from "./types";
import { analyzeCapabilityCoverage } from "./coverageAnalyzer";

/**
 * Execution Readiness Engine
 *
 * Synthesizes capability coverage, risk evaluations, authorization policies,
 * and integration states into a conclusive execution-readiness verdict.
 */
export async function evaluateExecutionReadiness(params: {
  userId: string;
  objectiveId?: string;
  matches: CapabilityMatchResult[];
  hasMandateMismatch?: boolean;
  mandateMismatchReason?: string;
  persistRecord?: boolean;
}): Promise<ReadinessReport> {
  const {
    userId,
    objectiveId,
    matches,
    hasMandateMismatch = false,
    mandateMismatchReason,
    persistRecord = false,
  } = params;

  const coverageReport = analyzeCapabilityCoverage({
    objectiveId,
    matches,
  });

  const approvalRequirements: string[] = [];
  const configurationRequirements: string[] = [];
  const userInputRequirements: string[] = [];
  const blockingReasons: string[] = [];
  const recommendedActions: string[] = [];

  // Check mandate issues
  if (hasMandateMismatch) {
    blockingReasons.push(mandateMismatchReason || "Financial mandate budget/recipient constraint violated.");
    recommendedActions.push("Update financial mandate or adjust objective budget constraints.");
  }

  // Inspect matches
  for (const m of matches) {
    if (m.coverageStatus === "BLOCKED") {
      blockingReasons.push(`Capability "${m.capabilityName}" is blocked by security policy or lack of access.`);
      recommendedActions.push(`Grant explicit access to "${m.toolId || m.capabilityName}" in Agent Settings.`);
    }

    if (m.coverageStatus === "AUTH_REQUIRED") {
      configurationRequirements.push(`Integration "${m.capabilityName}" requires active credentials.`);
      recommendedActions.push(`Configure authentication for "${m.capabilityName}" in Discovery Center.`);
    }

    if (m.coverageStatus === "MISSING") {
      userInputRequirements.push(`Capability "${m.capabilityName}" is not available in Mandate.`);
      recommendedActions.push(`Register an MCP server or tool adapter supporting "${m.capabilityName}".`);
    }

    if (m.coverageStatus === "USER_ACTION_REQUIRED" || m.permissionStatus === "USER_APPROVAL_REQUIRED") {
      approvalRequirements.push(
        `Step operation "${m.operationsMatched.join(", ") || m.capabilityName}" requires user approval before execution.`
      );
    }
  }

  // Determine overall readiness verdict
  let overallReadiness: ExecutionReadiness = "READY";
  let canExecute = true;

  if (blockingReasons.length > 0) {
    overallReadiness = "BLOCKED";
    canExecute = false;
  } else if (coverageReport.missingCount > 0) {
    if (coverageReport.coveredCount > 0) {
      overallReadiness = "PARTIALLY_SUPPORTED";
      canExecute = false;
    } else {
      overallReadiness = "UNSUPPORTED";
      canExecute = false;
    }
  } else if (configurationRequirements.length > 0) {
    overallReadiness = "NEEDS_CONFIGURATION";
    canExecute = false;
  } else if (userInputRequirements.length > 0) {
    overallReadiness = "NEEDS_USER_INPUT";
    canExecute = false;
  } else if (approvalRequirements.length > 0) {
    overallReadiness = "READY_WITH_APPROVALS";
    canExecute = true; // Can start, but will halt at approval gate
  } else {
    overallReadiness = "READY";
    canExecute = true;
  }

  const report: ReadinessReport = {
    objectiveId,
    overallReadiness,
    canExecute,
    coverageScore: coverageReport.coverageScore,
    coverageReport,
    approvalRequirements,
    configurationRequirements,
    userInputRequirements,
    blockingReasons,
    recommendedActions,
  };

  // Persist discovery audit record if requested
  if (persistRecord && userId) {
    try {
      const discovery = await prisma.capabilityDiscovery.create({
        data: {
          userId,
          objectiveId,
          status: "COMPLETED",
          overallReadiness,
          coverageScore: coverageReport.coverageScore,
          summary: coverageReport.summary,
          readinessDetailsJson: JSON.stringify({
            overallReadiness,
            canExecute,
            approvalRequirements,
            configurationRequirements,
            blockingReasons,
            recommendedActions,
          }),
          coverageDetailsJson: JSON.stringify(coverageReport),
          missingCapabilitiesJson: JSON.stringify(
            matches.filter((m) => m.coverageStatus === "MISSING")
          ),
          blockedCapabilitiesJson: JSON.stringify(blockingReasons),
          authRequiredJson: JSON.stringify(configurationRequirements),
          unsupportedOperationsJson: JSON.stringify(coverageReport.unsupportedOperations),
          matches: {
            create: matches.map((m) => ({
              requirementId: m.requirementId,
              capabilityId: m.capabilityId,
              agentId: m.agentId,
              toolId: m.toolId,
              integrationId: m.integrationId,
              matchScore: m.matchScore,
              matchReason: m.matchReason,
              coverageStatus: m.coverageStatus,
              permissionStatus: m.permissionStatus,
              riskClassification: m.riskClassification,
              detailsJson: JSON.stringify({ operations: m.operationsMatched }),
            })),
          },
        },
      });
    } catch (err) {
      console.error("[evaluateExecutionReadiness] Error persisting capability discovery record:", err);
    }
  }

  return report;
}

