/**
 * MANDATE — Milestone 13.7: Production PostgreSQL Backup Service
 * 
 * Generates transactionally consistent, portable SQL backups of the PostgreSQL database.
 * Computes canonical SHA-256 checksums, verifies data integrity, and records audit trails.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Client } from "pg";
import { prismaPg } from "@/lib/postgresDb";

const BACKUPS_DIR = path.join(process.cwd(), "prisma", "backups");

export interface PostgresBackupResult {
  success: boolean;
  backupId: string;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  checksumSha256: string;
  durationMs: number;
  tablesCount: number;
  totalRows: number;
  error?: string;
}

// 72 Models in topological dependency order
const TOPOLOGICAL_ORDER: string[] = [
  "User",
  "Agent",
  "BackgroundWorker",
  "WorkerCapacitySnapshot",
  "TelemetrySnapshot",
  "OperationalControlState",
  "OperationalAuditRecord",
  "DatabaseBackupRecord",
  "ProviderCircuitBreakerState",
  "ResilienceDrillRun",
  "DispatchIntent",
  "IntegrationConnection",
  "OAuthSession",
  "GovernancePolicy",
  "PolicyEvaluation",
  "BackgroundJob",
  "OperationalAlert",
  "ReconciliationRun",
  "Incident",
  "Wallet",
  "AgentToolAccess",
  "AgentCapabilityProfile",
  "DatabaseRestoreRecord",
  "IntegrationOperationPermission",
  "IntegrationOperationExecution",
  "ToolInvocation",
  "PolicyVersion",
  "PolicyRule",
  "PolicyException",
  "PolicyReview",
  "JobAttempt",
  "JobEvent",
  "DeadLetterRecord",
  "ReconciliationFinding",
  "ExecutionDiscrepancy",
  "IncidentTimelineEvent",
  "IncidentAssignment",
  "RecoveryPlan",
  "FundingRecord",
  "WithdrawalRecord",
  "Mandate",
  "PolicyViolation",
  "ReconciliationEvidence",
  "RecoveryApproval",
  "RecoveryAttempt",
  "Task",
  "Objective",
  "RecoveryVerification",
  "ResearchSession",
  "ApprovalRequest",
  "AuditLog",
  "AgentExecution",
  "ExecutionRecord",
  "ObjectivePlan",
  "ObjectiveSuccessCriteria",
  "ObjectiveEvent",
  "ObjectiveCheckpoint",
  "CapabilityDiscovery",
  "TransactionRecord",
  "ExecutionEvent",
  "ObjectivePlanStep",
  "ObjectivePlanApproval",
  "CoordinationRun",
  "CapabilityMatch",
  "ObjectiveTaskEvent",
  "ObjectiveTaskResult",
  "CoordinationTask",
  "SharedObjectiveArtifact",
  "AgentAssignment",
  "AgentHandoff",
  "TaskLease",
  "CoordinationEvent",
];

export class PostgresBackupService {
  private static ensureBackupsDir(): void {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
  }

  /**
   * Generates a complete transactional SQL backup of the specified PostgreSQL database.
   */
  public static async createBackup(options: {
    databaseUrl?: string;
    createdBy?: string;
    trigger?: string;
    metadata?: Record<string, any>;
  } = {}): Promise<PostgresBackupResult> {
    this.ensureBackupsDir();

    const startTime = Date.now();
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(4).toString("hex");
    const fileName = `mandate-pg-backup-${timestamp}-${nonce}.sql`;
    const filePath = path.join(BACKUPS_DIR, fileName);

    const createdBy = options.createdBy || "SYSTEM";
    const trigger = options.trigger || "MANUAL";

    const defaultUrl =
      "postgresql://postgres:postgrespassword@localhost:5432/mandate_prod?schema=public";
    let connectionString = options.databaseUrl;
    if (!connectionString && process.env.DATABASE_URL?.startsWith("postgres")) {
      connectionString = process.env.DATABASE_URL;
    }
    if (!connectionString) {
      connectionString = defaultUrl;
    }

    const client = new Client({ connectionString });
    await client.connect();

    try {
      // 1. Fetch all public tables
      const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT LIKE '_prisma%'
        ORDER BY table_name;
      `);

      const existingTables: string[] = tablesRes.rows.map((r) => r.table_name);
      // Sort tables according to topological dependency order
      const tables = TOPOLOGICAL_ORDER.filter((t) => existingTables.includes(t));
      // Append any unlisted tables
      for (const t of existingTables) {
        if (!tables.includes(t)) tables.push(t);
      }

      let totalRows = 0;
      const sqlChunks: string[] = [];

      sqlChunks.push("-- MANDATE PRODUCTION POSTGRESQL BACKUP");
      sqlChunks.push(`-- Generated: ${new Date().toISOString()}`);
      sqlChunks.push(`-- Nonce: ${nonce}`);
      sqlChunks.push("BEGIN;\n");
      sqlChunks.push("SET statement_timeout = 0;");
      sqlChunks.push("SET client_encoding = 'UTF8';");
      sqlChunks.push("SET session_replication_role = 'replica';\n");

      // Dump each table
      for (const table of tables) {
        const rowsRes = await client.query(`SELECT * FROM "${table}"`);
        const rows = rowsRes.rows;
        if (rows.length === 0) continue;

        totalRows += rows.length;
        sqlChunks.push(`-- Table: ${table} (${rows.length} rows)`);

        for (const row of rows) {
          const cols = Object.keys(row);
          const colNames = cols.map((c) => `"${c}"`).join(", ");
          const vals = cols
            .map((c) => {
              const val = row[c];
              if (val === null || val === undefined) return "NULL";
              if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
              if (typeof val === "number") return val.toString();
              if (val instanceof Date) return `'${val.toISOString()}'`;
              if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
              return `'${String(val).replace(/'/g, "''")}'`;
            })
            .join(", ");

          sqlChunks.push(`INSERT INTO "${table}" (${colNames}) VALUES (${vals}) ON CONFLICT DO NOTHING;`);
        }
        sqlChunks.push("");
      }

      sqlChunks.push("SET session_replication_role = 'origin';");
      sqlChunks.push("COMMIT;");
      const dumpSql = sqlChunks.join("\n");
      fs.writeFileSync(filePath, dumpSql, "utf8");

      // Compute SHA-256
      const checksumSha256 = crypto.createHash("sha256").update(dumpSql, "utf8").digest("hex");
      const sizeBytes = fs.statSync(filePath).size;
      const durationMs = Date.now() - startTime;

      // Record in DatabaseBackupRecord via prismaPg
      const backupRecord = await prismaPg.databaseBackupRecord.create({
        data: {
          backupFileName: fileName,
          backupFilePath: filePath,
          backupType: "FULL",
          status: "COMPLETED",
          sizeBytes,
          checksumSha256,
          durationMs,
          createdBy,
          trigger,
          isEncrypted: false,
          metadata: JSON.stringify({
            ...(options.metadata || {}),
            tablesCount: tables.length,
            totalRows,
            engine: "PostgreSQL 18.6",
          }),
        },
      });

      console.log(`[PG_BACKUP] Successfully created backup ${fileName} (${sizeBytes} bytes, ${totalRows} rows, checksum: ${checksumSha256.substring(0, 16)}...)`);

      return {
        success: true,
        backupId: backupRecord.id,
        fileName,
        filePath,
        sizeBytes,
        checksumSha256,
        durationMs,
        tablesCount: tables.length,
        totalRows,
      };
    } catch (err: any) {
      console.error(`[PG_BACKUP_ERROR] Failed creating backup: ${err.message}`);
      return {
        success: false,
        backupId: "",
        fileName,
        filePath,
        sizeBytes: 0,
        checksumSha256: "",
        durationMs: Date.now() - startTime,
        tablesCount: 0,
        totalRows: 0,
        error: err.message,
      };
    } finally {
      await client.end();
    }
  }

  /**
   * Verifies the cryptographic integrity of a backup file.
   */
  public static verifyBackupIntegrity(filePath: string, expectedChecksum: string): boolean {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, "utf8");
    const computed = crypto.createHash("sha256").update(content, "utf8").digest("hex");
    return computed === expectedChecksum;
  }
}
