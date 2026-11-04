/**
 * Mandate Dedicated Background Worker Process Entry Point
 * Milestone 9.5 Stage 4 — Real Worker Process Architecture
 *
 * Distinct OS-level process entry point for background execution,
 * lease renewal, graceful termination, and fail-closed crash handling.
 */

import os from "os";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { JobWorkerService, WorkerOptions } from "@/lib/jobs/workerService";
import { JobClaimService } from "@/lib/jobs/claimService";
import { JobRegistry } from "@/lib/jobs/registry";
import { recordAuditEvent } from "@/lib/auditLedger";

// Register test harness job definitions for process-level failure simulations
JobRegistry.register({
  jobType: "TEST_ECHO_JOB",
  category: "GENERAL",
  requiredCapability: "*",
  timeoutMs: 10000,
  isFinancial: false,
  requiresApproval: false,
  requiresRecovery: false,
  retryPolicy: {
    maxAttempts: 3,
    initialBackoffMs: 1000,
    backoffMultiplier: 2,
    maxBackoffMs: 5000,
    jitter: false,
  },
  schema: () => ({ valid: true }),
  handler: async (ctx) => {
    return { success: true, result: ctx.payload };
  },
});

JobRegistry.register({
  jobType: "TEST_SLEEP_JOB",
  category: "GENERAL",
  requiredCapability: "*",
  timeoutMs: 30000,
  isFinancial: false,
  requiresApproval: false,
  requiresRecovery: false,
  retryPolicy: {
    maxAttempts: 3,
    initialBackoffMs: 1000,
    backoffMultiplier: 2,
    maxBackoffMs: 5000,
    jitter: false,
  },
  schema: () => ({ valid: true }),
  handler: async (ctx) => {
    const duration = ctx.payload?.durationMs || 3000;
    if (process.send) {
      process.send({
        type: "TEST_SLEEP_JOB_STARTED",
        jobId: ctx.job.id,
        workerId: ctx.workerId,
        pid: process.pid,
        durationMs: duration,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, duration));
    return { success: true, result: { sleptMs: duration } };
  },
});

JobRegistry.register({
  jobType: "TEST_CRASH_ON_RUN_JOB",
  category: "GENERAL",
  requiredCapability: "*",
  timeoutMs: 10000,
  isFinancial: false,
  requiresApproval: false,
  requiresRecovery: false,
  retryPolicy: {
    maxAttempts: 3,
    initialBackoffMs: 1000,
    backoffMultiplier: 2,
    maxBackoffMs: 5000,
    jitter: false,
  },
  schema: () => ({ valid: true }),
  handler: async (ctx) => {
    if (process.send) {
      process.send({
        type: "TEST_SCENARIO_MID_EXECUTION_CRASH",
        jobId: ctx.job.id,
        workerId: ctx.workerId,
        pid: process.pid,
      });
    }
    // Hard crash simulation mid-execution (SIGKILL equivalent)
    process.exit(137);
  },
});

JobRegistry.register({
  jobType: "TEST_POST_PROVIDER_CRASH_JOB",
  category: "FINANCIAL",
  requiredCapability: "*",
  timeoutMs: 10000,
  isFinancial: true,
  requiresApproval: false,
  requiresRecovery: true,
  retryPolicy: {
    maxAttempts: 1,
    initialBackoffMs: 1000,
    backoffMultiplier: 2,
    maxBackoffMs: 5000,
    jitter: false,
  },
  schema: () => ({ valid: true }),
  handler: async (ctx) => {
    const mockTxHash = `mock_tx_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    if (process.send) {
      process.send({
        type: "TEST_SCENARIO_POST_PROVIDER_CRASH",
        jobId: ctx.job.id,
        workerId: ctx.workerId,
        pid: process.pid,
        mockTxHash,
      });
    }
    // Crash immediately after external provider response, before DB persistence!
    process.exit(137);
  },
});

// Command line argument parser helper
function parseArgs(args: string[]): {
  capabilities: string[];
  maxConcurrency: number;
  pollIntervalMs: number;
  leaseTtlSeconds: number;
  workerName: string;
  workerType: string;
  instanceId?: string;
  testScenario?: string;
  once?: boolean;
} {
  const options = {
    capabilities: ["*"],
    maxConcurrency: 1,
    pollIntervalMs: 1000,
    leaseTtlSeconds: 30,
    workerName: `worker_${os.hostname()}_${process.pid}`,
    workerType: "STANDARD",
    instanceId: undefined as string | undefined,
    testScenario: process.env.TEST_SCENARIO || undefined,
    once: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--capabilities" && args[i + 1]) {
      options.capabilities = args[i + 1].split(",").map((s) => s.trim());
      i++;
    } else if (arg === "--concurrency" && args[i + 1]) {
      options.maxConcurrency = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--poll-interval" && args[i + 1]) {
      options.pollIntervalMs = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--lease-ttl" && args[i + 1]) {
      options.leaseTtlSeconds = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--name" && args[i + 1]) {
      options.workerName = args[i + 1];
      i++;
    } else if (arg === "--type" && args[i + 1]) {
      options.workerType = args[i + 1];
      i++;
    } else if (arg === "--instance-id" && args[i + 1]) {
      options.instanceId = args[i + 1];
      i++;
    } else if (arg === "--test-scenario" && args[i + 1]) {
      options.testScenario = args[i + 1];
      i++;
    } else if (arg === "--once") {
      options.once = true;
    }
  }

  return options;
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  const instanceId =
    parsed.instanceId ||
    `inst_${os.hostname()}_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;

  console.log(`[Worker Process] Initializing worker PID ${process.pid}`);
  console.log(`[Worker Process] Instance ID: ${instanceId}`);
  console.log(`[Worker Process] Capabilities: ${JSON.stringify(parsed.capabilities)}`);
  console.log(`[Worker Process] Lease TTL: ${parsed.leaseTtlSeconds}s | Poll Interval: ${parsed.pollIntervalMs}ms`);

  // IPC communication channel to parent test harness if spawned via child_process.fork
  if (process.send) {
    process.send({
      type: "WORKER_STARTING",
      pid: process.pid,
      instanceId,
      options: parsed,
    });
  }

  // Handle deterministic crash harness test scenarios
  if (parsed.testScenario === "exit_before_claim") {
    console.log("[Worker Process] [TestScenario: exit_before_claim] Exiting immediately before claiming jobs");
    if (process.send) process.send({ type: "TEST_SCENARIO_EXIT", scenario: parsed.testScenario, pid: process.pid });
    process.exit(0);
  }

  const workerService = new JobWorkerService({
    workerName: parsed.workerName,
    workerType: parsed.workerType,
    capabilities: parsed.capabilities,
    instanceId,
    maxConcurrency: parsed.maxConcurrency,
    pollIntervalMs: parsed.pollIntervalMs,
    leaseTtlSeconds: parsed.leaseTtlSeconds,
  });

  // Register worker in database
  const workerRecord = await workerService.registerWorker();
  console.log(`[Worker Process] Registered in database with ID ${workerRecord.id}`);

  // Graceful shutdown management
  let isShuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Worker Process] Received ${signal}. Initiating graceful shutdown...`);

    if (process.send) {
      process.send({ type: "WORKER_SHUTDOWN_START", signal, pid: process.pid });
    }

    try {
      // 1. Drain incoming jobs
      console.log("[Worker Process] Draining worker (stopping new job claims)...");
      await workerService.drain();

      // 2. Allow up to 5s for in-flight work to complete or cleanly abort
      const drainTimeout = new Promise((resolve) => setTimeout(resolve, 5000));
      const stopWork = workerService.stop();
      await Promise.race([stopWork, drainTimeout]);

      console.log("[Worker Process] Graceful shutdown complete. Exiting cleanly.");
      if (process.send) {
        process.send({ type: "WORKER_SHUTDOWN_COMPLETE", signal, pid: process.pid });
      }
      process.exit(0);
    } catch (err: any) {
      console.error(`[Worker Process] Error during graceful shutdown: ${err.message}`);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGHUP", () => handleShutdown("SIGHUP"));

  process.on("uncaughtException", async (err) => {
    console.error(`[Worker Process] Uncaught Exception: ${err.message}`, err.stack);
    try {
      if (workerRecord) {
        await prisma.backgroundWorker.update({
          where: { id: workerRecord.id },
          data: { status: "UNHEALTHY" },
        });
      }
    } catch {}
    process.exit(1);
  });

  process.on("unhandledRejection", async (reason: any) => {
    console.error(`[Worker Process] Unhandled Rejection:`, reason);
    try {
      if (workerRecord) {
        await prisma.backgroundWorker.update({
          where: { id: workerRecord.id },
          data: { status: "UNHEALTHY" },
        });
      }
    } catch {}
    process.exit(1);
  });

  if (process.send) {
    process.send({
      type: "WORKER_READY",
      pid: process.pid,
      workerId: workerRecord.id,
      instanceId,
    });
  }

  // Special scenario handling: exit immediately after claim
  if (parsed.testScenario === "exit_after_claim") {
    console.log("[Worker Process] [TestScenario: exit_after_claim] Waiting to claim 1 job then crashing immediately");
    const claim = await JobClaimService.claimNextJob({
      workerId: workerRecord.id,
      workerCapabilities: parsed.capabilities,
      leaseTtlSeconds: parsed.leaseTtlSeconds,
    });
    if (claim.claimed && claim.job) {
      console.log(`[Worker Process] Claimed job ${claim.job.id}, crashing immediately without processing (SIGKILL simulation)`);
      if (process.send) {
        process.send({
          type: "TEST_SCENARIO_CLAIMED_THEN_CRASH",
          jobId: claim.job.id,
          workerId: workerRecord.id,
          pid: process.pid,
          leaseToken: claim.leaseToken,
          leaseExpiresAt: claim.leaseExpiresAt,
        });
      }
      process.exit(137); // Simulated exit/crash code
    } else {
      console.log("[Worker Process] No job available to claim for exit_after_claim scenario");
      process.exit(1);
    }
  }

  // Special scenario handling: stall and lose lease, then attempt completion
  if (parsed.testScenario === "stall_lease_loss") {
    console.log("[Worker Process] [TestScenario: stall_lease_loss] Claiming job, stalling to lose lease, then attempting completion");
    const claim = await JobClaimService.claimNextJob({
      workerId: workerRecord.id,
      workerCapabilities: parsed.capabilities,
      leaseTtlSeconds: 1, // 1 second short lease
    });

    if (claim.claimed && claim.job && claim.leaseToken) {
      console.log(`[Worker Process] Claimed job ${claim.job.id} with 1s lease. Sleeping 2.5s to force lease expiry...`);
      if (process.send) {
        process.send({
          type: "TEST_SCENARIO_CLAIMED_STALLING",
          jobId: claim.job.id,
          workerId: workerRecord.id,
          pid: process.pid,
          leaseToken: claim.leaseToken,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 2500));
      console.log(`[Worker Process] Awake after lease expiration. Attempting stale completion...`);

      try {
        await workerService.processJob(claim.job, claim.leaseToken, 1, claim.leaseGeneration);
        console.error("[Worker Process] Error: processJob unexpectedly succeeded after lease expired!");
        if (process.send) process.send({ type: "STALE_COMPLETION_UNEXPECTED_SUCCESS" });
        process.exit(1);
      } catch (staleErr: any) {
        console.log(`[Worker Process] Expected stale completion rejection caught: ${staleErr.message}`);
        if (process.send) {
          process.send({
            type: "STALE_COMPLETION_REJECTED_SUCCESS",
            message: staleErr.message,
            pid: process.pid,
          });
        }
        process.exit(0);
      }
    } else {
      console.log("[Worker Process] No job available to claim for stall_lease_loss scenario");
      process.exit(1);
    }
  }

  // Special scenario handling: wait for SIGTERM signal test
  if (parsed.testScenario === "wait_for_sigterm") {
    console.log("[Worker Process] [TestScenario: wait_for_sigterm] Worker ready, awaiting parent SIGTERM signal");
    if (process.send) {
      process.send({
        type: "TEST_SCENARIO_WAITING_FOR_SIGTERM",
        workerId: workerRecord.id,
        pid: process.pid,
      });
    }
    // Keep process alive awaiting signal
    await new Promise((resolve) => setTimeout(resolve, 60000));
    process.exit(0);
  }

  // Start processing
  if (parsed.once) {
    console.log("[Worker Process] Running single claim cycle (--once)...");
    const claimResult = await JobClaimService.claimNextJob({
      workerId: workerRecord.id,
      workerCapabilities: parsed.capabilities,
      leaseTtlSeconds: parsed.leaseTtlSeconds,
    });
    if (claimResult.claimed && claimResult.job && claimResult.leaseToken) {
      await workerService.processJob(claimResult.job, claimResult.leaseToken, claimResult.attemptNumber || 1, claimResult.leaseGeneration);
    }
    await workerService.stop();
    process.exit(0);
  } else {
    console.log("[Worker Process] Starting continuous processing loop...");
    await workerService.start();
  }
}

main().catch((err) => {
  console.error("[Worker Process] Fatal startup error:", err);
  process.exit(1);
});

