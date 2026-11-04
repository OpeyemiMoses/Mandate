/**
 * Emergency Pause Service (Milestone 9.4)
 * Provides targeted and platform-wide emergency pause and safe resumption controls.
 */

import { prisma } from "@/lib/db";
import { OperationalControlService } from "./operationalControlService";
import { OperatorRole, ResumeExecutionParams } from "./types";

export class EmergencyPauseService {
  /**
   * Pauses all new financial executions immediately while preserving pending recovery data & reservations.
   */
  public static async pauseFinancialExecution(params: {
    actorId: string;
    actorRole: OperatorRole;
    isAgent?: boolean;
    reason: string;
    incidentId?: string;
    ipAddress?: string;
  }) {
    return await OperationalControlService.transitionState({
      newMode: "FINANCIAL_EXECUTION_PAUSED",
      actionType: "EMERGENCY_PAUSE_FINANCIAL",
      actorId: params.actorId,
      actorRole: params.actorRole,
      isAgent: params.isAgent,
      reason: params.reason,
      incidentId: params.incidentId,
      ipAddress: params.ipAddress,
      metadata: { initiatedAt: new Date().toISOString() },
    });
  }

  /**
   * Pauses all autonomous agent workflows and tool invocations.
   */
  public static async pauseAllAgentExecution(params: {
    actorId: string;
    actorRole: OperatorRole;
    isAgent?: boolean;
    reason: string;
    incidentId?: string;
    ipAddress?: string;
  }) {
    return await OperationalControlService.transitionState({
      newMode: "ALL_AGENT_EXECUTION_PAUSED",
      actionType: "EMERGENCY_PAUSE_ALL",
      actorId: params.actorId,
      actorRole: params.actorRole,
      isAgent: params.isAgent,
      reason: params.reason,
      incidentId: params.incidentId,
      ipAddress: params.ipAddress,
      metadata: { initiatedAt: new Date().toISOString() },
    });
  }

  /**
   * Universal pause execution method supporting targeted options.
   */
  public static async pauseExecution(params: {
    pauseType?: "FINANCIAL_ONLY" | "ALL_AGENTS";
    reason: string;
    actorId: string;
    actorRole: OperatorRole;
    isAgent?: boolean;
    incidentId?: string;
    ipAddress?: string;
  }) {
    if (params.pauseType === "ALL_AGENTS") {
      return this.pauseAllAgentExecution(params);
    }
    return this.pauseFinancialExecution(params);
  }

  /**
   * Resumes normal execution after verifying preconditions and security state.
   */
  public static async resumeExecution(params: ResumeExecutionParams) {
    const currentMode = await OperationalControlService.getCurrentMode();

    // Check for unresolved SEV-1 incidents unless forced
    if (!params.forceOverrideUnacknowledgedIncidents) {
      const activeSev1 = await prisma.incident.count({
        where: {
          severity: { in: ["SEV-1", "SEV1"] },
          status: { in: ["DETECTED", "TRIGGERED", "ESCALATED", "MANUAL_INTERVENTION_REQUIRED"] },
        },
      });

      if (activeSev1 > 0) {
        throw new Error(
          `PRECONDITION_FAILED: Cannot resume execution while ${activeSev1} unacknowledged or active SEV-1 incident(s) remain open.`
        );
      }
    }

    let targetMode: any = params.targetMode || "NORMAL";
    if (params.target === "ALL_AGENTS" && currentMode === "ALL_AGENT_EXECUTION_PAUSED") {
      targetMode = "NORMAL";
    } else if (params.target === "FINANCIAL" && currentMode === "FINANCIAL_EXECUTION_PAUSED") {
      targetMode = "NORMAL";
    }

    return await OperationalControlService.transitionState({
      newMode: targetMode,
      actionType: "RESUME_EXECUTION",
      actorId: params.actorId,
      actorRole: params.actorRole,
      isAgent: params.isAgent,
      reason: params.reason,
      ipAddress: params.ipAddress,
      metadata: {
        previousMode: currentMode,
        resumedAt: new Date().toISOString(),
        ...params.metadata,
      },
    });
  }
}
