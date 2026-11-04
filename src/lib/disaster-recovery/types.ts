/**
 * Disaster Recovery & Database Backup Types (Milestone 9.4)
 */

export type BackupStatus =
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CORRUPTED"
  | "RESTORING";

export type BackupType = "FULL" | "SNAPSHOT" | "DRILL";

export type RestoreStatus =
  | "RUNNING"
  | "VERIFYING"
  | "RESTORED"
  | "RECONCILING"
  | "COMPLETED"
  | "FAILED";

export interface CreateBackupParams {
  backupType?: BackupType;
  createdBy?: string;
  trigger?: "MANUAL" | "SCHEDULED" | "DRILL";
  isEncrypted?: boolean;
  metadata?: Record<string, any>;
}

export interface BackupResult {
  backupId: string;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  checksumSha256: string;
  durationMs: number;
  status: BackupStatus;
  createdAt: string;
}

export interface RestoreParams {
  backupId: string;
  restoredBy: string;
  restoredByRole: string;
  isDrill?: boolean;
  targetPath?: string; // If drill, restores to an isolated target
  skipMaintenanceCheck?: boolean;
}

export interface RestoreResult {
  restoreId: string;
  backupId: string;
  status: RestoreStatus;
  isDrill: boolean;
  durationMs: number;
  integrityPassed: boolean;
  financialReconciliationCount: number;
  completedAt: string;
  error?: string;
}

export interface DisasterRecoveryMetrics {
  targetRpoMinutes: number;
  targetRtoMinutes: number;
  measuredRpoMinutes: number;
  measuredRtoMinutes: number;
  lastSuccessfulBackupAt: string | null;
  lastSuccessfulRestoreAt: string | null;
  backupSuccessRate: number;
  totalBackupsCount: number;
}

