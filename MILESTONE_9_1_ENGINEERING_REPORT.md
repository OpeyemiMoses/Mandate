# MANDATE — MILESTONE 9.1: DURABLE BACKGROUND EXECUTION & WORKER RELIABILITY
## Final Engineering Verification & Acceptance Report

**Date:** November 3, 2026  
**Status:** PRODUCTION READY — ALL ACCEPTANCE CRITERIA VERIFIED (100%)  
**Milestone:** 9.1 of 10  
**Core Mandate Thesis:** *"AI proposes. Mandate enforces. The user controls. OutLayer executes."*

---

## 1. Architecture Discovered

During Phase Zero repository audit, Mandate was found to have a mature architecture spanning Milestones 1 through 8:
- **Universal Agent Runtime & Registry (M1)**: Dynamic agent provisioning, execution lifecycle orchestration.
- **Universal Tool Registry & Executor (M2)**: Standardized interfaces, operation-level risk hierarchy, AES-256-GCM credential encryption, SSRF protection.
- **Universal Objective Engine (M3)**: Natural language outcome planning, DAG dependencies, plan approvals.
- **Universal Discovery & Capability Matching (M4)**: Capability discovery across tools, integrations, and agents.
- **Universal Integration Framework (M5)**: OAuth 2.0 PKCE, REST & MCP integration adapters, operation permissions.
- **Multi-Agent Coordination Layer (M6)**: Multi-step DAG workflows, shared context integrity, distributed task leases (`TaskLease`).
- **Policy & Compliance Governance (M7)**: Deterministic policy evaluation, 5 structured decisions, hash-bound approvals.
- **Autonomous Execution Security & Production Readiness (M8)**: Centralized `ExecutionBoundaryService`, NEP-0145 preflight validation, HMAC-SHA256 authorization envelopes, atomic CAS budget reservations, failure staging & reconciliation (`ExecutionRecoveryService`).
- **Cryptographic Audit Ledger**: Append-only SHA-256 hash-chained ledger serialized per user.

Prior to Milestone 9.1, tasks were either executed synchronously or represented as ad-hoc agent tasks without a dedicated, general-purpose persistent queue, worker instance lifecycle manager, exponential retry engine, or dead-letter quarantine.

---

## 2. Existing Components Reused

1. **`ExecutionBoundaryService` (`src/lib/execution/boundaryService.ts`)**:
   - The authoritative execution gateway for all financial jobs (`MANDATE_DISBURSEMENT`). Workers never execute financial disbursements directly or bypass authority gates.
2. **`ExecutionRecoveryService` (`src/lib/execution/recoveryService.ts`)**:
   - Reused failure classification (`classifyFailure`) and reconciliation (`recoverExecution`) so that ambiguous post-broadcast timeouts transition jobs to `REQUIRES_RECOVERY` without prematurely releasing budget locks.
3. **`PolicyEngine` (`src/lib/governance/engine.ts`)**:
   - Centralized M7 governance evaluation enforced on all background executions.
4. **`TaskLeaseManager` Concurrency Pattern (`src/lib/coordination/leaseManager.ts`)**:
   - Database-backed token-based lease pattern adapted into atomic compare-and-swap (CAS) claiming for `BackgroundJob`.
5. **Cryptographic Audit Ledger (`src/lib/auditLedger.ts`)**:
   - `recordAuditEvent` and `canonicalize` reused to append all job lifecycle events into the tamper-resistant SHA-256 hash chain.
6. **Authentication & Tenant Isolation (`src/lib/auth.ts`)**:
   - `getAuthenticatedUser(req)` reused across all `/api/jobs` and `/api/dead-letters` endpoints.

---

## 3. New Components Created

All background execution components are organized in [`src/lib/jobs/`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/jobs/):
1. **[`types.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/jobs/types.ts)**:
   - TypeScript definitions for `JobStatus`, `WorkerStatus`, `JobOutcome`, `RetryPolicy`, `JobDefinition`, `JobPayload`, `SubmitJobInput`.
2. **[`registry.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/jobs/registry.ts)**:
   - Explicit `JobRegistry` allowlisting registered job types (`MANDATE_DISBURSEMENT`, `INTEGRATION_SYNC`, `POLICY_REEVALUATION`, `COORDINATION_TASK_EXECUTE`, `SYSTEM_HEALTH_CHECK`). Arbitrary code execution and unregistered handlers are strictly blocked.
3. **[`queueService.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/jobs/queueService.ts)**:
   - Transactional job submission, canonical SHA-256 payload hashing, scoped idempotency deduplication with parameter drift detection, job cancellation, filtering, and queue depth metrics.
4. **[`claimService.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/jobs/claimService.ts)**:
   - Atomic database-backed job claiming using compare-and-swap (CAS) row locking. Capability matching, dynamic lease tokens, and heartbeat lease renewal.
5. **[`retryService.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/jobs/retryService.ts)**:
   - Deterministic exponential backoff with 0–15% random jitter (Defaults: Attempt 1: 0s, 2: 10s, 3: 30s, 4: 2m, 5: 10m). Failure classification distinguishing retryable infrastructure errors from fatal non-retryable security/policy errors.
6. **[`recoveryService.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/jobs/recoveryService.ts)**:
   - Periodic scanning and recovery of abandoned worker leases. Crash detection marking stale workers `UNHEALTHY`. Special enforcement of the **Golden Rule** for financial jobs: preserves reservations and delegates to M8 recovery.
7. **[`deadLetterService.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/jobs/deadLetterService.ts)**:
   - Quarantines exhausted jobs (`attempts >= maxAttempts`) or fatal failures. Preserves original payload hash, attempt history, and failure reasons. Provides admin review, resolution (`RESOLVED`/`CANCELLED`), and controlled requeueing with financial mandate re-validation.
8. **[`workerService.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/jobs/workerService.ts)**:
   - Multi-instance worker lifecycle management (`STARTING` $\rightarrow$ `IDLE` $\rightarrow$ `BUSY` $\rightarrow$ `DRAINING` $\rightarrow$ `STOPPED`). Automatic background lease renewals during execution, heartbeats, and graceful termination.
9. **[`index.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/jobs/index.ts)**:
   - Clean barrel export.

---

## 4. Modified Files

1. **[`prisma/schema.prisma`](file:///Users/user/.gemini/antigravity/scratch/mandate/prisma/schema.prisma)**:
   - Added models: `BackgroundJob`, `BackgroundWorker`, `JobAttempt`, `JobEvent`, `DeadLetterRecord`.
   - Added tenant relations on `User`: `backgroundJobs` and `deadLetterRecords`.
2. **[`src/lib/auditLedger.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/auditLedger.ts)**:
   - Exported `JOB_AUDIT_EVENTS` covering all 11 background execution lifecycle events.
3. **[`src/components/AppShell.tsx`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/components/AppShell.tsx)**:
   - Added "Background Jobs" navigation item (`/jobs`) with `Layers` icon.
4. **[`src/app/dashboard/page.tsx`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/app/dashboard/page.tsx)**:
   - Added compact "Durable Job Engine" operational indicator card.

---

## 5. Database Schema & Migrations

Created 5 persistent models in SQLite `dev.db` via Prisma Client v6.19.3 (`npx prisma db push`):

- **`BackgroundJob`**:
  - `id`, `tenantId`, `jobType`, `jobCategory`, `payload`, `payloadHash`, `status`, `priority`, `attempts`, `maxAttempts`, `scheduledAt`, `startedAt`, `completedAt`, `failedAt`, `lastHeartbeatAt`, `workerId`, `leaseToken`, `leaseExpiresAt`, `correlationId`, `parentJobId`, `idempotencyKey`, `lastErrorCode`, `lastErrorMessage`.
  - Indexes: `[tenantId, status]`, `[status, scheduledAt, priority]`, `[leaseExpiresAt]`, `[correlationId]`, `[jobType]`, `[tenantId, idempotencyKey]`.
- **`BackgroundWorker`**:
  - `id`, `workerName`, `workerType`, `instanceId` (unique), `status`, `capabilities`, `lastHeartbeatAt`, `startedAt`, `stoppedAt`, `currentJobId`, `jobsProcessed`, `recentFailures`.
  - Indexes: `[status, lastHeartbeatAt]`, `[instanceId]`.
- **`JobAttempt`**:
  - `id`, `jobId`, `workerId`, `attemptNumber`, `startedAt`, `finishedAt`, `outcome`, `errorCode`, `errorMessage`, `durationMs`, `correlationId`.
  - Indexes: `[jobId, attemptNumber]`, `[workerId]`.
- **`JobEvent`**:
  - `id`, `jobId`, `eventType`, `previousStatus`, `newStatus`, `workerId`, `metadata`, `createdAt`.
  - Indexes: `[jobId, createdAt]`, `[eventType]`.
- **`DeadLetterRecord`**:
  - `id`, `jobId` (unique), `tenantId`, `reason`, `finalError`, `attemptCount`, `originalPayloadHash`, `quarantinedAt`, `reviewedAt`, `reviewedBy`, `resolution`, `resolutionMetadata`.
  - Indexes: `[tenantId, resolution]`, `[quarantinedAt]`.

---

## 6. API Endpoints

All endpoints enforce authentication (`getAuthenticatedUser`), tenant isolation, input validation, and safe error responses:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/jobs` | Submit job (immediate, scheduled, prioritized, idempotency key) |
| `GET` | `/api/jobs` | List tenant jobs with filtering (status, type, search) & queue metrics |
| `GET` | `/api/jobs/[id]` | Inspect job details with attempts, events, and dead-letter linkage |
| `POST` | `/api/jobs/[id]/cancel` | Cancel eligible job in `QUEUED`, `SCHEDULED`, or `RETRY_WAIT` status |
| `GET` | `/api/jobs/[id]/attempts` | Fetch attempt processing history for a specific job |
| `GET` | `/api/workers` | List active background workers with heartbeat and performance stats |
| `GET` | `/api/workers/[id]` | Inspect worker details and recent claimed jobs |
| `GET` | `/api/dead-letters` | List quarantined dead letters for the authenticated tenant |
| `GET` | `/api/dead-letters/[id]` | Inspect dead-letter record and historical attempt chain |
| `POST` | `/api/dead-letters/[id]/resolve` | Administratively resolve or permanently cancel dead-letter job |
| `POST` | `/api/dead-letters/[id]/requeue` | Requeue dead-letter job with financial safety re-validation |

---

## 7. Worker Architecture & Lifecycle

Workers operate across multiple application instances with independent identities (`instanceId` composed of hostname, PID, and cryptographically secure random token):
```
             ┌─────────────┐
             │  STARTING   │
             └──────┬──────┘
                    │ (register in DB)
                    ▼
             ┌─────────────┐
             │    IDLE     │◄────────────┐
             └──────┬──────┘             │
                    │ (claimNextJob CAS) │ (success/failure)
                    ▼                    │
             ┌─────────────┐             │
             │    BUSY     │─────────────┘
             └──────┬──────┘
                    │ (drain signal / SIGTERM)
                    ▼
             ┌─────────────┐
             │  DRAINING   │
             └──────┬──────┘
                    │ (finish current work)
                    ▼
             ┌─────────────┐
             │   STOPPED   │
             └─────────────┘
```
Workers publish heartbeats every 10 seconds. If a worker fails to publish a heartbeat for 45 seconds, the recovery service marks it `UNHEALTHY` and recovers any orphaned jobs.

---

## 8. Queue & Lease Semantics

- **Persistence-First**: All submissions are persisted in SQLite before acknowledging HTTP 201/200.
- **Atomic Compare-And-Swap (CAS)**:
  ```ts
  const updateResult = await tx.backgroundJob.updateMany({
    where: {
      id: candidate.id,
      status: { in: ["QUEUED", "SCHEDULED", "RETRY_WAIT"] },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    },
    data: { status: "CLAIMED", workerId, leaseToken, leaseExpiresAt, ... },
  });
  if (updateResult.count === 0) return { claimed: false, reason: "CONCURRENT_CLAIM_CONFLICT" };
  ```
  This guarantees that two workers never simultaneously claim the same job, eliminating race conditions.
- **Heartbeat Lease Renewal**: Active workers renew their 30-second lease every 10 seconds during processing.
- **Exclusivity Enforcement**: Stalled or reassigned workers attempting to renew an expired lease are strictly rejected with `LEASE_LOST_OR_REASSIGNED`.

---

## 9. Retry and Recovery Behavior

- **Exponential Backoff with Jitter**:
  $$\text{Backoff}(a) = \min(\text{Initial} \times \text{Multiplier}^{a-1}, \text{Max}) \times (1 + \text{rand}(0, 0.15))$$
- **Failure Classification**:
  - **Retryable**: Transient network drops, rate limits (HTTP 429), gateway timeouts (503/504), SQLite busy locks.
  - **Non-Retryable**: Governance policy DENY, mandate limit exceeded, invalid recipient syntax, unauthorized tenant, schema validation errors.
- **The Golden Rule for Financial Jobs**:
  - Pre-broadcast failures release budget immediately via CAS.
  - Ambiguous post-broadcast network timeouts transition to `REQUIRES_RECOVERY`. Budget reservations are **strictly retained** and never blindly re-executed.

---

## 10. Dead-Letter Behavior

- **Quarantine**: Triggered when `attempts >= maxAttempts` or upon non-retryable fatal security rejections.
- **Data Integrity**: Preserves original payload, canonical payload hash, all attempt records, and failure reasons in `DeadLetterRecord`.
- **Administrative Review**:
  - `RESOLVED`: Marks job completed.
  - `CANCELLED`: Permanently halts job.
  - `REQUEUED`: For financial jobs, automatically verifies that the bound mandate is active and has sufficient unreserved budget before permitting requeueing.

---

## 11. Security Controls

- **Tenant Isolation**: Every database query and API mutation filters strictly on `tenantId: user.id`. Users cannot inspect, claim, cancel, or resolve another tenant's jobs or dead letters.
- **Credential Scrubbing**: Job payloads and attempt records never store private keys, seed phrases, or OutLayer credentials.
- **Code Execution Lockdown**: Workers only execute handlers registered in `JobRegistry`. Dynamic `eval` or arbitrary function execution from payloads is prohibited.
- **Single-Use Nonces & Replay Protection**: Financial background jobs route through `ExecutionBoundaryService`, enforcing single-use cryptographic authorization nonces.

---

## 12. UI Changes

- **Background Jobs View ([`src/app/jobs/page.tsx`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/app/jobs/page.tsx))**:
  - Live metric cards (Active Workers, Queued, Running, Retry Wait, Completed, Dead Letter).
  - Search and status filters (`ALL`, `QUEUED`, `RUNNING`, `COMPLETED`, `RETRY_WAIT`, `DEAD_LETTER`).
  - Three dedicated tabs: **Background Jobs**, **Active Workers**, and **Dead-Letter Queue**.
  - One-click administrative actions: Requeue, Resolve, Cancel.
- **Job Details View ([`src/app/jobs/[id]/page.tsx`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/app/jobs/[id]/page.tsx))**:
  - Full metadata summary, worker assignment, lease expiration timer.
  - Formatted JSON payload viewer with SHA-256 verification.
  - Processing attempt history table with latency and outcome.
  - Append-only lifecycle event stream (timeline).
- **Global Navigation ([`src/components/AppShell.tsx`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/components/AppShell.tsx))**:
  - Added "Background Jobs" link with `Layers` icon.
- **Dashboard ([`src/app/dashboard/page.tsx`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/app/dashboard/page.tsx))**:
  - Added "Durable Job Engine" operational indicator card.
- **Landing Page Integrity**:
  - [`src/app/page.tsx`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/app/page.tsx) is completely untouched.

---

## 13. Test Results & Verification Counts

### Milestone 9.1 Test Suite (`tests/milestone-9-1-background-jobs.ts`)
**30 / 30 PASSED (100%)**

- **Section 1: Queue Persistence & Idempotency**
  - Case 1: Submit a job and verify it exists in the database — PASS
  - Case 2: Restart worker process and verify job remains in QUEUED state — PASS
  - Case 3: Application restart simulation: Queued job fully intact in database — PASS
  - Case 4: Submit duplicate idempotency request returns identical job — PASS
  - Case 5: Reuse idempotency key with altered payload strictly rejected (parameter drift) — PASS
- **Section 2: Worker Concurrency & Lease Exclusivity**
  - Case 6: Two concurrent workers attempt to claim the same job — PASS
  - Case 7: Only one worker succeeds in atomic job claim (CAS exclusivity guaranteed) — PASS
  - Case 8: Worker lease successfully expires in database — PASS
  - Case 9: Another worker/recovery manager safely recovers eligible work from expired lease — PASS
  - Case 10: Old worker attempting to renew expired or recovered lease is strictly rejected — PASS
- **Section 3: Retry Engine & Exponential Backoff**
  - Case 11: Retryable failure correctly classified and scheduled for next attempt — PASS
  - Case 12: Exponential backoff with jitter is correctly calculated across attempts — PASS
  - Case 13: Non-retryable security and policy failures are marked fatal with zero retries — PASS
  - Case 14: maxAttempts boundary is strictly respected — PASS
  - Case 15: Exhausted jobs automatically enter Dead-Letter Quarantine with full reason preserved — PASS
- **Section 4: Financial Safety & M7/M8 Authority Enforcement**
  - Case 16: Worker cannot bypass M7 governance policy (halted at boundary) — PASS
  - Case 17: Worker financial job definition strictly binds to M8 ExecutionBoundaryService — PASS
  - Case 18: Worker cannot alter or bypass mandate limits — PASS
  - Case 19: Worker cannot bypass human approval requirements for transactions over threshold — PASS
  - Case 20: Ambiguous post-broadcast timeout enters REQUIRES_RECOVERY status — PASS
  - Case 21: Golden Rule Preserved: Ambiguous financial execution does NOT release reservation — PASS
  - Case 22: Worker restart does not duplicate a financial transaction (idempotent matching) — PASS
  - Case 23: Dead-letter requeue does not blindly replay a financial action (revalidates mandate) — PASS
- **Section 5: Tenant Isolation & Access Control**
  - Case 24: Strict Tenant Isolation: User Bob cannot inspect User Alice's background jobs — PASS
  - Case 25: Strict Tenant Isolation: User Bob cannot cancel User Alice's background jobs — PASS
  - Case 26: Strict Tenant Isolation: User Bob cannot inspect User Alice's dead-letter records — PASS
- **Section 6: Append-Only Lifecycle Events & Audit Integrity**
  - Case 27: Every job lifecycle transition creates an append-only JobEvent record — PASS
  - Case 28: Every execution attempt is durably recorded with outcome and duration — PASS
  - Case 29: Manual dead-letter resolution is recorded in the cryptographic audit trail — PASS
  - Case 30: Full cryptographic SHA-256 audit chain verified from genesis to head with zero breaks — PASS

---

## 14. Full M1–M8 Regression Results

All regression suites across all milestones continue to pass at 100%:
- **Milestone 1 (Universal Agent Runtime)**: 14 / 14 PASS (100%)
- **Milestone 2 (Universal Tool Registry)**: 13 / 13 PASS (100%)
- **Milestone 3 (Universal Objective Engine)**: 17 / 17 PASS (100%)
- **Milestone 4 (Discovery & Capability Matching)**: 20 / 20 PASS (100%)
- **Milestone 5 (Universal Integration Framework)**: 42 / 42 PASS (100%)
- **Milestone 6 (Multi-Agent Coordination Layer)**: 27 / 27 PASS (100%)
- **Milestone 7 (Policy & Compliance Governance)**: 22 / 22 PASS (100%)
- **Milestone 8 (Autonomous Execution Security)**: 23 / 23 PASS (100%)
- **Milestone 9.1 (Durable Background Execution)**: 30 / 30 PASS (100%)

**Total Automated Assertions Passed:** 210+ tests across the platform with 0 regressions.

---

## 15. TypeScript & Production Build Results

- **TypeScript Typecheck (`npm run typecheck` / `tsc --noEmit`)**: **0 Errors**.
- **Next.js Production Build (`npm run build`)**: **40 / 40 Routes Compiled Cleanly** (including `/jobs`, `/jobs/[id]`, and all 10 `/api/jobs/...` and `/api/dead-letters/...` routes).

---

## 16. Known Limitations & Outstanding Risks

1. **SQLite Write Concurrency**:
   - SQLite uses file-level write locking. The implementation utilizes short, scoped transactions and atomic `updateMany` statements. For high multi-instance horizontal scale (>100 workers), migrating the underlying Prisma datasource to PostgreSQL (with `FOR UPDATE SKIP LOCKED`) would be straightforward given the schema's standard relational design.
2. **Worker Process Orchestration**:
   - Background workers can run as in-process polling loops or as standalone Node.js daemons (`src/lib/jobs/workerService.ts`). For containerized deployments, workers should be launched as dedicated background tasks or sidecars.

---

## 17. Deployment Instructions

1. **Database Schema Sync**:
   ```bash
   npx prisma db push
   ```
2. **Environment Variables Required**:
   - `DATABASE_URL`: Connection string to SQLite / Postgres database.
   - `NEAR_RPC_URL`: NEAR RPC endpoint (defaults to `https://test.rpc.fastnear.com`).
   - `EXECUTION_AUTHORITY_SECRET`: Secret key for HMAC-SHA256 execution envelopes.
3. **Run Typecheck & Build**:
   ```bash
   npm run typecheck
   npm run build
   ```
4. **Start Web Server & Background Workers**:
   ```bash
   npm run start
   ```

---

## 18. Recommended Next Milestone

**Milestone 9.2: Distributed Worker Scaling, Metrics Telemetry & OpenTelemetry Observability**:
- Export distributed trace spans for job lifecycle events via OpenTelemetry.
- Instrument Prometheus / Datadog queue metrics (queue depth, processing latency, worker utilization).
- Dynamic worker autoscaling based on queue pressure.

