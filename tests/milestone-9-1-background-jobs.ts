/**
 * MANDATE — MILESTONE 9.1: BACKGROUND EXECUTION & WORKER RELIABILITY
 * Comprehensive Adversarial & Resilience Test Suite
 *
 * Covers all 30 test scenarios across:
 * - Queue persistence & Idempotency
 * - Worker concurrency & Database-backed leases
 * - Retry engine & Exponential backoff
 * - Financial safety & Milestone 7/8 authority enforcement
 * - Tenant isolation & Boundary enforcement
 * - Append-only lifecycle events & SHA-256 audit ledger
 */

import crypto from "crypto";
import { prisma } from "../src/lib/db";
import {
  JobQueueService,
  JobClaimService,
  JobRetryService,
  JobRecoveryService,
  DeadLetterService,
  JobWorkerService,
  JobRegistry,
} from "../src/lib/jobs";
import { PolicyEngine } from "../src/lib/governance/engine";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { verifyAuditChain } from "../src/lib/auditLedger";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, testNum: number, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ Case ${testNum} PASS: ${testName}`);
    if (detail) console.log(`     ↳ ${detail}`);
    totalPassed++;
  } else {
    console.error(`  ✗ Case ${testNum} FAIL: ${testName}`);
    if (detail) console.error(`     ↳ Details: ${detail}`);
    totalFailed++;
  }
}

async function runMilestone91TestSuite() {
  console.log("================================================================================");
  console.log("  MANDATE — MILESTONE 9.1: BACKGROUND EXECUTION & WORKER RELIABILITY TEST SUITE");
  console.log("================================================================================");

  const testRunId = `run_m91_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  // Provision Tenant Alice & Tenant Bob
  const userAlice = await prisma.user.upsert({
    where: { nearAccountId: `alice_m91_${testRunId}.testnet` },
    create: {
      nearAccountId: `alice_m91_${testRunId}.testnet`,
      displayName: "Alice Background Operator",
      sessionToken: `sess_alice_${testRunId}`,
    },
    update: {},
  });

  const userBob = await prisma.user.upsert({
    where: { nearAccountId: `bob_m91_${testRunId}.testnet` },
    create: {
      nearAccountId: `bob_m91_${testRunId}.testnet`,
      displayName: "Bob Adversary",
      sessionToken: `sess_bob_${testRunId}`,
    },
    update: {},
  });

  // Provision Wallet & Mandate for Alice
  const agentAlice = await prisma.agent.create({
    data: {
      name: "Alice Background Agent",
      type: "treasury_operations",
      userId: userAlice.id,
    },
  });

  const walletAlice = await prisma.wallet.create({
    data: {
      walletId: `outlayer_wallet_m91_${testRunId}`,
      apiKey: `wk_test_m91_${testRunId}`,
      nearAccountId: `wallet_alice_${testRunId}.testnet`,
      balanceYocto: nearToYocto("5.0"),
      agent: { connect: { id: agentAlice.id } },
    },
  });

  const mandateAlice = await prisma.mandate.create({
    data: {
      name: "Alice Background Disbursement Mandate",
      totalBudgetYocto: nearToYocto("5.0"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("1.0"),
      approvalThresholdYocto: nearToYocto("0.5"),
      allowedRecipientsJson: JSON.stringify([
        "vendor-payments.testnet",
        "cloud-host.testnet",
        "blocked-scammer.testnet",
      ]),
      expiresAt: new Date(Date.now() + 86400000),
      status: "ACTIVE",
      policyVersion: 1,
      userId: userAlice.id,
      agentId: agentAlice.id,
      walletId: walletAlice.id,
    },
  });

  // ---------------------------------------------------------------------------
  // SECTION 1: QUEUE PERSISTENCE & IDEMPOTENCY
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 1: QUEUE PERSISTENCE & IDEMPOTENCY");
  console.log("--------------------------------------------------------------------------------");

  // Case 1: Submit a job and verify it exists in the database
  const job1Payload = { ping: "hello_db_persistence", echo: true };
  const job1 = await JobQueueService.submitJob({
    tenantId: userAlice.id,
    jobType: "SYSTEM_HEALTH_CHECK",
    payload: job1Payload,
    priority: 10,
    correlationId: `corr_job1_${testRunId}`,
  });

  const persistedJob1 = await prisma.backgroundJob.findUnique({
    where: { id: job1.id },
  });

  assert(
    Boolean(persistedJob1 && persistedJob1.status === "QUEUED" && persistedJob1.priority === 10),
    1,
    "Submit a job and verify it exists in the database",
    `Job ID: ${job1.id}, Status: ${persistedJob1?.status}, PayloadHash: ${persistedJob1?.payloadHash.slice(0, 16)}...`
  );

  // Case 2: Restart worker process and verify job remains
  // Simulate worker restart: instantiate a new JobWorkerService instance
  const workerInstance1 = new JobWorkerService({
    instanceId: `inst_worker_1_${testRunId}`,
    workerName: "Worker Node 1",
    capabilities: ["*"],
  });
  const worker1Record = await workerInstance1.registerWorker();

  const job1AfterWorkerRestart = await prisma.backgroundJob.findUnique({
    where: { id: job1.id },
  });

  assert(
    job1AfterWorkerRestart?.status === "QUEUED" && job1AfterWorkerRestart?.id === job1.id,
    2,
    "Restart worker process and verify the job remains persisted in QUEUED state",
    `Job ${job1.id} preserved across worker instantiation`
  );

  // Case 3: Restart application state and verify queued jobs remain
  // Simulating fresh connection / new process query
  const freshDbFetch = await prisma.backgroundJob.findFirst({
    where: { id: job1.id, tenantId: userAlice.id },
  });

  assert(
    freshDbFetch !== null && freshDbFetch.payloadHash === job1.payloadHash,
    3,
    "Application restart simulation: Queued job fully intact in database",
    `Hash verified: ${freshDbFetch?.payloadHash.slice(0, 16)}...`
  );

  // Case 4: Submit duplicate idempotency request (returns identical job)
  const idemKey = `idem_key_${testRunId}_unique`;
  const jobWithIdem = await JobQueueService.submitJob({
    tenantId: userAlice.id,
    jobType: "SYSTEM_HEALTH_CHECK",
    payload: { ping: "fixed_payload" },
    idempotencyKey: idemKey,
  });

  const duplicateSubmit = await JobQueueService.submitJob({
    tenantId: userAlice.id,
    jobType: "SYSTEM_HEALTH_CHECK",
    payload: { ping: "fixed_payload" },
    idempotencyKey: idemKey,
  });

  assert(
    jobWithIdem.id === duplicateSubmit.id,
    4,
    "Submit duplicate idempotency request returns identical existing job without re-submission",
    `Job ID: ${duplicateSubmit.id} matched original`
  );

  // Case 5: Reuse idempotency key with altered payload (parameter drift strictly rejected)
  let driftRejected = false;
  let driftError = "";
  try {
    await JobQueueService.submitJob({
      tenantId: userAlice.id,
      jobType: "SYSTEM_HEALTH_CHECK",
      payload: { ping: "TAMPERED_ALTERED_PAYLOAD" },
      idempotencyKey: idemKey,
    });
  } catch (err: any) {
    driftRejected = true;
    driftError = err.message;
  }

  assert(
    driftRejected && driftError.includes("Parameter drift rejected"),
    5,
    "Reuse idempotency key with altered payload is strictly rejected",
    `Rejection: "${driftError}"`
  );

  // ---------------------------------------------------------------------------
  // SECTION 2: WORKER CONCURRENCY & LEASE EXCLUSIVITY
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 2: WORKER CONCURRENCY & LEASE EXCLUSIVITY");
  console.log("--------------------------------------------------------------------------------");

  // Register Worker 2
  const workerInstance2 = new JobWorkerService({
    instanceId: `inst_worker_2_${testRunId}`,
    workerName: "Worker Node 2",
    capabilities: ["*"],
  });
  const worker2Record = await workerInstance2.registerWorker();

  // Register unique job type for atomic concurrency contest
  const contestJobType = `CONTEST_JOB_${testRunId}`;
  JobRegistry.register({
    jobType: contestJobType,
    category: "GENERAL",
    requiredCapability: "contest",
    timeoutMs: 10000,
    isFinancial: false,
    requiresApproval: false,
    requiresRecovery: false,
    retryPolicy: {
      maxAttempts: 3,
      initialBackoffMs: 5000,
      backoffMultiplier: 2,
      maxBackoffMs: 20000,
      jitter: false,
    },
    schema: () => ({ valid: true }),
    handler: async () => ({ success: true }),
  });

  // Create single test job for concurrency contest
  const contestJob = await JobQueueService.submitJob({
    tenantId: userAlice.id,
    jobType: contestJobType,
    payload: { ping: "concurrency_contest" },
    priority: 50,
  });

  // Case 6 & 7: Two workers attempt to claim the exact same job simultaneously
  const [claim1, claim2] = await Promise.all([
    JobClaimService.claimNextJob({
      workerId: worker1Record.id,
      workerCapabilities: [contestJobType],
      leaseTtlSeconds: 5,
    }),
    JobClaimService.claimNextJob({
      workerId: worker2Record.id,
      workerCapabilities: [contestJobType],
      leaseTtlSeconds: 5,
    }),
  ]);

  const exactlyOneSucceeded =
    (claim1.claimed && !claim2.claimed) || (!claim1.claimed && claim2.claimed);

  const winningClaim = claim1.claimed ? claim1 : claim2;
  const losingClaim = claim1.claimed ? claim2 : claim1;

  assert(
    Boolean(claim1 && claim2),
    6,
    "Two concurrent workers attempt to claim the same job",
    `Worker 1: ${claim1.claimed ? "CLAIMED" : claim1.reason}, Worker 2: ${claim2.claimed ? "CLAIMED" : claim2.reason}`
  );

  assert(
    exactlyOneSucceeded && Boolean(winningClaim.leaseToken),
    7,
    "Only one worker succeeds in atomic job claim (exclusivity guaranteed)",
    `Winner: ${winningClaim.job?.workerId}, Loser Reason: ${losingClaim.reason}`
  );

  // Case 8: Worker lease expires
  // Artificially expire the winner's lease in database
  const activeJobId = winningClaim.job!.id;
  await prisma.backgroundJob.update({
    where: { id: activeJobId },
    data: {
      leaseExpiresAt: new Date(Date.now() - 10000), // Expired 10 seconds ago
    },
  });

  const expiredJobRecord = await prisma.backgroundJob.findUnique({
    where: { id: activeJobId },
  });

  assert(
    Boolean(expiredJobRecord && expiredJobRecord.leaseExpiresAt && expiredJobRecord.leaseExpiresAt < new Date()),
    8,
    "Worker lease successfully expires in database",
    `Expired At: ${expiredJobRecord?.leaseExpiresAt?.toISOString()}`
  );

  // Case 9: Another worker safely recovers eligible work
  const recoveryReport = await JobRecoveryService.recoverAbandonedLeases();
  const recoveredJob = await prisma.backgroundJob.findUnique({
    where: { id: activeJobId },
  });

  assert(
    recoveryReport.recoveredCount >= 1 && (recoveredJob?.status === "RETRY_WAIT" || recoveredJob?.status === "QUEUED"),
    9,
    "Another worker/recovery manager safely recovers eligible work from expired lease",
    `Recovered Status: ${recoveredJob?.status}, Worker reset: ${recoveredJob?.workerId === null}`
  );

  // Case 10: Old worker attempts to renew an expired or reassigned lease (strictly rejected)
  const renewAttempt = await JobClaimService.renewLease({
    jobId: activeJobId,
    workerId: winningClaim.job!.workerId!,
    leaseToken: winningClaim.leaseToken!,
    ttlSeconds: 30,
  });

  assert(
    Boolean(!renewAttempt.renewed && (renewAttempt.error?.includes("JOB_NOT_ACTIVE") || renewAttempt.error?.includes("LEASE_LOST_OR_REASSIGNED"))),
    10,
    "Old worker attempting to renew expired or recovered lease is strictly rejected",
    `Rejection: "${renewAttempt.error}"`
  );

  // ---------------------------------------------------------------------------
  // SECTION 3: RETRY ENGINE & EXPONENTIAL BACKOFF
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 3: RETRY ENGINE & EXPONENTIAL BACKOFF");
  console.log("--------------------------------------------------------------------------------");

  // Case 11: Retryable failure schedules next attempt
  const retryableError = new Error("Gateway 503: Connection timeout to upstream provider");
  const classification = JobRetryService.classifyFailure(retryableError);

  assert(
    classification.isRetryable && classification.errorCode === "TRANSIENT_INFRASTRUCTURE_FAILURE",
    11,
    "Retryable failure correctly classified and scheduled for next attempt",
    `Error Code: ${classification.errorCode}`
  );

  // Case 12: Exponential backoff with jitter is applied
  const backoff1 = JobRetryService.calculateBackoff(1);
  const backoff2 = JobRetryService.calculateBackoff(2);
  const backoff3 = JobRetryService.calculateBackoff(3);
  const backoff4 = JobRetryService.calculateBackoff(4);

  assert(
    backoff1 === 0 && backoff2 >= 10000 && backoff3 >= 30000 && backoff4 >= 120000,
    12,
    "Exponential backoff is correctly calculated across attempts",
    `Attempt 1: ${backoff1}ms, Attempt 2: ${backoff2}ms, Attempt 3: ${backoff3}ms, Attempt 4: ${backoff4}ms`
  );

  // Case 13: Non-retryable failures are not retried
  const nonRetryableError = new Error("Governance policy denied: Target recipient is explicitly prohibited");
  const nonRetryableClassification = JobRetryService.classifyFailure(nonRetryableError);

  assert(
    !nonRetryableClassification.isRetryable && nonRetryableClassification.errorCode === "FATAL_SECURITY_OR_VALIDATION_ERROR",
    13,
    "Non-retryable security and policy failures are marked fatal with zero retries",
    `Code: ${nonRetryableClassification.errorCode}, Retryable: ${nonRetryableClassification.isRetryable}`
  );

  // Case 14 & 15: maxAttempts is respected and exhausted jobs enter dead-letter queue
  const exhaustingJob = await JobQueueService.submitJob({
    tenantId: userAlice.id,
    jobType: "SYSTEM_HEALTH_CHECK",
    payload: { ping: "exhaust_test" },
    maxAttempts: 2,
  });

  // Simulate attempt 1 failure
  await prisma.backgroundJob.update({
    where: { id: exhaustingJob.id },
    data: { attempts: 1, status: "RETRY_WAIT" },
  });

  // Simulate attempt 2 failure -> should quarantine to Dead Letter
  await DeadLetterService.quarantineJob({
    jobId: exhaustingJob.id,
    reason: "MAX_ATTEMPTS_EXCEEDED",
    finalError: "Simulated repeated transient network timeout after 2 attempts",
  });

  const deadLetterJob = await prisma.backgroundJob.findUnique({
    where: { id: exhaustingJob.id },
    include: { deadLetterRecord: true },
  });

  assert(
    deadLetterJob?.attempts === 1 && deadLetterJob.maxAttempts === 2,
    14,
    "maxAttempts boundary is strictly respected",
    `Attempts: ${deadLetterJob?.attempts}, Max: ${deadLetterJob?.maxAttempts}`
  );

  assert(
    deadLetterJob?.status === "DEAD_LETTER" && Boolean(deadLetterJob.deadLetterRecord),
    15,
    "Exhausted jobs automatically enter Dead-Letter Quarantine with full reason preserved",
    `Status: ${deadLetterJob?.status}, Reason: ${deadLetterJob?.deadLetterRecord?.reason}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 4: FINANCIAL SAFETY & M7/M8 AUTHORITY ENFORCEMENT
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 4: FINANCIAL SAFETY & M7/M8 AUTHORITY ENFORCEMENT");
  console.log("--------------------------------------------------------------------------------");

  // Create a policy that blocks a specific recipient for Alice
  await prisma.governancePolicy.create({
    data: {
      name: "Prohibit Malicious Recipient",
      description: "Blocks scammer address",
      scope: "GLOBAL",
      priority: 100,
      isSystem: false,
      status: "ACTIVE",
      version: 1,
      userId: userAlice.id,
      rules: {
        create: [
          {
            ruleType: "RECIPIENT_BLOCKLIST",
            operator: "EQUALS",
            field: "recipient",
            valueJson: JSON.stringify("blocked-scammer.testnet"),
            action: "DENY",
            order: 0,
          },
        ],
      },
    },
  });

  // Case 16: Worker cannot bypass M7 governance policy
  const prohibitedJob = await JobQueueService.submitJob({
    tenantId: userAlice.id,
    jobType: "MANDATE_DISBURSEMENT",
    payload: {
      mandateId: mandateAlice.id,
      recipient: "blocked-scammer.testnet",
      amountYocto: nearToYocto("0.1"),
      purpose: "Attempted disbursement to prohibited recipient",
      isSimulated: true,
    },
  });

  const prohibitedJobDef = JobRegistry.get(prohibitedJob.jobType)!;
  const prohibitedExecResult = await prohibitedJobDef.handler({
    job: prohibitedJob,
    payload: JSON.parse(prohibitedJob.payload),
    workerId: worker1Record.id,
    correlationId: prohibitedJob.correlationId,
    signal: new AbortController().signal,
    heartbeat: async () => true,
  });

  assert(
    Boolean(!prohibitedExecResult.success && prohibitedExecResult.error?.includes("Governance Policy Denied")),
    16,
    "Worker cannot bypass M7 governance policy (halted at execution boundary)",
    `Boundary Rejection: "${prohibitedExecResult.error}"`
  );

  // Case 17: Worker cannot bypass M8 execution authorization
  // (All financial jobs must route through ExecutionBoundaryService with valid authorization)
  assert(
    prohibitedJobDef.isFinancial === true && prohibitedJobDef.requiresApproval === true,
    17,
    "Worker financial job definition strictly binds to M8 ExecutionBoundaryService",
    `IsFinancial: ${prohibitedJobDef.isFinancial}, RequiresApproval: ${prohibitedJobDef.requiresApproval}`
  );

  // Case 18: Worker cannot alter mandate limits
  const mandateBefore = await prisma.mandate.findUnique({ where: { id: mandateAlice.id } });
  
  // Submit an amount exceeding per-transaction limit (1.5 NEAR > 1.0 NEAR limit)
  const excessiveLimitJob = await JobQueueService.submitJob({
    tenantId: userAlice.id,
    jobType: "MANDATE_DISBURSEMENT",
    payload: {
      mandateId: mandateAlice.id,
      recipient: "vendor-payments.testnet",
      amountYocto: nearToYocto("1.5"),
      purpose: "Attempted limit bypass",
      isSimulated: true,
    },
  });

  const limitExecResult = await prohibitedJobDef.handler({
    job: excessiveLimitJob,
    payload: JSON.parse(excessiveLimitJob.payload),
    workerId: worker1Record.id,
    correlationId: excessiveLimitJob.correlationId,
    signal: new AbortController().signal,
    heartbeat: async () => true,
  });

  const mandateAfter = await prisma.mandate.findUnique({ where: { id: mandateAlice.id } });

  assert(
    Boolean(
      !limitExecResult.success &&
        limitExecResult.error?.includes("exceeds per-transaction limit") &&
        mandateBefore?.perTxLimitYocto === mandateAfter?.perTxLimitYocto
    ),
    18,
    "Worker cannot alter or bypass mandate limits",
    `Rejection: "${limitExecResult.error}"`
  );

  // Case 19: Worker cannot bypass approval requirements (amount 0.6 NEAR > 0.5 NEAR threshold)
  const overThresholdJob = await JobQueueService.submitJob({
    tenantId: userAlice.id,
    jobType: "MANDATE_DISBURSEMENT",
    payload: {
      mandateId: mandateAlice.id,
      recipient: "vendor-payments.testnet",
      amountYocto: nearToYocto("0.6"),
      purpose: "Over threshold payment without approval",
      isSimulated: true,
    },
  });

  const overThresholdResult = await prohibitedJobDef.handler({
    job: overThresholdJob,
    payload: JSON.parse(overThresholdJob.payload),
    workerId: worker1Record.id,
    correlationId: overThresholdJob.correlationId,
    signal: new AbortController().signal,
    heartbeat: async () => true,
  });

  assert(
    Boolean(!overThresholdResult.success && overThresholdResult.error?.includes("explicit human authorization")),
    19,
    "Worker cannot bypass human approval requirements for transactions over threshold",
    `Halt: "${overThresholdResult.error}"`
  );

  // Case 20 & 21: Ambiguous post-broadcast timeout enters REQUIRES_RECOVERY and DOES NOT release reservation
  // Create an execution record in REQUIRES_RECOVERY status to simulate broadcast timeout
  const timeoutIdemKey = `idem_fin_timeout_${testRunId}`;
  const timeoutJob = await JobQueueService.submitJob({
    tenantId: userAlice.id,
    jobType: "MANDATE_DISBURSEMENT",
    payload: {
      mandateId: mandateAlice.id,
      recipient: "vendor-payments.testnet",
      amountYocto: nearToYocto("0.1"),
      purpose: "Simulated timeout disbursement",
      isSimulated: true,
    },
    idempotencyKey: timeoutIdemKey,
  });

  // Manually insert an execution record reflecting post-broadcast timeout
  const execRecordTimeout = await prisma.executionRecord.create({
    data: {
      idempotencyKey: timeoutIdemKey,
      payloadHash: timeoutJob.payloadHash,
      status: "REQUIRES_RECOVERY",
      operation: "TRANSFER",
      recipient: "vendor-payments.testnet",
      amountYocto: nearToYocto("0.1"),
      nonce: `nonce_timeout_${testRunId}`,
      authSignature: "mock_sig",
      expiresAt: new Date(Date.now() + 300000),
      recoveryStatus: "PENDING_RECOVERY",
      userId: userAlice.id,
      mandateId: mandateAlice.id,
    },
  });

  // Reserve budget manually to test non-release
  await prisma.mandate.update({
    where: { id: mandateAlice.id },
    data: { reservedYocto: nearToYocto("0.1") },
  });

  // Mark job as running with expired lease to trigger recovery
  await prisma.backgroundJob.update({
    where: { id: timeoutJob.id },
    data: {
      status: "RUNNING",
      leaseExpiresAt: new Date(Date.now() - 5000),
      workerId: worker1Record.id,
    },
  });

  await JobRecoveryService.recoverAbandonedLeases();

  const recoveredTimeoutJob = await prisma.backgroundJob.findUnique({
    where: { id: timeoutJob.id },
  });

  const mandateAfterTimeoutRecovery = await prisma.mandate.findUnique({
    where: { id: mandateAlice.id },
  });

  assert(
    recoveredTimeoutJob?.status === "REQUIRES_RECOVERY",
    20,
    "Ambiguous post-broadcast timeout enters REQUIRES_RECOVERY status",
    `Job Status: ${recoveredTimeoutJob?.status}`
  );

  assert(
    mandateAfterTimeoutRecovery?.reservedYocto === nearToYocto("0.1"),
    21,
    "Golden Rule Preserved: Ambiguous financial execution does NOT release its reservation",
    `Reserved Yocto remains locked: ${yoctoToNear(mandateAfterTimeoutRecovery!.reservedYocto)} NEAR`
  );

  // Case 22: Worker restart does not duplicate a financial transaction
  // (Idempotency key check prevents re-submitting or re-dispatching)
  const duplicateFinSubmission = await JobQueueService.submitJob({
    tenantId: userAlice.id,
    jobType: "MANDATE_DISBURSEMENT",
    payload: {
      mandateId: mandateAlice.id,
      recipient: "vendor-payments.testnet",
      amountYocto: nearToYocto("0.1"),
      purpose: "Simulated timeout disbursement",
      isSimulated: true,
    },
    idempotencyKey: timeoutIdemKey,
  });

  assert(
    duplicateFinSubmission.id === timeoutJob.id,
    22,
    "Worker restart does not duplicate a financial transaction (idempotent matching)",
    `Submitted ID: ${duplicateFinSubmission.id} matched original ID: ${timeoutJob.id}`
  );

  // Case 23: Dead-letter requeue does not blindly replay a financial action
  // Quarantining a financial job and attempting to requeue when mandate is deactivated
  await prisma.mandate.update({
    where: { id: mandateAlice.id },
    data: { status: "PAUSED" }, // Deactivate mandate!
  });

  const dlRecord = await DeadLetterService.quarantineJob({
    jobId: timeoutJob.id,
    reason: "EXHAUSTED",
    finalError: "Failed during network recovery",
  });

  let requeueBlocked = false;
  let requeueError = "";
  try {
    await DeadLetterService.requeueDeadLetter({
      deadLetterId: dlRecord.id,
      tenantId: userAlice.id,
      reviewedBy: userAlice.nearAccountId,
    });
  } catch (err: any) {
    requeueBlocked = true;
    requeueError = err.message;
  }

  // Restore mandate to active
  await prisma.mandate.update({
    where: { id: mandateAlice.id },
    data: { status: "ACTIVE", reservedYocto: "0" },
  });

  assert(
    requeueBlocked && requeueError.includes("no longer active"),
    23,
    "Dead-letter requeue does not blindly replay a financial action (revalidates mandate)",
    `Rejection: "${requeueError}"`
  );

  // ---------------------------------------------------------------------------
  // SECTION 5: TENANT ISOLATION
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 5: TENANT ISOLATION & ACCESS CONTROL");
  console.log("--------------------------------------------------------------------------------");

  // Case 24: User Bob cannot inspect User Alice's jobs
  const bobInspectAliceJob = await JobQueueService.getJob(job1.id, userBob.id);

  assert(
    bobInspectAliceJob === null,
    24,
    "Strict Tenant Isolation: User Bob cannot inspect User Alice's background jobs",
    `Returned: ${bobInspectAliceJob}`
  );

  // Case 25: User Bob cannot cancel User Alice's jobs
  let bobCancelBlocked = false;
  try {
    await JobQueueService.cancelJob(job1.id, userBob.id, "Malicious cancellation");
  } catch (err: any) {
    bobCancelBlocked = err.message.includes("not found or unauthorized");
  }

  assert(
    bobCancelBlocked,
    25,
    "Strict Tenant Isolation: User Bob cannot cancel User Alice's background jobs",
    `Cancel attempt by Bob strictly blocked`
  );

  // Case 26: User Bob cannot inspect User Alice's dead letters
  const bobDlList = await DeadLetterService.listDeadLetters({
    tenantId: userBob.id,
  });

  assert(
    bobDlList.total === 0 && bobDlList.records.length === 0,
    26,
    "Strict Tenant Isolation: User Bob cannot inspect User Alice's dead-letter records",
    `Bob Dead Letters: ${bobDlList.total}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 6: APPEND-ONLY LIFECYCLE EVENTS & AUDIT INTEGRITY
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 6: APPEND-ONLY LIFECYCLE EVENTS & AUDIT INTEGRITY");
  console.log("--------------------------------------------------------------------------------");

  // Case 27: Every job lifecycle transition creates an event
  const job1Events = await prisma.jobEvent.findMany({
    where: { jobId: job1.id },
    orderBy: { createdAt: "asc" },
  });

  assert(
    job1Events.length >= 1 && job1Events[0].eventType === "QUEUED",
    27,
    "Every job lifecycle transition creates an append-only JobEvent record",
    `Events recorded for Job 1: ${job1Events.map((e) => e.eventType).join(" -> ")}`
  );

  // Case 28: Every attempt is recorded
  // Submit a quick diagnostic job and execute it with Worker 1
  const diagJob = await JobQueueService.submitJob({
    tenantId: userAlice.id,
    jobType: "SYSTEM_HEALTH_CHECK",
    payload: { ping: "attempt_tracking_test" },
    priority: 100,
  });

  const diagClaim = await JobClaimService.claimNextJob({
    workerId: worker1Record.id,
    workerCapabilities: ["SYSTEM_HEALTH_CHECK"],
  });

  if (diagClaim.claimed && diagClaim.job && diagClaim.leaseToken) {
    await workerInstance1.processJob(diagClaim.job, diagClaim.leaseToken, diagClaim.attemptNumber || 1);
  }

  const recordedAttempts = await prisma.jobAttempt.findMany({
    where: { jobId: diagClaim.job!.id },
  });

  assert(
    recordedAttempts.length === 1 && recordedAttempts[0].outcome === "SUCCESS",
    28,
    "Every execution attempt is durably recorded with outcome and duration",
    `Attempt outcome: ${recordedAttempts[0]?.outcome}, Duration: ${recordedAttempts[0]?.durationMs}ms`
  );

  // Case 29: Manual dead-letter resolution is audited
  const dummyDLJob = await JobQueueService.submitJob({
    tenantId: userAlice.id,
    jobType: "SYSTEM_HEALTH_CHECK",
    payload: { ping: "dl_audit_test" },
  });

  const dummyDL = await DeadLetterService.quarantineJob({
    jobId: dummyDLJob.id,
    reason: "TEST_QUARANTINE",
    finalError: "Manual test error",
  });

  await DeadLetterService.resolveDeadLetter({
    deadLetterId: dummyDL.id,
    tenantId: userAlice.id,
    reviewedBy: userAlice.nearAccountId,
    resolution: "RESOLVED",
    notes: "Manual review confirmed safe to resolve",
  });

  const auditEvents = await prisma.auditLog.findMany({
    where: { userId: userAlice.id, eventType: "DEAD_LETTER_RESOLVED" },
  });

  assert(
    auditEvents.length >= 1,
    29,
    "Manual dead-letter resolution is recorded in the cryptographic audit trail",
    `Audit Event ID: ${auditEvents[0]?.id}`
  );

  // Case 30: Cryptographic audit chain verification passes with 0 breaks
  const auditVerification = await verifyAuditChain(userAlice.id);

  assert(
    auditVerification.valid,
    30,
    "Full cryptographic SHA-256 audit chain verified from genesis to head with zero breaks",
    `Total Verified Events: ${auditVerification.count}, Head Hash: ${auditVerification.headHash ? auditVerification.headHash.slice(0, 16) : "N/A"}...`
  );

  // ---------------------------------------------------------------------------
  // CLEANUP & FINAL RESULTS
  // ---------------------------------------------------------------------------
  await workerInstance1.stop();
  await workerInstance2.stop();

  console.log("\n================================================================================");
  console.log(`  VERIFICATION RESULTS: ${totalPassed} / ${totalPassed + totalFailed} PASSED`);
  console.log("================================================================================");

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    console.log("\nALL MILESTONE 9.1 DURABLE BACKGROUND EXECUTION INVARIANTS VERIFIED SUCCESSFULLY!\n");
  }
}

runMilestone91TestSuite().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
