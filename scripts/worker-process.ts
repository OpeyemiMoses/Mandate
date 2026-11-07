/**
 * MANDATE — Milestone 13.6: Dedicated Worker OS Child Process Runner
 * 
 * Runs as an independent OS process for background job and objective execution.
 * Communicates state markers via stdout for external process lifecycle and crash testing.
 */

import {
  isTestOrHarnessRuntime,
  assertNotProductionDatabase,
} from "../src/lib/security/databaseTargetGuard";
import { JobWorkerService } from "../src/lib/jobs/workerService";
import { prisma } from "../src/lib/db";

if (isTestOrHarnessRuntime()) {
  assertNotProductionDatabase(undefined, "scripts/worker-process.ts");
}

// Parse CLI args
const args = process.argv.slice(2);
const workerName = args.find((a) => a.startsWith("--name="))?.split("=")[1] || `worker_proc_${process.pid}`;
const pollIntervalMs = parseInt(args.find((a) => a.startsWith("--poll="))?.split("=")[1] || "500", 10);
const leaseTtlSeconds = parseInt(args.find((a) => a.startsWith("--ttl="))?.split("=")[1] || "3", 10);

console.log(`[PROCESS_START] PID: ${process.pid}, Worker: ${workerName}`);

const worker = new JobWorkerService({
  workerName,
  pollIntervalMs,
  leaseTtlSeconds,
  maxConcurrency: 1,
});

async function run() {
  const registered = await worker.registerWorker();
  console.log(`[WORKER_READY] ID: ${registered.id}, Instance: ${registered.instanceId}, PID: ${process.pid}`);

  await worker.start();
  console.log(`[WORKER_LOOP_ACTIVE] Listening for queued jobs...`);
}

run().catch((err) => {
  console.error(`[WORKER_FATAL] ${err.message}`);
  process.exit(1);
});

// Handle SIGTERM gracefully if asked (though SIGKILL bypasses this)
process.on("SIGTERM", async () => {
  console.log(`[WORKER_SIGTERM] Received SIGTERM, shutting down PID ${process.pid}`);
  await prisma.$disconnect();
  process.exit(0);
});

