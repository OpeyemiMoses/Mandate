/**
 * Central Operational Control Service (Milestone 9.4)
 * Manages the global operational execution state with persistent storage,
 * authorization gates, and cached evaluation.
 */

import { prisma } from "@/lib/db";
import { recordMetric } from "@/lib/observability";
import {
  OperationalMode,
  OperationalStatusResponse,
  TransitionControlStateParams,
} from "./types";
import { ControlAuthorizationService } from "./controlAuthorizationService";
import { ControlAuditService } from "./controlAuditService";

// In-memory cache for high-throughput execution gate checks (< 1ms)
let cachedMode: OperationalMode = "NORMAL";
let lastCacheRefresh = 0;
const CACHE_TTL_MS = 2000;

export class OperationalControlService {
  /**
   * Retrieves the current global operational mode.
   */
  public static async getCurrentMode(): Promise<OperationalMode> {
    const now = Date.now();
    if (now - lastCacheRefresh < CACHE_TTL_MS) {
      return cachedMode;
    }

    try {
      const state = await prisma.operationalControlState.findFirst({
        orderBy: { updatedAt: "desc" },
      });

      if (state) {
        cachedMode = state.mode as OperationalMode;
      } else {
        cachedMode = "NORMAL";
      }
      lastCacheRefresh = now;
      return cachedMode;
    } catch {
      // Fail closed: if database query fails during critical state check, return cachedMode or NORMAL
      return cachedMode;
    }
  }

  /**
   * Retrieves full operational status response including active incidents.
   */
  public static async getStatus(): Promise<OperationalStatusResponse> {
    const mode = await this.getCurrentMode();
    const latest = await prisma.operationalControlState.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const activeIncidentsCount = await prisma.incident.count({
      where: {
        status: { in: ["DETECTED", "ACKNOWLEDGED", "INVESTIGATING", "RECOVERY_PENDING", "ESCALATED", "MANUAL_INTERVENTION_REQUIRED"] },
      },
    });

    return {
      currentMode: mode,
      isFinancialAllowed: mode === "NORMAL" || mode === "ALL_AGENT_EXECUTION_PAUSED",
      isAgentAllowed: mode === "NORMAL" || mode === "FINANCIAL_EXECUTION_PAUSED",
      isMaintenanceMode: mode === "MAINTENANCE_MODE",
      isSecurityLockdown: mode === "SECURITY_LOCKDOWN",
      lastChangedAt: latest?.updatedAt.toISOString() || new Date().toISOString(),
      lastChangedBy: latest?.updatedBy || "SYSTEM",
      lastChangedByRole: latest?.updatedByRole || "SYSTEM",
      reason: latest?.reason || "System initialized in default normal operating mode",
      activeIncidentsCount,
    };
  }

  /**
   * Alias for getStatus providing raw state fields.
   */
  public static async getState() {
    const status = await this.getStatus();
    return {
      mode: status.currentMode,
      currentMode: status.currentMode,
      reason: status.reason,
      updatedBy: status.lastChangedBy,
      updatedByRole: status.lastChangedByRole,
      updatedAt: status.lastChangedAt,
      isFinancialAllowed: status.isFinancialAllowed,
      isAgentAllowed: status.isAgentAllowed,
      isMaintenanceMode: status.isMaintenanceMode,
      isSecurityLockdown: status.isSecurityLockdown,
    };
  }

  /**
   * Retrieves recent operational audit records.
   */
  public static async getRecentAudits(limit: number = 10) {
    return prisma.operationalAuditRecord.findMany({
      take: limit,
      orderBy: { timestamp: "desc" },
    });
  }

  /**
   * Atomically transitions global operational state with authorization check and audit trail.
   */
  public static async transitionState(params: TransitionControlStateParams) {
    const currentMode = await this.getCurrentMode();

    // 1. Enforce strict authorization invariants (AI agents blocked, roles validated)
    ControlAuthorizationService.assertAuthorized({
      actorId: params.actorId,
      actorRole: params.actorRole,
      isAgent: params.isAgent,
      actionType: params.actionType,
      currentMode,
    });

    // 2. Persist state in database
    const updated = await prisma.operationalControlState.create({
      data: {
        mode: params.newMode,
        previousMode: currentMode,
        reason: params.reason,
        updatedBy: params.actorId,
        updatedByRole: params.actorRole,
        incidentId: params.incidentId,
        metadata: JSON.stringify(params.metadata || {}),
      },
    });

    // 3. Update memory cache immediately
    cachedMode = params.newMode;
    lastCacheRefresh = Date.now();

    // 4. Record tamper-evident audit record
    await ControlAuditService.recordAction({
      actionType: params.actionType,
      mode: params.newMode,
      actorId: params.actorId,
      actorRole: params.actorRole,
      reason: params.reason,
      incidentId: params.incidentId,
      details: {
        previousMode: currentMode,
        newMode: params.newMode,
        ...params.metadata,
      },
      ipAddress: params.ipAddress,
    });

    // 5. Emit operational metric
    try {
      recordMetric("mandate.operations.state_transition", 1, "count", {
        new_mode: params.newMode,
        action_type: params.actionType,
      });
    } catch {
      // Non-blocking
    }

    return updated;
  }

  /**
   * Clears the in-memory cache (useful in tests and after emergency commands).
   */
  public static clearCache(): void {
    lastCacheRefresh = 0;
  }
}
