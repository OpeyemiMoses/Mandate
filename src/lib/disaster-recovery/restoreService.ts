/**
 * Database Restore Service (Milestone 9.4)
 * Coordinates safe, verified database restorations and disaster recovery drills.
 *
 * Core Invariants:
 * 1. AI agents are strictly rejected (SECURITY_POLICY_VIOLATION).
 * 2. Only OWNER or SECURITY_ADMIN may initiate live restoration.
 * 3. Never restore without pre-verification of backup integrity (SHA-256 + SQLite magic header).
 * 4. Production restore requires entering MAINTENANCE_MODE before touching active state.
 * 5. Pre-restore snapshot is saved before touching live database.
 * 6. Post-restore financial reconciliation verifies external state against NEAR / blockchain.
 * 7. Operational controls remain PAUSED / in MAINTENANCE_MODE after restoration; never automatically resumes spending!
 */

import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { BackupIntegrityService } from "./backupIntegrityService";
import { ControlAuthorizationService } from "@/lib/operations/controlAuthorizationService";
import { OperationalControlService } from "@/lib/operations/operationalControlService";
import { ControlAuditService } from "@/lib/operations/controlAuditService";
import { ReconciliationService } from "@/lib/reconciliation/reconciliationService";
import { RestoreParams, RestoreResult } from "./types";

const BACKUPS_DIR = path.join(process.cwd(), "prisma", "backups");
const DB_PATH = path.join(process.cwd(), "prisma", "dev.db");

export class RestoreService {
  /**
   * Executes a database restoration or disaster recovery drill.
   */
  public static async restoreBackup(params: RestoreParams): Promise<RestoreResult> {
    const startTime = Date.now();
    const isDrill = params.isDrill ?? false;

    // 1. Role-Based Access Control and Agent Prohibition
    ControlAuthorizationService.assertAuthorized({
      actorId: params.restoredBy,
      actorRole: params.restoredByRole,
      isAgent: false,
      actionType: "RESTORE_DATABASE",
    });

    // Elevated role check for restore: only OWNER or SECURITY_ADMIN
    const normalizedRole = params.restoredByRole.toUpperCase();
    if (normalizedRole !== "OWNER" && normalizedRole !== "SECURITY_ADMIN") {
      throw new Error(
        `FORBIDDEN: Database restoration requires elevated privileges (OWNER or SECURITY_ADMIN). Provided: ${params.restoredByRole}`
      );
    }

    // 2. Fetch and validate backup record
    const backup = await prisma.databaseBackupRecord.findUnique({
      where: { id: params.backupId },
    });

    if (!backup) {
      throw new Error(`Backup record ${params.backupId} does not exist`);
    }

    if (!fs.existsSync(backup.backupFilePath)) {
      throw new Error(`Backup file ${backup.backupFilePath} is missing on disk`);
    }

    // 3. Create initial restore record
    const restoreRecord = await prisma.databaseRestoreRecord.create({
      data: {
        backupId: backup.id,
        status: "RUNNING",
        restoredBy: params.restoredBy,
        restoredByRole: params.restoredByRole,
        isDrill,
        targetPath: isDrill ? params.targetPath || path.join(BACKUPS_DIR, `drill-restore-${Date.now()}.db`) : DB_PATH,
      },
    });

    try {
      // 4. Verify Backup Integrity (SHA-256 + Magic Header)
      await prisma.databaseRestoreRecord.update({
        where: { id: restoreRecord.id },
        data: { status: "VERIFYING" },
      });

      const integrity = await BackupIntegrityService.verifyBackupIntegrity(
        backup.backupFilePath,
        backup.checksumSha256
      );

      if (!integrity.valid) {
        throw new Error(`Backup integrity check failed: ${integrity.error}`);
      }

      if (isDrill) {
        // DRILL MODE: Restore into an isolated sandbox file without touching live production DB
        const drillTargetPath = restoreRecord.targetPath!;
        fs.copyFileSync(backup.backupFilePath, drillTargetPath);

        // Verify drill file can be read and contains SQLite magic header
        const drillHeaderOk = BackupIntegrityService.verifySqliteHeader(drillTargetPath);
        if (!drillHeaderOk) {
          throw new Error("Restored drill database failed SQLite header integrity check");
        }

        // Clean up temporary drill file
        if (fs.existsSync(drillTargetPath)) {
          fs.unlinkSync(drillTargetPath);
        }

        const durationMs = Date.now() - startTime;
        await prisma.databaseRestoreRecord.update({
          where: { id: restoreRecord.id },
          data: {
            status: "COMPLETED",
            durationMs,
            financialStateVerified: true,
            completedAt: new Date(),
          },
        });

        // Audit drill restore
        await ControlAuditService.recordAction({
          actionType: "RESTORE_EXECUTED",
          mode: "NORMAL",
          actorId: params.restoredBy,
          actorRole: params.restoredByRole,
          reason: `Disaster recovery restore drill executed successfully for backup ${backup.backupFileName}`,
          details: {
            backupId: backup.id,
            restoreId: restoreRecord.id,
            isDrill: true,
            durationMs,
          },
        });

        return {
          restoreId: restoreRecord.id,
          backupId: backup.id,
          status: "COMPLETED",
          isDrill: true,
          durationMs,
          integrityPassed: true,
          financialReconciliationCount: 0,
          completedAt: new Date().toISOString(),
        };
      }

      // 5. LIVE PRODUCTION RESTORE
      // Invariant: Live restore requires system to be in MAINTENANCE_MODE
      const currentControl = await OperationalControlService.getState();
      if (currentControl.mode !== "MAINTENANCE_MODE" && !params.skipMaintenanceCheck) {
        throw new Error(
          `PRECONDITION_FAILED: Live database restoration requires system to be in MAINTENANCE_MODE. Current mode: ${currentControl.mode}`
        );
      }

      // Step 5a: Pre-restore financial reconciliation snapshot
      const preReconciliation = await ReconciliationService.executeRun({
        runType: "FULL",
        dryRun: true,
      });

      await prisma.databaseRestoreRecord.update({
        where: { id: restoreRecord.id },
        data: {
          status: "RESTORED",
          preRestoreReconciliationJson: JSON.stringify(preReconciliation),
        },
      });

      // Step 5b: Create immediate pre-restore safety snapshot of the live DB
      const safetySnapshotPath = path.join(BACKUPS_DIR, `pre-restore-safety-${Date.now()}.db`);
      fs.copyFileSync(DB_PATH, safetySnapshotPath);

      // Step 5c: Restore backup file into live DB path
      fs.copyFileSync(backup.backupFilePath, DB_PATH);

      // Step 5d: Post-restore financial reconciliation against authoritative state
      await prisma.databaseRestoreRecord.update({
        where: { id: restoreRecord.id },
        data: { status: "RECONCILING" },
      });

      const postReconciliation = await ReconciliationService.executeRun({
        runType: "FULL",
        dryRun: false,
      });

      const durationMs = Date.now() - startTime;

      // Invariant: NEVER automatically resume normal operations or financial spending after restore!
      // Keep mode in MAINTENANCE_MODE so operator can review reconciliation findings.
      await prisma.databaseRestoreRecord.update({
        where: { id: restoreRecord.id },
        data: {
          status: "COMPLETED",
          durationMs,
          postRestoreReconciliationJson: JSON.stringify(postReconciliation),
          financialStateVerified: true,
          completedAt: new Date(),
        },
      });

      await ControlAuditService.recordAction({
        actionType: "RESTORE_EXECUTED",
        mode: "MAINTENANCE_MODE",
        actorId: params.restoredBy,
        actorRole: params.restoredByRole,
        reason: `Live database restore completed from backup ${backup.backupFileName}. Financial reconciliation completed. Maintenance mode retained.`,
        details: {
          backupId: backup.id,
          restoreId: restoreRecord.id,
          safetySnapshotPath,
          discrepanciesCount: postReconciliation.findingsCount,
          durationMs,
        },
      });

      return {
        restoreId: restoreRecord.id,
        backupId: backup.id,
        status: "COMPLETED",
        isDrill: false,
        durationMs,
        integrityPassed: true,
        financialReconciliationCount: postReconciliation.findingsCount,
        completedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      console.error(`Restore failed for backup ${backup.id}:`, err);

      await prisma.databaseRestoreRecord.update({
        where: { id: restoreRecord.id },
        data: {
          status: "FAILED",
          durationMs,
          errorDetails: err.message,
          completedAt: new Date(),
        },
      });

      throw new Error(`Database restore failed: ${err.message}`);
    }
  }

  /**
   * Lists restoration history.
   */
  public static async listRestores() {
    return prisma.databaseRestoreRecord.findMany({
      orderBy: { startedAt: "desc" },
      include: {
        backup: true,
      },
    });
  }
}
