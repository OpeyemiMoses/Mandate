# MANDATE — MILESTONE 13.5 ARCHITECTURE DISCOVERY REPORT
## End-to-End Autonomous Objective Fulfillment & Multi-Agent Execution

**Network:** NEAR Testnet ONLY  
**Security Boundary:** Intel SGX TEE (OutLayer) + ExecutionBoundaryService  
**Core Principle:** AI proposes. Mandate enforces. The user controls. OutLayer executes.  
**Zero Live Broadcast Rule:** STRICTLY OBSERVED (0 live transactions broadcast in automated verification)

---

## 1. EXECUTIVE SUMMARY & OBJECTIVE

Milestone 13.5 delivers the complete, authoritative, production-grade end-to-end objective fulfillment workflow for Mandate. It unites every capability developed across prior milestones into a single, cohesive, tamper-proof system:

```
OBJECTIVE_CREATED 
      ↓
PLAN_GENERATED 
      ↓
PLAN_VALIDATED (5-Tier Mathematical & Invariant Verification)
      ↓
AWAITING_APPROVAL 
      ↓
APPROVED (Human Plan Approval & Canonical SHA-256 Fingerprint)
      ↓
AGENTS_ASSIGNED (11-Point Eligibility, Load Balancing, Lease Fencing)
      ↓
ORCHESTRATING (Kahn DAG Scheduling, Constrained Context, Real Tool Execution)
      ↓
VERIFYING (Multi-Tier Output Verification & Success Criteria Engine)
      ↓
COMPLETED (Deterministic Evaluation of Measurable Conditions)
```

This discovery report maps the exact services, APIs, data models, extension points, and safety invariants required before implementing code.

---

## 2. REPOSITORY & SUBSYSTEM DISCOVERY MATRIX

| Subsystem | Milestone Origin | Existing Files & Components | Status in M13.5 | Extension / Integration Point |
|---|---|---|---|---|
| **Objective Lifecycle** | M13.1 | `src/lib/objectives/lifecycleService.ts` | Complete & Reusable | Guard `COMPLETED` transition with `SuccessCriteriaEngine` |
| **Planning & Plan Hash** | M13.2 | `src/lib/objectives/understandingService.ts`, `dagService.ts`, `planValidationService.ts`, `planHash.ts`, `planner.ts` | Complete & Reusable | Feed plan-defined success criteria into evaluation engine |
| **Capability Registry & Assignment** | M13.3 | `src/lib/agents/capabilityRegistry.ts`, `capabilityValidator.ts`, `assignmentEngine.ts`, `delegationManager.ts` | Complete & Reusable | Verify active profiles and active leases prior to task dispatch |
| **Task Lifecycle & CAS** | M13.4 | `src/lib/orchestration/taskLifecycle.ts`, `types.ts` | Complete & Reusable | Re-use 12-state machine; enforce anti-self-certification |
| **DAG Scheduler** | M13.4 | `src/lib/orchestration/scheduler.ts` | Complete & Reusable | Level-based scheduling; upstream failure blocking |
| **Task Dispatch & Sandbox** | M13.4 | `src/lib/orchestration/dispatchService.ts` | Active Extension | Connect to Universal Agent Runtime and `ToolExecutor` |
| **Output Verification** | M13.4 | `src/lib/orchestration/verificationService.ts` | Active Extension | Normalize taxonomy; generate SHA-256 digests in `ObjectiveTaskResult` |
| **Failure Recovery** | M13.4 | `src/lib/orchestration/recoveryManager.ts` | Active Extension | Bridge with `BackgroundJob` worker queue and retry backoff |
| **Progress Calculation** | M13.4 | `src/lib/orchestration/progressService.ts` | Complete & Reusable | Accurately aggregate verified weights across steps |
| **Universal Policy Engine** | M7 | `src/lib/governance/engine.ts`, `policy.ts` | Complete & Reusable | Policy evaluation at plan approval and execution boundary |
| **Execution Boundary** | M8 | `src/lib/execution/boundaryService.ts` | Complete & Reusable | Strictly gate financial transfers behind human approval |
| **Background Workers** | M9 | `src/lib/jobs/workerService.ts`, `queueService.ts`, `registry.ts` | Active Extension | Register `OBJECTIVE_TASK_EXECUTE` and `OBJECTIVE_ORCHESTRATE` |
| **Operational Controls** | M9.4 | `src/lib/operations/executionGateService.ts` | Complete & Reusable | Gate execution on operational mode (NORMAL vs HALTED) |
| **Tenant Isolation** | M10 | Session-derived `userId`, Prisma tenant filters | Complete & Reusable | Enforce fail-closed 404/403 across all new and extended routes |
| **Spending & Mandates** | M12, M12.1 | `src/lib/mandate/`, `src/lib/objectives/authority.ts` | Complete & Reusable | Zero live testnet broadcast invariant for M13.5 |

---

## 3. TASK TAXONOMY NORMALIZATION

Prior milestones evolved subtle task taxonomy variances:
- **M13.2 Planning:** 5 typed categories: `RESEARCH`, `ANALYSIS`, `EXECUTION`, `PAYMENT`, `VERIFICATION`.
- **M13.3 Registry:** Included agent capabilities referencing `COORDINATION` and `VALIDATION`.
- **M13.4 Orchestration:** Checked verification rules for `RESEARCH`, `ANALYSIS`, `VERIFICATION`, `EXECUTION`.

To resolve these differences without silent conflation, M13.5 introduces an authoritative taxonomy module:
`src/lib/orchestration/taxonomy.ts`

### Authoritative Taxonomy Rules:
1. **`RESEARCH`**: Passive information retrieval (e.g. web search, RPC reads). Cannot mutate state. Requires sources and findings evidence.
2. **`ANALYSIS`**: Structured evaluation and mathematical comparisons. Requires metrics, comparative matrix, or scored recommendations.
3. **`EXECUTION`**: Active operational state modification (non-financial). Must run via registered tool adapters and record tool invocation evidence.
4. **`PAYMENT`**: Financial value transfers on NEAR. Strictly held at `AWAITING_APPROVAL`. Zero live broadcast in M13.5.
5. **`VERIFICATION`**: Post-hoc independent inspection of completed work. Performed by independent agents (e.g. `security_auditor`). Must evaluate tamper-evident hash chains or authoritative state.
6. **`VALIDATION`**: Pre-execution or in-flight invariant checking. Validates schemas, policy rules, and preconditions.
7. **`COORDINATION`**: Workflow synchronization, sub-DAG management, and agent delegation handoffs.

**Anti-Conflation Rule:** `EXECUTION`, `VERIFICATION`, `VALIDATION`, and `COORDINATION` are strictly non-interchangeable. An agent supporting only `VALIDATION` cannot execute `EXECUTION` tasks. An agent executing a task cannot serve as its independent `VERIFIER`.

---

## 4. OBJECTIVE SUCCESS CRITERIA ENGINE

An objective must never transition to `COMPLETED` simply because all agents returned responses.

### Engine Invariants:
1. **Measurable Conditions:** Derived from the approved plan's `ObjectiveSuccessCriteria` records (e.g. required research deliverable exists, analysis has required structured fields, validation confirms result, no failed tasks).
2. **Anti-Self-Certification:** An AI agent returning `"task completed"` is rejected as insufficient evidence.
3. **Deterministic Verification:** Every criterion must be evaluated against genuine persisted evidence (`ObjectiveTaskResult`, `ObjectivePlanStep.outputJson`, or `ToolInvocation`).
4. **Atomic Gate:** `ObjectiveLifecycleService.transitionStatus(..., "COMPLETED")` must consult `SuccessCriteriaEngine.evaluateCriteria(...)`. If any mandatory criterion is not satisfied, the transition is rejected fail-closed.
5. **Audit Persistence:** Criteria evaluation outcomes are permanently saved to `ObjectiveSuccessCriteria` and dual-logged to the immutable audit ledger.

---

## 5. REAL AGENT RUNTIME & TOOL EXECUTION INTEGRATION

M13.5 bridges orchestration directly to real registered agent adapters and tool implementations:
- **Procurement Agent (`research_procurement`):** Invokes `duckduckgo_search` via `ToolExecutor` or web research engine; produces structured candidates and ranking matrices.
- **Security Auditor (`security_auditor`):** Runs real SHA-256 cryptographic audit hash-chain verification (`verifyAuditChain`); confirms ledger integrity.
- **Operations Agent (`operations_execution`):** Executes operational tasks and records service health evidence.
- **Treasury Agent (`finance_treasury`):** Formulates spending proposals within mandate limits. Stops at `AWAITING_APPROVAL`.

### Evidence Capturing:
Every dispatched task persists:
1. `output`: Structured payload from agent execution.
2. `evidenceReferences`: References to authoritative source URLs, hashes, or records.
3. `toolExecutions`: Tool ID, parameters SHA-256 hash, execution timestamp, and status.
4. `verificationStatus`: `AGENT_REPORTED` $\rightarrow$ `SYSTEM_VALIDATED` $\rightarrow$ `INDEPENDENTLY_VERIFIED`.
5. `resultFingerprint`: Canonical 64-hex SHA-256 digest of normalized output.

---

## 6. DURABLE WORKER & FAILURE RECOVERY INTEGRATION

Connects M13.4 `TaskRecoveryManager` to M9 `BackgroundJob` infrastructure:
- **`OBJECTIVE_ORCHESTRATE` Job Type:** Dispatched when an objective starts or is resumed, running orchestration rounds asynchronously with lease heartbeats.
- **`OBJECTIVE_TASK_EXECUTE` Job Type:** Dispatched for individual ready steps, executing under monotonic lease fencing.
- **Crash Recovery:** If a worker crashes or an agent times out, the lease expires. The recovery service detects the dead worker, releases the lease, and uses bounded exponential backoff ($2\text{s}, 4\text{s}, 8\text{s}$) to re-enqueue the task.
- **Circuit Breaker:** Repeated failures exceeding `maxRetries` (3) transition the task to `REQUIRES_INTERVENTION` and halt downstream dispatches.

---

## 7. UNIFIED CHRONOLOGICAL AUDIT TRAIL

To satisfy Section 10, M13.5 introduces `ObjectiveAuditTrailService` and API route `GET /api/objectives/[id]/history`:
- Aggregates events across:
  - `ObjectiveEvent` (Lifecycle transitions)
  - `ObjectivePlanApproval` (User sign-offs)
  - `AgentAssignment` & `AgentHandoff` (Agent assignment & delegation)
  - `ObjectiveTaskEvent` (Task status changes & retries)
  - `ObjectiveTaskResult` (Tool executions & result fingerprints)
  - `ObjectiveSuccessCriteria` (Criteria evaluations)
- Renders a unified, chronological, tenant-isolated history with actor roles, timestamps, reasons, and cryptographic verification statuses.

---

## 8. EXTENSIONS TO CUSTOMER UI (`/objectives/[id]`)

1. **Progress Card:** Real verified progress percentage computed from persisted task states and verified criteria weights.
2. **Orchestration Tab:**
   - Active agent indicators showing current running steps.
   - Dependency status (Prerequisites satisfied vs waiting).
   - Direct button to inspect task evidence, tool calls, and SHA-256 fingerprints.
   - Clear banner when human approval is required (`AWAITING_APPROVAL`).
3. **Execution History Tab:**
   - Unified chronological audit trail table with filterable event categories.
4. **Success Criteria Tab:**
   - Real-time status pills (`MET`, `NOT_MET`, `FAILED`) with supporting evidence previews.

---

## 9. FINANCIAL BOUNDARIES & TESTNET SAFETY

- **ZERO LIVE BROADCASTS:** Automated tests and orchestration runs must NOT broadcast any live NEAR transactions.
- **Human Approval Gate:** Any plan containing a `PAYMENT` step automatically transitions the objective to `AWAITING_APPROVAL`.
- **yoctoNEAR Precision:** All balance and budget arithmetic remains in BigInt integer precision.
- **Tenant Isolation:** All endpoints strictly verify session user ownership; cross-tenant requests fail-closed with 404/403.

