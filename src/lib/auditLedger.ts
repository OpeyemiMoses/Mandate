import crypto from "crypto";
import { prisma } from "@/lib/db";

export const GENESIS_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";

// Milestone 8 Execution Lifecycle Event Types
export const EXECUTION_AUDIT_EVENTS = {
  EXECUTION_PROPOSED: "EXECUTION_PROPOSED",
  POLICY_EVALUATED: "POLICY_EVALUATED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  APPROVAL_VERIFIED: "APPROVAL_VERIFIED",
  BUDGET_RESERVED: "BUDGET_RESERVED",
  EXECUTION_AUTHORIZED: "EXECUTION_AUTHORIZED",
  EXECUTION_SIGNED: "EXECUTION_SIGNED",
  TRANSACTION_BROADCAST: "TRANSACTION_BROADCAST",
  TRANSACTION_CONFIRMED: "TRANSACTION_CONFIRMED",
  EXECUTION_FAILED: "EXECUTION_FAILED",
  EXECUTION_RECOVERED: "EXECUTION_RECOVERED",
  BUDGET_SETTLED: "BUDGET_SETTLED",
  BUDGET_RELEASED: "BUDGET_RELEASED",
  MANUAL_INTERVENTION_REQUIRED: "MANUAL_INTERVENTION_REQUIRED",
} as const;

// Milestone 9.1 Background Job Lifecycle Audit Event Types
export const JOB_AUDIT_EVENTS = {
  JOB_SUBMITTED: "JOB_SUBMITTED",
  JOB_SCHEDULED: "JOB_SCHEDULED",
  JOB_CLAIMED: "JOB_CLAIMED",
  JOB_STARTED: "JOB_STARTED",
  JOB_COMPLETED: "JOB_COMPLETED",
  JOB_FAILED: "JOB_FAILED",
  JOB_RETRY_SCHEDULED: "JOB_RETRY_SCHEDULED",
  JOB_RECOVERED: "JOB_RECOVERED",
  JOB_DEAD_LETTERED: "JOB_DEAD_LETTERED",
  DEAD_LETTER_RESOLVED: "DEAD_LETTER_RESOLVED",
  DEAD_LETTER_REQUEUED: "DEAD_LETTER_REQUEUED",
} as const;

/**
 * Deterministically sort object keys for canonical cryptographic hashing
 */
export function canonicalize(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalize);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  for (const key of sortedKeys) {
    if (obj[key] !== undefined) {
      result[key] = canonicalize(obj[key]);
    }
  }
  return result;
}

export interface CanonicalAuditPayload {
  sequenceNumber: number;
  userId: string;
  eventType: string;
  verdict: string | null;
  reasonCode: string | null;
  details: Record<string, any>;
  prevHash: string;
  timestamp: string;
}

export function computeAuditHash(payload: CanonicalAuditPayload): string {
  const canonicalString = JSON.stringify(canonicalize(payload));
  return crypto.createHash("sha256").update(canonicalString, "utf8").digest("hex");
}

export interface RecordAuditEventInput {
  userId: string;
  eventType: string;
  verdict?: string;
  reasonCode?: string;
  description?: string;
  details?: Record<string, any>;
  agentId?: string | null;
  agentWalletAddress?: string | null;
  mandateId?: string | null;
  taskId?: string | null;
  proposalId?: string | null;
  txHash?: string | null;
  prismaClient?: any;
}

// Per-user async mutex to safely serialize concurrent event creation
const userMutexQueues = new Map<string, Promise<any>>();

export async function runWithUserLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previous = userMutexQueues.get(userId) || Promise.resolve();

  let resolveCurrent: () => void;
  const current = new Promise<void>((resolve) => {
    resolveCurrent = resolve;
  });

  userMutexQueues.set(
    userId,
    previous.catch(() => {}).then(() => current)
  );

  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    resolveCurrent!();
  }
}

/**
 * Record an append-only, tamper-evident audit event linked cryptographically
 * to the preceding user audit event via SHA-256 hash chaining.
 */
export async function recordAuditEvent(input: RecordAuditEventInput) {
  return await runWithUserLock(input.userId, async () => {
    const client = input.prismaClient || prisma;
    const now = new Date();
    const nowIso = now.toISOString();

    // Find the most recent event for this user to get sequence & prevHash
    const latest = await client.auditLog.findFirst({
      where: { userId: input.userId },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true, currentHash: true },
    });

    const sequenceNumber = (latest?.sequenceNumber ?? 0) + 1;
    const prevHash = latest?.currentHash || GENESIS_HASH;
    const details = input.details || {};

    const canonicalPayload: CanonicalAuditPayload = {
      sequenceNumber,
      userId: input.userId,
      eventType: input.eventType,
      verdict: input.verdict || null,
      reasonCode: input.reasonCode || null,
      details,
      prevHash,
      timestamp: nowIso,
    };

    const currentHash = computeAuditHash(canonicalPayload);

    return await client.auditLog.create({
      data: {
        sequenceNumber,
        eventType: input.eventType,
        verdict: input.verdict,
        reasonCode: input.reasonCode,
        description: input.description,
        detailsJson: JSON.stringify(details),
        prevHash,
        currentHash,
        agentId: input.agentId,
        agentWalletAddress: input.agentWalletAddress,
        mandateId: input.mandateId,
        taskId: input.taskId,
        proposalId: input.proposalId,
        txHash: input.txHash,
        userId: input.userId,
        createdAt: now,
      },
    });
  });
}

export interface AuditChainVerificationResult {
  valid: boolean;
  count: number;
  genesisHash?: string;
  headHash?: string;
  error?: string;
  tamperedIndex?: number;
  tamperedEventId?: string;
}

/**
 * Verify complete cryptographic hash-chain integrity for a user's audit log
 */
export async function verifyAuditChain(
  userId: string
): Promise<AuditChainVerificationResult> {
  const logs = await prisma.auditLog.findMany({
    where: { userId },
    orderBy: [{ sequenceNumber: "asc" }, { createdAt: "asc" }],
  });

  if (logs.length === 0) {
    return {
      valid: true,
      count: 0,
      headHash: GENESIS_HASH,
      genesisHash: GENESIS_HASH,
    };
  }

  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];

    // If record was generated before hash chain was enabled, skip strict linkage
    if (!log.currentHash) {
      continue;
    }

    // 1. Verify predecessor linkage
    if (log.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        count: logs.length,
        tamperedIndex: i,
        tamperedEventId: log.id,
        error: `Broken link at event ${log.id} (sequence ${log.sequenceNumber}): expected prevHash ${expectedPrevHash}, got ${log.prevHash}`,
      };
    }

    // 2. Re-compute SHA-256 from canonical payload
    let details: Record<string, any> = {};
    try {
      details = JSON.parse(log.detailsJson || "{}");
    } catch {}

    const payload: CanonicalAuditPayload = {
      sequenceNumber: log.sequenceNumber,
      userId: log.userId || userId,
      eventType: log.eventType,
      verdict: log.verdict,
      reasonCode: log.reasonCode,
      details,
      prevHash: log.prevHash,
      timestamp: log.createdAt.toISOString(),
    };

    const recomputedHash = computeAuditHash(payload);

    if (recomputedHash !== log.currentHash) {
      return {
        valid: false,
        count: logs.length,
        tamperedIndex: i,
        tamperedEventId: log.id,
        error: `Hash mismatch at event ${log.id} (sequence ${log.sequenceNumber}): stored ${log.currentHash}, recomputed ${recomputedHash}`,
      };
    }

    expectedPrevHash = log.currentHash;
  }

  return {
    valid: true,
    count: logs.length,
    genesisHash: logs[0].prevHash || GENESIS_HASH,
    headHash: logs[logs.length - 1].currentHash || expectedPrevHash,
  };
}
