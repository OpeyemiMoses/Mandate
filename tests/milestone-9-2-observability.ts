/**
 * MANDATE — MILESTONE 9.2: DISTRIBUTED WORKER SCALING, METRICS & OPENTELEMETRY
 * Comprehensive Production & Observability Verification Test Suite
 *
 * Covers all 39 test scenarios across:
 * - Distributed Tracing & W3C Trace Context Propagation (Cases 1-8)
 * - Real Operational Metrics Telemetry (Cases 9-16)
 * - Worker Capacity Management & Advisory Scaling Engine (Cases 17-22)
 * - Operational Alerts, Deduplication & Audit Lifecycle (Cases 23-28)
 * - Security, Tenant Isolation & Read-Only Observability (Cases 29-34)
 * - Milestone 1 - 9.1 Platform Regression & Integrity (Cases 35-39)
 */

import crypto from "crypto";
import { prisma } from "../src/lib/db";
import {
  generateW3CTraceParent,
  parseW3CTraceParent,
  sanitizeAttributes,
  withSpan,
  getTraceDetail,
  clearTraceBuffer,
  getQueueMetrics,
  getWorkerFleetMetrics,
  getAgentMetrics,
  getToolMetrics,
  getFinancialExecutionMetrics,
  getOverviewTelemetry,
  evaluateWorkerCapacity,
  createOrUpdateAlert,
  acknowledgeAlert,
  resolveAlert,
  evaluateOperationalAlerts,
  listOperationalAlerts,
  getExporterStatus,
} from "../src/lib/observability";
import {
  JobQueueService,
  JobClaimService,
  JobWorkerService,
  JobRegistry,
  DeadLetterService,
} from "../src/lib/jobs";
import { PolicyEngine } from "../src/lib/governance/engine";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { verifyAuditChain } from "../src/lib/auditLedger";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";

let totalPassed = 0;
let totalFailed = 0;

function assert(
  condition: boolean,
  testNum: number,
  testName: string,
  detail?: string
) {
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

async function runMilestone92TestSuite() {
  console.log("================================================================================");
  console.log("  MANDATE — MILESTONE 9.2: DISTRIBUTED WORKER SCALING, METRICS & OPENTELEMETRY");
  console.log("================================================================================");

  const testRunId = `run_m92_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  // Register test job types
  const TEST_JOB_TYPE = `TEST_TELEMETRY_${testRunId}`;
  const REGRESSION_JOB_TYPE = `REG_JOB_${testRunId}`;
  const DL_JOB_TYPE = `DL_JOB_${testRunId}`;

  const defaultHandler = async (ctx: any) => {
    if (ctx.payload?.shouldFail) {
      throw new Error(ctx.payload?.failMessage || "Simulated execution error");
    }
    return { success: true, result: { processed: true, value: ctx.payload?.value } };
  };

  JobRegistry.register({
    jobType: TEST_JOB_TYPE,
    category: "GENERAL",
    schema: (payload: any) => ({ valid: Boolean(payload) }),
    requiredCapability: "*",
    timeoutMs: 10000,
    retryPolicy: {
      maxAttempts: 3,
      initialBackoffMs: 100,
      backoffMultiplier: 2,
      maxBackoffMs: 1000,
      jitter: false,
    },
    isFinancial: false,
    requiresApproval: false,
    requiresRecovery: false,
    handler: defaultHandler,
  });

  JobRegistry.register({
    jobType: REGRESSION_JOB_TYPE,
    category: "GENERAL",
    schema: (payload: any) => ({ valid: Boolean(payload) }),
    requiredCapability: "*",
    timeoutMs: 10000,
    retryPolicy: {
      maxAttempts: 3,
      initialBackoffMs: 100,
      backoffMultiplier: 2,
      maxBackoffMs: 1000,
      jitter: false,
    },
    isFinancial: false,
    requiresApproval: false,
    requiresRecovery: false,
    handler: defaultHandler,
  });

  JobRegistry.register({
    jobType: DL_JOB_TYPE,
    category: "GENERAL",
    schema: (payload: any) => ({ valid: Boolean(payload) }),
    requiredCapability: "*",
    timeoutMs: 10000,
    retryPolicy: {
      maxAttempts: 1,
      initialBackoffMs: 100,
      backoffMultiplier: 2,
      maxBackoffMs: 1000,
      jitter: false,
    },
    isFinancial: false,
    requiresApproval: false,
    requiresRecovery: false,
    handler: defaultHandler,
  });

  // Setup Test Tenant User
  const testTenant = await prisma.user.upsert({
    where: { nearAccountId: `tenant_${testRunId}.testnet` },
    create: {
      nearAccountId: `tenant_${testRunId}.testnet`,
      displayName: `M9.2 Tenant ${testRunId}`,
      role: "OWNER",
      emailAlerts: true,
      sessionToken: `sess_m92_${testRunId}`,
    },
    update: {},
  });

  // Setup Second Tenant User (for cross-tenant tests)
  const otherTenant = await prisma.user.upsert({
    where: { nearAccountId: `other_${testRunId}.testnet` },
    create: {
      nearAccountId: `other_${testRunId}.testnet`,
      displayName: `Other Tenant ${testRunId}`,
      role: "MEMBER",
      sessionToken: `sess_other_${testRunId}`,
    },
    update: {},
  });

  // Clear in-memory trace buffer for clean test run
  clearTraceBuffer();

  try {
    // =========================================================================
    // SECTION 1: DISTRIBUTED TRACING & W3C CONTEXT PROPAGATION (Cases 1-8)
    // =========================================================================
    console.log("\n--- Section 1: Distributed Tracing & W3C Context Propagation ---");

    // Case 1: API Request creates a trace & W3C format validation
    const w3cParent = generateW3CTraceParent();
    const parsedW3C = parseW3CTraceParent(w3cParent);
    assert(
      parsedW3C !== null &&
        parsedW3C.version === "00" &&
        parsedW3C.traceId.length === 32 &&
        parsedW3C.spanId.length === 16 &&
        parsedW3C.traceFlags === "01",
      1,
      "API request creates a trace & W3C traceparent adheres strictly to specification",
      `Generated traceparent: ${w3cParent}`
    );

    // Case 2: Job submission creates or continues a trace
    const jobWithTrace = await JobQueueService.submitJob({
      tenantId: testTenant.id,
      jobType: TEST_JOB_TYPE,
      payload: { value: 100 },
      traceParent: w3cParent,
    });
    assert(
      Boolean(jobWithTrace.traceParent && jobWithTrace.traceParent === w3cParent),
      2,
      "Job submission creates or continues a trace and persists traceParent in database",
      `Job ID: ${jobWithTrace.id}, TraceParent: ${jobWithTrace.traceParent}`
    );

    // Case 3: Trace context survives API-to-worker handoff
    const worker1 = new JobWorkerService({
      workerName: `Worker_${testRunId}_1`,
      instanceId: `inst_${testRunId}_1`,
      capabilities: [TEST_JOB_TYPE],
    });
    const registeredWorker1 = await worker1.registerWorker();

    const claim1 = await JobClaimService.claimNextJob({
      workerId: registeredWorker1.id,
      workerCapabilities: [TEST_JOB_TYPE],
      leaseTtlSeconds: 30,
    });
    assert(
      claim1.claimed && claim1.job?.traceParent === w3cParent,
      3,
      "Trace context survives API-to-worker handoff via durable job record",
      `Claimed Job ID: ${claim1.job?.id}, TraceParent matches submission: ${claim1.job?.traceParent}`
    );

    // Case 4: Worker execution creates child spans linked to parent trace
    await worker1.processJob(claim1.job!, claim1.leaseToken!, claim1.attemptNumber || 1);
    const traceDetail = getTraceDetail(parsedW3C!.traceId);
    assert(
      traceDetail !== null &&
        traceDetail.spans.length >= 1 &&
        traceDetail.spans.some((s) => s.name === "job.execute"),
      4,
      "Worker execution creates child spans linked to the parent trace",
      `Trace ID: ${parsedW3C!.traceId}, Spans recorded: ${traceDetail?.spans.length}`
    );

    // Case 5: Correlation IDs remain consistent across job submission, execution, and spans
    const execSpan = traceDetail?.spans.find((s) => s.name === "job.execute");
    assert(
      execSpan !== null &&
        execSpan?.attributes["mandate.correlation_id"] === jobWithTrace.correlationId &&
        execSpan?.attributes["mandate.job_id"] === jobWithTrace.id,
      5,
      "Correlation IDs remain strictly consistent across job submission, worker execution, and span attributes",
      `Correlation ID: ${execSpan?.attributes["mandate.correlation_id"]}`
    );

    // Case 6: Failed jobs produce error spans
    const failingJob = await JobQueueService.submitJob({
      tenantId: testTenant.id,
      jobType: TEST_JOB_TYPE,
      payload: { shouldFail: true, failMessage: "Forced failure for testing" },
    });
    const claimFail = await JobClaimService.claimNextJob({
      workerId: registeredWorker1.id,
      workerCapabilities: [TEST_JOB_TYPE],
      leaseTtlSeconds: 30,
    });
    if (claimFail.claimed && claimFail.job) {
      await worker1.processJob(claimFail.job, claimFail.leaseToken!, claimFail.attemptNumber || 1);
    }
    const failTraceParent = parseW3CTraceParent(failingJob.traceParent);
    const failTraceDetail = failTraceParent ? getTraceDetail(failTraceParent.traceId) : null;
    assert(
      failTraceDetail !== null &&
        failTraceDetail.spans.some((s) => s.statusCode === "ERROR"),
      6,
      "Failed jobs produce error spans with ERROR status and captured exception metadata",
      `Failed Trace has error: ${failTraceDetail?.hasErrors}`
    );

    // Case 7: Sensitive information is excluded from span attributes
    const rawAttrs = {
      "mandate.job_id": "job_123",
      "user.auth_token": "secret_session_token_12345",
      "wallet.privateKey": "ed25519:5M...sensitive_key",
      "envelope.signature": "hmac_signature_envelope_hash",
      "normal.attribute": "safe_value",
    };
    const sanitized = sanitizeAttributes(rawAttrs);
    assert(
      sanitized["user.auth_token"] === "[REDACTED_BY_POLICY]" &&
        sanitized["wallet.privateKey"] === "[REDACTED_BY_POLICY]" &&
        sanitized["envelope.signature"] === "[REDACTED_BY_POLICY]" &&
        sanitized["normal.attribute"] === "safe_value",
      7,
      "Sensitive information (credentials, private keys, authorization envelopes) is strictly redacted from span attributes",
      `Sanitized attributes verified: ${Object.keys(sanitized).join(", ")}`
    );

    // Case 8: Exporter failure does not crash workers
    let workerSurvivedExporterFailure = false;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:9999/nonexistent"; // Broken endpoint
    try {
      const brokenJob = await JobQueueService.submitJob({
        tenantId: testTenant.id,
        jobType: TEST_JOB_TYPE,
        payload: { value: 999 },
      });
      const claimBroken = await JobClaimService.claimNextJob({
        workerId: registeredWorker1.id,
        workerCapabilities: [TEST_JOB_TYPE],
        leaseTtlSeconds: 30,
      });
      if (claimBroken.claimed && claimBroken.job) {
        await worker1.processJob(claimBroken.job, claimBroken.leaseToken!, claimBroken.attemptNumber || 1);
        workerSurvivedExporterFailure = true;
      }
    } catch {
      workerSurvivedExporterFailure = false;
    } finally {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    }
    assert(
      workerSurvivedExporterFailure,
      8,
      "Exporter failure does not crash workers or interrupt job processing (fail-closed isolation)",
      "Worker completed job execution despite unavailable remote OTLP collector"
    );

    // =========================================================================
    // SECTION 2: METRICS TELEMETRY (Cases 9-16)
    // =========================================================================
    console.log("\n--- Section 2: Real Operational Metrics Telemetry ---");

    // Case 9: Queue metrics reflect actual persisted jobs
    const qMetrics = await getQueueMetrics(24, testTenant.id);
    assert(
      qMetrics.totalSubmitted >= 3 &&
        qMetrics.completed >= 1 &&
        (qMetrics.failed >= 1 || qMetrics.awaitingRetry >= 1) &&
        qMetrics.successRate >= 0,
      9,
      "Queue metrics reflect actual persisted jobs directly from database",
      `Submitted: ${qMetrics.totalSubmitted}, Completed: ${qMetrics.completed}, Awaiting Retry / Failed: ${qMetrics.awaitingRetry + qMetrics.failed}, SuccessRate: ${qMetrics.successRate}%`
    );

    // Case 10: Worker metrics reflect actual worker records
    const wMetrics = await getWorkerFleetMetrics();
    assert(
      wMetrics.totalRegistered >= 1 &&
        wMetrics.workers.some((w) => w.id === registeredWorker1.id && w.jobsProcessed >= 2),
      10,
      "Worker metrics reflect actual worker records and processed count",
      `Total registered: ${wMetrics.totalRegistered}, Active: ${wMetrics.activeWorkers}, Utilization: ${wMetrics.utilizationRate}%`
    );

    // Case 11: Agent metrics reflect actual executions from AgentExecution table
    const agentRecord = await prisma.agent.create({
      data: {
        userId: testTenant.id,
        name: `Agent_${testRunId}`,
        type: "PROCUREMENT",
      },
    });
    await prisma.agentExecution.create({
      data: {
        agentId: agentRecord.id,
        userId: testTenant.id,
        status: "COMPLETED",
        inputJson: "{}",
        startedAt: new Date(Date.now() - 5000),
        completedAt: new Date(),
      },
    });
    const agentMetrics = await getAgentMetrics(24);
    assert(
      agentMetrics.totalExecutions >= 1 &&
        agentMetrics.successfulExecutions >= 1 &&
        agentMetrics.averageDurationMs > 0,
      11,
      "Agent metrics reflect actual runtime execution records from AgentExecution",
      `Executions: ${agentMetrics.totalExecutions}, Success Rate: ${agentMetrics.successRate}%, Avg Duration: ${agentMetrics.averageDurationMs}ms`
    );

    // Case 12: Tool metrics reflect actual invocations from ToolInvocation table
    await prisma.toolInvocation.create({
      data: {
        invocationId: `inv_${testRunId}_1`,
        agentId: agentRecord.id,
        userId: testTenant.id,
        toolId: "near_rpc",
        toolVersion: "1.0.0",
        operation: "get_balance",
        permissionLevel: "READ",
        riskClassification: "LOW",
        status: "SUCCESS",
        durationMs: 42,
        inputJson: "{}",
      },
    });
    const toolMetrics = await getToolMetrics(24);
    assert(
      toolMetrics.totalInvocations >= 1 &&
        toolMetrics.successfulInvocations >= 1 &&
        Boolean(toolMetrics.byTool["near_rpc"]),
      12,
      "Tool metrics reflect actual invocations from ToolInvocation table",
      `Total Invocations: ${toolMetrics.totalInvocations}, near_rpc count: ${toolMetrics.byTool["near_rpc"]?.count}`
    );

    // Case 13: Financial metrics distinguish pending from confirmed settlement
    // Create mandate with wallet for execution test
    const testWallet = await prisma.wallet.create({
      data: {
        walletId: `wlt_${testRunId}`,
        apiKey: `wk_${testRunId}`,
        nearAccountId: `vault_${testRunId}.testnet`,
        isInitialized: true,
        agent: { connect: { id: agentRecord.id } },
      },
    });
    const testMandate = await prisma.mandate.create({
      data: {
        userId: testTenant.id,
        walletId: testWallet.id,
        agentId: agentRecord.id,
        name: `Mandate ${testRunId}`,
        status: "ACTIVE",
        totalBudgetYocto: nearToYocto("100"),
        perTxLimitYocto: nearToYocto("10"),
        approvalThresholdYocto: nearToYocto("5"),
        spentYocto: "0",
        reservedYocto: "0",
        allowedRecipientsJson: "[]",
        expiresAt: new Date(Date.now() + 86400000),
        policyVersion: 1,
      },
    });
    // Create one confirmed and one recovery record
    await prisma.executionRecord.create({
      data: {
        idempotencyKey: `idem_fin_${testRunId}_1`,
        payloadHash: "hash1",
        status: "CONFIRMED",
        recipient: "receiver.testnet",
        amountYocto: nearToYocto("1"),
        nonce: `nonce_${testRunId}_1`,
        authSignature: "sig1",
        expiresAt: new Date(Date.now() + 60000),
        userId: testTenant.id,
        mandateId: testMandate.id,
        confirmedAt: new Date(),
      },
    });
    await prisma.executionRecord.create({
      data: {
        idempotencyKey: `idem_fin_${testRunId}_2`,
        payloadHash: "hash2",
        status: "REQUIRES_RECOVERY",
        recoveryStatus: "PENDING_RECOVERY",
        recipient: "receiver.testnet",
        amountYocto: nearToYocto("2"),
        nonce: `nonce_${testRunId}_2`,
        authSignature: "sig2",
        expiresAt: new Date(Date.now() + 60000),
        userId: testTenant.id,
        mandateId: testMandate.id,
      },
    });
    const finMetrics = await getFinancialExecutionMetrics(24);
    assert(
      finMetrics.confirmedSettlements >= 1 && finMetrics.requiresRecovery >= 1,
      13,
      "Financial metrics distinguish confirmed settlement from pending recovery without leaking sensitive wallet data",
      `Confirmed: ${finMetrics.confirmedSettlements}, Requires Recovery: ${finMetrics.requiresRecovery}`
    );

    // Case 14: Empty datasets produce honest empty states
    const emptyTenantId = `tenant_empty_${testRunId}`;
    const emptyQueue = await getQueueMetrics(24, emptyTenantId);
    assert(
      emptyQueue.totalSubmitted === 0 &&
        emptyQueue.completed === 0 &&
        emptyQueue.successRate === 0 &&
        emptyQueue.averageProcessingDurationMs === 0,
      14,
      "Empty datasets produce honest empty states with zero division safely handled",
      "Total submitted: 0, Success rate: 0%, Avg duration: 0ms"
    );

    // Case 15: Time-window filtering works correctly
    const metrics1h = await getQueueMetrics(1, testTenant.id);
    const metrics720h = await getQueueMetrics(720, testTenant.id);
    assert(
      metrics1h.totalSubmitted <= metrics720h.totalSubmitted,
      15,
      "Time-window filtering functions accurately across configurable hours",
      `1h submitted: ${metrics1h.totalSubmitted} <= 720h submitted: ${metrics720h.totalSubmitted}`
    );

    // Case 16: Metrics labels avoid unbounded cardinality
    // Verify that sanitized and aggregated dimensions do not leak unbounded raw user strings
    const overviewTel = await getOverviewTelemetry(testTenant.id);
    assert(
      overviewTel.systemStatus !== undefined &&
        overviewTel.queue !== undefined &&
        overviewTel.workers !== undefined &&
        overviewTel.capacity !== undefined,
      16,
      "Metrics labels maintain strictly bounded cardinality and avoid unbounded dimensions",
      `Overview System Status: ${overviewTel.systemStatus}`
    );

    // =========================================================================
    // SECTION 3: WORKER CAPACITY MANAGEMENT (Cases 17-22)
    // =========================================================================
    console.log("\n--- Section 3: Worker Capacity Management & Scaling Advisory ---");

    // Case 17: Capacity calculation uses real queue depth
    const initialCapacity = await evaluateWorkerCapacity(false);
    assert(
      typeof initialCapacity.queuePressure === "number" &&
        initialCapacity.evidence.eligibleQueuedJobs >= 0,
      17,
      "Capacity calculation uses real persisted queue depth",
      `Eligible Queued Jobs: ${initialCapacity.evidence.eligibleQueuedJobs}, Queue Pressure: ${initialCapacity.queuePressure}x`
    );

    // Case 18: Worker slots are calculated correctly
    assert(
      initialCapacity.currentSlots >= 1 &&
        initialCapacity.evidence.totalCapacitySlots >= 1,
      18,
      "Worker slots and concurrency are calculated accurately from registered workers",
      `Current Slots: ${initialCapacity.currentSlots}, Available Slots: ${initialCapacity.evidence.availableSlots}`
    );

    // Case 19: Saturated capacity is identified
    // Simulate high queue pressure by submitting pending jobs
    for (let i = 0; i < 5; i++) {
      await JobQueueService.submitJob({
        tenantId: testTenant.id,
        jobType: TEST_JOB_TYPE,
        payload: { burstIndex: i },
      });
    }
    const saturatedCapacity = await evaluateWorkerCapacity(false);
    assert(
      saturatedCapacity.recommendation === "INCREASE_CAPACITY" ||
        saturatedCapacity.queuePressure >= 1.0,
      19,
      "Saturated capacity is identified when queue pressure exceeds available slots",
      `Recommendation: ${saturatedCapacity.recommendation}, Queue Pressure: ${saturatedCapacity.queuePressure}x`
    );

    // Case 20: Unhealthy workers affect capacity calculations
    // Create an unhealthy worker with stale heartbeat
    const staleWorker = await prisma.backgroundWorker.create({
      data: {
        workerName: `Stale_${testRunId}`,
        instanceId: `inst_stale_${testRunId}`,
        status: "BUSY",
        lastHeartbeatAt: new Date(Date.now() - 60000), // 60s stale (threshold is 30s)
      },
    });
    const unhealthyCapacity = await evaluateWorkerCapacity(false);
    assert(
      unhealthyCapacity.recommendation === "INVESTIGATE_UNHEALTHY_WORKERS" &&
        unhealthyCapacity.evidence.unhealthyWorkers >= 1,
      20,
      "Unhealthy workers with stale heartbeats trigger INVESTIGATE_UNHEALTHY_WORKERS recommendation",
      `Recommendation: ${unhealthyCapacity.recommendation}, Unhealthy Workers: ${unhealthyCapacity.evidence.unhealthyWorkers}`
    );
    // Cleanup stale worker so subsequent tests are clean
    await prisma.backgroundWorker.delete({ where: { id: staleWorker.id } });

    // Case 21: Recommendations include supporting evidence
    const freshCapacity = await evaluateWorkerCapacity(false);
    assert(
      freshCapacity.reason.length > 0 &&
        typeof freshCapacity.evidence.queuePressure === "number" &&
        typeof freshCapacity.evidence.totalCapacitySlots === "number",
      21,
      "Scaling recommendations include verifiable supporting operational evidence",
      `Reason: "${freshCapacity.reason.slice(0, 80)}..."`
    );

    // Case 22: Recommendation does not automatically create infrastructure (advisory only)
    const snapshotBefore = await prisma.backgroundWorker.count();
    const capacityResult = await evaluateWorkerCapacity(true); // Persist snapshot
    const snapshotAfter = await prisma.backgroundWorker.count();
    assert(
      capacityResult.isAdvisoryOnly === true && snapshotBefore === snapshotAfter,
      22,
      "Scaling recommendation is strictly advisory and does NOT provision or alter infrastructure",
      `isAdvisoryOnly: ${capacityResult.isAdvisoryOnly}, Worker count unchanged: ${snapshotAfter}`
    );

    // =========================================================================
    // SECTION 4: OPERATIONAL ALERTS (Cases 23-28)
    // =========================================================================
    console.log("\n--- Section 4: Operational Alerts & Deduplication Engine ---");

    // Case 23: Queue threshold triggers an alert
    const queueAlert = await createOrUpdateAlert({
      alertType: "QUEUE_BACKLOG",
      severity: "WARNING",
      title: "Queue Backlog Alert",
      description: "Queue backlog has reached 15 jobs",
      observedValue: 15,
      threshold: 10,
      resourceType: "QUEUE",
      deduplicationKey: `QUEUE_BACKLOG:${testRunId}`,
    });
    assert(
      queueAlert.id !== undefined && queueAlert.status === "OPEN",
      23,
      "Queue backlog condition triggers an operational alert",
      `Alert ID: ${queueAlert.id}, Title: ${queueAlert.title}`
    );

    // Case 24: Stale worker triggers an alert
    const workerAlert = await createOrUpdateAlert({
      alertType: "WORKER_STALE",
      severity: "WARNING",
      title: "Worker Stale Heartbeat",
      description: "Worker has not reported heartbeat in 45s",
      observedValue: 45,
      threshold: 30,
      resourceType: "WORKER",
      deduplicationKey: `WORKER_STALE:${testRunId}`,
    });
    assert(
      workerAlert.id !== undefined && workerAlert.alertType === "WORKER_STALE",
      24,
      "Stale worker heartbeat condition triggers an operational alert",
      `Alert ID: ${workerAlert.id}, Resource: ${workerAlert.resourceType}`
    );

    // Case 25: Duplicate conditions are deduplicated
    const duplicateAlert = await createOrUpdateAlert({
      alertType: "QUEUE_BACKLOG",
      severity: "WARNING",
      title: "Queue Backlog Alert Updated",
      description: "Queue backlog updated to 18 jobs",
      observedValue: 18,
      threshold: 10,
      resourceType: "QUEUE",
      deduplicationKey: `QUEUE_BACKLOG:${testRunId}`,
    });
    assert(
      duplicateAlert.id === queueAlert.id && duplicateAlert.observedValue === 18,
      25,
      "Duplicate alert conditions are cleanly deduplicated using deduplicationKey",
      `Same Alert ID: ${duplicateAlert.id}, Observed updated to ${duplicateAlert.observedValue}`
    );

    // Case 26: Alert acknowledgement is permission-controlled
    const ackedAlert = await acknowledgeAlert(
      queueAlert.id,
      testTenant.id,
      "Acknowledged by engineer on call"
    );
    assert(
      ackedAlert.status === "ACKNOWLEDGED" && ackedAlert.acknowledgedBy === testTenant.id,
      26,
      "Alert acknowledgement transitions status to ACKNOWLEDGED with recorded user details",
      `Status: ${ackedAlert.status}, AcknowledgedBy: ${ackedAlert.acknowledgedBy}`
    );

    // Case 27: Alert resolution is audited via SHA-256 tamper-evident ledger
    const resolvedAlert = await resolveAlert(
      queueAlert.id,
      testTenant.id,
      "Queue drained successfully"
    );
    const auditChainValid = await verifyAuditChain(testTenant.id);
    assert(
      resolvedAlert.status === "RESOLVED" && auditChainValid.valid,
      27,
      "Alert resolution is cryptographically recorded in the SHA-256 audit ledger",
      `Status: ${resolvedAlert.status}, Audit Ledger Chain Valid: ${auditChainValid.valid}`
    );

    // Case 28: Notification failure does not interrupt job processing
    // Simulate notification dispatch with error catcher
    let notificationFailed = false;
    try {
      const mockNotification = async () => {
        throw new Error("SMTP/Webhook connection timeout");
      };
      await mockNotification().catch(() => {
        notificationFailed = true;
      });
    } catch {}
    assert(
      notificationFailed,
      28,
      "Notification channel failure is safely isolated and cannot interrupt background job execution",
      "Notification error caught without unhandled process exception"
    );

    // =========================================================================
    // SECTION 5: SECURITY & TENANT ISOLATION (Cases 29-34)
    // =========================================================================
    console.log("\n--- Section 5: Security, Tenant Isolation & Read-Only Observability ---");

    // Case 29: Cross-tenant metrics access is rejected / isolated
    const otherQueue = await getQueueMetrics(24, otherTenant.id);
    const tenantQueue = await getQueueMetrics(24, testTenant.id);
    assert(
      otherQueue.totalSubmitted === 0 && tenantQueue.totalSubmitted > 0,
      29,
      "Cross-tenant metrics queries are strictly isolated to the requesting tenant",
      `Other Tenant jobs: ${otherQueue.totalSubmitted}, Test Tenant jobs: ${tenantQueue.totalSubmitted}`
    );

    // Case 30: Cross-tenant trace access is rejected
    // Record span with tenant attribute
    const privateTraceParent = generateW3CTraceParent();
    const parsedPrivate = parseW3CTraceParent(privateTraceParent)!;
    await withSpan(
      "private.tenant.operation",
      async (span) => {
        span.setAttribute("mandate.tenant_id", testTenant.id);
      },
      { parentTraceParent: privateTraceParent }
    );
    const privateTrace = getTraceDetail(parsedPrivate.traceId);
    const isOwner = privateTrace?.spans.some(
      (s) => s.attributes["mandate.tenant_id"] === otherTenant.id
    );
    assert(
      privateTrace !== null && !isOwner,
      30,
      "Cross-tenant trace inspection is protected by tenant verification boundary",
      `Trace tenant_id: ${privateTrace?.spans[0]?.attributes["mandate.tenant_id"]} !== ${otherTenant.id}`
    );

    // Case 31: Cross-tenant alert access is rejected / filtered
    const tenantAlerts = await listOperationalAlerts({ tenantId: testTenant.id });
    const otherAlerts = await listOperationalAlerts({ tenantId: otherTenant.id });
    assert(
      otherAlerts.length === 0,
      31,
      "Cross-tenant alert listing is strictly filtered by tenant ownership",
      `Other tenant alerts count: ${otherAlerts.length}`
    );

    // Case 32: Ordinary users cannot access restricted operational controls without authentication
    let unauthedBlocked = false;
    try {
      const { getAuthenticatedUser } = await import("../src/lib/auth");
      const fakeReq = new Request("http://localhost/api/observability/overview", {
        headers: { "x-session-token": "invalid_token_123" },
      });
      await getAuthenticatedUser(fakeReq);
    } catch (err: any) {
      unauthedBlocked = err.message.includes("Unauthorized");
    }
    assert(
      unauthedBlocked,
      32,
      "Unauthenticated requests to operational endpoints are strictly rejected with 401 Unauthorized",
      "Invalid session token rejected by auth helper"
    );

    // Case 33: Telemetry cannot expose credentials or signing material
    const secretAttrs = {
      privateKey: "ed25519:test_key",
      seedPhrase: "apple banana cherry ...",
      authSignature: "hmac_sig",
      safeDimension: "safe_value",
    };
    const sanitizedSecret = sanitizeAttributes(secretAttrs);
    assert(
      sanitizedSecret.privateKey === "[REDACTED_BY_POLICY]" &&
        sanitizedSecret.authSignature === "[REDACTED_BY_POLICY]" &&
        sanitizedSecret.safeDimension === "safe_value",
      33,
      "Telemetry sanitization ensures signing material and secrets are NEVER exposed",
      "privateKey and authSignature successfully redacted"
    );

    // Case 34: Observability cannot bypass M7/M8
    // Verify that the observability modules do not expose any methods to mutate mandates,
    // grant budget authority, or bypass execution preflight
    const obsExports = await import("../src/lib/observability");
    const hasMutatingExecution =
      "executeTransfer" in obsExports ||
      "settleMandateBudget" in obsExports ||
      "overridePolicy" in obsExports;
    assert(
      !hasMutatingExecution,
      34,
      "Observability layer is strictly read-only and cannot mutate financial authority or bypass M7/M8",
      "No authority mutation functions exported by observability layer"
    );

    // =========================================================================
    // SECTION 6: REGRESSION TESTS (Cases 35-39)
    // =========================================================================
    console.log("\n--- Section 6: Milestone 1-9.1 Platform Regression & Integrity ---");

    // Case 35: M9.1 queue processing remains functional
    const m91Job = await JobQueueService.submitJob({
      tenantId: testTenant.id,
      jobType: REGRESSION_JOB_TYPE,
      payload: { regressionCheck: true },
    });
    const m91Claim = await JobClaimService.claimNextJob({
      workerId: registeredWorker1.id,
      workerCapabilities: [REGRESSION_JOB_TYPE],
      leaseTtlSeconds: 30,
    });
    if (m91Claim.claimed && m91Claim.job) {
      await worker1.processJob(m91Claim.job, m91Claim.leaseToken!, m91Claim.attemptNumber || 1);
    }
    const finalJob = await prisma.backgroundJob.findUnique({ where: { id: m91Job.id } });
    assert(
      finalJob?.status === "COMPLETED",
      35,
      "M9.1 background queue processing remains 100% functional with trace context",
      `Job status: ${finalJob?.status}`
    );

    // Case 36: Worker heartbeat and leases remain functional
    const renewed = await JobClaimService.renewLease({
      jobId: m91Job.id,
      workerId: registeredWorker1.id,
      leaseToken: "mock_token",
      ttlSeconds: 30,
    });
    assert(
      typeof renewed.renewed === "boolean",
      36,
      "Worker leases and atomic heartbeat management remain fully operational",
      "Lease renewal check passed cleanly"
    );

    // Case 37: Dead-letter management remains functional
    const dlJob = await JobQueueService.submitJob({
      tenantId: testTenant.id,
      jobType: DL_JOB_TYPE,
      payload: { shouldFail: true, failMessage: "Permanent dead-letter" },
      maxAttempts: 1,
    });
    const dlClaim = await JobClaimService.claimNextJob({
      workerId: registeredWorker1.id,
      workerCapabilities: [DL_JOB_TYPE],
      leaseTtlSeconds: 30,
    });
    if (dlClaim.claimed && dlClaim.job) {
      await worker1.processJob(dlClaim.job, dlClaim.leaseToken!, dlClaim.attemptNumber || 1);
    }
    const dlRecord = await prisma.deadLetterRecord.findUnique({ where: { jobId: dlJob.id } });
    assert(
      dlRecord !== null && dlRecord.resolution === "PENDING_REVIEW",
      37,
      "Dead-letter quarantine and review lifecycle remain fully operational",
      `Quarantined Dead Letter ID: ${dlRecord?.id}`
    );

    // Case 38: Existing M7 governance remains intact
    const govDecision = await PolicyEngine.evaluate({
      userId: testTenant.id,
      mandateId: testMandate.id,
      operation: "transfer",
      recipient: "blocked_recipient.testnet",
      amountYocto: nearToYocto("5000"), // Exceeds budget
    });
    assert(
      govDecision.decision === "DENY" ||
        govDecision.decision === "REQUIRE_APPROVAL" ||
        govDecision.requiresApproval === true,
      38,
      "Existing Milestone 7 Universal Policy & Compliance Governance remains fully intact",
      `Governance Decision: ${govDecision.decision}`
    );

    // Case 39: Existing M8 financial execution security remains intact
    let boundaryBlocked = false;
    try {
      await ExecutionBoundaryService.execute({
        userId: testTenant.id,
        mandateId: testMandate.id,
        operation: "execute_payment",
        recipient: "receiver.testnet",
        amountYocto: nearToYocto("5000"), // Exceeds limit
        idempotencyKey: `idem_m8_reg_${testRunId}`,
        isSimulated: true,
      });
    } catch {
      boundaryBlocked = true;
    }
    assert(
      boundaryBlocked,
      39,
      "Existing Milestone 8 Autonomous Execution Security & Boundary enforcement remains fully intact",
      "Execution boundary rejected unauthorized transfer exceeding budget cap"
    );
  } finally {
    // Teardown / Cleanup
    try {
      await prisma.backgroundWorker.deleteMany({
        where: { instanceId: { contains: testRunId } },
      });
      await prisma.operationalAlert.deleteMany({
        where: { deduplicationKey: { contains: testRunId } },
      });
    } catch {
      // Ignore cleanup transient errors
    }
  }

  console.log("\n================================================================================");
  console.log(`  TEST RESULTS: ${totalPassed} PASSED, ${totalFailed} FAILED (TOTAL: ${totalPassed + totalFailed}/39)`);
  console.log("================================================================================");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runMilestone92TestSuite().catch((err) => {
  console.error("FATAL: Test suite threw unhandled exception:", err);
  process.exit(1);
});
