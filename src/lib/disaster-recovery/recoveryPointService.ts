/**
 * Recovery Point & Time Objective Service (Milestone 9.4)
 * Measures real-world RPO and RTO metrics from backup manifests and restore audits.
 */

import { prisma } from "@/lib/db";
import { DisasterRecoveryMetrics } from "./types";

const TARGET_RPO_MINUTES = 60; // Max 1 hour data loss tolerance
const TARGET_RTO_MINUTES = 15; // Max 15 minutes recovery time objective

export class RecoveryPointService {
  /**
   * Computes measured RPO, RTO, and disaster recovery health metrics.
   */
  public static async getMetrics(): Promise<DisasterRecoveryMetrics> {
    const totalBackupsCount = await prisma.databaseBackupRecord.count();

    const successfulBackups = await prisma.databaseBackupRecord.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    const failedBackupsCount = await prisma.databaseBackupRecord.count({
      where: { status: "FAILED" },
    });

    const latestRestore = await prisma.databaseRestoreRecord.findFirst({
      where: { status: "COMPLETED" },
      orderBy: { startedAt: "desc" },
    });

    let measuredRpoMinutes = 0;
    let lastSuccessfulBackupAt: string | null = null;

    if (successfulBackups.length > 0) {
      const latestBackup = successfulBackups[0];
      lastSuccessfulBackupAt = latestBackup.createdAt.toISOString();
      const elapsedMs = Date.now() - new Date(latestBackup.createdAt).getTime();
      measuredRpoMinutes = Math.max(0, Math.round((elapsedMs / (1000 * 60)) * 10) / 10);
    } else {
      // If no backups exist yet, measured RPO is unavailable (flagged high)
      measuredRpoMinutes = 999;
    }

    let measuredRtoMinutes = 0;
    let lastSuccessfulRestoreAt: string | null = null;

    if (latestRestore) {
      lastSuccessfulRestoreAt = (latestRestore.completedAt || latestRestore.startedAt).toISOString();
      measuredRtoMinutes = Math.round((latestRestore.durationMs / (1000 * 60)) * 100) / 100;
    }

    const completedCount = totalBackupsCount - failedBackupsCount;
    const backupSuccessRate =
      totalBackupsCount > 0 ? Math.round((completedCount / totalBackupsCount) * 100) : 100;

    return {
      targetRpoMinutes: TARGET_RPO_MINUTES,
      targetRtoMinutes: TARGET_RTO_MINUTES,
      measuredRpoMinutes,
      measuredRtoMinutes,
      lastSuccessfulBackupAt,
      lastSuccessfulRestoreAt,
      backupSuccessRate,
      totalBackupsCount,
    };
  }
}

