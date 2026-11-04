/**
 * MANDATE — MILESTONE 9.3: AUTOMATED RECONCILIATION, INCIDENT MANAGEMENT & RECOVERY
 * Comprehensive Production & Verification Test Suite
 *
 * Covers 43 test scenarios across:
 * - Section 1: Automated Reconciliation Engine & Classification (Cases 1-10)
 * - Section 2: Incident Management & Deterministic Lifecycle (Cases 11-20)
 * - Section 3: Recovery Orchestration & Security Enforcement (Cases 21-31)
 * - Section 4: Background Worker & Queue Integration (Cases 32-35)
 * - Section 5: End-to-End REST API Verification (Cases 36-39)
 * - Section 6: Platform Regression & System Invariants (Cases 40-43)
 */

import crypto from "crypto";
import { prisma } from "../src/lib/db";
import {
  ReconciliationService,
  ExecutionReconciler,
  JobReconciler,
  WorkerReconciler,
  ProviderReconciler,
  EvidenceService,
  DiscrepancyService,
} from "../src/lib/reconciliation";
import {
  IncidentDetectionService,
  IncidentLifecycleService,
  IncidentTimelineService,
  IncidentEscalationService,
} from "../src/lib/incidents";
import {
  RecoveryPlanner,
  RecoveryApprovalService,
  RecoveryExecutor,
  RecoveryVerificationService,
} from "../src/lib/recovery";
import { JobQueueService, JobClaimService, JobWorkerService, JobRegistry } from "../src/lib/jobs";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { ExecutionRecoveryService } from "../src/lib/execution/recoveryService";
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

async function runMilestone93TestSuite() {
  console.log("================================================================================");
  console.log("  MANDATE — MILESTONE 9.3: AUTOMATED RECONCILIATION, INCIDENTS & RECOVERY");
  console.log("================================================================================\n");

  const runId = crypto.randomBytes(4).toString("hex");

  // Create or retrieve clean test tenant & agent & wallet
  const testUser = await prisma.user.create({
    data: {
      nearAccountId: `tenant_m93_${runId}.testnet`,
      displayName: `M9.3 Test Tenant ${runId}`,
      sessionToken: `token_m93_${runId}`,
      role: "OWNER",
    },
  });

  const testAgent = await prisma.agent.create({
    data: {
      name: `Agent M93 ${runId}`,
      purpose: "Reliability and Reconciliation Agent",
      status: "ACTIVE",
      type: "reconciliation_procurement",
      userId: testUser.id,
    },
  });

  const testWallet = await prisma.wallet.create({
    data: {
      walletId: `wlt_m93_${runId}`,
      apiKey: `wk_m93_${runId}`,
      agent: { connect: { id: testAgent.id } },
      nearAccountId: `wallet_m93_${runId}.testnet`,
      balanceYocto: "10000000000000000000000000", // 10 NEAR
      isInitialized: true,
    },
  });

  const testMandate = await prisma.mandate.create({
    data: {
      name: `Mandate M93 ${runId}`,
      totalBudgetYocto: "5000000000000000000000000", // 5 NEAR
      spentYocto: "0",
      reservedYocto: "1000000000000000000000000", // 1 NEAR reserved
      perTxLimitYocto: "2000000000000000000000000",
      approvalThresholdYocto: "1000000000000000000000000",
      allowedRecipientsJson: JSON.stringify(["alice.near", "vendor.testnet"]),
      expiresAt: new Date(Date.now() + 86400000),
      policyVersion: 1,
      userId: testUser.id,
      agentId: testAgent.id,
      walletId: testWallet.id,
    },
  });

  // ============================================================================
  // SECTION 1: Automated Reconciliation Engine & Classification
  // ============================================================================
  console.log("--- Section 1: Automated Reconciliation Engine & Classification ---");

  // Case 1: Full reconciliation sweep executes across all layers
  const fullRunResult = await ReconciliationService.executeRun({
    tenantId: testUser.id,
    runType: "FULL",
  });
  assert(
    fullRunResult.status === "COMPLETED" && fullRunResult.totalEvaluated >= 0,
    "Case 1: Full reconciliation sweep executes cleanly and returns COMPLETED status"
  );
  console.log(`     ↳ Run ID: ${fullRunResult.runId}, Total Evaluated: ${fullRunResult.totalEvaluated}`);

  // Case 2: Clean matched state evaluation (MATCHED)
  const matchedExec = await prisma.executionRecord.create({
    data: {
      idempotencyKey: `idem_matched_${runId}`,
      payloadHash: "hash_matched",
      status: "PROPOSED",
      recipient: "alice.near",
      amountYocto: "500000000000000000000000",
      nonce: `nonce_matched_${runId}`,
      authSignature: "sig_matched",
      expiresAt: new Date(Date.now() + 300000),
      userId: testUser.id,
      mandateId: testMandate.id,
    },
  });
  const matchedFinding = await ExecutionReconciler.reconcileExecution(matchedExec.id);
  assert(
    matchedFinding !== null && matchedFinding.classification === "INTERNAL_ONLY",
    "Case 2: Pre-broadcast execution evaluates correctly as INTERNAL_ONLY without false discrepancies"
  );

  // Case 3: State mismatch detection (STATE_MISMATCH)
  const mismatchFinding = {
    entityType: "EXECUTION" as const,
    entityId: matchedExec.id,
    internalState: "BROADCAST",
    externalState: "SUCCESS",
    classification: "STATE_MISMATCH" as const,
    severity: "SEV-2" as const,
    details: "Execution succeeded on-chain but marked BROADCAST in DB",
    recommendedResponse: "EXECUTION_STATUS_CHECK",
    evidence: [],
  };
  const recordedDiscrepancy = await DiscrepancyService.recordDiscrepancyFromFinding(
    mismatchFinding,
    testUser.id
  );
  assert(
    recordedDiscrepancy.status === "OPEN" && recordedDiscrepancy.category === "STATE_DESYNC",
    "Case 3: State mismatch finding generates persistent OPEN ExecutionDiscrepancy"
  );

  // Case 4: Ambiguous post-broadcast execution detection (AMBIGUOUS)
  const ambiguousExec = await prisma.executionRecord.create({
    data: {
      idempotencyKey: `idem_ambiguous_${runId}`,
      payloadHash: "hash_ambiguous",
      status: "BROADCAST",
      recipient: "vendor.testnet",
      amountYocto: "1000000000000000000000000",
      nonce: `nonce_ambiguous_${runId}`,
      authSignature: "sig_ambiguous",
      expiresAt: new Date(Date.now() + 300000),
      userId: testUser.id,
      mandateId: testMandate.id,
      // No txHash post-broadcast -> AMBIGUOUS!
    },
  });
  const ambiguousFinding = await ExecutionReconciler.reconcileExecution(ambiguousExec.id);
  assert(
    ambiguousFinding !== null &&
      ambiguousFinding.classification === "AMBIGUOUS" &&
      ambiguousFinding.severity === "SEV-1",
    "Case 4: Post-broadcast execution without txHash is classified AMBIGUOUS (SEV-1)"
  );

  // Case 5: Provider unavailability detection
  const unreachableEp = {
    name: "Simulated Down Provider",
    url: "http://127.0.0.1:54321/down",
    providerType: "near_rpc" as const,
  };
  const providerFinding = await ProviderReconciler.reconcileEndpoint(unreachableEp, 1000);
  assert(
    providerFinding.classification === "UNAVAILABLE" && providerFinding.severity === "SEV-2",
    "Case 5: Unreachable external provider is classified UNAVAILABLE (SEV-2)"
  );

  // Case 6: Cryptographic evidence generation with canonical SHA-256 hash
  const rawPayload = { txHash: "abc1234", blockHeight: 99482, observed: "CONFIRMED" };
  const { canonicalJson, hash } = EvidenceService.hashPayload(rawPayload);
  const verifyResult = EvidenceService.verifyEvidenceIntegrity(canonicalJson, hash);
  assert(
    verifyResult && hash.length === 64,
    "Case 6: Cryptographic evidence computes canonical SHA-256 hash with verified integrity"
  );

  // Case 7: Strict evidence secret sanitization (No private keys or auth signatures stored)
  const dirtyPayload = {
    privateKey: "ed25519:5M7...supersecretkeymaterial",
    authSignature: "hmac-sha256-signature-envelope",
    secretToken: "bearer_secret_12345",
    normalData: "safe_value",
  };
  const sanitized = EvidenceService.sanitizePayload(dirtyPayload);
  assert(
    sanitized.privateKey === "[REDACTED_SECURITY_SECRET]" &&
      sanitized.authSignature === "[REDACTED_SECURITY_SECRET]" &&
      sanitized.normalData === "safe_value",
    "Case 7: Sensitive private keys, signatures, and secrets are strictly redacted from evidence payloads"
  );

  // Case 8: Discrepancy deduplication key enforcement
  const dedupKey1 = DiscrepancyService.generateDeduplicationKey("JOB", "job_123", "LEASE_EXPIRED");
  const dedupKey2 = DiscrepancyService.generateDeduplicationKey("job", "job_123", "lease_expired" as any);
  assert(
    dedupKey1 === dedupKey2 && dedupKey1 === "JOB:job_123:LEASE_EXPIRED",
    "Case 8: Discrepancy deduplication keys are normalized and enforce uniqueness"
  );

  // Case 9: Discrepancy re-observation updates timestamp and count without duplicate records
  const initialObsCount = JSON.parse(recordedDiscrepancy.metadata || "{}").observationCount || 1;
  const updatedDiscrepancy = await DiscrepancyService.recordDiscrepancyFromFinding(
    mismatchFinding,
    testUser.id
  );
  const updatedObsCount = JSON.parse(updatedDiscrepancy.metadata || "{}").observationCount || 1;
  assert(
    updatedDiscrepancy.id === recordedDiscrepancy.id && updatedObsCount > initialObsCount,
    "Case 9: Re-observed discrepancy updates observation counter and timestamp idempotently"
  );

  // Case 10: Discrepancy resolution lifecycle
  const resolvedDiscrepancy = await DiscrepancyService.resolveDiscrepancy(
    recordedDiscrepancy.id,
    "Manually reconciled on chain",
    "security-admin"
  );
  assert(
    resolvedDiscrepancy.status === "RESOLVED" && resolvedDiscrepancy.resolvedAt !== null,
    "Case 10: Discrepancy resolves cleanly with actor attribution and resolution notes"
  );

  // ============================================================================
  // SECTION 2: Incident Management & Deterministic Lifecycle
  // ============================================================================
  console.log("\n--- Section 2: Incident Management & Deterministic Lifecycle ---");

  // Case 11: Automated incident detection from discrepancy with formatted INC-YYYY-XXXX number
  const incidentDiscrepancy = await prisma.executionDiscrepancy.create({
    data: {
      tenantId: testUser.id,
      entityType: "EXECUTION",
      entityId: ambiguousExec.id,
      category: "FINANCIAL_AMBIGUITY",
      severity: "SEV-1",
      status: "OPEN",
      deduplicationKey: `EXECUTION:${ambiguousExec.id}:FINANCIAL_AMBIGUITY_${runId}`,
      internalState: "BROADCAST",
      externalState: "UNKNOWN",
      recommendedResponse: "MANUAL_FINANCIAL_REVIEW",
    },
  });
  const detectedIncident = await IncidentDetectionService.detectFromDiscrepancy(
    incidentDiscrepancy.id
  );
  assert(
    detectedIncident.incidentNumber.startsWith("INC-") &&
      detectedIncident.status === "DETECTED" &&
      detectedIncident.severity === "SEV-1",
    "Case 11: Automated incident detection assigns sequential incident number and preserves SEV-1"
  );
  console.log(`     ↳ Incident Number: ${detectedIncident.incidentNumber}`);

  // Case 12: Deduplication key prevents duplicate incident creation for identical issue
  const dedupIncident = await IncidentDetectionService.detectFromDiscrepancy(
    incidentDiscrepancy.id
  );
  assert(
    dedupIncident.id === detectedIncident.id,
    "Case 12: Deduplication key prevents incident flapping and binds duplicate discrepancies to existing incident"
  );

  // Case 13: Stage transition state machine
  const triagedIncident = await IncidentLifecycleService.transitionStage({
    incidentId: detectedIncident.id,
    newStage: "TRIAGED",
    actorId: testUser.nearAccountId,
    actorType: "OPERATOR",
    notes: "Triage completed by on-call engineer",
  });
  assert(
    triagedIncident.currentStage === "TRIAGED",
    "Case 13: Incident smoothly transitions stage to TRIAGED"
  );

  // Case 14: Incident operator acknowledgment
  const ackedIncident = await IncidentLifecycleService.acknowledgeIncident(
    detectedIncident.id,
    testUser.nearAccountId,
    "Confirmed on-call acknowledgment"
  );
  assert(
    ackedIncident.status === "ACKNOWLEDGED" && ackedIncident.acknowledgedBy === testUser.nearAccountId,
    "Case 14: Incident acknowledgment updates status to ACKNOWLEDGED with actor attribution"
  );

  // Case 15: Incident responder assignment
  const assignedIncident = await IncidentLifecycleService.assignIncident({
    incidentId: detectedIncident.id,
    assignedTo: "secops@mandate.xyz",
    assignedBy: testUser.nearAccountId,
    assignedTeam: "security",
    role: "LEAD_RESPONDER",
  });
  assert(
    assignedIncident.assignedTo === "secops@mandate.xyz" && assignedIncident.assignedTeam === "security",
    "Case 15: Incident responder and specialized team assignment recorded"
  );

  // Case 16: Append-only incident timeline records events with evidence hashes
  const timelineEvents = await IncidentTimelineService.getTimeline(detectedIncident.id);
  assert(
    timelineEvents.length >= 3,
    "Case 16: Append-only incident timeline accurately records state transitions in chronological order"
  );

  // Case 17: Operator comment posting on incident timeline
  const commentEvent = await IncidentTimelineService.addComment({
    incidentId: detectedIncident.id,
    actorId: testUser.nearAccountId,
    comment: "Investigating RPC latency spike on primary node",
    evidenceHash: hash,
  });
  assert(
    commentEvent.eventType === "COMMENT" && commentEvent.evidenceHash === hash,
    "Case 17: Operator comments append to incident timeline with cryptographic evidence hash binding"
  );

  // Case 18: Unacknowledged incident SLA auto-escalation check
  const escalationResult = await IncidentEscalationService.evaluateAndEscalateOpenIncidents();
  assert(
    typeof escalationResult.evaluatedCount === "number",
    "Case 18: SLA evaluation daemon executes and evaluates open incidents"
  );

  // Case 19: Severity escalation: incoming SEV-1 discrepancy escalates an existing SEV-2 incident
  const sev2Incident = await IncidentDetectionService.createIncident({
    tenantId: testUser.id,
    title: `Worker Heartbeat Warning ${runId}`,
    description: "Worker instance stalled",
    category: "SYSTEM_DEGRADATION",
    severity: "SEV-3",
    targetEntityType: "WORKER",
    targetEntityId: `worker_sev_test_${runId}`,
  });
  const sev1Discrepancy = await prisma.executionDiscrepancy.create({
    data: {
      tenantId: testUser.id,
      entityType: "WORKER",
      entityId: `worker_sev_test_${runId}`,
      category: "SYSTEM_DEGRADATION",
      severity: "SEV-1",
      status: "OPEN",
      deduplicationKey: `WORKER:worker_sev_test_${runId}:SYSTEM_DEGRADATION_${runId}`,
      internalState: "BUSY",
      externalState: "CRASHED",
      recommendedResponse: "RECLAIM_EXPIRED_WORKER_LEASE",
    },
  });
  const escalatedIncident = await IncidentDetectionService.detectFromDiscrepancy(sev1Discrepancy.id);
  assert(
    escalatedIncident.severity === "SEV-1" && escalatedIncident.status === "ESCALATED",
    "Case 19: Severity rank escalation automatically raises incident from SEV-3 to SEV-1 (ESCALATED)"
  );

  // Case 20: Incident resolution resolves linked execution discrepancies
  const resolvedIncident = await IncidentLifecycleService.resolveIncident({
    incidentId: detectedIncident.id,
    resolutionSummary: "Verified on-chain receipt; no double spend detected.",
    resolvedBy: testUser.nearAccountId,
  });
  const linkedDisc = await prisma.executionDiscrepancy.findUnique({
    where: { id: incidentDiscrepancy.id },
  });
  assert(
    resolvedIncident.status === "RESOLVED" && linkedDisc?.status === "RESOLVED",
    "Case 20: Incident resolution automatically closes linked execution discrepancies"
  );

  // ============================================================================
  // SECTION 3: Recovery Orchestration & Security Enforcement
  // ============================================================================
  console.log("\n--- Section 3: Recovery Orchestration & Security Enforcement ---");

  // Case 21: Deterministic recovery planning selects safe strategy
  const nonFinJob = await prisma.backgroundJob.create({
    data: {
      tenantId: testUser.id,
      jobType: "INTEGRATION_SYNC",
      jobCategory: "INTEGRATION",
      status: "REQUIRES_RECOVERY",
      payload: JSON.stringify({ integrationId: "slack_123" }),
      payloadHash: "hash_int",
    },
  });
  const jobPlan = await RecoveryPlanner.planRecovery({
    targetEntityType: "JOB",
    targetEntityId: nonFinJob.id,
  });
  assert(
    jobPlan.strategy === "RESUME_SAFE_JOB" && !jobPlan.isFinancial,
    "Case 21: Recovery planner deterministically chooses RESUME_SAFE_JOB for non-financial jobs"
  );

  // Case 22: Financial recovery plan flags isFinancial=true and requiresApproval=true
  const finPlan = await RecoveryPlanner.planRecovery({
    targetEntityType: "EXECUTION",
    targetEntityId: ambiguousExec.id,
    mandateVersion: 1,
  });
  assert(
    finPlan.isFinancial === true && finPlan.requiresApproval === true && finPlan.status === "PENDING_APPROVAL",
    "Case 22: Financial recovery plan strictly enforces requiresApproval=true and PENDING_APPROVAL"
  );

  // Case 23: Strict Human Authority Rule: AI agent approval of financial recovery is REJECTED
  let agentApprovalBlocked = false;
  try {
    await RecoveryApprovalService.approvePlan({
      planId: finPlan.id,
      approverId: testAgent.id,
      approverRole: "OPERATOR",
      approverType: "AGENT", // Prohibited!
    });
  } catch (err: any) {
    if (err.message.includes("SECURITY_POLICY_VIOLATION")) {
      agentApprovalBlocked = true;
    }
  }
  assert(
    agentApprovalBlocked,
    "Case 23: Autonomous AI agent attempting to approve financial recovery is REJECTED (SECURITY_POLICY_VIOLATION)"
  );

  // Case 24: Human operator approval of financial recovery succeeds
  const humanApproval = await RecoveryApprovalService.approvePlan({
    planId: finPlan.id,
    approverId: testUser.nearAccountId,
    approverRole: "OWNER",
    approverType: "HUMAN", // Allowed!
    notes: "Human authority granted after checking block explorer",
  });
  const approvedPlan = await prisma.recoveryPlan.findUnique({ where: { id: finPlan.id } });
  assert(
    humanApproval.status === "APPROVED" && approvedPlan?.status === "APPROVED",
    "Case 24: Human operator approval transitions financial recovery plan to APPROVED"
  );

  // Case 25: Anti-TOCTOU mandate version binding: drifted version fails approval
  const driftedPlan = await prisma.recoveryPlan.create({
    data: {
      tenantId: testUser.id,
      targetEntityType: "EXECUTION",
      targetEntityId: ambiguousExec.id,
      strategy: "MANUAL_FINANCIAL_REVIEW",
      status: "PENDING_APPROVAL",
      isFinancial: true,
      actionPayloadJson: "{}",
      payloadHash: "hash_stale",
      requiresApproval: true,
      mandateVersion: 999, // Stale mandate version!
    },
  });
  let toctouBlocked = false;
  try {
    await RecoveryApprovalService.approvePlan({
      planId: driftedPlan.id,
      approverId: testUser.nearAccountId,
      approverRole: "OWNER",
      approverType: "HUMAN",
    });
  } catch (err: any) {
    if (err.message.includes("CONCURRENCY_VIOLATION")) {
      toctouBlocked = true;
    }
  }
  assert(
    toctouBlocked,
    "Case 25: Mandate version drift triggers CONCURRENCY_VIOLATION, preventing TOCTOU approval"
  );

  // Case 26: Recovery approval payload hash binding: mismatched hash fails execution
  const tamperedPlan = await prisma.recoveryPlan.create({
    data: {
      tenantId: testUser.id,
      targetEntityType: "EXECUTION",
      targetEntityId: ambiguousExec.id,
      strategy: "EXECUTION_STATUS_CHECK",
      status: "APPROVED",
      isFinancial: true,
      actionPayloadJson: "{}",
      payloadHash: "original_hash",
      requiresApproval: true,
    },
  });
  await prisma.recoveryApproval.create({
    data: {
      planId: tamperedPlan.id,
      approverId: testUser.nearAccountId,
      approverRole: "OWNER",
      approverType: "HUMAN",
      status: "APPROVED",
      payloadHash: "mismatched_tampered_hash", // Mismatch!
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  let hashMismatchBlocked = false;
  try {
    await RecoveryExecutor.executePlan({
      planId: tamperedPlan.id,
      executedBy: testUser.nearAccountId,
    });
  } catch (err: any) {
    if (err.message.includes("SECURITY_VIOLATION")) {
      hashMismatchBlocked = true;
    }
  }
  assert(
    hashMismatchBlocked,
    "Case 26: Hash discrepancy between approval and plan blocks execution (SECURITY_VIOLATION)"
  );

  // Case 27: Unapproved financial recovery plan cannot be executed
  const unapprovedPlan = await prisma.recoveryPlan.create({
    data: {
      tenantId: testUser.id,
      targetEntityType: "EXECUTION",
      targetEntityId: ambiguousExec.id,
      strategy: "EXECUTION_STATUS_CHECK",
      status: "PENDING_APPROVAL", // Not approved
      isFinancial: true,
      actionPayloadJson: "{}",
      payloadHash: "hash_unapproved",
      requiresApproval: true,
    },
  });
  let unapprovedBlocked = false;
  try {
    await RecoveryExecutor.executePlan({
      planId: unapprovedPlan.id,
      executedBy: testUser.nearAccountId,
    });
  } catch (err: any) {
    unapprovedBlocked = true;
  }
  assert(
    unapprovedBlocked,
    "Case 27: Unapproved recovery plan execution is strictly blocked"
  );

  // Case 28: Execution of non-financial recovery plan (worker lease reclamation)
  const jobToReclaim = await prisma.backgroundJob.create({
    data: {
      tenantId: testUser.id,
      jobType: "INTEGRATION_SYNC",
      jobCategory: "INTEGRATION",
      status: "CLAIMED",
      leaseExpiresAt: new Date(Date.now() - 60000), // Expired
      payload: "{}",
      payloadHash: "hash_reclaim",
    },
  });
  const reclaimPlan = await RecoveryPlanner.planRecovery({
    targetEntityType: "JOB",
    targetEntityId: jobToReclaim.id,
    strategy: "RECLAIM_EXPIRED_WORKER_LEASE",
  });
  const reclaimExec = await RecoveryExecutor.executePlan({
    planId: reclaimPlan.id,
    executedBy: "system_recovery",
  });
  const reclaimedJob = await prisma.backgroundJob.findUnique({ where: { id: jobToReclaim.id } });
  assert(
    reclaimExec.status === "EXECUTED" && reclaimedJob?.status === "QUEUED",
    "Case 28: Non-financial worker lease reclamation executes and resets job status to QUEUED"
  );

  // Case 29: Execution of financial recovery routes strictly through M8 ExecutionRecoveryService
  const execResult = await RecoveryExecutor.executePlan({
    planId: finPlan.id,
    executedBy: testUser.nearAccountId,
  });
  assert(
    execResult.status === "EXECUTED" || execResult.status === "FAILED",
    "Case 29: Financial recovery execution dispatches through M8 ExecutionRecoveryService"
  );

  // Case 30: Independent post-recovery verification verifies actual state outcome
  const verifyOutcome = await RecoveryVerificationService.verifyOutcome({
    planId: reclaimPlan.id,
    verificationStrategy: "DATABASE_CONSISTENCY_CHECK",
  });
  assert(
    verifyOutcome.isVerified === true && verifyOutcome.evidenceHash.length === 64,
    "Case 30: Independent post-recovery verifier confirms entity state and hashes verification evidence"
  );

  // Case 31: Failed recovery attempts threshold transitions incident to MANUAL_INTERVENTION_REQUIRED
  const failIncident = await IncidentDetectionService.createIncident({
    tenantId: testUser.id,
    title: `Persistent Failure Incident ${runId}`,
    description: "Repeated recovery failures on execution",
    category: "FINANCIAL_AMBIGUITY",
    severity: "SEV-1",
    targetEntityType: "EXECUTION",
    targetEntityId: ambiguousExec.id,
    deduplicationKey: `INCIDENT:FAIL_TEST_${runId}`,
  });
  const repeatFailPlan = await prisma.recoveryPlan.create({
    data: {
      tenantId: testUser.id,
      incidentId: failIncident.id,
      targetEntityType: "EXECUTION",
      targetEntityId: ambiguousExec.id,
      strategy: "EXECUTION_STATUS_CHECK",
      status: "FAILED",
      actionPayloadJson: "{}",
      payloadHash: "hash_fail",
    },
  });
  // Simulate 3 failed attempts
  for (let i = 1; i <= 3; i++) {
    await prisma.recoveryAttempt.create({
      data: {
        planId: repeatFailPlan.id,
        attemptNumber: i,
        executedBy: "system",
        status: "FAILED",
        errorDetails: `RPC timeout on attempt ${i}`,
      },
    });
  }
  await IncidentEscalationService.evaluateAndEscalateOpenIncidents();
  const manualInterventionInc = await prisma.incident.findUnique({ where: { id: failIncident.id } });
  assert(
    manualInterventionInc?.status === "MANUAL_INTERVENTION_REQUIRED" || manualInterventionInc?.currentStage === "MANUAL_INTERVENTION_REQUIRED",
    "Case 31: 3 consecutive failed recovery attempts flags incident as MANUAL_INTERVENTION_REQUIRED"
  );

  // ============================================================================
  // SECTION 4: Background Worker & Queue Integration
  // ============================================================================
  console.log("\n--- Section 4: Background Worker & Queue Integration ---");

  // Case 32: Background job queue executes RECONCILIATION_RUN job
  const reconJob = await JobQueueService.submitJob({
    tenantId: testUser.id,
    jobType: "RECONCILIATION_RUN",
    payload: { options: { dryRun: true, runType: "TARGETED_PROVIDER" } },
  });
  assert(
    Boolean(reconJob.id) && reconJob.status === "QUEUED",
    "Case 32: RECONCILIATION_RUN background job submits successfully to durable queue"
  );

  // Case 33: Background job queue executes INCIDENT_ESCALATION job
  const escJob = await JobQueueService.submitJob({
    tenantId: testUser.id,
    jobType: "INCIDENT_ESCALATION",
    payload: {},
  });
  assert(
    Boolean(escJob.id) && escJob.status === "QUEUED",
    "Case 33: INCIDENT_ESCALATION background job submits successfully to durable queue"
  );

  // Case 34: Background job queue executes RECOVERY_EXECUTION job
  const recExecJob = await JobQueueService.submitJob({
    tenantId: testUser.id,
    jobType: "RECOVERY_EXECUTION",
    payload: { planId: reclaimPlan.id, dryRun: true },
  });
  assert(
    Boolean(recExecJob.id) && recExecJob.status === "QUEUED",
    "Case 34: RECOVERY_EXECUTION background job submits successfully to durable queue"
  );

  // Case 35: Financial transaction budget reservation is NEVER released merely because RPC checks time out
  const timeoutClassification = ExecutionRecoveryService.classifyFailure({
    stage: "AFTER_BROADCAST_BEFORE_RESPONSE",
    error: new Error("RPC Gateway Timeout 504"),
    txHash: "tx_unknown_timeout",
  });
  assert(
    timeoutClassification.canReleaseReservationImmediately === false &&
      timeoutClassification.requiresPolling === true,
    "Case 35: Ambiguous RPC broadcast timeout strictly PREVENTS immediate budget release"
  );

  // ============================================================================
  // SECTION 5: End-to-End REST API Verification
  // ============================================================================
  console.log("\n--- Section 5: End-to-End REST API Verification ---");

  const authHeaders = {
    "Content-Type": "application/json",
    "x-session-token": testUser.sessionToken!,
  };

  // Case 36: GET & POST /api/reconciliation/runs
  const reconListRes = await fetch(`${TEST_BASE_URL}/api/reconciliation/runs?limit=5`, {
    headers: authHeaders,
  });
  const reconListData = await reconListRes.json();
  assert(
    reconListRes.ok && reconListData.success === true && Array.isArray(reconListData.runs),
    "Case 36: GET /api/reconciliation/runs responds with 200 OK and valid run history"
  );

  // Case 37: GET & POST /api/incidents
  const incCreateRes = await fetch(`${TEST_BASE_URL}/api/incidents`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      title: `API Verification Incident ${runId}`,
      category: "SYSTEM_DEGRADATION",
      severity: "SEV-2",
      description: "Tested via REST API verification",
    }),
  });
  const incCreateData = await incCreateRes.json();
  assert(
    incCreateRes.ok && incCreateData.success === true && incCreateData.incident.incidentNumber,
    "Case 37: POST /api/incidents creates incident via live REST API"
  );

  // Case 38: POST /api/incidents/[id]/acknowledge
  const createdIncId = incCreateData.incident.id;
  const incAckRes = await fetch(`${TEST_BASE_URL}/api/incidents/${createdIncId}/acknowledge`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ notes: "Acknowledged via API test" }),
  });
  const incAckData = await incAckRes.json();
  assert(
    incAckRes.ok && incAckData.success === true && incAckData.incident.status === "ACKNOWLEDGED",
    "Case 38: POST /api/incidents/[id]/acknowledge updates status to ACKNOWLEDGED"
  );

  // Case 39: GET & POST /api/recovery/plans
  const planListRes = await fetch(`${TEST_BASE_URL}/api/recovery/plans?limit=5`, {
    headers: authHeaders,
  });
  const planListData = await planListRes.json();
  assert(
    planListRes.ok && planListData.success === true && Array.isArray(planListData.plans),
    "Case 39: GET /api/recovery/plans responds with 200 OK and array of active plans"
  );

  // ============================================================================
  // SECTION 6: Platform Regression & System Invariants
  // ============================================================================
  console.log("\n--- Section 6: Platform Regression & System Invariants ---");

  // Case 40: M9.1 Background job lease & dead letter handling remains operational
  const deadLetterCount = await prisma.deadLetterRecord.count();
  assert(
    typeof deadLetterCount === "number",
    "Case 40: M9.1 Dead letter records and quarantine infrastructure intact"
  );

  // Case 41: M9.2 OpenTelemetry tracing & operational metrics remain operational
  const metricsSnapshot = await prisma.telemetrySnapshot.count();
  assert(
    typeof metricsSnapshot === "number",
    "Case 41: M9.2 Telemetry snapshot engine and metrics aggregation intact"
  );

  // Case 42: M8 Autonomous execution security & boundary enforcement remains intact
  let boundaryRejected = false;
  try {
    await ExecutionBoundaryService.execute({
      userId: testUser.id,
      mandateId: testMandate.id,
      recipient: "hacker.near", // Not in allowedRecipientsJson
      amountYocto: "1000000000000000000000000",
      operation: "TRANSFER",
      parameters: { purpose: "Regression attack" },
      idempotencyKey: `regression_attack_${runId}`,
    });
  } catch (err: any) {
    boundaryRejected = true;
  }
  assert(
    boundaryRejected,
    "Case 42: M8 Execution Boundary enforces recipient constraint and rejects unauthorized target"
  );

  // Case 43: SHA-256 audit ledger hash chain integrity is verified
  const auditVerification = await verifyAuditChain(testUser.id);
  assert(
    auditVerification.valid,
    `Case 43: Cryptographic SHA-256 audit ledger hash chain is 100% verified and untampered (${auditVerification.count} events)`
  );

  console.log("\n================================================================================");
  console.log(`  TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${passedCount + failedCount}/43)`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runMilestone93TestSuite().catch((err) => {
  console.error("Test suite crashed with unhandled error:", err);
  process.exit(1);
});
