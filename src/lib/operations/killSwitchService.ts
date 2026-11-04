/**
 * Kill Switch & Security Lockdown Service (Milestone 9.4)
 * Provides an immediate fail-closed panic button for security breaches or catastrophic failures.
 */

import { prisma } from "@/lib/db";
import { IncidentDetectionService } from "@/lib/incidents/incidentDetectionService";
import { OperationalControlService } from "./operationalControlService";
import { OperatorRole } from "./types";

export class KillSwitchService {
  /**
   * Activates immediate platform-wide security lockdown.
   * Halts all execution, terminates worker leases, and opens a SEV-1 incident.
   */
  public static async triggerSecurityLockdown(params: {
    actorId: string;
    actorRole: OperatorRole;
    isAgent?: boolean;
    reason: string;
    incidentId?: string;
    ipAddress?: string;
  }) {
    let incidentId = params.incidentId;

    // Automatically create SEV-1 incident if none linked
    if (!incidentId) {
      let incidentActorId = params.actorId;
      const userExists = await prisma.user.findUnique({
        where: { id: params.actorId },
        select: { id: true },
      });
      if (!userExists) {
        const fallback = await prisma.user.findFirst({ select: { id: true } });
        if (fallback) incidentActorId = fallback.id;
      }

      const incident = await IncidentDetectionService.createIncident({
        tenantId: incidentActorId,
        title: `CRITICAL: Security Lockdown Activated`,
        description: `Operational kill switch activated by ${params.actorId} (${params.actorRole}). Reason: ${params.reason}`,
        category: "SYSTEM_DEGRADATION",
        severity: "SEV-1",
        source: "MANUAL",
        actorId: incidentActorId,
        actorType: "OPERATOR",
        metadata: { killSwitchTriggered: true },
      });
      incidentId = incident.id;
    }

    return await OperationalControlService.transitionState({
      newMode: "SECURITY_LOCKDOWN",
      actionType: "TRIGGER_SECURITY_LOCKDOWN",
      actorId: params.actorId,
      actorRole: params.actorRole,
      isAgent: params.isAgent,
      reason: params.reason,
      incidentId,
      ipAddress: params.ipAddress,
      metadata: {
        lockdownTriggeredAt: new Date().toISOString(),
        incidentId,
      },
    });
  }

  /**
   * Alias for triggerSecurityLockdown
   */
  public static async activateKillSwitch(params: {
    actorId: string;
    actorRole: OperatorRole;
    isAgent?: boolean;
    reason: string;
    incidentId?: string;
    ipAddress?: string;
  }) {
    return this.triggerSecurityLockdown(params);
  }

  /**
   * Alias for releaseSecurityLockdown
   */
  public static async releaseKillSwitch(params: {
    actorId: string;
    actorRole: OperatorRole;
    isAgent?: boolean;
    reason: string;
    targetMode?: "NORMAL" | "FINANCIAL_EXECUTION_PAUSED";
    forceOverride?: boolean;
    ipAddress?: string;
  }) {
    return this.releaseSecurityLockdown(params);
  }

  /**
   * Releases security lockdown under elevated authority and confirmed incident resolution.
   */
  public static async releaseSecurityLockdown(params: {
    actorId: string;
    actorRole: OperatorRole;
    isAgent?: boolean;
    reason: string;
    targetMode?: "NORMAL" | "FINANCIAL_EXECUTION_PAUSED";
    forceOverride?: boolean;
    ipAddress?: string;
  }) {
    // Check for unresolved SEV-1 incidents unless explicit operator override is provided
    if (!params.forceOverride) {
      const unresolvedSev1 = await prisma.incident.count({
        where: {
          severity: "SEV-1",
          status: { in: ["DETECTED", "ESCALATED", "MANUAL_INTERVENTION_REQUIRED"] },
        },
      });

      if (unresolvedSev1 > 0) {
        throw new Error(
          `SECURITY_LOCKDOWN_RELEASE_BLOCKED: Cannot release lockdown while ${unresolvedSev1} unresolved SEV-1 incident(s) remain open.`
        );
      }
    }

    const targetMode = params.targetMode || "NORMAL";

    return await OperationalControlService.transitionState({
      newMode: targetMode,
      actionType: "RELEASE_SECURITY_LOCKDOWN",
      actorId: params.actorId,
      actorRole: params.actorRole,
      isAgent: params.isAgent,
      reason: params.reason,
      ipAddress: params.ipAddress,
      metadata: {
        lockdownReleasedAt: new Date().toISOString(),
        targetMode,
      },
    });
  }
}
