# MANDATE — MILESTONE 13.6 ARCHITECTURE AUDIT & IMPLEMENTATION PLAN
## Long-Running Autonomous Objectives, Production Reliability & External Execution Verification

**Date:** 2026-11-04  
**Status:** Audit & Planning Phase  
**Core Principle:** *AI proposes. Mandate enforces. The user controls. OutLayer executes.*

---

## 1. Executive Summary & Audit Baseline

Milestone 13.5 successfully unified end-to-end multi-agent orchestration, verifiable success criteria, anti-conflation task taxonomy, and tenant-guarded progress tracking. 

However, running long-duration autonomous workflows in production introduces operational vulnerabilities that must be solved before moving to external multi-user deployments:
1. **Volatile In-Flight State:** If an orchestration round or task execution is interrupted mid-flight, state must be recoverable from a formal, immutable, point-in-time durable checkpoint rather than relying on disparate table reconstruction.
2. **Worker Crashes & Abandoned Leases:** In multi-process production environments, workers crash, get terminated by schedulers (SIGKILL/OOM), or suffer network partitions while holding exclusive task leases. Recovery must not merely be a software exception test; it must handle actual OS process termination and safe lease reclamation without duplicating external actions.
3. **External Provider Verification:** Providers (FastNEAR RPC, OutLayer TEE, DuckDuckGo Search) must be audited and verified with genuine live execution evidence, distinguishing live integrations from fixtures.
4. **Timeouts & Deadlines:** Long-running workflows require deterministic deadline management, per-task timeouts, and provider retry windows that never bypass security or spending mandates.
5. **Multi-Tenant Concurrency & Fairness:** Multiple tenants executing concurrent objectives must not starve worker capacity or exhaust shared provider rate limits.

---

## 2. Existing Capabilities Inventory

| Subsystem | Existing Implementation | Capabilities to Retain |
| :--- | :--- | :--- |
| **Objective Lifecycle** | `ObjectiveLifecycleService` (`src/lib/objectives/lifecycleService.ts`) | 12-state deterministic state machine with CAS optimistic concurrency (`version`), user-only transitions, and mandate bindings. |
| **Plan DAG & Kahn Sorting** | `ObjectiveDAGService` (`src/lib/objectives/dagService.ts`) | Acyclic topological sorting, execution level partitioning, canonical SHA-256 plan fingerprinting. |
| **Task Lifecycle & Recovery** | `TaskLifecycleService`, `TaskRecoveryManager` (`src/lib/orchestration/`) | Step status transitions, exponential backoff retries, circuit breaker on max retries. |
| **Worker Queue & Leases** | `JobWorkerService`, `JobClaimService`, `JobRecoveryService` (`src/lib/jobs/`) | Monotonic `leaseGeneration` counters, CAS fencing, heartbeat TTLs, dead-letter quarantine. |
| **Success Criteria Engine** | `SuccessCriteriaEngine` (`src/lib/orchestration/successCriteriaEngine.ts`) | Measurable conditions, anti-self-certification filtering, DB persistence. |
| **External Providers & Tools** | `duckDuckGoTool`, `nearRpcTool`, `executeOutlayerTransfer` (`src/lib/tools/`, `src/lib/outlayer.ts`) | Live web search, FastNEAR Testnet RPC queries, OutLayer TEE attestation and custody endpoints. |
| **Execution Boundary** | `ExecutionBoundaryService` (`src/lib/execution/boundaryService.ts`) | Atomic yoctoNEAR reservations, policy firewall, constant-time HMAC validation, idempotent settlement. |

---

## 3. Gap Analysis: Missing Requirements

### 3.1 Durable Objective Checkpoints (Phase 1)
- **Gap:** Currently, objective steps, events, and results are written to separate tables, but there is no atomic, point-in-time `ObjectiveCheckpoint` entity capturing the unified snapshot (objective state + plan version + task states + agent assignments + lease generations + dependency evidence + approval state + execution references).
- **Solution:** Add `ObjectiveCheckpoint` model to Prisma schema with canonical SHA-256 fingerprinting, monotonic checkpoint numbering per objective, tenant scoping, and zero secrets in payloads. Implement `ObjectiveCheckpointService`.

### 3.2 Real Worker OS Process Termination & Restart Recovery (Phase 2)
- **Gap:** Previous tests verified software error handling in-memory, but did not spawn and `SIGKILL` real Node.js worker processes mid-execution.
- **Solution:** Create an isolated test harness spawning actual Node.js worker child processes. Issue `kill -9` (`SIGKILL`) during:
  1. Idle state
  2. Active task lease ownership
  3. In-flight execution before persistence
  4. Post-external-response before local settlement
  Demonstrate worker restart, safe lease reclamation, monotonic fencing rejection of zombie workers, and checkpoint-based resumption.

### 3.3 External Provider Verification Matrix (Phase 3)
- **Gap:** Lack of a unified documentation and verification matrix auditing live vs fixture status for all registered adapters.
- **Solution:** Build `ProviderVerificationService` and document all registered adapters (DuckDuckGo, FastNEAR RPC, OutLayer TEE, REST Generic, MCP Generic). Execute live, safe, non-financial operations against real external endpoints, recording request correlation IDs, response evidence, and latencies.

### 3.4 Long-Running Scheduling & Deadlines (Phase 4)
- **Gap:** Objectives possess `deadlineAt`, but scheduler does not enforce active deadline expiry checks, per-task execution timeouts, or provider retry windows.
- **Solution:** Enhance `ObjectiveScheduler` and `TaskRecoveryManager` with:
  - `checkObjectiveDeadline(objectiveId)`
  - Per-task timeout enforcement (`timeoutMs`)
  - Deadline-aware queue prioritization
  - Delayed and blocked state visibility

### 3.5 Multi-Tenant Concurrency & Quota Management (Phase 5)
- **Gap:** No per-tenant concurrency ceilings or agent workload caps, allowing one tenant to monopolize all worker slots.
- **Solution:** Implement `ConcurrencyControlService` enforcing:
  - Max concurrent running objectives per tenant (quota)
  - Max concurrent tasks per agent (workload limit)
  - Duplicate orchestration prevention via mutex/lease locks
  - Provider rate-limit coordination

### 3.6 Comprehensive Failure Injection & Acceptance (Phase 6)
- **Gap:** Need dedicated end-to-end failure injection covering database interruptions, stale leases, retry exhaustion, and ambiguous outcomes.
- **Solution:** Suite of 12+ failure injection test scenarios verifying fail-closed invariants and zero data corruption.

---

## 4. Architectural Invariants & Rules

1. **AI Proposes. Mandate Enforces. The User Controls. OutLayer Executes.**
2. **STRICT INVARIANT: ZERO LIVE FINANCIAL BROADCASTS IN AUTOMATED TESTS.**
3. **Deadlines NEVER Override Mandate Authority, Approvals, or Security Firewalls.**
4. **Monotonic Fencing Generations Always Win:** Any worker attempting to update an assignment or checkpoint with a stale lease generation or token must be rejected fail-closed (`STALE_LEASE_GENERATION`).
5. **No Secrets in Plaintext:** Checkpoints must never store private keys, API secrets, or raw authorization envelopes.
6. **Strict Tenant Isolation:** Cross-tenant checkpoint, deadline, or concurrency inspection must fail-closed (HTTP 404 / `OBJECTIVE_NOT_FOUND`).

---

## 5. Milestone 13.6 Implementation Plan

```mermaid
flowchart TD
    subgraph Phase 1: Checkpoints
        A["Prisma Schema: ObjectiveCheckpoint"] --> B["ObjectiveCheckpointService"]
        B --> C["Lifecycle & Task Checkpoint Hooks"]
    end
    subgraph Phase 2: Worker Process Kill & Restart
        D["Spawn Child Process Worker"] --> E["SIGKILL at In-Flight Stages"]
        E --> F["Restart Worker & Reclaim Leases"]
        F --> G["Resume Objective from Checkpoint"]
    end
    subgraph Phase 3: Provider Verification
        H["Provider Inventory Matrix"] --> I["Execute Safe Live Calls (FastNEAR/DDG/OutLayer)"]
        I --> J["Record Latency, Request IDs, Evidence"]
    end
    subgraph Phase 4: Scheduling & Deadlines
        K["Scheduler Deadline Engine"] --> L["Per-Task Execution Timeouts"]
        L --> M["Expired Objective Transitions"]
    end
    subgraph Phase 5: Concurrency & Quotas
        N["ConcurrencyControlService"] --> O["Tenant & Agent Quota Gating"]
        O --> P["Duplicate Orchestration Lock"]
    end
    subgraph Phase 6: Failure Injection & Certification
        Q["12-Scenario Failure Suite"] --> R["Run M13.1-M13.5 Regressions"]
        R --> S["Build & Milestone Certification Report"]
    end
    Phase 1 --> Phase 2
    Phase 2 --> Phase 3
    Phase 3 --> Phase 4
    Phase 4 --> Phase 5
    Phase 5 --> Phase 6
```

