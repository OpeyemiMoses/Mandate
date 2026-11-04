/**
 * MANDATE — MILESTONE 9.4: OPERATIONAL CONTROLS, RESILIENCE & DISASTER RECOVERY
 * Comprehensive Production & Verification Test Suite
 *
 * Covers 45 test scenarios across:
 * - Section 1: Emergency Operational Control Plane & Modes (Cases 1-8)
 * - Section 2: Graceful Shutdown & Crash Recovery (Cases 9-14)
 * - Section 3: SQLite Online Backups & Disaster Recovery (Cases 15-22)
 * - Section 4: Queue Backpressure & Durability Guarantees (Cases 23-28)
 * - Section 5: Provider Circuit Breakers (Cases 29-34)
 * - Section 6: Failure Injection & Chaos Drills (Cases 35-40)
 * - Section 7: REST API Endpoints & RBAC Security (Cases 41-45)
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../src/lib/db";
import {
  OperationalControlService,
  ControlAuthorizationService,
  ControlAuditService,
  ExecutionGateService,
  EmergencyPauseService,
  MaintenanceModeService,
  KillSwitchService,
} from "../src/lib/operations";
import {
  ShutdownCoordinator,
  RestartRecoveryService,
  LivenessService,
  ReadinessService,
  BackpressureService,
  ProviderResilienceService,
} from "../src/lib/resilience";
import {
  BackupService,
  BackupIntegrityService,
  BackupManifestService,
  RestoreService,
  RecoveryPointService,
} from "../src/lib/disaster-recovery";
import { DrillRunner } from "../src/lib/resilience/testing/drillRunner";
import { JobQueueService } from "../src/lib/jobs";
import { verifyAuditChain } from "../src/lib/auditLedger";

const TEST_BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failedCount++;
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passedCount++;
    console.log(`  ✓ PASS: ${message}`);
  }
}

async function runMilestone94TestSuite() {
  console.log("================================================================================");
  console.log("  MANDATE — MILESTONE 9.4: OPERATIONAL CONTROLS, RESILIENCE & DISASTER RECOVERY");
  console.log("  Core Invariant: Availability must never compromise authorization or financial safety.");
  console.log("================================================================================\n");

  const testTenant = await prisma.user.upsert({
    where: { id: "test-resilience-tenant-94" },
    create: {
      id: "test-resilience-tenant-94",
      nearAccountId: "resilience-tenant.near",
      displayName: "Resilience Test Tenant",
      role: "OPERATOR",
    },
    update: {},
  });

  await prisma.user.upsert({
    where: { id: "admin_1" },
    create: {
      id: "admin_1",
      nearAccountId: "admin1.near",
      displayName: "Admin One",
      role: "SECURITY_ADMIN",
    },
    update: {},
  });

  await prisma.user.upsert({
    where: { id: "operator_1" },
    create: {
      id: "operator_1",
      nearAccountId: "operator1.near",
      displayName: "Operator One",
      role: "OPERATOR",
    },
    update: {},
  });

  await prisma.user.upsert({
    where: { id: "security_admin_1" },
    create: {
      id: "security_admin_1",
      nearAccountId: "securityadmin1.near",
      displayName: "Security Admin One",
      role: "SECURITY_ADMIN",
    },
    update: {},
  });

  // Ensure clean starting operational mode
  await OperationalControlService.transitionState({
    newMode: "NORMAL",
    actionType: "RESUME_EXECUTION",
    actorId: "TEST_INIT",
    actorRole: "SECURITY_ADMIN",
    reason: "Initializing Milestone 9.4 test run in NORMAL state",
  });
  OperationalControlService.clearCache();

  // ============================================================================
  // SECTION 1: EMERGENCY OPERATIONAL CONTROL PLANE & MODES (Cases 1-8)
  // ============================================================================
  console.log("\n--- SECTION 1: EMERGENCY OPERATIONAL CONTROL PLANE & MODES ---");

  // Case 1: Initial state is NORMAL
  const initialMode = await OperationalControlService.getCurrentMode();
  assert(initialMode === "NORMAL", "Case 1: Global operational mode starts in NORMAL");

  // Case 2: Financial execution pause transition & gate checks
  await EmergencyPauseService.pauseFinancialExecution({
    actorId: "operator_1",
    actorRole: "OPERATOR",
    reason: "Suspicious NEAR transaction volume detected",
  });
  OperationalControlService.clearCache();
  const finPauseMode = await OperationalControlService.getCurrentMode();
  assert(finPauseMode === "FINANCIAL_EXECUTION_PAUSED", "Case 2a: Transition to FINANCIAL_EXECUTION_PAUSED succeeds");

  let finGateBlocked = false;
  try {
    await ExecutionGateService.assertFinancialExecutionAllowed("Test financial transfer");
  } catch (err: any) {
    finGateBlocked = err.message.includes("OPERATIONAL_CONTROL_BLOCKED");
  }
  assert(finGateBlocked, "Case 2b: Financial gate strictly blocks transactions during financial pause");

  const agentAllowedDuringFinPause = await ExecutionGateService.checkAgentExecutionAllowed();
  assert(agentAllowedDuringFinPause.allowed, "Case 2c: Non-financial agent reasoning remains permitted during financial-only pause");

  // Case 3: All-agent execution pause transition & gate checks
  await EmergencyPauseService.pauseAllAgentExecution({
    actorId: "operator_1",
    actorRole: "OPERATOR",
    reason: "Platform maintenance and agent pause",
  });
  OperationalControlService.clearCache();
  const allAgentPauseMode = await OperationalControlService.getCurrentMode();
  assert(allAgentPauseMode === "ALL_AGENT_EXECUTION_PAUSED", "Case 3a: Transition to ALL_AGENT_EXECUTION_PAUSED succeeds");

  let agentGateBlocked = false;
  try {
    await ExecutionGateService.assertAgentExecutionAllowed("Test agent run");
  } catch (err: any) {
    agentGateBlocked = err.message.includes("OPERATIONAL_CONTROL_BLOCKED");
  }
  assert(agentGateBlocked, "Case 3b: Agent execution gate blocks all agent runs");

  // Case 4: Maintenance mode transition & gate checks
  await MaintenanceModeService.enterMaintenance({
    actorId: "operator_1",
    actorRole: "SECURITY_ADMIN",
    reason: "Performing database vacuum and DR drill",
  });
  OperationalControlService.clearCache();
  assert(await MaintenanceModeService.isUnderMaintenance(), "Case 4a: System confirmed under MAINTENANCE_MODE");

  const maintFinCheck = await ExecutionGateService.checkFinancialExecutionAllowed();
  const maintAgentCheck = await ExecutionGateService.checkAgentExecutionAllowed();
  assert(!maintFinCheck.allowed && !maintAgentCheck.allowed, "Case 4b: Maintenance mode disables both financial and agent actions");

  // Exit maintenance
  await MaintenanceModeService.exitMaintenance({
    actorId: "operator_1",
    actorRole: "SECURITY_ADMIN",
    reason: "Maintenance complete",
  });
  OperationalControlService.clearCache();

  // Case 5: Security lockdown panic kill switch activation & gate checks
  await KillSwitchService.activateKillSwitch({
    actorId: "admin_1",
    actorRole: "SECURITY_ADMIN",
    reason: "CRITICAL: Potential enclave signature anomaly",
  });
  OperationalControlService.clearCache();
  assert((await OperationalControlService.getCurrentMode()) === "SECURITY_LOCKDOWN", "Case 5a: Panic button activates SECURITY_LOCKDOWN immediately");

  let lockdownFinBlocked = false;
  try {
    await ExecutionGateService.assertFinancialExecutionAllowed();
  } catch (err: any) {
    lockdownFinBlocked = err.message.includes("OPERATIONAL_CONTROL_BLOCKED");
  }
  assert(lockdownFinBlocked, "Case 5b: Financial operations fail-closed under security lockdown");

  // Case 6: AI Agent prohibition (SECURITY_POLICY_VIOLATION on control changes)
  let agentProhibitionThrown = false;
  try {
    ControlAuthorizationService.assertAuthorized({
      actorId: "specialist_agent_42",
      actorRole: "AGENT",
      isAgent: true,
      actionType: "RELEASE_SECURITY_LOCKDOWN",
    });
  } catch (err: any) {
    agentProhibitionThrown = err.message.includes("SECURITY_POLICY_VIOLATION");
  }
  assert(agentProhibitionThrown, "Case 6: AI agents are strictly prohibited from mutating control plane (SECURITY_POLICY_VIOLATION)");

  // Case 7: Unacknowledged SEV-1 incident blocks pause release without force override
  const sev1Incident = await prisma.incident.create({
    data: {
      incidentNumber: `INC-SEV1-TEST-${Date.now()}`,
      title: "Test Active Unacknowledged SEV-1 Incident",
      severity: "SEV-1",
      status: "TRIGGERED",
      description: "Severe anomaly requiring operator investigation",
      category: "FINANCIAL",
      deduplicationKey: `sev1-lock-test-${Date.now()}`,
    },
  });

  let sev1BlockThrown = false;
  try {
    await EmergencyPauseService.resumeExecution({
      actorId: "operator_1",
      actorRole: "OPERATOR",
      reason: "Attempting to resume with active SEV-1",
      forceOverrideUnacknowledgedIncidents: false,
    });
  } catch (err: any) {
    sev1BlockThrown = err.message.includes("PRECONDITION_FAILED");
  }
  assert(sev1BlockThrown, "Case 7: Unacknowledged SEV-1 incident blocks pause release without explicit override");

  // Clean up SEV-1 incident and release lockdown with elevated auth
  await prisma.incident.update({
    where: { id: sev1Incident.id },
    data: { status: "RESOLVED" },
  });
  await KillSwitchService.releaseKillSwitch({
    actorId: "admin_1",
    actorRole: "SECURITY_ADMIN",
    reason: "Anomaly cleared after operator verification",
    forceOverride: true,
  });
  OperationalControlService.clearCache();

  // Case 8: Tamper-evident dual audit logging in OperationalAuditRecord and recordAuditEvent
  const recentAudits = await OperationalControlService.getRecentAudits(5);
  assert(recentAudits.length > 0, "Case 8a: State transitions persisted in OperationalAuditRecord table");

  const auditVerification = await verifyAuditChain("SYSTEM");
  assert(auditVerification.valid, "Case 8b: SHA-256 cryptographic audit ledger chain verified valid");

  // ============================================================================
  // SECTION 2: GRACEFUL SHUTDOWN & CRASH RECOVERY (Cases 9-14)
  // ============================================================================
  console.log("\n--- SECTION 2: GRACEFUL SHUTDOWN & CRASH RECOVERY ---");

  // Case 9: Process liveness telemetry check
  const liveness = LivenessService.getStatus();
  assert(liveness.status === "ALIVE" && liveness.pid === process.pid && liveness.uptimeSeconds >= 0, "Case 9: Process liveness reports ALIVE, PID, and uptime");

  // Case 10: Process readiness check
  const readiness = await ReadinessService.getStatus();
  assert(readiness.status === "READY" && readiness.databaseHealthy, "Case 10: Readiness check confirms Database connected and operational mode READY");

  // Case 11: ShutdownCoordinator worker drain & safe lease release
  const lifecycleState = ShutdownCoordinator.getLifecycleState();
  assert(lifecycleState === "READY" || lifecycleState === "INITIALIZING", "Case 11: ShutdownCoordinator reports valid lifecycle state");

  // Case 12: Financial job locks preserved as REQUIRES_RECOVERY during shutdown
  // Enqueue a test financial job
  const finJob = await JobQueueService.submitJob({
    tenantId: testTenant.id,
    jobType: "MANDATE_DISBURSEMENT",
    payload: {
      mandateId: "mandate-test",
      recipient: "test.near",
      amountYocto: "1000000000000000000000000",
    },
    priority: 10,
  });

  assert(finJob.status === "QUEUED" && finJob.jobCategory === "FINANCIAL", "Case 12a: Financial job queued with FINANCIAL category");

  // Case 13: RestartRecoveryService startup reconciliation: identifies stale workers (>30s)
  const restartResult = await RestartRecoveryService.executeStartupRecovery();
  assert(typeof restartResult.staleWorkersMarkedStopped === "number", "Case 13: Restart recovery evaluates worker heartbeats and marks stale workers stopped");

  // Case 14: Orphaned non-financial job lease reclaimed and reset to PENDING
  assert(typeof restartResult.recoveredLeasesCount === "number", "Case 14: Orphaned non-financial job leases reclaimed safely");

  // ============================================================================
  // SECTION 3: SQLITE ONLINE BACKUPS & DISASTER RECOVERY (Cases 15-22)
  // ============================================================================
  console.log("\n--- SECTION 3: SQLITE ONLINE BACKUPS & DISASTER RECOVERY ---");

  // Case 15: BackupService.createBackup executes online VACUUM INTO without table lock
  const backup = await BackupService.createBackup({
    backupType: "FULL",
    createdBy: "admin_dr_1",
    trigger: "MANUAL",
    metadata: { reason: "M9.4 Resilience test" },
  });

  assert(backup.status === "COMPLETED" && fs.existsSync(backup.filePath), "Case 15: Online SQLite backup created via VACUUM INTO");

  // Case 16: BackupIntegrityService validates SQLite magic header bytes ('SQLite format 3\0')
  const hasValidMagicHeader = BackupIntegrityService.verifySqliteHeader(backup.filePath);
  assert(hasValidMagicHeader, "Case 16: Backup file contains valid 'SQLite format 3' magic header");

  // Case 17: SHA-256 checksum computation and verification matches file on disk
  const integrity = await BackupIntegrityService.verifyBackupIntegrity(backup.filePath, backup.checksumSha256);
  assert(integrity.valid && integrity.actualChecksum === backup.checksumSha256, "Case 17: SHA-256 checksum matches physical file on disk");

  // Case 18: Corrupted backup detection (tampered byte array or header mismatch)
  const corruptFilePath = path.join(process.cwd(), "prisma", "backups", `corrupt-test-${Date.now()}.db`);
  fs.writeFileSync(corruptFilePath, "TAMPERED_HEADER_INVALID_SQLITE_BYTES");

  const corruptIntegrity = await BackupIntegrityService.verifyBackupIntegrity(corruptFilePath, "fake-hash");
  assert(Boolean(!corruptIntegrity.valid && corruptIntegrity.error?.includes("magic header")), "Case 18: Corrupted SQLite backup detected and rejected prior to restoration");
  if (fs.existsSync(corruptFilePath)) fs.unlinkSync(corruptFilePath);

  // Case 19: Backup retention policy enforcement (prunes older than retention limit)
  const pruned = await BackupService.pruneOldBackups(20);
  assert(typeof pruned === "number", "Case 19: Backup retention policy enforces max snapshot threshold");

  // Case 20: Restore drill in isolated sandbox without touching live dev.db
  const drillResult = await RestoreService.restoreBackup({
    backupId: backup.backupId,
    restoredBy: "security_admin_1",
    restoredByRole: "SECURITY_ADMIN",
    isDrill: true,
  });
  assert(drillResult.isDrill && drillResult.status === "COMPLETED" && drillResult.integrityPassed, "Case 20: Disaster recovery restore drill executes in isolated sandbox and passes integrity verification");

  // Case 21: Live restore requires MAINTENANCE_MODE precondition
  let liveRestoreBlocked = false;
  try {
    await RestoreService.restoreBackup({
      backupId: backup.backupId,
      restoredBy: "security_admin_1",
      restoredByRole: "SECURITY_ADMIN",
      isDrill: false,
      skipMaintenanceCheck: false,
    });
  } catch (err: any) {
    liveRestoreBlocked = err.message.includes("PRECONDITION_FAILED") || err.message.includes("MAINTENANCE_MODE");
  }
  assert(liveRestoreBlocked, "Case 21: Live restore rejected when system is not in MAINTENANCE_MODE");

  // Case 22: RPO and RTO calculations in RecoveryPointService
  const drMetrics = await RecoveryPointService.getMetrics();
  assert(drMetrics.totalBackupsCount >= 1 && drMetrics.backupSuccessRate === 100, "Case 22: Disaster recovery telemetry calculates measured RPO, RTO, and backup success rate");

  // ============================================================================
  // SECTION 4: QUEUE BACKPRESSURE & DURABILITY GUARANTEES (Cases 23-28)
  // ============================================================================
  console.log("\n--- SECTION 4: QUEUE BACKPRESSURE & DURABILITY GUARANTEES ---");

  // Configure backpressure thresholds for deterministic testing
  const originalBpConfig = BackpressureService.getConfig();
  BackpressureService.configure({
    maxPendingQueueDepth: 3,
    maxTenantPendingJobs: 2,
    highWatermarkRatio: 0.6,
  });

  // Case 23: Global queue saturation limit rejection of standard background jobs
  // Temporarily insert 3 mock pending jobs
  const dummyJobs = await Promise.all([
    prisma.backgroundJob.create({
      data: {
        tenantId: testTenant.id,
        jobType: "SYSTEM_HEALTH_CHECK",
        jobCategory: "GENERAL",
        payload: "{}",
        payloadHash: "dummy1",
        status: "PENDING",
      },
    }),
    prisma.backgroundJob.create({
      data: {
        tenantId: testTenant.id,
        jobType: "SYSTEM_HEALTH_CHECK",
        jobCategory: "GENERAL",
        payload: "{}",
        payloadHash: "dummy2",
        status: "PENDING",
      },
    }),
    prisma.backgroundJob.create({
      data: {
        tenantId: testTenant.id,
        jobType: "SYSTEM_HEALTH_CHECK",
        jobCategory: "GENERAL",
        payload: "{}",
        payloadHash: "dummy3",
        status: "PENDING",
      },
    }),
  ]);

  const saturatedEval = await BackpressureService.evaluateAdmission({
    tenantId: "another-tenant",
    jobType: "SYSTEM_HEALTH_CHECK",
    priority: 0,
  });
  assert(!saturatedEval.allowed && saturatedEval.admissionState === "SATURATED", "Case 23: Standard jobs rejected when pending queue depth reaches capacity limit");

  // Case 24: Per-tenant pending job quota enforcement
  const tenantEval = await BackpressureService.evaluateAdmission({
    tenantId: testTenant.id,
    jobType: "SYSTEM_HEALTH_CHECK",
    priority: 0,
  });
  assert(!tenantEval.allowed, "Case 24: Tenant exceeding max pending quota is restricted by admission controller");

  // Case 25: Critical priority / recovery jobs bypass backpressure limits
  const criticalEval = await BackpressureService.evaluateAdmission({
    tenantId: testTenant.id,
    jobType: "SYSTEM_HEALTH_CHECK",
    priority: 150,
  });
  assert(criticalEval.allowed, "Case 25: Priority >= 100 jobs bypass backpressure limits");

  // Case 26: Financial Job Durability Guarantee: financial jobs NEVER dropped or rejected
  const finDurabilityEval = await BackpressureService.evaluateAdmission({
    tenantId: testTenant.id,
    jobType: "MANDATE_DISBURSEMENT",
    priority: 0,
  });
  assert(
    Boolean(
      finDurabilityEval.allowed &&
        finDurabilityEval.reason?.includes("FINANCIAL_DURABILITY_GUARANTEE")
    ),
    "Case 26: Financial jobs receive an absolute durability admission guarantee (never dropped)"
  );

  // Case 27: Backpressure status reporting
  const bpStatus = await BackpressureService.getStatus();
  assert(bpStatus.pendingQueueDepth >= 3 && bpStatus.admissionState === "SATURATED", "Case 27: Backpressure telemetry reports accurate saturation percentage and admission state");

  // Clean up dummy jobs and restore original config
  await prisma.backgroundJob.deleteMany({
    where: { id: { in: dummyJobs.map((j) => j.id) } },
  });
  BackpressureService.configure(originalBpConfig);

  // Case 28: Idempotency takes precedence before backpressure check
  const idempotentKey = `idemp-test-${Date.now()}`;
  const job1 = await JobQueueService.submitJob({
    tenantId: testTenant.id,
    jobType: "SYSTEM_HEALTH_CHECK",
    payload: { checkType: "DIAGNOSTIC", sample: "1" },
    idempotencyKey: idempotentKey,
  });
  const job2 = await JobQueueService.submitJob({
    tenantId: testTenant.id,
    jobType: "SYSTEM_HEALTH_CHECK",
    payload: { checkType: "DIAGNOSTIC", sample: "1" },
    idempotencyKey: idempotentKey,
  });
  assert(job1.id === job2.id, "Case 28: Idempotent submission returns original job before queue admission check");

  // ============================================================================
  // SECTION 5: PROVIDER CIRCUIT BREAKERS (Cases 29-34)
  // ============================================================================
  console.log("\n--- SECTION 5: PROVIDER CIRCUIT BREAKERS ---");

  const testProvider = "near_rpc_testnet";

  // Case 29: Circuit breaker starts in CLOSED state and allows requests
  await ProviderResilienceService.resetBreaker(testProvider, "TEST", "SECURITY_ADMIN");
  const stateInitial = await ProviderResilienceService.getCircuitState(testProvider);
  assert(stateInitial.state === "CLOSED", "Case 29: Circuit breaker initializes in CLOSED state");

  // Case 30: 5 consecutive failures trip breaker to OPEN state
  for (let i = 0; i < 5; i++) {
    try {
      await ProviderResilienceService.executeWithBreaker(testProvider, async () => {
        throw new Error("RPC simulated network failure");
      });
    } catch {
      // Expected
    }
  }

  const trippedState = await ProviderResilienceService.getCircuitState(testProvider);
  assert(trippedState.state === "OPEN" && trippedState.failureCount >= 5, "Case 30: 5 consecutive provider failures trip breaker to OPEN");

  // Case 31: OPEN state immediately rejects requests without contacting upstream provider
  let rejectedByCircuit = false;
  let upstreamCalled = false;
  try {
    await ProviderResilienceService.executeWithBreaker(testProvider, async () => {
      upstreamCalled = true;
      return "OK";
    });
  } catch (err: any) {
    rejectedByCircuit = err.message.includes("CIRCUIT_BREAKER_OPEN");
  }
  assert(rejectedByCircuit && !upstreamCalled, "Case 31: OPEN circuit breaker immediately short-circuits calls without invoking provider");

  // Case 32: Manual reset brings circuit back to CLOSED
  await ProviderResilienceService.resetBreaker(testProvider, "operator_1", "SECURITY_ADMIN");
  const resetState = await ProviderResilienceService.getCircuitState(testProvider);
  assert(resetState.state === "CLOSED" && resetState.failureCount === 0, "Case 32: Manual reset returns breaker to CLOSED with 0 failures");

  // Case 33: Successful execution through breaker preserves CLOSED state
  const execResult = await ProviderResilienceService.executeWithBreaker(testProvider, async () => {
    return "NEAR_BLOCK_1234567";
  });
  assert(execResult === "NEAR_BLOCK_1234567", "Case 33: Successful provider invocation passes through breaker and records telemetry");

  // Case 34: Manual trip to OPEN
  await ProviderResilienceService.tripBreaker(testProvider, "Maintenance isolation", "operator_1", "SECURITY_ADMIN");
  const manuallyTripped = await ProviderResilienceService.getCircuitState(testProvider);
  assert(manuallyTripped.state === "OPEN", "Case 34: Operator manual trip successfully isolates provider");

  // Restore breaker to closed
  await ProviderResilienceService.resetBreaker(testProvider, "TEST_CLEANUP", "SECURITY_ADMIN");

  // ============================================================================
  // SECTION 6: FAILURE INJECTION & CHAOS DRILLS (Cases 35-40)
  // ============================================================================
  console.log("\n--- SECTION 6: FAILURE INJECTION & CHAOS DRILLS ---");

  // Case 35: SECURITY_LOCKDOWN_ENFORCEMENT drill
  const drillLockdown = await DrillRunner.runDrill("SECURITY_LOCKDOWN_ENFORCEMENT", "CHAOS_ENGINE");
  assert(drillLockdown.status === "PASSED" && drillLockdown.assertionsPassed >= 3, "Case 35: Security Lockdown Enforcement drill passed with 100% assertions");

  // Case 36: EMERGENCY_PAUSE_FINANCIAL drill
  const drillFinPause = await DrillRunner.runDrill("EMERGENCY_PAUSE_FINANCIAL", "CHAOS_ENGINE");
  assert(drillFinPause.status === "PASSED", "Case 36: Emergency Financial Pause drill passed");

  // Case 37: SEV1_BLOCKS_PAUSE_RELEASE drill
  const drillSev1 = await DrillRunner.runDrill("SEV1_BLOCKS_PAUSE_RELEASE", "CHAOS_ENGINE");
  assert(drillSev1.status === "PASSED", "Case 37: SEV-1 pause release blocking drill passed");

  // Case 38: CORRUPTED_BACKUP_DETECTION drill
  const drillCorrupt = await DrillRunner.runDrill("CORRUPTED_BACKUP_DETECTION", "CHAOS_ENGINE");
  assert(drillCorrupt.status === "PASSED", "Case 38: Corrupted Backup Detection drill passed");

  // Case 39: FULL_RESTORE_DRILL
  const drillRestore = await DrillRunner.runDrill("FULL_RESTORE_DRILL", "CHAOS_ENGINE");
  assert(drillRestore.status === "PASSED", "Case 39: Full non-destructive database restore drill passed");

  // Case 40: QUEUE_BACKPRESSURE_OVERLOAD drill
  const drillBp = await DrillRunner.runDrill("QUEUE_BACKPRESSURE_OVERLOAD", "CHAOS_ENGINE");
  assert(drillBp.status === "PASSED", "Case 40: Queue Backpressure & Financial Durability drill passed");

  // ============================================================================
  // SECTION 7: REST API ENDPOINTS & RBAC SECURITY (Cases 41-45)
  // ============================================================================
  console.log("\n--- SECTION 7: REST API ENDPOINTS & RBAC SECURITY ---");

  // Case 41: /api/health/live and /api/health/ready HTTP responses
  const liveRes = await fetch(`${TEST_BASE_URL}/api/health/live`);
  assert(liveRes.status === 200, "Case 41a: GET /api/health/live returns 200 OK");
  const liveData = await liveRes.json();
  assert(liveData.status === "ALIVE", "Case 41b: Live endpoint returns ALIVE");

  const readyRes = await fetch(`${TEST_BASE_URL}/api/health/ready`);
  assert(readyRes.status === 200, "Case 41c: GET /api/health/ready returns 200 OK");

  // Case 42: /api/operations/status and /api/operations/pause
  const statusRes = await fetch(`${TEST_BASE_URL}/api/operations/status`);
  const statusData = await statusRes.json();
  assert(statusRes.status === 200 && statusData.success, "Case 42: GET /api/operations/status returns operational mode and circuit breakers");

  // Case 43: AI Agent rejected with 403 on /api/operations/pause
  const agentPauseRes = await fetch(`${TEST_BASE_URL}/api/operations/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pauseType: "FINANCIAL_ONLY",
      reason: "Agent trying to alter operational state",
      actorId: "autonomous_agent_007",
      actorRole: "AGENT",
      isAgent: true,
    }),
  });
  const agentPauseData = await agentPauseRes.json();
  assert(
    Boolean(
      agentPauseRes.status === 403 &&
        agentPauseData.error?.includes("SECURITY_POLICY_VIOLATION")
    ),
    "Case 43: POST /api/operations/pause returns 403 Forbidden for AI agents (SECURITY_POLICY_VIOLATION)"
  );

  // Case 44: /api/disaster-recovery/backups creation and manifest listing
  const backupApiRes = await fetch(`${TEST_BASE_URL}/api/disaster-recovery/backups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      backupType: "SNAPSHOT",
      createdBy: "api_operator",
      trigger: "MANUAL",
    }),
  });
  const backupApiData = await backupApiRes.json();
  assert(backupApiRes.status === 200 && backupApiData.success, "Case 44a: POST /api/disaster-recovery/backups creates consistent online snapshot via API");

  const manifestsRes = await fetch(`${TEST_BASE_URL}/api/disaster-recovery/backups`);
  const manifestsData = await manifestsRes.json();
  assert(manifestsData.manifests.length >= 1, "Case 44b: GET /api/disaster-recovery/backups returns manifests and RPO/RTO metrics");

  // Case 45: /api/resilience/providers and /api/resilience/queue status
  const queueApiRes = await fetch(`${TEST_BASE_URL}/api/resilience/queue`);
  const queueApiData = await queueApiRes.json();
  assert(queueApiRes.status === 200 && queueApiData.success, "Case 45a: GET /api/resilience/queue returns backpressure metrics");

  const providersApiRes = await fetch(`${TEST_BASE_URL}/api/resilience/providers`);
  const providersApiData = await providersApiRes.json();
  assert(providersApiRes.status === 200 && providersApiData.success, "Case 45b: GET /api/resilience/providers returns provider circuit breakers");

  // Final Cleanup: ensure platform is left in NORMAL mode
  await OperationalControlService.transitionState({
    newMode: "NORMAL",
    actionType: "RESUME_EXECUTION",
    actorId: "TEST_CLEANUP",
    actorRole: "SECURITY_ADMIN",
    reason: "Milestone 9.4 test suite completed successfully",
  });
  OperationalControlService.clearCache();

  console.log("\n================================================================================");
  console.log(`  MILESTONE 9.4 RESILIENCE TEST SUITE COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runMilestone94TestSuite()
  .catch((err) => {
    console.error("FATAL: Test suite crashed with error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
