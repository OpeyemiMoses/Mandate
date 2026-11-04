/**
 * Database Backup Service (Milestone 9.4)
 * Executes zero-downtime, fully consistent SQLite online backups via VACUUM INTO.
 * Verifies SHA-256 checksums and SQLite header magic bytes.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { BackupIntegrityService } from "./backupIntegrityService";
import { ControlAuditService } from "@/lib/operations/controlAuditService";
import { BackupResult, CreateBackupParams } from "./types";

const BACKUPS_DIR = path.join(process.cwd(), "prisma", "backups");
const DEFAULT_RETENTION_COUNT = 10;

export class BackupService {
  /**
   * Ensures the backups directory exists.
   */
  private static ensureBackupsDirectory(): void {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
  }

  /**
   * Executes a consistent SQLite online backup using VACUUM INTO.
   */
  public static async createBackup(params: CreateBackupParams = {}): Promise<BackupResult> {
    this.ensureBackupsDirectory();

    const timestamp = Date.now();
    const nonce = crypto.randomBytes(4).toString("hex");
    const fileName = `mandate-backup-${timestamp}-${nonce}.db`;
    const filePath = path.join(BACKUPS_DIR, fileName);

    const createdBy = params.createdBy || "SYSTEM";
    const trigger = params.trigger || "MANUAL";
    const backupType = params.backupType || "FULL";
    const startTime = Date.now();

    // 1. Create initial backup record in RUNNING state
    const record = await prisma.databaseBackupRecord.create({
      data: {
        backupFileName: fileName,
        backupFilePath: filePath,
        backupType,
        status: "RUNNING",
        sizeBytes: 0,
        checksumSha256: "PENDING",
        createdBy,
        trigger,
        isEncrypted: params.isEncrypted || false,
        metadata: JSON.stringify(params.metadata || {}),
      },
    });

    try {
      // 2. Execute SQLite VACUUM INTO for consistent online snapshot
      // Note: If the file already exists, SQLite will throw an error, so ensure clean path
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      await prisma.$executeRawUnsafe(`VACUUM INTO '${filePath}'`);

      const durationMs = Date.now() - startTime;

      // 3. Verify file was created
      if (!fs.existsSync(filePath)) {
        throw new Error(`Backup file ${filePath} was not created by VACUUM INTO`);
      }

      const stat = fs.statSync(filePath);
      const sizeBytes = stat.size;

      // 4. Verify SQLite header magic bytes
      const hasValidHeader = BackupIntegrityService.verifySqliteHeader(filePath);
      if (!hasValidHeader) {
        throw new Error("Created backup file has invalid SQLite format magic header");
      }

      // 5. Compute SHA-256 Checksum
      const checksumSha256 = await BackupIntegrityService.computeFileChecksum(filePath);

      // 6. Update database record to COMPLETED
      await prisma.databaseBackupRecord.update({
        where: { id: record.id },
        data: {
          status: "COMPLETED",
          sizeBytes,
          checksumSha256,
          durationMs,
        },
      });

      // 7. Record immutable audit log
      await ControlAuditService.recordAction({
        actionType: "BACKUP_CREATED",
        mode: "NORMAL",
        actorId: createdBy,
        actorRole: createdBy === "SYSTEM" ? "SYSTEM" : "OPERATOR",
        reason: `Online database backup ${fileName} created successfully (${sizeBytes} bytes, ${durationMs}ms)`,
        details: {
          backupId: record.id,
          fileName,
          sizeBytes,
          checksumSha256,
          trigger,
          durationMs,
        },
      });

      // 8. Apply retention policy asynchronously (keep last 10)
      this.pruneOldBackups(DEFAULT_RETENTION_COUNT).catch((err) => {
        console.error("Failed to prune old backups:", err);
      });

      return {
        backupId: record.id,
        fileName,
        filePath,
        sizeBytes,
        checksumSha256,
        durationMs,
        status: "COMPLETED",
        createdAt: new Date().toISOString(),
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      console.error(`Backup ${record.id} failed:`, err);

      await prisma.databaseBackupRecord.update({
        where: { id: record.id },
        data: {
          status: "FAILED",
          durationMs,
          metadata: JSON.stringify({
            ...(params.metadata || {}),
            error: err.message,
          }),
        },
      });

      // Clean up partial file if exists
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore
        }
      }

      throw new Error(`Database backup failed: ${err.message}`);
    }
  }

  /**
   * Lists all backup records with most recent first.
   */
  public static async listBackups() {
    return prisma.databaseBackupRecord.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves a backup record by ID.
   */
  public static async getBackup(id: string) {
    return prisma.databaseBackupRecord.findUnique({
      where: { id },
      include: {
        restores: {
          orderBy: { startedAt: "desc" },
        },
      },
    });
  }

  /**
   * Deletes a backup record and its physical file.
   */
  public static async deleteBackup(id: string): Promise<boolean> {
    const backup = await prisma.databaseBackupRecord.findUnique({ where: { id } });
    if (!backup) return false;

    if (fs.existsSync(backup.backupFilePath)) {
      try {
        fs.unlinkSync(backup.backupFilePath);
      } catch (err) {
        console.warn(`Failed to unlink file ${backup.backupFilePath}:`, err);
      }
    }

    await prisma.databaseBackupRecord.delete({ where: { id } });
    return true;
  }

  /**
   * Prunes backups older than the retention threshold.
   */
  public static async pruneOldBackups(retentionCount: number = DEFAULT_RETENTION_COUNT): Promise<number> {
    const allCompleted = await prisma.databaseBackupRecord.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    });

    if (allCompleted.length <= retentionCount) {
      return 0;
    }

    const toPrune = allCompleted.slice(retentionCount);
    let prunedCount = 0;

    for (const backup of toPrune) {
      try {
        if (fs.existsSync(backup.backupFilePath)) {
          fs.unlinkSync(backup.backupFilePath);
        }
        await prisma.databaseBackupRecord.delete({ where: { id: backup.id } });
        prunedCount++;
      } catch (err) {
        console.warn(`Error pruning backup ${backup.id}:`, err);
      }
    }

    return prunedCount;
  }
}

