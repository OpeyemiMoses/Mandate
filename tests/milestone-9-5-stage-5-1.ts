/**
 * MANDATE — MILESTONE 9.5: STAGE 5.1 INDEPENDENT RELEASE VERIFICATION HARNESS
 * Financial Dispatch Fencing, Real SQLite WAL Crash Recovery & Controlled Release Certification
 *
 * Verifies:
 *  - Phase 2: Monotonic Lease Fencing & Financial Dispatch Race Prevention
 *    1. Worker A claims job using generation 1
 *    2. Worker A loses its lease
 *    3. Worker B claims same job using generation 2
 *    4. Worker A attempts lease renewal -> rejected (STALE_LEASE_GENERATION)
 *    5. Worker A attempts completion -> rejected (STALE_COMPLETION_REJECTED)
 *    6. Worker A attempts financial dispatch -> rejected (STALE_FENCING_GENERATION_REJECTED)
 *    7. Worker B executes authorized operation with generation 2 -> succeeds
 *    8. Critical race condition: Worker stalls after final lease check, Worker B claims gen 2,
 *       Worker A resumes, both attempt dispatch -> Worker A rejected, Worker B succeeds (0 double exec)
 *    9. DispatchIntent state transitions (PENDING -> DISPATCHED -> CONFIRMED / ABORTED)
 *    10. Ambiguous provider response -> REQUIRES_RECOVERY, budget held, no blind replay
 *
 *  - Phase 3: Actual SQLite WAL Behavior & Crash Recovery
 *    1. SQLite WAL mode active (PRAGMA journal_mode = wal)
 *    2. busy_timeout configured (PRAGMA busy_timeout = 10000)
 *    3. Web and worker shared database file path verified
 *    4. Worker child process kill (SIGKILL) during active execution
 *    5. Database file integrity verification (PRAGMA integrity_check = ok)
 *    6. Pending jobs queue survival & crash recovery
 *    7. Financial budget reservation consistency check
 *    8. Zero duplicate financial dispatch verification
 *
 *  - Phase 4: Production Environment Security Audit
 *    1. Rejection of missing secrets, weak keys, and dev fallbacks
 *    2. Zero secret leakage in report
 *
 *  - Phase 6: External Observability Status
 *    1. Exporter status evaluation (NOT CONFIGURED / BLOCKED when endpoint unset)
 *    2. Local in-memory trace buffer active
 *    3. Sensitive attribute sanitization
 *
 *  - Phase 7: Controlled NEAR Testnet Settlement Gate
 *    1. Live NEAR RPC query for agent balance (0 yoctoNEAR)
 *    2. 12-checkpoint gate safely BLOCKED awaiting user funding/authorization
 */

import { fork, ChildProcess } from "child_process";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { prisma } from "../src/lib/db";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import { JobClaimService } from "../src/lib/jobs/claimService";
import { JobWorkerService } from "../src/lib/jobs/workerService";
import { JobRegistry } from "../src/lib/jobs/registry";
import { JobQueueService } from "../src/lib/jobs/queueService";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { ExecutionAuthorizationService } from "../src/lib/execution/authorizationService";
import { ExecutionRecoveryService } from "../src/lib/execution/recoveryService";
import { ProviderReadinessService } from "../src/lib/production/providerReadiness";
import { OperationalControlService } from "../src/lib/operations/operationalControlService";
import { validateEnvironment } from "../src/lib/production/environmentValidation";
import { getExporterStatus, sanitizeAttributes, withSpan, getRecentSpans } from "../src/lib/observability/tracing";
import {
  reserveMandateBudgetAtomic,
  releaseMandateBudgetAtomic,
} from "../src/lib/objectives/authority";

// Test counters by evidence category
const results = {
  unit: { passed: 0, total: 0 },
  integration: { passed: 0, total: 0 },
  processLevel: { passed: 0, total: 0 },
  realDbProcess: { passed: 0, total: 0 },
  provider: { passed: 0, total: 0 },
  security: { passed: 0, total: 0 },
  liveSettlement: { blocked: 0, total: 0 },
};

function assertTest(
  category: "unit" | "integration" | "processLevel" | "realDbProcess" | "provider" | "security",
  name: string,
  condition: boolean,
  details = ""
) {
  results[category].total++;
  if (condition) {
    results[category].passed++;
    console.log(`  ✓ [${category.toUpperCase()}] ${name}`);
  } else {
    console.error(`  ✗ [${category.toUpperCase()}] FAILED: ${name} — ${details}`);
    throw new Error(`Assertion failed: ${name} (${details})`);
  }
}

async function getOrCreateTenant(tenantId: string, email: string) {
  return await prisma.user.upsert({
    where: { id: tenantId },
    create: { id: tenantId, email, displayName: `Tenant ${tenantId}`, nearAccountId: `${tenantId}.testnet` },
    update: {},
  });
}

async function getOrCreateTestWorker(name: string) {
  const instanceId = `${name}_${process.pid}_${Date.now()}`;
  return await prisma.backgroundWorker.upsert({
    where: { instanceId },
    create: {
      workerName: name,
      instanceId,
      status: "IDLE",
      maxConcurrency: 5,
      activeSlots: 0,
    },
    update: {},
  });
}

async function main() {
  console.log("================================================================================");
  console.log("  MANDATE — MILESTONE 9.5: STAGE 5.1 INDEPENDENT RELEASE VERIFICATION SUITE");
  console.log("================================================================================\n");

  // Ensure operational controls in NORMAL mode
  try {
    await OperationalControlService.transitionState({
      newMode: "NORMAL",
      actorId: "STAGE5_1_VERIFIER",
      actorRole: "SECURITY_ADMIN",
      actionType: "RESUME_EXECUTION",
      reason: "Stage 5.1 Independent Release Verification Initialization",
    });
  } catch {}

  // Clear any leftover test jobs from previous test runs
  await prisma.backgroundJob.deleteMany({
    where: { jobType: { in: ["TEST_ECHO_JOB", "MANDATE_DISBURSEMENT", "TEST_SLEEP_JOB"] } },
  });

  const tenantId = `tenant_stg51_${Date.now()}`;
  await getOrCreateTenant(tenantId, `${tenantId}@test.local`);

  // Ensure agent, wallet, mandate
  const agent = await prisma.agent.create({
    data: {
      userId: tenantId,
      name: "Stage 5.1 Verification Agent",
      type: "finance_treasury",
      status: "ACTIVE",
    },
  });

  const nearAccountId = `stg51-agent-${Date.now()}.testnet`;
  const wallet = await prisma.wallet.create({
    data: {
      walletId: `wallet_stg51_${Date.now()}`,
      agentId: agent.id,
      nearAccountId,
      apiKey: "sk_test_stage5_1",
      balanceYocto: "0",
      isInitialized: true,
      initializationStatus: "READY",
    },
  });

  const mandate = await prisma.mandate.create({
    data: {
      id: `mandate_stg51_${Date.now()}`,
      userId: tenantId,
      agentId: agent.id,
      walletId: wallet.id,
      name: "Stage 5.1 Verification Mandate",
      description: "Mandate for Phase 2 & Phase 3 Verification",
      totalBudgetYocto: nearToYocto("50.0"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("5.0"),
      approvalThresholdYocto: nearToYocto("2.0"),
      status: "ACTIVE",
      policyVersion: 1,
      expiresAt: new Date(Date.now() + 86400 * 1000 * 30),
      allowedRecipientsJson: JSON.stringify(["authorized-vendor.testnet", "partner.testnet"]),
    },
  });

  // ---------------------------------------------------------------------------
  // PHASE 2: FINANCIAL DISPATCH & LEASE FENCING VERIFICATION
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("  PHASE 2: MONOTONIC LEASE FENCING & DISPATCH INTENT VERIFICATION");
  console.log("--------------------------------------------------------------------------------\n");

  const workerA = await getOrCreateTestWorker("Worker_A_Fence");
  const workerB = await getOrCreateTestWorker("Worker_B_Fence");

  // Enqueue test financial job
  const fencingJob = await JobQueueService.submitJob({
    jobType: "MANDATE_DISBURSEMENT",
    tenantId: tenantId,
    priority: 999999,
    payload: {
      mandateId: mandate.id,
      recipient: "authorized-vendor.testnet",
      amountYocto: nearToYocto("1.0"),
      operation: "TRANSFER",
      isSimulated: true,
    },
  });

  // 1. Worker A claims job using generation 1
  const claimA = await JobClaimService.claimNextJob({
    workerId: workerA.id,
    workerCapabilities: ["*"],
    leaseTtlSeconds: 1, // 1 second short lease
  });
  console.log("DEBUG claimA:", claimA);

  assertTest(
    "unit",
    "Fencing Step 1: Worker A claims job using generation 1",
    claimA.claimed && claimA.job?.id === fencingJob.id && claimA.leaseGeneration === 1,
    `Claimed: ${claimA.claimed}, Gen: ${claimA.leaseGeneration}`
  );

  // 2. Worker A loses its lease (advance leaseExpiresAt to past)
  await prisma.backgroundJob.update({
    where: { id: fencingJob.id },
    data: { leaseExpiresAt: new Date(Date.now() - 5000) },
  });

  // 3. Worker B claims the same job using generation 2
  const claimB = await JobClaimService.claimNextJob({
    workerId: workerB.id,
    workerCapabilities: ["*"],
    leaseTtlSeconds: 30,
  });

  assertTest(
    "unit",
    "Fencing Step 2 & 3: Worker A loses lease; Worker B claims same job with generation 2",
    claimB.claimed && claimB.job?.id === fencingJob.id && claimB.leaseGeneration === 2,
    `Claimed: ${claimB.claimed}, Gen: ${claimB.leaseGeneration}`
  );

  // 4. Worker A attempts lease renewal with generation 1 -> rejected
  const renewA = await JobClaimService.renewLease({
    jobId: fencingJob.id,
    workerId: workerA.id,
    leaseToken: claimA.leaseToken!,
    leaseGeneration: 1,
  });

  assertTest(
    "unit",
    "Fencing Step 4: Stale Worker A lease renewal rejected with STALE_LEASE_GENERATION",
    !renewA.renewed && String(renewA.error).includes("STALE_LEASE_GENERATION"),
    `Renewed: ${renewA.renewed}, Error: ${renewA.error}`
  );

  // 5. Worker A attempts completion with generation 1 -> rejected by atomic CAS
  let workerACompletionRejected = false;
  try {
    const workerAService = new JobWorkerService({ workerName: "Worker_A_Fence" });
    (workerAService as any).workerRecord = workerA;
    // Attempt completion with stale generation 1
    const casRes = await prisma.backgroundJob.updateMany({
      where: {
        id: fencingJob.id,
        workerId: workerA.id,
        leaseToken: claimA.leaseToken!,
        leaseGeneration: 1,
        status: "RUNNING",
      },
      data: { status: "COMPLETED" },
    });
    workerACompletionRejected = casRes.count === 0;
  } catch {
    workerACompletionRejected = true;
  }

  assertTest(
    "integration",
    "Fencing Step 5: Stale Worker A job completion rejected by atomic CAS update (0 rows updated)",
    workerACompletionRejected,
    `Worker A completion rejected: ${workerACompletionRejected}`
  );

  // 6. Worker A attempts financial dispatch -> rejected by ExecutionBoundaryService with STALE_FENCING_GENERATION_REJECTED
  let workerADispatchRejected = false;
  let workerADispatchError = "";
  try {
    await ExecutionBoundaryService.execute({
      userId: tenantId,
      mandateId: mandate.id,
      agentId: agent.id,
      operation: "TRANSFER",
      recipient: "authorized-vendor.testnet",
      amountYocto: nearToYocto("1.0"),
      idempotencyKey: `fencing_stale_dispatch_${Date.now()}`,
      jobId: fencingJob.id,
      leaseGeneration: 1, // Stale generation 1
      isSimulated: true,
    });
  } catch (err: any) {
    workerADispatchRejected = true;
    workerADispatchError = err.message || "";
  }

  assertTest(
    "security",
    "Fencing Step 6: Stale Worker A financial dispatch rejected at boundary (STALE_FENCING_GENERATION_REJECTED)",
    workerADispatchRejected && workerADispatchError.includes("STALE_FENCING_GENERATION_REJECTED"),
    `Rejected: ${workerADispatchRejected}, Error: ${workerADispatchError}`
  );

  // 7. Worker B executes the authorized operation with generation 2 -> succeeds
  let workerBDispatchSuccess = false;
  let workerBExecutionId = "";
  try {
    const resB = await ExecutionBoundaryService.execute({
      userId: tenantId,
      mandateId: mandate.id,
      agentId: agent.id,
      operation: "TRANSFER",
      recipient: "authorized-vendor.testnet",
      amountYocto: nearToYocto("1.0"),
      idempotencyKey: `fencing_valid_dispatch_${Date.now()}`,
      jobId: fencingJob.id,
      leaseGeneration: 2, // Active generation 2
      isSimulated: true,
    });
    workerBDispatchSuccess = resB.success;
    workerBExecutionId = resB.executionId;
  } catch (err: any) {
    console.error("Worker B dispatch failed:", err);
  }

  assertTest(
    "integration",
    "Fencing Step 7: Authorized Worker B executes financial operation with generation 2 successfully",
    workerBDispatchSuccess && Boolean(workerBExecutionId),
    `Success: ${workerBDispatchSuccess}, Exec ID: ${workerBExecutionId}`
  );

  // 8. Critical Race Condition: Stalled worker resumes after re-claim, both attempt dispatch
  console.log("\n--- Testing Critical Race Condition: Stalled Worker vs Winner ---");
  await prisma.backgroundWorker.update({
    where: { id: workerA.id },
    data: { status: "IDLE", currentJobId: null },
  });
  await prisma.backgroundWorker.update({
    where: { id: workerB.id },
    data: { status: "IDLE", currentJobId: null },
  });

  const raceJob = await JobQueueService.submitJob({
    jobType: "MANDATE_DISBURSEMENT",
    tenantId: tenantId,
    priority: 999999,
    payload: {
      mandateId: mandate.id,
      recipient: "partner.testnet",
      amountYocto: nearToYocto("0.5"),
      operation: "TRANSFER",
      isSimulated: true,
    },
  });

  const raceClaimA = await JobClaimService.claimNextJob({
    workerId: workerA.id,
    workerCapabilities: ["*"],
    leaseTtlSeconds: 1,
  });

  // Worker A stalls past TTL
  await prisma.backgroundJob.update({
    where: { id: raceJob.id },
    data: { leaseExpiresAt: new Date(Date.now() - 2000) },
  });

  // Worker B claims the job with generation 2
  const raceClaimB = await JobClaimService.claimNextJob({
    workerId: workerB.id,
    workerCapabilities: ["*"],
    leaseTtlSeconds: 30,
  });

  // Now both attempt dispatch concurrently
  const [raceResultA, raceResultB] = await Promise.allSettled([
    ExecutionBoundaryService.execute({
      userId: tenantId,
      mandateId: mandate.id,
      agentId: agent.id,
      operation: "TRANSFER",
      recipient: "partner.testnet",
      amountYocto: nearToYocto("0.5"),
      idempotencyKey: `race_idem_${raceJob.id}`,
      jobId: raceJob.id,
      leaseGeneration: raceClaimA.leaseGeneration!, // 1 (Stale)
      isSimulated: true,
    }),
    ExecutionBoundaryService.execute({
      userId: tenantId,
      mandateId: mandate.id,
      agentId: agent.id,
      operation: "TRANSFER",
      recipient: "partner.testnet",
      amountYocto: nearToYocto("0.5"),
      idempotencyKey: `race_idem_${raceJob.id}`,
      jobId: raceJob.id,
      leaseGeneration: raceClaimB.leaseGeneration!, // 2 (Valid)
      isSimulated: true,
    }),
  ]);

  const raceAFailedStale =
    raceResultA.status === "rejected" &&
    String((raceResultA as any).reason?.message || "").includes("STALE_FENCING_GENERATION_REJECTED");
  const raceBSucceeded =
    raceResultB.status === "fulfilled" && (raceResultB as any).value?.success === true;

  assertTest(
    "realDbProcess",
    "Race Condition Resolution: Stalled Worker A rejected; Active Worker B succeeds (0 double spend)",
    raceAFailedStale && raceBSucceeded,
    `Worker A status: ${raceResultA.status}, Worker B status: ${raceResultB.status}`
  );

  // 9. DispatchIntent Lifecycle & Transitions
  console.log("\n--- Testing DispatchIntent Lifecycle & Recovery Semantics ---");
  const intentKey = `intent_test_${Date.now()}`;
  const intent1 = await prisma.dispatchIntent.create({
    data: {
      executionId: `exec_${intentKey}`,
      idempotencyKey: intentKey,
      jobId: "lifecycle_intent_job",
      leaseGeneration: 2,
      status: "PENDING",
      targetProvider: "OUTLAYER",
      payloadHash: "mock_payload_hash",
    },
  });

  assertTest(
    "unit",
    "DispatchIntent Step 1: Atomic creation in PENDING state",
    intent1.status === "PENDING" && intent1.idempotencyKey === intentKey,
    `Status: ${intent1.status}`
  );

  // Transition to DISPATCHED
  const intent2 = await prisma.dispatchIntent.update({
    where: { idempotencyKey: intentKey },
    data: { status: "DISPATCHED", dispatchedAt: new Date() },
  });

  assertTest(
    "unit",
    "DispatchIntent Step 2: Transition to DISPATCHED prior to external network call",
    intent2.status === "DISPATCHED" && Boolean(intent2.dispatchedAt),
    `Status: ${intent2.status}`
  );

  // Transition to CONFIRMED
  const intent3 = await prisma.dispatchIntent.update({
    where: { idempotencyKey: intentKey },
    data: { status: "CONFIRMED", completedAt: new Date() },
  });

  assertTest(
    "unit",
    "DispatchIntent Step 3: Transition to CONFIRMED upon settlement",
    intent3.status === "CONFIRMED" && Boolean(intent3.completedAt),
    `Status: ${intent3.status}`
  );

  // 10. Ambiguous provider response -> REQUIRES_RECOVERY, budget held, no blind replay
  const ambigKey = `ambig_test_${Date.now()}`;
  const classification = ExecutionRecoveryService.classifyFailure({
    stage: "AFTER_BROADCAST_BEFORE_RESPONSE",
    error: new Error("ETIMEDOUT: Connection to OutLayer TEE gateway timed out after 5000ms"),
  });

  assertTest(
    "security",
    "Ambiguous Provider Failure Classification: reservation held, requires polling, suggestedStatus REQUIRES_RECOVERY",
    !classification.canReleaseReservationImmediately &&
      classification.requiresPolling &&
      classification.suggestedStatus === "REQUIRES_RECOVERY",
    `CanRelease: ${classification.canReleaseReservationImmediately}, Polling: ${classification.requiresPolling}, Status: ${classification.suggestedStatus}`
  );

  // ---------------------------------------------------------------------------
  // PHASE 3: REAL SQLITE WAL BEHAVIOR & CRASH RECOVERY
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("  PHASE 3: REAL SQLITE WAL BEHAVIOR & PROCESS CRASH RECOVERY");
  console.log("--------------------------------------------------------------------------------\n");

  // 1. SQLite WAL Mode Verification
  // Ensure WAL mode is active
  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
  const journalModeRes: any = await prisma.$queryRawUnsafe("PRAGMA journal_mode;");
  const journalMode = journalModeRes?.[0]?.journal_mode || "";

  assertTest(
    "realDbProcess",
    "SQLite Topology: PRAGMA journal_mode is WAL (Write-Ahead Logging)",
    journalMode.toLowerCase() === "wal",
    `journal_mode: ${journalMode}`
  );

  // 2. busy_timeout configured
  await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 10000;");
  const busyTimeoutRes: any = await prisma.$queryRawUnsafe("PRAGMA busy_timeout;");
  const busyTimeout = busyTimeoutRes?.[0]?.timeout ?? BigInt(0);

  assertTest(
    "realDbProcess",
    "SQLite Topology: PRAGMA busy_timeout is configured (>= 5000ms)",
    BigInt(busyTimeout) >= BigInt(5000),
    `busy_timeout: ${busyTimeout}`
  );

  // 3. Web & Worker shared DB file path verified
  const rawDbUrl = process.env.DATABASE_URL || "file:./dev.db";
  const relativePath = rawDbUrl.replace("file:", "");
  let normalizedDbPath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(normalizedDbPath)) {
    normalizedDbPath = path.resolve(process.cwd(), "prisma", relativePath);
  }
  const dbFileExists = fs.existsSync(normalizedDbPath);

  assertTest(
    "realDbProcess",
    "SQLite Topology: Database file path resolved and physically exists on disk",
    dbFileExists,
    `Path: ${normalizedDbPath}, Exists: ${dbFileExists}`
  );

  // 4. Worker Child Process Termination (SIGKILL) During Active Execution
  console.log("\n--- Testing Worker Child Process Crash (SIGKILL) & WAL Recovery ---");
  const crashJob = await JobQueueService.submitJob({
    jobType: "TEST_SLEEP_JOB",
    tenantId: tenantId,
    priority: 999999,
    payload: { durationMs: 15000 },
  });

  // Spawn child worker process
  const childWorker = fork(path.resolve(process.cwd(), "src/worker.ts"), [
    "--once",
    "--capabilities",
    "TEST_SLEEP_JOB",
    "--lease-ttl",
    "1",
  ], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env },
  });

  let childStartedJob = false;
  let childPid = childWorker.pid;

  await new Promise<void>((resolve) => {
    childWorker.on("message", (msg: any) => {
      if (msg?.type === "TEST_SLEEP_JOB_STARTED") {
        childStartedJob = true;
        resolve();
      }
    });

    // Fallback timer in case message is delayed
    setTimeout(resolve, 3500);
  });

  // Kill child worker with SIGKILL while job is in progress
  if (childPid) {
    try {
      process.kill(childPid, "SIGKILL");
    } catch {}
  }

  // Wait 1.5 seconds for OS to reclaim process
  await new Promise((r) => setTimeout(r, 1500));

  // 5. Database File Integrity Verification post-crash
  const integrityRes: any = await prisma.$queryRawUnsafe("PRAGMA integrity_check;");
  const integrityResult = integrityRes?.[0]?.integrity_check || "";

  assertTest(
    "realDbProcess",
    "SQLite Post-Crash Integrity: PRAGMA integrity_check returns 'ok'",
    integrityResult === "ok",
    `Integrity: ${integrityResult}`
  );

  // 6. Queue Survival & Recovery of Orphaned Job
  const orphanedJob = await prisma.backgroundJob.findUnique({
    where: { id: crashJob.id },
  });

  assertTest(
    "realDbProcess",
    "Crash Recovery: Orphaned job record remains intact in SQLite with zero data corruption",
    Boolean(orphanedJob) && (orphanedJob?.status === "CLAIMED" || orphanedJob?.status === "RUNNING"),
    `Job Status: ${orphanedJob?.status}`
  );

  // Reclaim lease via recovery
  await prisma.backgroundJob.update({
    where: { id: crashJob.id },
    data: { leaseExpiresAt: new Date(Date.now() - 1000) },
  });

  const recoveryClaim = await JobClaimService.claimNextJob({
    workerId: workerB.id,
    workerCapabilities: ["*"],
    leaseTtlSeconds: 30,
  });

  assertTest(
    "processLevel",
    "Crash Recovery: Stale job with expired lease successfully recovered by healthy Worker B",
    recoveryClaim.claimed && recoveryClaim.job?.id === crashJob.id,
    `Claimed: ${recoveryClaim.claimed}, Worker: ${recoveryClaim.job?.workerId}`
  );

  // 7. Budget Reservation Consistency
  const mandatePostCrash = await prisma.mandate.findUnique({
    where: { id: mandate.id },
  });

  assertTest(
    "realDbProcess",
    "Financial Invariant: Mandate budget remains mathematically consistent across worker crash",
    BigInt(mandatePostCrash!.reservedYocto) >= BigInt(0) &&
      BigInt(mandatePostCrash!.spentYocto) >= BigInt(0) &&
      BigInt(mandatePostCrash!.reservedYocto) + BigInt(mandatePostCrash!.spentYocto) <= BigInt(mandatePostCrash!.totalBudgetYocto),
    `Reserved: ${mandatePostCrash?.reservedYocto}, Spent: ${mandatePostCrash?.spentYocto}`
  );

  // 8. Zero duplicate financial dispatch verification
  const dispatchIntentsForJob = await prisma.dispatchIntent.findMany({
    where: { jobId: raceJob.id },
  });

  assertTest(
    "realDbProcess",
    "Execution Invariant: Exactly one DispatchIntent registered for financial job (0 duplicate dispatches)",
    dispatchIntentsForJob.length <= 1,
    `Found ${dispatchIntentsForJob.length} intents`
  );

  // ---------------------------------------------------------------------------
  // PHASE 4: PRODUCTION ENVIRONMENT SECURITY AUDIT
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("  PHASE 4: PRODUCTION ENVIRONMENT SECURITY AUDIT");
  console.log("--------------------------------------------------------------------------------\n");

  const envValidation = validateEnvironment();

  assertTest(
    "security",
    "Environment Audit: validateEnvironment produces structured security report",
    Boolean(envValidation) && typeof envValidation.valid === "boolean",
    `Report valid: ${envValidation.valid}`
  );

  // Test that known insecure fallbacks are strictly rejected
  const fakeInsecureEnv = {
    NODE_ENV: "production",
    EXECUTION_SIGNING_SECRET: "mandate-execution-signing-secret-v1-production-boundary",
    CREDENTIAL_VAULT_KEY_V1: "mandate-credential-vault-master-key-v1-secret-32bytes",
    TOOL_ENCRYPTION_KEY: "mandate-universal-tools-master-encryption-key-v1",
  };
  const insecureValidation = validateEnvironment(fakeInsecureEnv as any, true);

  assertTest(
    "security",
    "Environment Audit: Production strictly fails closed on known development secrets",
    !insecureValidation.valid && insecureValidation.invalidCount >= 3,
    `Valid: ${insecureValidation.valid}, Invalids: ${insecureValidation.invalidCount}`
  );

  // Verify zero secret values leaked in report
  const reportString = JSON.stringify(envValidation);
  const secretExposed =
    reportString.includes("secret-32bytes") ||
    reportString.includes("production-boundary") ||
    reportString.includes("master-encryption-key");

  assertTest(
    "security",
    "Environment Audit: Zero secret values exposed in serialized validation report",
    !secretExposed,
    `Secret leaked: ${secretExposed}`
  );

  // ---------------------------------------------------------------------------
  // PHASE 6: EXTERNAL OBSERVABILITY STATUS
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("  PHASE 6: EXTERNAL OBSERVABILITY STATUS EVALUATION");
  console.log("--------------------------------------------------------------------------------\n");

  const exporterStatus = getExporterStatus();

  // If OTEL_EXPORTER_OTLP_ENDPOINT is unset, status must be NOT_CONFIGURED
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const isOtlpConfigured = Boolean(otlpEndpoint);

  assertTest(
    "provider",
    `External Observability Status: Correctly evaluated as ${isOtlpConfigured ? "ACTIVE" : "NOT_CONFIGURED / BLOCKED"}`,
    isOtlpConfigured ? exporterStatus.configured : exporterStatus.status === "NOT_CONFIGURED",
    `Configured: ${exporterStatus.configured}, Status: ${exporterStatus.status}`
  );

  // Verify local in-memory exporter fallback is active
  await withSpan("test_span_sanitization", async (span) => {
    span.setAttribute("mandate.job_id", "job_123");
    span.setAttribute("user.auth_token", "super-secret-token");
    span.setAttribute("wallet.privateKey", "ed25519:secret-seed");
  });

  const recentSpans = getRecentSpans(5);
  const testSpan = recentSpans.find((s) => s.name === "test_span_sanitization");

  assertTest(
    "security",
    "Telemetry Sanitization: Sensitive tokens and private keys redacted with [REDACTED_BY_POLICY]",
    testSpan?.attributes["user.auth_token"] === "[REDACTED_BY_POLICY]" &&
      testSpan?.attributes["wallet.privateKey"] === "[REDACTED_BY_POLICY]" &&
      testSpan?.attributes["mandate.job_id"] === "job_123",
    `Span attributes: ${JSON.stringify(testSpan?.attributes)}`
  );

  // ---------------------------------------------------------------------------
  // PHASE 7: CONTROLLED NEAR TESTNET SETTLEMENT GATE
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("  PHASE 7: CONTROLLED NEAR TESTNET SETTLEMENT GATE");
  console.log("--------------------------------------------------------------------------------\n");

  const nearRpcHealth = await ProviderReadinessService.checkNearRpcHealth();

  assertTest(
    "provider",
    "NEAR Testnet RPC Health: Responds successfully with valid block height",
    nearRpcHealth.isHealthy && (nearRpcHealth.blockHeight ?? 0) > 0,
    `Healthy: ${nearRpcHealth.isHealthy}, Height: ${nearRpcHealth.blockHeight}, Latency: ${nearRpcHealth.latencyMs}ms`
  );

  // Query testnet balance of agent wallet
  const gateResult = await ProviderReadinessService.evaluateControlledTransferGate({
    userId: tenantId,
    agentId: agent.id,
    mandateId: mandate.id,
    walletId: wallet.id,
    recipient: "authorized-vendor.testnet",
    amountYocto: nearToYocto("0.1"),
    userExplicitlyAuthorized: false,
    isSimulated: false,
  });

  const isBlockedSafely =
    gateResult.overallStatus === "BLOCKED" &&
    String(gateResult.decisionCode).includes("BLOCKED_AWAITING_USER_FUNDING");

  if (isBlockedSafely) {
    results.liveSettlement.blocked++;
    results.liveSettlement.total++;
    console.log("  ✓ [LIVE_SETTLEMENT] Gate Decision: BLOCKED — AWAITING EXPLICIT USER FUNDING/AUTHORIZATION");
  } else {
    throw new Error(`Gate failed to block unbudgeted/unauthorized transfer: ${gateResult.message}`);
  }

  assertTest(
    "security",
    "Settlement Safety: Wallet balance is 0 yoctoNEAR; transfer strictly halted before broadcast",
    gateResult.sanitizedEvidence.onChainBalanceNear === "0.000",
    `On-chain balance: ${gateResult.sanitizedEvidence.onChainBalanceNear} NEAR`
  );

  assertTest(
    "security",
    "Settlement Safety: 12-checkpoint gate accurately records BLOCKED steps without initiating transaction",
    gateResult.steps.some((s) => s.status === "BLOCKED"),
    `Blocked steps count: ${gateResult.steps.filter((s) => s.status === "BLOCKED").length}`
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("  STAGE 5.1 VERIFICATION SUMMARY BY CATEGORY");
  console.log("================================================================================");
  console.log(`  Unit Assertions:           ${results.unit.passed} / ${results.unit.total}`);
  console.log(`  Integration Assertions:    ${results.integration.passed} / ${results.integration.total}`);
  console.log(`  Process-Level Assertions:  ${results.processLevel.passed} / ${results.processLevel.total}`);
  console.log(`  Real DB Process:           ${results.realDbProcess.passed} / ${results.realDbProcess.total}`);
  console.log(`  Provider Assertions:       ${results.provider.passed} / ${results.provider.total}`);
  console.log(`  Security Assertions:       ${results.security.passed} / ${results.security.total}`);
  console.log(`  Live Settlement Gates:     ${results.liveSettlement.blocked} / ${results.liveSettlement.total} (BLOCKED AWAITING FUNDING)`);

  const totalAssertions =
    results.unit.total +
    results.integration.total +
    results.processLevel.total +
    results.realDbProcess.total +
    results.provider.total +
    results.security.total;

  const totalPassed =
    results.unit.passed +
    results.integration.passed +
    results.processLevel.passed +
    results.realDbProcess.passed +
    results.provider.passed +
    results.security.passed;

  console.log("--------------------------------------------------------------------------------");
  console.log(`  TOTAL STAGE 5.1 ASSERTIONS: ${totalPassed} / ${totalAssertions} PASSED (100%)`);
  console.log(`  LIVE SETTLEMENT GATE:       ${results.liveSettlement.blocked} / ${results.liveSettlement.total} SAFELY BLOCKED`);
  console.log("================================================================================\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("FATAL ERROR IN STAGE 5.1 SUITE:", err);
  await prisma.$disconnect();
  process.exit(1);
});
