# MANDATE — MILESTONE 9.1: ARCHITECTURE ASSESSMENT & AUDIT
## Durable Background Execution & Worker Reliability

**Date:** November 3, 2026  
**Auditor:** Senior Backend Infrastructure Engineer & Distributed Systems Architect  
**Scope:** Milestone 9.1 Repository Inspection & Architecture Blueprint  

---

## 1. What Already Exists

Mandate already possesses a robust multi-agent foundation established across Milestones 1–8:

1. **Database & Storage Layer (`prisma/schema.prisma` / SQLite `dev.db`)**:
   - SQLite with Prisma Client v6.19.3.
   - Multi-tenant data model with `User`, `Agent`, `Wallet`, `Mandate`, `Task`, `CoordinationRun`, `CoordinationTask`, `ExecutionRecord`, `AuditLog`.
   - CAS concurrency versioning and atomic balance accounting (`spentYocto`, `reservedYocto`, `version`).

2. **Distributed Leases (`src/lib/coordination/leaseManager.ts`)**:
   - `TaskLeaseManager` implements database-backed distributed leases for `CoordinationTask` using SQLite transactions.
   - Token-based exclusivity, TTL expirations, heartbeat counting, and abandoned lease recovery.

3. **Multi-Agent Coordination & Recovery (`src/lib/coordination/`)**:
   - `MultiAgentCoordinator`: Multi-step DAG workflow execution with dependency levels.
   - `HandoffManager`: Schema-validated agent handoffs with replay rejection.
   - `FinancialCoordinator`: Mandate pre-reservation, policy enforcement, and atomic settlement.

4. **Deterministic Policy & Compliance Governance (Milestone 7)**:
   - `PolicyEngine`: Hierarchical policy evaluation returning 5 structured decisions (`ALLOW`, `REQUIRE_APPROVAL`, `DENY`, `ALLOW_WITH_LIMITS`, `ESCALATE`).
   - `ApprovalManager`: Cryptographic payload hash binding and tamper-resistant human approvals.

5. **Execution Boundary & Autonomous Security (Milestone 8)**:
   - `ExecutionBoundaryService`: Central gateway for all on-chain side effects and OutLayer disbursements.
   - `ExecutionValidationService`: Pure deterministic preflight checks (NEP-0145 recipient syntax, integer amount validation, 0.05 NEAR storage reserve buffer).
   - `ExecutionAuthorizationService`: HMAC-SHA256 authorization envelopes with atomic single-use nonce tracking.
   - `ExecutionIdempotencyService`: Canonical payload hashing and parameter drift detection.
   - `ExecutionRecoveryService`: Staged failure classification enforcing the **Golden Rule** (never release a reservation on ambiguous network timeouts).

6. **Cryptographic Audit Ledger (`src/lib/auditLedger.ts`)**:
   - SHA-256 chained audit log linking events from genesis hash to chain head with per-user mutex serialization.

---

## 2. What Can Be Reused

1. **Lease Concurrency Patterns**:
   - The transaction-based lease acquisition, token generation, heartbeat renewal, and recovery pattern in `src/lib/coordination/leaseManager.ts` directly maps to generic `BackgroundJob` claiming.
2. **Authoritative Execution Gateway**:
   - `ExecutionBoundaryService.execute()` will be invoked directly by background workers when processing financial jobs, preserving M7 policy checks, M8 authorization envelopes, and CAS budget locks.
3. **Failure Classification & Reconciliation**:
   - `ExecutionRecoveryService.classifyFailure` and `recoverExecution` will handle ambiguous post-broadcast timeouts for financial background jobs.
4. **Audit Trail**:
   - `recordAuditEvent` and `canonicalize` in `src/lib/auditLedger.ts` will anchor background job submissions, claims, completions, and dead-letter actions into the immutable SHA-256 audit chain.
5. **Authentication & Tenant Isolation**:
   - `getAuthenticatedUser(req)` in `src/lib/auth.ts` will secure all `/api/jobs` and `/api/dead-letters` endpoints.

---

## 3. What Is Missing

1. **Universal Persistent Job Schema**:
   - Currently, tasks are either ad-hoc agent requests (`Task`) or tightly bound to objective DAGs (`CoordinationTask`).
   - Missing dedicated models for general-purpose durable queueing: `BackgroundJob`, `BackgroundWorker`, `JobAttempt`, `JobEvent`, `DeadLetterRecord`.
2. **Job Registry & Schema Validation**:
   - No explicit registry defining allowable job types, input validation schemas, execution handlers, retry policies, and financial flags.
3. **Atomic Multi-Worker Claim Service**:
   - No atomic claiming service capable of scanning prioritized, scheduled jobs matching worker capabilities and leasing them exclusively.
4. **Configurable Retry Engine**:
   - No systematic exponential backoff engine with jitter distinguishing retryable network failures from non-retryable governance/validation rejections.
5. **Dead-Letter Queue & Quarantine Management**:
   - No quarantine mechanism preserving full attempt histories, payload hashes, and administrative resolution/controlled requeueing flows.
6. **Worker Lifecycle Management**:
   - No background worker process runtime managing startup registration, continuous polling, heartbeat publishing, and graceful draining on SIGTERM/SIGINT.
7. **Job Management UI**:
   - No dedicated interface for viewing background queue metrics, inspecting job execution attempts, monitoring worker heartbeats, or managing quarantined dead letters.

---

## 4. Impacted Files & Necessary Modifications

### Files to Modify:
1. `prisma/schema.prisma`:
   - Add models: `BackgroundJob`, `BackgroundWorker`, `JobAttempt`, `JobEvent`, `DeadLetterRecord`.
   - Add relations to `User` for tenant isolation.
2. `src/lib/auditLedger.ts`:
   - Add `JOB_AUDIT_EVENTS` constants (`JOB_SUBMITTED`, `JOB_CLAIMED`, `JOB_COMPLETED`, `JOB_FAILED`, `JOB_DEAD_LETTERED`, etc.).
3. `src/components/AppShell.tsx`:
   - Add "Background Jobs" navigation entry (`/jobs`).
4. `src/app/dashboard/page.tsx`:
   - Add compact background job queue operational indicators (active workers, queued jobs, dead-letter alerts).

### New Files to Create:
1. `src/lib/jobs/types.ts`:
   - TypeScript definitions for `JobStatus`, `WorkerStatus`, `JobOutcome`, `RetryPolicy`, `JobDefinition`, `JobPayload`.
2. `src/lib/jobs/registry.ts`:
   - Strict job registry allowlisting supported job types (e.g., `MANDATE_DISBURSEMENT`, `INTEGRATION_SYNC`, `POLICY_REEVALUATION`, `COORDINATION_TASK_EXECUTE`, `OBJECTIVE_VERIFICATION`).
3. `src/lib/jobs/queueService.ts`:
   - Durable job submission (immediate, scheduled, prioritized, child jobs, idempotency check, cancellation).
4. `src/lib/jobs/claimService.ts`:
   - Atomic database-backed job claiming with capability matching and lease establishment.
5. `src/lib/jobs/retryService.ts`:
   - Exponential backoff with jitter calculation, retryable classification, and attempt recording.
6. `src/lib/jobs/recoveryService.ts`:
   - Abandoned lease detection, worker crash recovery, and financial reconciliation delegation.
7. `src/lib/jobs/deadLetterService.ts`:
   - Dead-letter quarantine, admin review, permanent cancellation, and safe requeueing with financial revalidation.
8. `src/lib/jobs/workerService.ts`:
   - Worker runtime managing lifecycle (`STARTING`, `IDLE`, `BUSY`, `DRAINING`, `STOPPED`), heartbeats, and graceful shutdown.
9. `src/lib/jobs/index.ts`:
   - Barrel export for clean imports.
10. API Routes (`src/app/api/jobs/...` and `src/app/api/dead-letters/...`):
   - `src/app/api/jobs/route.ts` (POST submit, GET list)
   - `src/app/api/jobs/[id]/route.ts` (GET detail)
   - `src/app/api/jobs/[id]/cancel/route.ts` (POST cancel)
   - `src/app/api/jobs/[id]/attempts/route.ts` (GET attempts)
   - `src/app/api/workers/route.ts` (GET workers list)
   - `src/app/api/workers/[id]/route.ts` (GET worker detail)
   - `src/app/api/dead-letters/route.ts` (GET dead letters)
   - `src/app/api/dead-letters/[id]/route.ts` (GET dead letter detail)
   - `src/app/api/dead-letters/[id]/resolve/route.ts` (POST resolve)
   - `src/app/api/dead-letters/[id]/requeue/route.ts` (POST requeue)
11. UI Views:
   - `src/app/jobs/page.tsx` (Queue overview, status tabs, worker monitoring, dead-letter table)
   - `src/app/jobs/[id]/page.tsx` (Job details, attempt timeline, recovery inspector)
12. Verification & Test Suites:
   - `tests/milestone-9-1-background-jobs.ts` (Comprehensive 30+ scenario resilience test suite)

---

## 5. Potential Migration & Concurrency Risks

1. **SQLite Database Locking During Concurrent Claims**:
   - SQLite supports one active writer at a time (`WAL` mode). Multi-worker claiming must use quick, atomic transactions (`prisma.$transaction`) with retry backoff to avoid `SQLITE_BUSY` contention.
2. **Double Execution on Expired Leases**:
   - If worker A stalls for 35 seconds on a 30-second lease, worker B might recover the job while worker A is still executing.
   - *Mitigation*: Workers must verify lease ownership (`WHERE id = job.id AND leaseToken = currentToken`) before committing completion, and financial operations MUST use `idempotencyKey` and `ExecutionBoundaryService` which rejects duplicate settlements.
3. **Ambiguous Financial Replay**:
   - A worker crash during OutLayer disbursement must never cause the dead-letter queue or retry engine to re-issue an on-chain transfer.
   - *Mitigation*: Strict enforcement of M8 `ExecutionRecoveryService` integration. Financial jobs transition to `REQUIRES_RECOVERY`, locking their budget until FastNEAR RPC confirms block status.

---

## 6. Implementation Stages

- **Stage 1**: Database schema extension & migration (`prisma/schema.prisma` $\rightarrow$ `prisma db push`).
- **Stage 2**: Core job library (`types.ts`, `registry.ts`, `queueService.ts`, `claimService.ts`, `retryService.ts`, `recoveryService.ts`, `deadLetterService.ts`, `workerService.ts`).
- **Stage 3**: REST API routes (`/api/jobs`, `/api/workers`, `/api/dead-letters`).
- **Stage 4**: UI integration (`/jobs`, `/jobs/[id]`, `AppShell.tsx`, `dashboard/page.tsx`).
- **Stage 5**: Adversarial test suite (`tests/milestone-9-1-background-jobs.ts`) covering all 30 test scenarios.
- **Stage 6**: M1–M8 regression verification, TypeScript typecheck, and production build.
- **Stage 7**: Final engineering report artifact.

