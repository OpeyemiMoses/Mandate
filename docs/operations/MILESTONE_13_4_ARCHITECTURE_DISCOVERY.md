# MANDATE — MILESTONE 13.4 ARCHITECTURE DISCOVERY
## Multi-Agent Orchestration, Dependency-Aware Execution & Task Lifecycle Management

**Date:** 2026-11-04  
**Author:** DeepMind Coding Agent & Pair Programmer  
**Network Target:** NEAR Testnet ONLY  
**Security Boundary:** Intel SGX TEE (OutLayer) + ExecutionBoundaryService  
**Zero Live Broadcast Rule:** STRICTLY OBSERVED (Orchestration & Task Coordination only — ZERO live transactions broadcast)

---

## 1. EXECUTIVE SUMMARY & OBJECTIVE

Milestone 13.4 establishes the **Multi-Agent Orchestration, Dependency-Aware Execution & Task Lifecycle Management** layer for the Mandate platform.

### Core Principle
> **"AI proposes. Mandate enforces. The user controls. OutLayer executes."**

Following the successful completion of:
- **Milestone 12 & 12.1:** Autonomous Spending Lifecycle, Multi-Transaction Reliability, and Authoritative FastNEAR RPC Settlement.
- **Milestone 13.1:** Deterministic Objective Lifecycle (11 states, CAS optimistic locking, audit ledger dual-logging).
- **Milestone 13.2:** Natural-Language Objective Understanding, 5 Typed Task Categories, Kahn Topological Sorting, 5-Tier Validation, and Canonical SHA-256 Plan Fingerprinting (`planHash`).
- **Milestone 13.3:** Agent Capability Registry, Deterministic Task Assignment Engine, and Governed Delegation Manager.

Milestone 13.4 bridges approved objective plans and real multi-agent execution. It takes an approved plan, verifies its cryptographic fingerprint and assignments, schedules tasks across dependency execution levels, dispatches tasks to assigned agents with strictly constrained contexts, independently verifies outputs, manages bounded retries and recovery, and advances objective progress safely without introducing unrestricted autonomous spending.

---

## 2. COMPREHENSIVE COMPONENT AUDIT

### 2.1 Objective DAG Service (`src/lib/objectives/dagService.ts`)
- **Current State:** Implements Kahn's algorithm for topological sorting and cycle detection. Partitions tasks into parallel `executionLevels` (Level 0, Level 1, etc.). Rejects self-dependencies, duplicate task IDs, and missing references.
- **Milestone 13.4 Reuse:** Fully reusable as the mathematical foundation for dependency resolution and execution level scheduling. The scheduler can evaluate task readiness at runtime by checking if all prerequisite stepIds in `dependenciesJson` have reached verified `COMPLETED` state.
- **Enhancement Needed:** Real-time dependency evaluation during runtime orchestration: detecting blocked prerequisites when an upstream step fails or requires intervention, and preventing downstream dispatch unless an explicit recovery policy permits.

### 2.2 Objective Planning, Approval & Plan Hash (`src/lib/objectives/planner.ts`, `planValidationService.ts`)
- **Current State:** Generates structured `ObjectivePlan` with `ObjectivePlanStep` entries. Computes canonical SHA-256 `planHash` using normalized properties. Enforces mandatory user approval for plan activation.
- **Milestone 13.4 Reuse:** The orchestrator must load only plans with status `APPROVED` and re-verify that the active plan's computed `planHash` exactly matches `approvedHash`. Any divergence triggers immediate fail-closed termination with `PLAN_INTEGRITY_VIOLATION`.

### 2.3 Task Assignment Engine (`src/lib/agents/assignmentEngine.ts`)
- **Current State:** Deterministically maps plan steps to eligible agents using load-balancing, capability versions, and tie-breaking. Issues cryptographic lease tokens (`lease_*`) with 30-minute to 1-hour expiration. Records `AgentAssignment` bound to `planHash`, `planVersion`, and `stepId`.
- **Milestone 13.4 Reuse:** Orchestrator must verify that every step in the approved plan has an active `AgentAssignment` with a valid, non-expired lease and matching `planHash`.
- **Enhancement Needed:** Dynamic assignment verification before task dispatch, ensuring agent has not been suspended, paused, or had capabilities modified between assignment time and execution time.

### 2.4 Agent Capability Registry & Validator (`src/lib/agents/capabilityRegistry.ts`, `capabilityValidator.ts`)
- **Current State:** Centralized validated registry of agent profiles. 11 deterministic eligibility checks verifying task types, tool registration against `toolRegistry`, testnet-only networks, risk thresholds, and financial mandate limits.
- **Milestone 13.4 Reuse:** Pre-dispatch verification gate to ensure the assigned agent remains 100% eligible before work starts.

### 2.5 Governed Delegation Manager (`src/lib/agents/delegationManager.ts`)
- **Current State:** 10 governance rules allowing task re-assignment between agents. Anti-tamper, cycle prevention, tenant isolation, and strict non-transferability of wallet or mandate authority.
- **Milestone 13.4 Reuse:** Allows in-flight task delegation when an agent encounters capability constraints or transient issues during orchestration.

### 2.6 Agent Runtime Orchestrator (`src/lib/runtime/orchestrator.ts`)
- **Current State:** Executes individual agents (`executionOrchestrator.startExecution`). Enforces execution limits, operational control plane gates (`ExecutionGateService`), tool execution access controls, and policy evaluations.
- **Milestone 13.4 Integration:** The orchestrator delegates execution to the agent runtime using constrained input contexts.

### 2.7 Background Job Queue & Workers (`src/lib/jobs/queueService.ts`, `workerService.ts`, `registry.ts`)
- **Current State:** Durable job queue with database persistence, monotonic lease fencing, dead-letter queues, exponential backoff, and heartbeat tracking.
- **Milestone 13.4 Integration:** Asynchronous task dispatch using `OBJECTIVE_TASK_EXECUTION` job type, guaranteeing crash resilience, lease fencing, and distributed processing.

### 2.8 Execution Boundary & Recovery (`src/lib/execution/boundaryService.ts`, `recoveryService.ts`)
- **Current State:** Authoritative boundary for OutLayer TEE transaction execution. Stage-based failure classification (`classifyFailure`), ambiguous transaction recovery, and zero reservation leaks.
- **Milestone 13.4 Invariant:** ZERO NEAR transfers broadcast during Milestone 13.4. Any financial step must enter `AWAITING_APPROVAL` with preflight budget validation.

### 2.9 Objective Lifecycle Service (`src/lib/objectives/lifecycleService.ts`)
- **Current State:** 11 lifecycle states: `DRAFT`, `ACTIVE`, `PLANNING`, `READY`, `RUNNING`, `AWAITING_APPROVAL`, `PAUSED`, `COMPLETED`, `FAILED`, `CANCELLED`, `REQUIRES_INTERVENTION`. Atomic CAS optimistic locking.
- **Milestone 13.4 Integration:** Orchestrator transitions objective to `RUNNING` when tasks start, to `PAUSED` when paused by user, and to `COMPLETED` only when all success criteria and tasks pass independent verification.

---

## 3. IDENTIFIED GAPS & NEW ARCHITECTURAL REQUIREMENTS

| Domain | Existing State | Required Milestone 13.4 Implementation |
|--------|----------------|-----------------------------------------|
| **Task Lifecycle** | Basic 8-state model in `ObjectivePlanStep` without CAS versioning | 12-state deterministic state machine (`PENDING`, `BLOCKED`, `READY`, `ASSIGNED`, `QUEUED`, `RUNNING`, `AWAITING_APPROVAL`, `COMPLETED`, `FAILED`, `RETRY_PENDING`, `CANCELLED`, `REQUIRES_INTERVENTION`) with atomic CAS, lease verification, and audit logs |
| **Scheduler** | Static Kahn sorting at planning time | Real-time dependency-aware runtime scheduler dynamically checking prerequisite satisfaction, parallel partition dispatching, and agent concurrency limits |
| **Orchestration Service** | Legacy synchronous loop in `executor.ts` | Centralized `ObjectiveOrchestrationService` providing crash-safe, durable, restartable orchestration |
| **Execution Context** | Freeform input payloads | Constrained, tamper-proof execution context stripping private keys, credentials, and cross-tenant data |
| **Result Verification** | Blind acceptance of agent outputs | Multi-tier verification distinguishing `AGENT_REPORTED`, `SYSTEM_VALIDATED`, and `INDEPENDENTLY_VERIFIED` with SHA-256 output fingerprints |
| **Failure & Retry** | Global failure on any step error | Granular failure classification, bounded retries with exponential backoff, circuit-breaking to `REQUIRES_INTERVENTION` |
| **Progress Metrics** | Naive step count percentages | Objective progress calculated strictly from verified criteria and validated step completion |
| **Customer Experience** | Basic step cards in UI | Real-time orchestration dashboard with parallel execution visualization, active attempts, and pause/resume/cancel controls |

---

## 4. CONCURRENCY RISKS & FENCING STRATEGY

1. **Concurrent State Mutations:** If two workers or events attempt to transition a task simultaneously, optimistic CAS version checking (`WHERE id = ? AND version = ?`) rejects the stale update with `CONCURRENCY_CONFLICT`.
2. **Double Dispatch & Duplicate Claims:** Monotonic lease tokens (`lease_*`) and lease generation counters prevent a revoked or expired worker from committing task results.
3. **Plan Drift / Race Conditions:** Every dispatch, claim, and transition verifies the canonical `planHash` to ensure no replanning or tampering occurred concurrently.
4. **Agent Over-Allocation:** Concurrency throttles enforce per-agent and per-objective active task limits, preventing worker overload.

---

## 5. DATABASE SCHEMA REVISIONS

To support deterministic task lifecycles, structured verification, and auditability:
1. **Extend `ObjectivePlanStep`:**
   - `version Int @default(1)`
   - `retryCount Int @default(0)`
   - `maxRetries Int @default(3)`
   - `verificationStatus String @default("UNVERIFIED")`
   - `resultFingerprint String?`
   - `evidenceReferencesJson String @default("[]")`
   - `toolExecutionsJson String @default("[]")`
   - `failureStage String?`
   - `lastTransitionReason String?`
   - `leaseGeneration Int @default(1)`
2. **Add `ObjectiveTaskEvent`:**
   - Tracks atomic state transitions, actor role, previous status, next status, reason, task version, and timestamps.
3. **Add `ObjectiveTaskResult`:**
   - Stores structured results, execution attempt, result fingerprint, verification status, verifiedBy, evidence references, and timing.

---

## 6. INTEGRATION ROADMAP

- **Phase 2:** Task Execution Lifecycle State Machine (`src/lib/orchestration/taskLifecycle.ts`).
- **Phase 3:** Dependency-Aware Runtime Scheduler (`src/lib/orchestration/scheduler.ts`).
- **Phase 4:** Objective Orchestration Service (`src/lib/orchestration/orchestrationService.ts`).
- **Phase 5:** Agent Task Dispatch & Constrained Context (`src/lib/orchestration/dispatchService.ts`).
- **Phase 6:** Agent Results & Multi-Tier Output Verification (`src/lib/orchestration/verificationService.ts`).
- **Phase 7:** Failure, Retry, and Recovery Manager (`src/lib/orchestration/recoveryManager.ts`).
- **Phase 8:** Pause, Resume, and Cancellation Controls.
- **Phase 9:** Financial Boundaries (Mandate Gating, 0 Live NEAR transfers).
- **Phase 10:** Progress Calculation Engine (`src/lib/orchestration/progressService.ts`).
- **Phase 11:** UI Orchestration View (`src/app/objectives/[id]/page.tsx`).
- **Phase 12:** Comprehensive Verification Test Suite (`tests/milestone-13-4-orchestration.ts`).
- **Phase 13:** Certification & Operational Runbook.

