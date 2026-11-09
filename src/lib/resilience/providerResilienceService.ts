/**
 * Provider Circuit Breaker Service (Milestone 9.4)
 * Protects external RPC and provider boundaries (NEAR RPC, FastNEAR, OutLayer)
 * with robust CLOSED -> OPEN -> HALF_OPEN state machine, persistence, and audit logs.
 */

import { prisma } from "@/lib/db";
import { ControlAuditService } from "@/lib/operations/controlAuditService";
import { isTestOrHarnessRuntime } from "@/lib/security/databaseTargetGuard";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface ProviderCircuitConfig {
  failureThreshold: number; // default 5
  cooldownMs: number;       // default 30,000ms (30s)
  timeoutMs: number;        // default 10,000ms
}

export const DEFAULT_CIRCUIT_CONFIG: ProviderCircuitConfig = {
  failureThreshold: 5,
  cooldownMs: 30000,
  timeoutMs: 10000,
};

// In-memory cache for ultra-fast checks (<0.5ms)
interface CachedCircuit {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  nextProbeTime: number | null;
  failureThreshold: number;
  cooldownMs: number;
  lastErrorMessage: string | null;
}

const memoryCache = new Map<string, CachedCircuit>();

export class ProviderResilienceService {
  /**
   * Clears the in-memory cache for deterministic testing and isolation.
   */
  public static clearMemoryCache(): void {
    memoryCache.clear();
  }

  /**
   * Initializes or fetches circuit state from DB with in-memory caching.
   */
  public static async getCircuitState(providerId: string): Promise<CachedCircuit> {
    const cached = memoryCache.get(providerId);
    if (cached) {
      // If OPEN and cooldown has passed, dynamically consider it HALF_OPEN
      if (cached.state === "OPEN" && cached.nextProbeTime && Date.now() >= cached.nextProbeTime) {
        cached.state = "HALF_OPEN";
      }
      return cached;
    }

    // In test harness runtime without disposable DB, allow deterministic in-memory circuit tracking.
    // In production runtime, fail closed if DB is unreachable and no cache exists.
    const isTest = isTestOrHarnessRuntime();
    let dbRecord: any = null;
    try {
      dbRecord = await prisma.providerCircuitBreakerState.findUnique({
        where: { providerId },
      });

      if (!dbRecord) {
        dbRecord = await prisma.providerCircuitBreakerState.create({
          data: {
            providerId,
            state: "CLOSED",
            failureThreshold: DEFAULT_CIRCUIT_CONFIG.failureThreshold,
            cooldownMs: DEFAULT_CIRCUIT_CONFIG.cooldownMs,
          },
        });
      }
    } catch (dbErr: any) {
      if (isTest) {
        dbRecord = {
          state: "CLOSED",
          failureThreshold: DEFAULT_CIRCUIT_CONFIG.failureThreshold,
          cooldownMs: DEFAULT_CIRCUIT_CONFIG.cooldownMs,
          failureCount: 0,
          successCount: 0,
          lastFailureTime: null,
          lastSuccessTime: null,
          nextProbeTime: null,
          lastErrorMessage: null,
        };
      } else {
        throw new Error(
          `DATABASE_UNAVAILABLE_FAIL_CLOSED: Provider circuit breaker cannot verify safety because database is unavailable: ${dbErr?.message || dbErr}`
        );
      }
    }

    let state = dbRecord.state as CircuitState;
    const nextProbeTime = dbRecord.nextProbeTime ? new Date(dbRecord.nextProbeTime).getTime() : null;
    if (state === "OPEN" && nextProbeTime && Date.now() >= nextProbeTime) {
      state = "HALF_OPEN";
    }

    const item: CachedCircuit = {
      state,
      failureCount: dbRecord.failureCount,
      successCount: dbRecord.successCount,
      lastFailureTime: dbRecord.lastFailureTime ? new Date(dbRecord.lastFailureTime).getTime() : null,
      lastSuccessTime: dbRecord.lastSuccessTime ? new Date(dbRecord.lastSuccessTime).getTime() : null,
      nextProbeTime,
      failureThreshold: dbRecord.failureThreshold,
      cooldownMs: dbRecord.cooldownMs,
      lastErrorMessage: dbRecord.lastErrorMessage,
    };

    memoryCache.set(providerId, item);
    return item;
  }

  /**
   * Executes an external provider call wrapped in circuit breaker safety.
   */
  public static async executeWithBreaker<T>(
    providerId: string,
    operation: () => Promise<T>,
    timeoutMs: number = DEFAULT_CIRCUIT_CONFIG.timeoutMs
  ): Promise<T> {
    const circuit = await this.getCircuitState(providerId);

    // 1. Check if OPEN
    if (circuit.state === "OPEN") {
      const now = Date.now();
      if (circuit.nextProbeTime && now >= circuit.nextProbeTime) {
        // Cooldown passed: transition to HALF_OPEN probe mode
        circuit.state = "HALF_OPEN";
      } else {
        const remainingSec = circuit.nextProbeTime
          ? Math.ceil((circuit.nextProbeTime - now) / 1000)
          : Math.ceil(circuit.cooldownMs / 1000);
        throw new Error(
          `CIRCUIT_BREAKER_OPEN: Provider "${providerId}" circuit breaker is OPEN due to repeated failures. Requests blocked for ${remainingSec}s to allow recovery.`
        );
      }
    }

    // 2. Execute operation with bounded timeout
    try {
      let timeoutHandle: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`PROVIDER_TIMEOUT: Request to provider "${providerId}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const result = await Promise.race([
        operation().finally(() => clearTimeout(timeoutHandle)),
        timeoutPromise,
      ]);

      // 3. Record Success
      await this.recordSuccess(providerId);
      return result;
    } catch (err: any) {
      // 4. Record Failure
      await this.recordFailure(providerId, err.message || "Unknown provider error");
      throw err;
    }
  }

  /**
   * Handles successful call.
   */
  private static async recordSuccess(providerId: string): Promise<void> {
    const circuit = await this.getCircuitState(providerId);
    const wasHalfOpen = circuit.state === "HALF_OPEN";

    circuit.failureCount = 0;
    circuit.successCount += 1;
    circuit.lastSuccessTime = Date.now();
    circuit.state = "CLOSED";
    circuit.nextProbeTime = null;

    memoryCache.set(providerId, circuit);

    // Asynchronously sync to DB
    try {
      prisma.providerCircuitBreakerState.update({
        where: { providerId },
        data: {
          state: "CLOSED",
          failureCount: 0,
          successCount: circuit.successCount,
          lastSuccessTime: new Date(circuit.lastSuccessTime),
          nextProbeTime: null,
        },
      }).catch((e) => console.warn(`Failed to sync circuit state to DB:`, e));
    } catch {}

    if (wasHalfOpen) {
      ControlAuditService.recordAction({
        actionType: "RESUME_EXECUTION",
        mode: "NORMAL",
        actorId: "CIRCUIT_BREAKER",
        actorRole: "SYSTEM",
        reason: `Provider "${providerId}" circuit breaker successfully transitioned from HALF_OPEN to CLOSED following valid probe.`,
        details: { providerId, previousState: "HALF_OPEN", newState: "CLOSED" },
      }).catch(() => {});
    }
  }

  /**
   * Handles failed call.
   */
  private static async recordFailure(providerId: string, errorMessage: string): Promise<void> {
    const circuit = await this.getCircuitState(providerId);
    circuit.failureCount += 1;
    circuit.lastFailureTime = Date.now();
    circuit.lastErrorMessage = errorMessage;

    const shouldTrip =
      circuit.state === "HALF_OPEN" || circuit.failureCount >= circuit.failureThreshold;

    if (shouldTrip) {
      circuit.state = "OPEN";
      circuit.nextProbeTime = Date.now() + circuit.cooldownMs;
    }

    memoryCache.set(providerId, circuit);

    // Asynchronously sync to DB
    try {
      prisma.providerCircuitBreakerState.update({
        where: { providerId },
        data: {
          state: circuit.state,
          failureCount: circuit.failureCount,
          lastFailureTime: new Date(circuit.lastFailureTime),
          lastErrorMessage: errorMessage,
          nextProbeTime: circuit.nextProbeTime ? new Date(circuit.nextProbeTime) : null,
        },
      }).catch((e) => console.warn(`Failed to sync circuit state to DB:`, e));
    } catch {}

    if (shouldTrip) {
      ControlAuditService.recordAction({
        actionType: "EMERGENCY_PAUSE",
        mode: "NORMAL",
        actorId: "CIRCUIT_BREAKER",
        actorRole: "SYSTEM",
        reason: `Provider "${providerId}" circuit breaker TRIPPED to OPEN after ${circuit.failureCount} consecutive failures. Cooldown: ${circuit.cooldownMs}ms. Error: ${errorMessage}`,
        details: {
          providerId,
          failureCount: circuit.failureCount,
          lastError: errorMessage,
          cooldownMs: circuit.cooldownMs,
        },
      }).catch(() => {});
    }
  }

  /**
   * Manually resets a provider circuit breaker back to CLOSED.
   */
  public static async resetBreaker(
    providerId: string,
    actorId: string,
    actorRole: string
  ): Promise<CachedCircuit> {
    const circuit: CachedCircuit = {
      state: "CLOSED",
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      lastSuccessTime: Date.now(),
      nextProbeTime: null,
      failureThreshold: DEFAULT_CIRCUIT_CONFIG.failureThreshold,
      cooldownMs: DEFAULT_CIRCUIT_CONFIG.cooldownMs,
      lastErrorMessage: null,
    };

    memoryCache.set(providerId, circuit);

    await prisma.providerCircuitBreakerState.upsert({
      where: { providerId },
      create: {
        providerId,
        state: "CLOSED",
        failureCount: 0,
        successCount: 0,
      },
      update: {
        state: "CLOSED",
        failureCount: 0,
        nextProbeTime: null,
      },
    });

    await ControlAuditService.recordAction({
      actionType: "RESUME_EXECUTION",
      mode: "NORMAL",
      actorId,
      actorRole,
      reason: `Operator manually reset circuit breaker for provider "${providerId}" to CLOSED.`,
      details: { providerId },
    });

    return circuit;
  }

  /**
   * Manually trips a provider circuit breaker to OPEN (e.g. for testing or isolation).
   */
  public static async tripBreaker(
    providerId: string,
    reason: string,
    actorId: string,
    actorRole: string
  ): Promise<CachedCircuit> {
    const circuit = await this.getCircuitState(providerId);
    circuit.state = "OPEN";
    circuit.failureCount = circuit.failureThreshold;
    circuit.lastFailureTime = Date.now();
    circuit.nextProbeTime = Date.now() + circuit.cooldownMs;
    circuit.lastErrorMessage = reason;

    memoryCache.set(providerId, circuit);

    await prisma.providerCircuitBreakerState.upsert({
      where: { providerId },
      create: {
        providerId,
        state: "OPEN",
        failureCount: circuit.failureThreshold,
        lastErrorMessage: reason,
        nextProbeTime: new Date(circuit.nextProbeTime),
      },
      update: {
        state: "OPEN",
        failureCount: circuit.failureThreshold,
        lastErrorMessage: reason,
        nextProbeTime: new Date(circuit.nextProbeTime),
      },
    });

    await ControlAuditService.recordAction({
      actionType: "EMERGENCY_PAUSE",
      mode: "NORMAL",
      actorId,
      actorRole,
      reason: `Operator manually tripped circuit breaker for provider "${providerId}" to OPEN: ${reason}`,
      details: { providerId, reason },
    });

    return circuit;
  }

  /**
   * Lists all provider circuit breaker states.
   */
  public static async listBreakers(): Promise<any[]> {
    const records = await prisma.providerCircuitBreakerState.findMany({
      orderBy: { providerId: "asc" },
    });
    return records.map((r) => {
      const cached = memoryCache.get(r.providerId);
      const isProbeDue =
        r.state === "OPEN" && r.nextProbeTime && Date.now() >= new Date(r.nextProbeTime).getTime();
      return {
        ...r,
        state: isProbeDue ? "HALF_OPEN" : cached?.state || r.state,
      };
    });
  }
}

