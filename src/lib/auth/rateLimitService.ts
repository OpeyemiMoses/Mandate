/**
 * MANDATE — Distributed Rate Limiting & Abuse Prevention Service
 * Milestone 14.4 / 14.5: Rate Limiter Reliability & Credential Boundary Hardening
 * 
 * Algorithm: Fixed-Window Counter with sliding reset deadline.
 * - Each key starts an independent, atomic rate-limit window stored in the RateLimitBucket table.
 * - Backed by PostgreSQL RateLimitBucket table with native TIMESTAMPTZ columns.
 * - Multi-instance production clustering safe via ON CONFLICT DO UPDATE atomic row locks.
 * - Safe reset behavior: rejected requests NEVER extend the window reset deadline.
 * - Timezone-agnostic: uses PostgreSQL TIMESTAMPTZ and NOW() server-calculated intervals.
 * - Bounded batch cleanup: expired buckets are reclaimed in bounded batches (default 500).
 * - Fails safely (closed) if rate-limiting infrastructure is unavailable.
 */

import { prisma } from "@/lib/db";

export interface RateLimitCheckResult {
  allowed: boolean;
  tokens: number;
  limit: number;
  resetAt: Date;
  retryAfterSec: number;
  reason?: string;
  code?: "RATE_LIMIT_EXCEEDED" | "RATE_LIMIT_SERVICE_UNAVAILABLE";
}

export const RATE_LIMIT_CONFIG = {
  PER_IP_CHALLENGE_LIMIT: 30, // 30 challenge requests per minute per IP
  PER_IP_WINDOW_SECONDS: 60,
  PER_ACCOUNT_CHALLENGE_LIMIT: 5, // 5 challenge requests per minute per account
  PER_ACCOUNT_WINDOW_SECONDS: 60,
  GLOBAL_CHALLENGE_LIMIT: 300, // 300 challenge requests per minute globally
  GLOBAL_WINDOW_SECONDS: 60,
};

export interface CleanupResult {
  success: boolean;
  deleted: number;
  durationMs: number;
  batchSize: number;
  error?: string;
}

export class RateLimitService {
  /**
   * Atomically checks and increments a rate-limit counter in the shared database store.
   * Multi-instance safe via PostgreSQL ON CONFLICT row-level locking.
   * Algorithm: Fixed-Window Counter with sliding reset deadline.
   * - If resetAt < NOW(): resets tokens = 1 and advances resetAt = NOW() + windowSeconds.
   * - If resetAt >= NOW(): increments tokens without extending resetAt (rejected requests do NOT extend deadline).
   * - retryAfterSec is calculated database-side as the exact ceiling seconds until resetAt.
   */
  public static async checkLimit(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitCheckResult> {
    const now = Date.now();
    const fallbackResetAt = new Date(now + windowSeconds * 1000);

    try {
      const res: any[] = await prisma.$queryRaw`
        INSERT INTO "RateLimitBucket" ("key", "tokens", "resetAt", "createdAt", "updatedAt")
        VALUES (
          ${key}, 
          1, 
          NOW() + make_interval(secs => ${windowSeconds}), 
          NOW(), 
          NOW()
        )
        ON CONFLICT ("key") DO UPDATE
        SET "tokens" = CASE 
            WHEN "RateLimitBucket"."resetAt" < NOW() THEN 1 
            WHEN "RateLimitBucket"."tokens" > 10000 THEN "RateLimitBucket"."tokens"
            ELSE "RateLimitBucket"."tokens" + 1 
          END,
          "resetAt" = CASE 
            WHEN "RateLimitBucket"."resetAt" < NOW() THEN NOW() + make_interval(secs => ${windowSeconds})
            ELSE "RateLimitBucket"."resetAt" 
          END,
          "updatedAt" = NOW()
        RETURNING 
          "tokens", 
          "resetAt",
          LEAST(${windowSeconds}, GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetAt" - NOW())))::INT)) AS "retryAfterSec";
      `;

      if (!res || res.length === 0) {
        // Fails closed on query anomaly
        return {
          allowed: false,
          tokens: limit + 1,
          limit,
          resetAt: fallbackResetAt,
          retryAfterSec: windowSeconds,
          reason: "Rate limiting store did not return state",
          code: "RATE_LIMIT_SERVICE_UNAVAILABLE",
        };
      }

      const tokens = Number(res[0].tokens);
      const activeResetAt = new Date(res[0].resetAt);
      const retryAfterSec = Number(res[0].retryAfterSec) || Math.max(1, Math.min(windowSeconds, Math.ceil((activeResetAt.getTime() - Date.now()) / 1000)));

      if (tokens > limit) {
        return {
          allowed: false,
          tokens,
          limit,
          resetAt: activeResetAt,
          retryAfterSec,
          reason: `Rate limit exceeded for key "${key}". Allowed: ${limit} per ${windowSeconds}s.`,
          code: "RATE_LIMIT_EXCEEDED",
        };
      }

      return {
        allowed: true,
        tokens,
        limit,
        resetAt: activeResetAt,
        retryAfterSec: 0,
      };
    } catch (err: any) {
      // FAIL CLOSED: If the shared rate-limiting store fails or disconnects,
      // abuse protection must not be silently disabled.
      return {
        allowed: false,
        tokens: limit + 1,
        limit,
        resetAt: fallbackResetAt,
        retryAfterSec: windowSeconds,
        reason: `Rate limiting store unavailable: ${err?.message || "DB_ERROR"}`,
        code: "RATE_LIMIT_SERVICE_UNAVAILABLE",
      };
    }
  }

  /**
   * Helper to check authentication challenge rate limits across IP, Account, and Global boundaries.
   */
  public static async checkChallengeLimits(params: {
    clientIp: string;
    accountId: string;
  }): Promise<RateLimitCheckResult> {
    const { clientIp, accountId } = params;

    // 1. Check Global Issuance Rate Limit (Arbitrary Account Flooding Mitigation)
    const globalCheck = await this.checkLimit(
      "global:challenges",
      RATE_LIMIT_CONFIG.GLOBAL_CHALLENGE_LIMIT,
      RATE_LIMIT_CONFIG.GLOBAL_WINDOW_SECONDS
    );
    if (!globalCheck.allowed) {
      return {
        ...globalCheck,
        reason: "Global authentication challenge rate limit exceeded. Please wait a moment before trying again.",
      };
    }

    // 2. Check Per-IP Rate Limit
    const cleanIp = clientIp.trim() || "127.0.0.1";
    const ipCheck = await this.checkLimit(
      `ip:${cleanIp}`,
      RATE_LIMIT_CONFIG.PER_IP_CHALLENGE_LIMIT,
      RATE_LIMIT_CONFIG.PER_IP_WINDOW_SECONDS
    );
    if (!ipCheck.allowed) {
      return {
        ...ipCheck,
        reason: "Too many authentication requests from this IP address. Please try again later.",
      };
    }

    // 3. Check Per-Account Rate Limit
    const cleanAccountId = accountId.trim().toLowerCase();
    const accountCheck = await this.checkLimit(
      `acct:${cleanAccountId}`,
      RATE_LIMIT_CONFIG.PER_ACCOUNT_CHALLENGE_LIMIT,
      RATE_LIMIT_CONFIG.PER_ACCOUNT_WINDOW_SECONDS
    );
    if (!accountCheck.allowed) {
      return {
        ...accountCheck,
        reason: `Too many authentication requests for account "${cleanAccountId}". Please use an active challenge or wait before requesting another.`,
      };
    }

    return {
      allowed: true,
      tokens: accountCheck.tokens,
      limit: RATE_LIMIT_CONFIG.PER_ACCOUNT_CHALLENGE_LIMIT,
      resetAt: accountCheck.resetAt,
      retryAfterSec: 0,
    };
  }

  /**
   * Clean expired rate limit buckets using bounded batch deletion with structured observability.
   * Returns deleted row count on success; throws on failure so errors are never masked as 0-row cleanups.
   */
  public static async cleanExpiredBuckets(batchSize = 500): Promise<number> {
    const result = await this.cleanExpiredBucketsDetailed(batchSize);
    if (!result.success) {
      throw new Error(`RATE_LIMIT_CLEANUP_FAILED: ${result.error}`);
    }
    return result.deleted;
  }

  /**
   * Detailed cleanup with explicit structured status and observability metrics.
   * Distinguishes "0 deleted (healthy empty)" from "cleanup failed (database error)".
   */
  public static async cleanExpiredBucketsDetailed(batchSize = 500): Promise<CleanupResult> {
    const startTime = Date.now();
    const safeBatchSize = Math.max(1, Math.min(batchSize, 500)); // Bounded strictly to <= 500

    try {
      const isPostgres =
        process.env.DATABASE_URL?.startsWith("postgres") ||
        process.env.DATABASE_URL?.startsWith("postgresql") ||
        process.env.MANDATE_DATABASE_TYPE === "postgres";

      let deleted = 0;
      if (isPostgres) {
        const res: any = await prisma.$executeRaw`
          DELETE FROM "RateLimitBucket"
          WHERE "key" IN (
            SELECT "key"
            FROM "RateLimitBucket"
            WHERE "resetAt" < NOW() - INTERVAL '1 hour'
            LIMIT ${safeBatchSize}
          );
        `;
        deleted = Number(res) || 0;
      } else {
        const oneHourAgo = new Date(Date.now() - 3600000);
        if ((prisma as any).rateLimitBucket?.findMany) {
          const expiredKeys = await (prisma as any).rateLimitBucket.findMany({
            where: { resetAt: { lt: oneHourAgo } },
            select: { key: true },
            take: safeBatchSize,
          });
          if (expiredKeys.length > 0) {
            const deleteRes = await (prisma as any).rateLimitBucket.deleteMany({
              where: { key: { in: expiredKeys.map((k: any) => k.key) } },
            });
            deleted = deleteRes.count;
          }
        }
      }

      const durationMs = Date.now() - startTime;
      console.log(
        JSON.stringify({
          event: "RATE_LIMIT_CLEANUP",
          status: "SUCCESS",
          deleted_rows: deleted,
          cleanup_failed: false,
          duration_ms: durationMs,
          batch_size: safeBatchSize,
        })
      );

      return {
        success: true,
        deleted,
        durationMs,
        batchSize: safeBatchSize,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err?.message || "Unknown database cleanup error";

      console.error(
        JSON.stringify({
          event: "RATE_LIMIT_CLEANUP",
          status: "FAILED",
          deleted_rows: 0,
          cleanup_failed: true,
          error: errorMsg,
          duration_ms: durationMs,
          batch_size: safeBatchSize,
        })
      );

      return {
        success: false,
        deleted: 0,
        durationMs,
        batchSize: safeBatchSize,
        error: errorMsg,
      };
    }
  }

  /**
   * Sweeps all expired buckets in bounded batches up to a maximum number of iterations.
   */
  public static async cleanAllExpiredBuckets(
    batchSize = 500,
    maxBatches = 20
  ): Promise<{ success: boolean; totalDeleted: number; batchesRun: number; error?: string }> {
    let totalDeleted = 0;
    let batchesRun = 0;
    for (let batch = 0; batch < maxBatches; batch++) {
      batchesRun++;
      const res = await this.cleanExpiredBucketsDetailed(batchSize);
      if (!res.success) {
        return {
          success: false,
          totalDeleted,
          batchesRun,
          error: res.error,
        };
      }
      totalDeleted += res.deleted;
      if (res.deleted < batchSize) break;
    }
    return { success: true, totalDeleted, batchesRun };
  }
}

/**
 * Extracts normalized client IP address from standard proxy/CDN headers.
 */
export function extractClientIp(req: Request): string {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor.split(",").map((ip) => ip.trim());
    if (ips[0] && ips[0].length > 0) return ips[0];
  }
  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp && xRealIp.trim().length > 0) return xRealIp.trim();
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp && cfConnectingIp.trim().length > 0) return cfConnectingIp.trim();
  return "127.0.0.1";
}
