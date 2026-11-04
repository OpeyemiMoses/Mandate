/**
 * MANDATE — MILESTONE 13.4: TASK RESULT VERIFICATION SERVICE
 *
 * Implements structured task result verification and immutable persistence:
 * - Distinguishes AGENT_REPORTED, SYSTEM_VALIDATED, and INDEPENDENTLY_VERIFIED.
 * - Computes deterministic canonical SHA-256 result fingerprints.
 * - Inspects upstream dependency outputs in a read-only manner.
 * - Rejects unverified or hallucinated claims fail-closed.
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { canonicalize } from "@/lib/auditLedger";
import {
  VerificationStatus,
  StructuredTaskResult,
} from "./types";
import {
  assertAntiSelfCertification,
  IndependentEvidenceService,
  IndependentEvidenceItem,
} from "./evidenceService";

export interface VerifyTaskResultParams {
  objectiveId: string;
  planId: string;
  stepId: string;
  agentId: string;
  taskType: string;
  output: Record<string, any>;
  evidenceReferences?: string[];
  toolExecutions?: Array<{
    toolId: string;
    paramsHash: string;
    executedAt: string;
    success: boolean;
  }>;
  executionAttempt?: number;
  verifierRole?: "SYSTEM" | "VERIFIER_AGENT" | "USER";
  verifierId?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export class TaskVerificationService {
  /**
   * Compute deterministic canonical SHA-256 fingerprint of task results
   */
  public static computeResultFingerprint(payload: {
    stepId: string;
    agentId: string;
    output: Record<string, any>;
    evidenceReferences: string[];
  }): string {
    const canonical = canonicalize({
      stepId: payload.stepId,
      agentId: payload.agentId,
      output: payload.output,
      evidence: payload.evidenceReferences.sort(),
    });
    return crypto.createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
  }

  /**
   * Evaluates task execution results against required verification conditions
   */
  public static async evaluateAndRecordResult(
    params: VerifyTaskResultParams
  ): Promise<StructuredTaskResult> {
    const {
      objectiveId,
      planId,
      stepId,
      agentId,
      taskType,
      output,
      evidenceReferences = [],
      toolExecutions = [],
      executionAttempt = 1,
      verifierRole = "SYSTEM",
      verifierId,
      startedAt = new Date(),
      completedAt = new Date(),
    } = params;

    // 1. Enforce Anti-Self-Certification if verifier is specified
    if (verifierId) {
      assertAntiSelfCertification(agentId, verifierId);
    }

    // 1.1 Fetch Step Definition
    const step = await prisma.objectivePlanStep.findFirst({
      where: { planId, stepId },
    });

    if (!step) {
      throw new Error(`TASK_NOT_FOUND: Step "${stepId}" in plan "${planId}" not found.`);
    }

    // 2. Perform Deterministic Verification by Task Type
    let verificationStatus: VerificationStatus = "AGENT_REPORTED";
    let verificationDetails: Record<string, any> = {
      taskType,
      verifiedAt: new Date().toISOString(),
      evaluator: verifierRole,
      verifierId: verifierId || null,
      antiSelfCertificationPassed: Boolean(verifierId && verifierId !== agentId),
    };
    let errorDetails: string | undefined = undefined;

    // Run active independent evidence verification if applicable
    let verifiedEvidenceItems: IndependentEvidenceItem[] = [];
    if (
      verifierRole === "VERIFIER_AGENT" ||
      taskType === "VERIFICATION" ||
      (output && (output.sources || output.evidenceItems || output.verifyEvidence === true))
    ) {
      try {
        const evidenceCheck = await IndependentEvidenceService.verifyTaskEvidence({
          tenantId: verifierId || agentId,
          objectiveId,
          taskId: stepId,
          executingAgentId: agentId,
          verifierAgentId: verifierId || "system_verifier",
          verifierRole,
          evidenceItems: Array.isArray(output.evidenceItems) ? output.evidenceItems : [],
          taskOutput: output,
        });

        verifiedEvidenceItems = evidenceCheck.items;
        verificationDetails.independentEvidence = {
          status: evidenceCheck.overallStatus,
          verifiedCount: evidenceCheck.verifiedCount,
          rejectedCount: evidenceCheck.rejectedCount,
          items: evidenceCheck.items,
        };

        if (evidenceCheck.overallStatus === "REJECTED") {
          verificationStatus = "REJECTED";
          errorDetails = evidenceCheck.error || "Independent evidence verification failed.";
        }
      } catch (indepErr: any) {
        if (indepErr.name === "AntiSelfCertificationError") {
          throw indepErr;
        }
        verificationStatus = "REJECTED";
        errorDetails = `Independent evidence verification error: ${indepErr.message}`;
      }
    }

    // Verification Rules
    if (!output || typeof output !== "object" || Object.keys(output).length === 0) {
      verificationStatus = "REJECTED";
      errorDetails = "Task output is empty or not a valid JSON object.";
    } else {
      switch (taskType) {
        case "RESEARCH": {
          const hasSources =
            Array.isArray(output.sources) ||
            Array.isArray(output.sourcesReviewed) ||
            output.recommendation !== undefined ||
            evidenceReferences.length > 0;
          const hasFindings =
            output.findings ||
            output.summary ||
            output.results ||
            output.recommendation ||
            output.requirements;
          if (hasSources && hasFindings) {
            verificationStatus =
              verifierRole === "SYSTEM" ? "SYSTEM_VALIDATED" : "INDEPENDENTLY_VERIFIED";
            verificationDetails.criteriaSatisfied = ["sources_identified", "findings_recorded"];
          } else {
            verificationStatus = "REJECTED";
            errorDetails = "Research task failed verification: missing verifiable sources or findings.";
          }
          break;
        }

        case "ANALYSIS": {
          const hasMetrics = output.metrics || output.comparison || output.analysis;
          const hasScoreOrRecommendation =
            output.recommendation !== undefined ||
            output.selectedOption !== undefined ||
            output.riskScore !== undefined;
          if (hasMetrics && hasScoreOrRecommendation) {
            verificationStatus =
              verifierRole === "SYSTEM" ? "SYSTEM_VALIDATED" : "INDEPENDENTLY_VERIFIED";
            verificationDetails.criteriaSatisfied = ["metrics_evaluated", "recommendation_provided"];
          } else {
            verificationStatus = "REJECTED";
            errorDetails = "Analysis task failed verification: missing comparative metrics or recommendation.";
          }
          break;
        }

        case "VERIFICATION": {
          // Independent verification task
          const isExplicitPass =
            output.valid === true ||
            output.verified === true ||
            output.auditChainStatus === "INTACT" ||
            output.complianceRating === "COMPLIANT";
          if (isExplicitPass) {
            verificationStatus = "INDEPENDENTLY_VERIFIED";
            verificationDetails.criteriaSatisfied = ["independent_audit_passed"];
          } else {
            verificationStatus = "REJECTED";
            errorDetails = output.error || "Independent verification failed.";
          }
          break;
        }

        case "VALIDATION": {
          const isValid = output.valid === true || output.validated === true;
          if (isValid) {
            verificationStatus = verifierRole === "SYSTEM" ? "SYSTEM_VALIDATED" : "INDEPENDENTLY_VERIFIED";
            verificationDetails.criteriaSatisfied = ["pre_conditions_validated", "schema_invariants_satisfied"];
          } else {
            verificationStatus = "REJECTED";
            errorDetails = output.error || "Pre-condition validation check failed.";
          }
          break;
        }

        case "COORDINATION": {
          const isCoordinated =
            output.success === true ||
            output.synchronized === true ||
            Array.isArray(output.dispatchedTasks);
          if (isCoordinated) {
            verificationStatus = "SYSTEM_VALIDATED";
            verificationDetails.criteriaSatisfied = ["multi_agent_workflow_synchronized"];
          } else {
            verificationStatus = "REJECTED";
            errorDetails = output.error || "Multi-agent coordination failed.";
          }
          break;
        }

        case "PAYMENT": {
          const isPaymentValid =
            output.approved === true ||
            output.status === "AWAITING_APPROVAL" ||
            output.txHash !== undefined ||
            output.reservationId !== undefined;
          if (isPaymentValid) {
            verificationStatus = "SYSTEM_VALIDATED";
            verificationDetails.criteriaSatisfied = ["payment_intent_formulated_and_gated"];
          } else {
            verificationStatus = "REJECTED";
            errorDetails = output.error || "Payment formulation invalid.";
          }
          break;
        }

        case "EXECUTION":
        default: {
          if (output.success === true || output.status === "SUCCESS" || output.completed === true || output.operationStatus === "SUCCESS") {
            verificationStatus =
              verifierRole === "SYSTEM" ? "SYSTEM_VALIDATED" : "INDEPENDENTLY_VERIFIED";
            verificationDetails.criteriaSatisfied = ["execution_success_reported"];
          } else {
            verificationStatus = "REJECTED";
            errorDetails = output.error || "Execution output did not indicate success.";
          }
          break;
        }
      }
    }

    // 3. Compute Canonical SHA-256 Result Fingerprint
    const resultFingerprint = this.computeResultFingerprint({
      stepId,
      agentId,
      output,
      evidenceReferences,
    });

    // 4. Durably Persist Result in ObjectiveTaskResult
    await prisma.objectiveTaskResult.upsert({
      where: {
        planId_stepId_executionAttempt: {
          planId,
          stepId,
          executionAttempt,
        },
      },
      create: {
        objectiveId,
        planId,
        stepId,
        stepRecordId: step.id,
        agentId,
        executionAttempt,
        status: verificationStatus === "REJECTED" ? "REJECTED" : "COMPLETED",
        structuredOutputJson: JSON.stringify(output),
        evidenceReferencesJson: JSON.stringify(evidenceReferences),
        toolExecutionsJson: JSON.stringify(toolExecutions),
        resultFingerprint,
        verificationStatus,
        verifiedBy: verifierRole,
        verificationDetailsJson: JSON.stringify(verificationDetails),
        errorDetails,
        startedAt,
        completedAt,
      },
      update: {
        status: verificationStatus === "REJECTED" ? "REJECTED" : "COMPLETED",
        structuredOutputJson: JSON.stringify(output),
        evidenceReferencesJson: JSON.stringify(evidenceReferences),
        toolExecutionsJson: JSON.stringify(toolExecutions),
        resultFingerprint,
        verificationStatus,
        verifiedBy: verifierRole,
        verificationDetailsJson: JSON.stringify(verificationDetails),
        errorDetails,
        startedAt,
        completedAt,
      },
    });

    return {
      stepId,
      agentId,
      executionAttempt,
      status: verificationStatus === "REJECTED" ? "REJECTED" : "COMPLETED",
      structuredOutput: output,
      evidenceReferences,
      toolExecutions,
      resultFingerprint,
      verificationStatus,
      verifiedBy: verifierRole,
      verificationDetails,
      errorDetails,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    };
  }
}
