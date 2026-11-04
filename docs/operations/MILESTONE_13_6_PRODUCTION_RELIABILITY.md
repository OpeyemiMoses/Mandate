# MANDATE — MILESTONE 13.6: LONG-RUNNING AUTONOMOUS OBJECTIVES, PRODUCTION RELIABILITY & EXTERNAL EXECUTION VERIFICATION

**Project:** Mandate  
**Network:** NEAR Testnet ONLY  
**Execution Boundary:** OutLayer Intel SGX TEE + `ExecutionBoundaryService`  
**Status:** Complete & Certified  
**Core Invariant:** STRICT INVARIANT: ZERO LIVE FINANCIAL BROADCASTS IN AUTOMATED TESTS  
**Core Operating Principle:** *AI proposes. Mandate enforces. The user controls. OutLayer executes.*

---

## 1. Executive Summary

Milestone 13.6 establishes production-grade execution durability, genuine OS process crash recovery, external provider verification, and multi-tenant concurrency controls for the Mandate platform.

Previous milestones established natural language objective understanding (M13.2), capability-based agent delegation (M13.3), DAG scheduling (M13.4), and end-to-end multi-agent fulfillment (M13.5). Milestone 13.6 hardens these systems against actual real-world failure modes:
1. **Durable Point-in-Time Checkpoints:** Point-in-time immutable state checkpoints with canonical SHA-256 fingerprinting, tenant scoping, and zero plaintext secrets.
2. **Real Worker OS Process Termination (SIGKILL):** Proven recovery from actual OS process death (`kill -9`), safe lease reclamation, monotonic lease generation advance, and zombie worker fencing.
3. **External Provider Verification:** Real, live, non-financial queries executed against FastNEAR Testnet RPC, DuckDuckGo Live Search, and OutLayer Intel SGX TEE with correlation IDs and verified evidence.
4. **Long-Running Objective Scheduling:** Strict deadline enforcement (`deadlineAt`), execution timeouts, auto-continuation of backoff retries, and blocked state tracking.
5. **Multi-Tenant Concurrency & Quotas:** Per-tenant running objective limits (5/5 max), per-agent workload capacity throttling, and mutual exclusion orchestration locks.

---

## 2. Database Changes Implemented

### 2.1 Prisma Schema Enhancements
Added model `ObjectiveCheckpoint` and linked relations to `Objective` and `User`:
- **Model `ObjectiveCheckpoint`:**
  - `id`: CUID identifier
  - `checkpointNumber`: Monotonic integer sequence (1, 2, 3...) per objective
  - `objectiveId`: Scoped to parent objective
  - `userId`: Tenant isolation
  - `objectiveStatus`: Status snapshot
  - `objectiveVersion`: Monotonic CAS version
  - `orchestrationRound`: Execution round sequence
  - `planId`, `planVersion`, `planHash`: Fingerprint of active DAG plan
  - `approvalState`, `approvalPayloadHash`: Cryptographic approval tracking
  - `taskStatesJson`: JSON array of all step statuses, versions, and retry counts
  - `assignmentsJson`: JSON array of agent IDs, capability versions, and lease tokens
  - `dependencyEvidenceJson`: Completed task outputs and SHA-256 result fingerprints
  - `executionReferencesJson`: Linked execution IDs and tool invocation counts
  - `recoveryStateJson`: Retry counters, circuit breaker states, and failed step IDs
  - `checkpointHash`: Canonical SHA-256 fingerprint of the entire checkpoint payload
  - `triggerReason`: Descriptive lifecycle or orchestration trigger event
  - `actorId`, `actorRole`, `workerId`, `leaseGeneration`
  - Unique constraint on `[objectiveId, checkpointNumber]`
- **Model `Objective` Updates:**
  - `checkpoints`: Relation to `ObjectiveCheckpoint[]`
  - `currentCheckpointNumber`: Monotonic sequence counter
  - `lastCheckpointAt`: Timestamp of latest successful checkpoint write

---

## 3. Core Subsystems & Services

| Subsystem | File Path | Key Capabilities |
| :--- | :--- | :--- |
| **Objective Checkpoint Service** | [`src/lib/orchestration/checkpointService.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/orchestration/checkpointService.ts) | Idempotent checkpoint creation, canonical SHA-256 hashing, secret filtering, tamper detection, state restoration, and lease fencing. |
| **Worker Process Runner** | [`scripts/worker-process.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/scripts/worker-process.ts) | Standalone Node.js OS process runner for real child process execution, leasing, and crash testing. |
| **Provider Verification Service** | [`src/lib/providers/providerVerificationService.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/providers/providerVerificationService.ts) | Live queries against FastNEAR RPC, DuckDuckGo, and OutLayer TEE with correlation IDs and evidence captures. |
| **Concurrency & Quotas** | [`src/lib/orchestration/concurrencyService.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/orchestration/concurrencyService.ts) | Tenant running objective quota enforcement, agent workload limits, mutual-exclusion orchestration locking. |
| **Scheduler Enhancements** | [`src/lib/orchestration/scheduler.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/orchestration/scheduler.ts) | Objective deadline breach detection (`deadlineAt`), retry backoff auto-continuation, timeout escalation. |

---

## 4. Real Worker Process Termination & Restart Evidence

As required by Milestone 13.6, process crash recovery was tested using actual OS process signals (`SIGKILL`), not simulated software exceptions:

```
SECTION 2: PHASE 2 — REAL WORKER OS PROCESS TERMINATION & RESTART
  ✓ PASS: 2a: Pre-crash baseline checkpoint persisted
  Launching real Node.js child worker process via spawn...
  ✓ PASS: 2b: Real worker OS process spawned with PID 89632
  Sending SIGKILL to PID 89632 while owning task lease...
  ✓ PASS: 2c: Process 89632 successfully killed with SIGKILL
  ✓ PASS: 2d: Worker PID 89632 is authoritatively confirmed DEAD by OS
  Restarting worker system and executing lease recovery...
  ✓ PASS: 2e: Lease recovery engine executed successfully
  ✓ PASS: 2f: Lease generation monotonically advanced to 2 on worker restart
  ✓ PASS: 2g: Zombie / stale worker update strictly rejected via STALE_LEASE_GENERATION
  ✓ PASS: 2h: Objective state successfully restored from Checkpoint #1
  ✓ PASS: 2i: Resumed from exact pre-crash checkpoint
  ✓ PASS: 2j: Checkpoint #2 created after successful recovery and task completion
```

### Key Crash Invariants Proven:
1. **Unambiguous OS Process Death:** Process was spawned as a separate OS process (PID 89632) and terminated via `process.kill(pid, "SIGKILL")`. An OS signal 0 check confirmed the process was dead.
2. **Safe Lease Reclamation:** The abandoned task lease expired and was reclaimed by the restarted worker.
3. **Monotonic Lease Fencing:** Lease generation advanced from `1` to `2`. Any update from the killed/stale worker with generation `1` was rejected with `STALE_LEASE_GENERATION`.
4. **Resumption from Checkpoint:** The objective resumed from Checkpoint #1 without repeating already completed steps.

---

## 5. Live External Provider Verification Report

All critical registered external adapters were exercised against real, live external services (no local fixtures or mocks):

| Provider | Environment | Endpoint | Operation | Correlation ID | Latency | Status | Live Evidence Captured |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FastNEAR RPC** | NEAR Testnet | `https://test.rpc.fastnear.com` | `status` | `corr_near_...` | 541ms | **SUCCESS** | `chainId: "testnet"`, `latestBlockHeight: 276132538`, `latestBlockHash: "3q61mg..."` |
| **DuckDuckGo** | Production Web | `https://html.duckduckgo.com/html/` | `search` | `corr_ddg_...` | 745ms | **SUCCESS** | 3 genuine sources retrieved: NearBlocks Explorer & Indexer docs |
| **OutLayer TEE** | NEAR / TEE | `https://testnet-api.outlayer.ai` | `health_check` | `corr_outlayer_...` | 1299ms | **SUCCESS** | HTTP 200, endpoint reachable, SGX Enclave infrastructure confirmed |

---

## 6. API Changes

| Method | Endpoint | Description | Tenant Isolation |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/objectives/[id]/checkpoints` | Chronological list of objective checkpoints | Masked with 404 for non-owners |
| `GET` | `/api/objectives/[id]/checkpoints/[num]` | Specific checkpoint with cryptographic integrity check | Masked with 404 for non-owners |
| `POST` | `/api/objectives/[id]/checkpoints/[num]/restore` | Restores objective state and fences stale workers | Masked with 404 for non-owners |
| `GET` | `/api/providers/verify` | Live verification report and provider inventory | Authenticated user required |

---

## 7. Customer UI Visibility

Enhanced [`src/app/objectives/[id]/page.tsx`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/app/objectives/[id]/page.tsx) with:
1. **Durable Checkpoints Tab:** Displays all checkpoints in chronological order with checkpoint #, trigger reason, timestamp, and task count.
2. **One-Click Integrity Verification:** Recalculates canonical SHA-256 fingerprint client-side and validates against stored hash (displays green `✓ INTEGRITY VERIFIED` or red `✕ TAMPERED`).
3. **Safe State Restoration Action:** Allows operators/users to restore objective to a previous verified state, automatically advancing worker lease generations.

---

## 8. Test Suite Results & Regression Arithmetic

### 8.1 Milestone 13.6 Test Suite (`tests/milestone-13-6-production-reliability.ts`)
- Section 1: Durable Objective Checkpoints -> **10 / 10 PASS**
- Section 2: Real Worker Crash (SIGKILL) & Restart -> **10 / 10 PASS**
- Section 3: Live External Provider Verification -> **13 / 13 PASS**
- Section 4: Long-Running Scheduling, Deadlines & Timeouts -> **4 / 4 PASS**
- Section 5: Concurrent Objective Isolation & Quotas -> **6 / 6 PASS**
- Section 6: Failure Injection & Resilience Gates -> **2 / 2 PASS**
- Section 7: HTTP API End-to-End Verification -> **9 / 9 PASS**
- **Milestone 13.6 Total:** **54 / 54 PASSED (100%)**

### 8.2 Full Predecessor Regression Suites
1. **Milestone 13.5 (End-to-End Fulfillment):** `tests/milestone-13-5-e2e-fulfillment.ts` -> **72 / 72 PASSED (100%)**
2. **Milestone 13.4 (Multi-Agent Orchestration):** `tests/milestone-13-4-orchestration.ts` -> **72 / 72 PASSED (100%)**
3. **Milestone 13.3 (Agent Assignment & Delegation):** `tests/milestone-13-3-agent-assignment.ts` -> **78 / 78 PASSED (100%)**
4. **Milestone 13.2 (Autonomous Planning & DAG):** `tests/milestone-13-2-planning-dag.ts` -> **63 / 63 PASSED (100%)**
5. **Milestone 13.1 (Objective Lifecycle):** `tests/milestone-13-1-objective-lifecycle.ts` -> **33 / 33 PASSED (100%)**
6. **Milestone 12 (Autonomous Spending Lifecycle):** `tests/milestone-12-autonomous-spending.ts` -> **54 / 54 PASSED (100%)**
7. **Milestone 12.1 (Multi-Transaction Negative Tests):** `tests/milestone-12-1-negative-tests.ts` -> **ALL CHECKS PASSED (100%)**

**Total Verified Assertions:** **426 / 426 PASSED (100% GREEN, ZERO REGRESSIONS)**

---

## 9. Known Limitations

1. **Database Engine:** Currently running on single-node SQLite (`dev.db`). Multi-node distributed operations and production PostgreSQL migration are explicitly scheduled for Milestone 13.7.
2. **Orchestration Lock Store:** Orchestration mutual-exclusion locks are currently stored in memory and enforced via database optimistic CAS versioning. Distributed Redis locking will be evaluated in M13.7.
3. **Zero Financial Broadcasts:** Financial operations in M13.6 strictly halted at `AWAITING_APPROVAL`, preserving the invariant of 0 live NEAR broadcasts during automated tests.

---

## 10. GO / NO-GO Recommendation for Milestone 13.7

| Criteria | Status | Evidence |
| :--- | :--- | :--- |
| **Durable Checkpoints Implemented & Verified** | **MET** | Checkpoints survive restarts; canonical SHA-256 fingerprinting verified. |
| **Real Worker Crash & Restart Demonstrated** | **MET** | OS PID 89632 killed via SIGKILL; dead confirmed; lease recovered with monotonic generation. |
| **Live Provider Verification Matrix** | **MET** | FastNEAR RPC, DuckDuckGo, and OutLayer TEE verified live with correlation IDs. |
| **Deadlines & Concurrency Quotas** | **MET** | Deadlines halt dispatch; tenant running objective quota (5/5) strictly enforced. |
| **Zero Live Financial Broadcasts** | **MET** | Invariant preserved (0 live NEAR spent in M13.6 automated tests). |
| **Full Regression Suite Pass** | **MET** | 426 / 426 tests passed across M12 through M13.6. |

**Final Recommendation:** **GO FOR MILESTONE 13.7** (Production Infrastructure, PostgreSQL Migration & Deployment Architecture).

