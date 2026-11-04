/**
 * Execution Idempotency & Replay Protection Service
 * Milestone 8 - Production Readiness
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { canonicalize } from "@/lib/auditLedger";
import { ExecutionRecord } from "@prisma/client";

export function computePayloadHash(payload: Record<string, any>): string {
  const canonical = canonicalize(payload);
  return crypto.createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  existingRecord?: ExecutionRecord;
  isMismatchedPayload: boolean;
  error?: string;
}

export class ExecutionIdempotencyService {
  /**
   * Evaluates incoming request against stored idempotency state.
   * - If key exists with IDENTICAL payload hash -> returns existing record (safe retry).
   * - If key exists with DIFFERENT payload hash -> strictly rejects (parameter tampering / key reuse).
   * - If new key -> permits execution.
   */
  public static async evaluateIdempotency(params: {
    idempotencyKey: string;
    userId: string;
    payload: Record<string, any>;
  }): Promise<IdempotencyCheckResult> {
    const { idempotencyKey, userId, payload } = params;
    const currentPayloadHash = computePayloadHash(payload);

    const existing = await prisma.executionRecord.findUnique({
      where: { idempotencyKey },
    });

    if (!existing) {
      return {
        isDuplicate: false,
        isMismatchedPayload: false,
      };
    }

    // Verify user owns this idempotency record
    if (existing.userId !== userId) {
      return {
        isDuplicate: true,
        isMismatchedPayload: true,
        error: "Idempotency key collision across different users is strictly rejected",
      };
    }

    // Compare payload hashes
    if (existing.payloadHash !== currentPayloadHash) {
      return {
        isDuplicate: true,
        isMismatchedPayload: true,
        existingRecord: existing,
        error: `Idempotency key "${idempotencyKey}" was previously used with a different execution payload. Modification of parameters under the same idempotency key is prohibited.`,
      };
    }

    return {
      isDuplicate: true,
      isMismatchedPayload: false,
      existingRecord: existing,
    };
  }
}

