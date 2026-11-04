/**
 * Graceful Shutdown Coordinator (Milestone 9.4)
 * Orchestrates safe, controlled application and worker shutdowns,
 * draining safe in-flight work while strictly preserving financial reservations.
 */

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import { recordMetric } from "@/lib/observability";
import { LifecycleState, ShutdownOptions, ShutdownResult } from "./types";

let currentLifecycleState: LifecycleState = "READY";
let isShutdownInProgress = false;
let shutdownPromise: Promise<ShutdownResult> | null = null;

export class ShutdownCoordinator {
  /**
   * Returns current application lifecycle state.
   */
  public static getLifecycleState(): LifecycleState {
    return currentLifecycleState;
  }

  /**
   * Initializes OS signal listeners (SIGTERM, SIGINT) for process-level graceful shutdown.
   */
  public static registerSignalHandlers(): void {
    if (typeof process === "undefined" || !process.on) return;

    // Avoid duplicate handlers
    if ((process as any).__mandate_signals_registered) return;
    (process as any).__mandate_signals_registered = true;

    const handleSignal = (signal: string) => {
      console.log(`[Mandate ShutdownCoordinator] Received ${signal}. Initiating graceful shutdown...`);
      this.initiateShutdown({
        reason: `OS signal ${signal} received`,
        gracePeriodMs: 5000,
      }).catch((err) => {
        console.error("[Mandate ShutdownCoordinator] Shutdown error:", err);
      });
    };

    process.once("SIGTERM", () => handleSignal("SIGTERM"));
    process.once("SIGINT", () => handleSignal("SIGINT"));
  }

  /**
   * Initiates a graceful shutdown workflow.
   */
  public static async initiateShutdown(options?: ShutdownOptions): Promise<ShutdownResult> {
    if (shutdownPromise) {
      return await shutdownPromise;
    }

    isShutdownInProgress = true;
    currentLifecycleState = "DRAINING";
    const startTime = Date.now();
    const gracePeriodMs = options?.gracePeriodMs || 5000;
    const reason = options?.reason || "Graceful shutdown requested";

    shutdownPromise = (async (): Promise<ShutdownResult> => {
      let drainedCount = 0;
      let preservedFinancialCount = 0;

      try {
        // 1. Mark all active local workers as DRAINING in database
        await prisma.backgroundWorker.updateMany({
          where: { status: { in: ["STARTING", "IDLE", "BUSY"] } },
          data: { status: "DRAINING" },
        });

        // 2. Query in-flight jobs currently claimed or running
        const inFlightJobs = await prisma.backgroundJob.findMany({
          where: { status: { in: ["CLAIMED", "RUNNING"] } },
        });

        // 3. Partition jobs: safe non-financial vs financial
        for (const job of inFlightJobs) {
          if (job.jobCategory === "FINANCIAL") {
            // FINANCIAL SAFETY INVARIANT: Never blindly release or abort financial transactions!
            // Flag as REQUIRES_RECOVERY so budget reservation stays locked!
            await prisma.backgroundJob.update({
              where: { id: job.id },
              data: {
                status: "REQUIRES_RECOVERY",
                lastErrorMessage: `Application shutdown during execution: ${reason}. Reservation preserved.`,
              },
            });
            preservedFinancialCount++;
          } else {
            // Non-financial: reset to QUEUED with released worker lease
            await prisma.backgroundJob.update({
              where: { id: job.id },
              data: {
                status: "QUEUED",
                workerId: null,
                leaseToken: null,
                leaseExpiresAt: null,
                startedAt: null,
              },
            });
            drainedCount++;
          }
        }

        // 4. Mark workers as STOPPED
        await prisma.backgroundWorker.updateMany({
          where: { status: "DRAINING" },
          data: { status: "STOPPED", stoppedAt: new Date() },
        });

        currentLifecycleState = "STOPPED";
        const durationMs = Date.now() - startTime;

        // 5. Audit log
        await recordAuditEvent({
          userId: "SYSTEM",
          eventType: "SYSTEM_GRACEFUL_SHUTDOWN",
          description: `Shutdown complete in ${durationMs}ms: ${drainedCount} jobs drained, ${preservedFinancialCount} financial jobs preserved.`,
          details: {
            reason,
            drainedCount,
            preservedFinancialCount,
            durationMs,
          },
        });

        // 6. Metrics
        try {
          recordMetric("mandate.resilience.shutdown_duration_ms", durationMs, "ms", {
            reason,
            drained_jobs: drainedCount,
          });
        } catch {
          // Non-blocking
        }

        return {
          completed: true,
          drainedJobsCount: drainedCount,
          preservedFinancialJobsCount: preservedFinancialCount,
          durationMs,
          state: currentLifecycleState,
        };
      } catch (err: any) {
        currentLifecycleState = "STOPPED";
        return {
          completed: false,
          drainedJobsCount: drainedCount,
          preservedFinancialJobsCount: preservedFinancialCount,
          durationMs: Date.now() - startTime,
          state: currentLifecycleState,
        };
      }
    })();

    return await shutdownPromise;
  }

  /**
   * Resets shutdown coordinator state (for testing and re-initialization).
   */
  public static reset(): void {
    currentLifecycleState = "READY";
    isShutdownInProgress = false;
    shutdownPromise = null;
  }
}
