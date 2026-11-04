/**
 * MANDATE — Distributed Database Idempotency Service
 * Milestone 13.10: PostgreSQL-Enforced Distributed Coordination
 *
 * Guarantees that concurrent requests across multiple worker processes,
 * application instances, or independent database clients CANNOT reserve budget,
 * double-broadcast transactions, or execute operations twice under the same idempotency key.
 */

import { prisma } from "@/lib/db";
import { ExecutionRecord } from "@prisma/client";
import { ExecutionStatus } from "./types";

export class DistributedIdempotencyManager {
  /**
   * Executes a critical financial operation protected by database-level synchronization.
   * In PostgreSQL: Uses pg_advisory_xact_lock(hashtext(key)) inside an atomic transaction.
   * Guarantees strict serialization across multiple OS processes and application instances.
   */
  public static async executeWithDistributedLock<T>(
    idempotencyKey: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const isPostgres =
      process.env.DATABASE_URL?.startsWith("postgres") ||
      process.env.DATABASE_URL?.startsWith("postgresql") ||
      process.env.MANDATE_DATABASE_TYPE === "postgres";

    if (isPostgres) {
      // In PostgreSQL: Acquire an advisory transaction lock bound to the idempotency key.
      // This serializes all concurrent workers on the database server itself.
      try {
        return await (prisma as any).$transaction(
          async (tx: any) => {
            // Hash key into signed 32-bit integer for pg_advisory_xact_lock
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`idempotency:${idempotencyKey}`}))`;
            return await operation();
          },
          { timeout: 30000 }
        );
      } catch (err: any) {
        // If advisory lock or transaction fails due to P2002 duplicate key, handle gracefully
        if (err?.code === "P2002") {
          const existing = await prisma.executionRecord.findUnique({
            where: { idempotencyKey },
          });
          if (existing) {
            return {
              success: existing.status === "CONFIRMED",
              executionId: existing.id,
              status: existing.status as ExecutionStatus,
              txHash: existing.txHash || undefined,
              blockHash: existing.blockHash || undefined,
              blockHeight: existing.blockHeight || undefined,
              error: existing.errorReason || undefined,
              recoveryStatus: existing.recoveryStatus || undefined,
              settled: existing.status === "CONFIRMED",
              isSimulated: existing.isSimulated,
              durationMs: 0,
            } as unknown as T;
          }
        }
        throw err;
      }
    }

    // Fallback for non-Postgres environments: execute directly with atomic DB constraint handling
    try {
      return await operation();
    } catch (err: any) {
      if (err?.code === "P2002") {
        const existing = await prisma.executionRecord.findUnique({
          where: { idempotencyKey },
        });
        if (existing) {
          return {
            success: existing.status === "CONFIRMED",
            executionId: existing.id,
            status: "DUPLICATE_IDEMPOTENT" as unknown as ExecutionStatus,
            txHash: existing.txHash || undefined,
            blockHash: existing.blockHash || undefined,
            blockHeight: existing.blockHeight || undefined,
            error: existing.errorReason || undefined,
            recoveryStatus: existing.recoveryStatus || undefined,
            settled: existing.status === "CONFIRMED",
            isSimulated: existing.isSimulated,
            durationMs: 0,
          } as unknown as T;
        }
      }
      throw err;
    }
  }
}
