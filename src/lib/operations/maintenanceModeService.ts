/**
 * Maintenance Mode Service (Milestone 9.4)
 * Coordinates scheduled or emergency maintenance windows and queue draining.
 */

import { OperationalControlService } from "./operationalControlService";
import { OperatorRole } from "./types";

export class MaintenanceModeService {
  /**
   * Enters maintenance mode, blocking incoming executions and beginning graceful worker drain.
   */
  public static async enterMaintenance(params: {
    actorId: string;
    actorRole: OperatorRole;
    isAgent?: boolean;
    reason: string;
    estimatedDurationMinutes?: number;
    ipAddress?: string;
  }) {
    return await OperationalControlService.transitionState({
      newMode: "MAINTENANCE_MODE",
      actionType: "ENTER_MAINTENANCE",
      actorId: params.actorId,
      actorRole: params.actorRole,
      isAgent: params.isAgent,
      reason: params.reason,
      ipAddress: params.ipAddress,
      metadata: {
        estimatedDurationMinutes: params.estimatedDurationMinutes || 60,
        maintenanceStartedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Exits maintenance mode and restores normal operations.
   */
  public static async exitMaintenance(params: {
    actorId: string;
    actorRole: OperatorRole;
    isAgent?: boolean;
    reason: string;
    ipAddress?: string;
  }) {
    return await OperationalControlService.transitionState({
      newMode: "NORMAL",
      actionType: "EXIT_MAINTENANCE",
      actorId: params.actorId,
      actorRole: params.actorRole,
      isAgent: params.isAgent,
      reason: params.reason,
      ipAddress: params.ipAddress,
      metadata: { maintenanceEndedAt: new Date().toISOString() },
    });
  }

  /**
   * Quick check for maintenance mode.
   */
  public static async isUnderMaintenance(): Promise<boolean> {
    const mode = await OperationalControlService.getCurrentMode();
    return mode === "MAINTENANCE_MODE";
  }
}

