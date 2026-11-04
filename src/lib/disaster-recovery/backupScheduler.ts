/**
 * Disaster Recovery Backup Scheduler (Milestone 9.4)
 * Triggers scheduled backups and validates RPO compliance.
 */

import { BackupService } from "./backupService";
import { RecoveryPointService } from "./recoveryPointService";

export class BackupScheduler {
  /**
   * Checks if an automated backup is overdue based on RPO thresholds and triggers one if needed.
   */
  public static async runScheduledCheck(): Promise<{ triggered: boolean; reason: string }> {
    const metrics = await RecoveryPointService.getMetrics();

    if (metrics.measuredRpoMinutes >= metrics.targetRpoMinutes || metrics.totalBackupsCount === 0) {
      await BackupService.createBackup({
        backupType: "FULL",
        trigger: "SCHEDULED",
        createdBy: "SYSTEM_SCHEDULER",
      });
      return {
        triggered: true,
        reason: `RPO threshold exceeded: measured ${metrics.measuredRpoMinutes}m >= target ${metrics.targetRpoMinutes}m`,
      };
    }

    return {
      triggered: false,
      reason: `RPO healthy: measured ${metrics.measuredRpoMinutes}m < target ${metrics.targetRpoMinutes}m`,
    };
  }
}

