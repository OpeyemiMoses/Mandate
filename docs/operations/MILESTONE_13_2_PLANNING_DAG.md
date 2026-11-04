# MANDATE — MILESTONE 13.2 ENGINEERING & OPERATIONAL SPECIFICATION
## Autonomous Objective Planning & Task DAG Decomposition

**Project:** Mandate  
**Network:** NEAR Testnet ONLY  
**Execution Engine:** OutLayer Intel SGX TEE  
**Date:** 2026-11-04  
**Author:** DeepMind Agentic Assistant & Engineering Team  
**Status:** Certified & Production-Ready  

---

### 1. CORE OPERATING PRINCIPLE

> **AI proposes. Mandate enforces. The user controls. OutLayer executes.**

Milestone 13.2 establishes the autonomous planning and dependency-aware task decomposition layer for the Mandate platform. It bridges high-level user goals with structured, dependency-ordered, validated execution graphs ready for multi-agent coordination.

**CRITICAL INVARIANT:** Milestone 13.2 is strictly about planning, decomposition, and validation. Zero live financial transactions or fund reservations occurred during this milestone. All financial values are modeled in integer yoctoNEAR BigInt strings.

---

### 2. ARCHITECTURE OVERVIEW

```mermaid
flowchart TD
    UserPrompt["Natural Language User Prompt / Objective Goal"] --> Understanding["ObjectiveUnderstandingService<br/>- Normalizes Intent & Deliverables<br/>- Extracts Criteria & Capabilities<br/>- Identifies Ambiguity & Emits Questions"]
    Understanding --> Planning["generateObjectivePlan<br/>- Decomposes into Typed Tasks<br/>- Integer yoctoNEAR Planning<br/>- Version Incrementing & Superseding"]
    
    subgraph DAG_Engine ["Dependency DAG Engine (Kahn's Algorithm)"]
        Planning --> DAGValidation["ObjectiveDAGService<br/>- Self-Dependency Check<br/>- Missing Dependency Check<br/>- Duplicate Edge Check<br/>- Kahn Topological Sort<br/>- Parallel Execution Levels (L0, L1, L2)"]
    end

    subgraph Five_Tier_Validation ["Deterministic 5-Tier Plan Validation Guard"]
        DAGValidation --> T1["Tier 1: Objective Tier<br/>Title, Deliverables, Success Criteria"]
        T1 --> T2["Tier 2: Mandate Authority Tier<br/>Active Status, Allowlist, yoctoNEAR Budget Ceilings"]
        T2 --> T3["Tier 3: Task & DAG Tier<br/>Valid TaskTypes, Registered Tools, Failure Handling"]
        T3 --> T4["Tier 4: Security Tier<br/>Anti-Tamper, No Spending Escalation, Firewalled Payments"]
        T4 --> T5["Tier 5: Risk Tier<br/>LOW/MEDIUM/HIGH/CRITICAL, Mandatory Human Approval"]
    end

    Five_Tier_Validation --> Fingerprint["Canonical SHA-256 Plan Fingerprinting<br/>computePlanContentHash (Immutable planHash)"]
    Fingerprint --> Lifecycle["ObjectiveLifecycleService<br/>DRAFT / ACTIVE -> PLANNING -> AWAITING_APPROVAL -> READY"]
    
    Lifecycle --> Approval["Human User Review & Approval<br/>Bound to Exact planHash & Version"]
    Approval --> ReadyState["READY for Milestone 14 Agent Orchestration"]
```

---

### 3. COMPONENT IMPLEMENTATION INVENTORY

| Component | File Location | Key Capabilities & Enforced Invariants |
| :--- | :--- | :--- |
| **Objective Understanding Service** | [`src/lib/objectives/understandingService.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/objectives/understandingService.ts) | Sanitizes prompts (strips HTML/script tags), normalizes deliverables, generates verifiable success criteria, extracts yoctoNEAR constraints, and emits structured clarification questions for ambiguous goals without hallucinating details. |
| **Objective DAG Service** | [`src/lib/objectives/dagService.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/objectives/dagService.ts) | Implements Kahn's algorithm for directed acyclic graph validation. Detects cycles and isolates exact cycle paths; rejects self-dependencies, non-existent step references, and duplicate dependency edges. Computes parallel execution levels ($L_0, L_1, \dots$) and deterministic topological order. |
| **5-Tier Plan Validation Service** | [`src/lib/objectives/planValidationService.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/objectives/planValidationService.ts) | Deterministically checks 5 validation tiers (Objective, Mandate, Task, Security, Risk). Enforces active mandate status, recipient allowlist, integer yoctoNEAR budget ceilings, tool existence in `toolRegistry`, upstream dependencies on financial actions, and mandatory human approvals for HIGH/CRITICAL or payment plans. |
| **Objective Planning Engine** | [`src/lib/objectives/planner.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/objectives/planner.ts) | Coordinates autonomous plan formulation, task decomposition across 5 typed categories (`RESEARCH`, `ANALYSIS`, `EXECUTION`, `PAYMENT`, `VERIFICATION`), version increments, canonical SHA-256 fingerprint generation, database persistence, and lifecycle transitions (`ACTIVE` $\rightarrow$ `PLANNING` $\rightarrow$ `AWAITING_APPROVAL`). Exports `approveObjectivePlan`, `rejectObjectivePlan`, and `replanObjective`. |
| **Canonical SHA-256 Fingerprint** | [`src/lib/objectives/types.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/lib/objectives/types.ts) | Computes canonical SHA-256 hash `planHash` across sorted task definitions, dependencies, tools, capabilities, and yoctoNEAR financial limits. Guarantees tamper resistance: any change in tasks or constraints alters the hash and invalidates approvals. |
| **Prisma Schema Enhancements** | [`prisma/schema.prisma`](file:///Users/user/.gemini/antigravity/scratch/mandate/prisma/schema.prisma) | Added `planHash String?`, `estimatedCostYocto String?` to `ObjectivePlan`; added `taskType String @default("EXECUTION")` and `estimatedCostYocto String?` to `ObjectivePlanStep`. Synchronized with SQLite `dev.db`. |
| **API Endpoints** | [`src/app/api/objectives/[id]/...`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/app/api/objectives) | `/plan` (GET, POST), `/plan/validate` (POST), `/plan/approve` (POST), `/plan/reject` (POST), `/plan/replan` (POST), `/graph` (GET). |
| **Frontend UI Dashboard** | [`src/app/objectives/[id]/page.tsx`](file:///Users/user/.gemini/antigravity/scratch/mandate/src/app/objectives/[id]/page.tsx) | Interactive UI displaying parallel DAG execution stages ($L_0, L_1, L_2$), typed task badges, canonical SHA-256 `planHash` badge with copy support, clarification notices, and approval/rejection action bars. |

---

### 4. THE 5-TIER VALIDATION GUARD SPECIFICATION

Every objective plan must pass all five deterministic validation tiers before it can be persisted, approved, or transitioned to `READY`:

1. **Tier 1: Objective Tier**
   - Title must be a non-empty string.
   - Category must be a recognized system category (`RESEARCH`, `PROCUREMENT`, `FINANCE`, `TREASURY`, `OPERATIONS`, `CUSTOM`).
   - Deliverables array must contain at least 1 concrete item.
   - Success criteria must contain at least 1 measurable condition with valid `verificationMethod` (`TOOL_RESULT`, `ON_CHAIN_VERIFICATION`, `EXTERNAL_EVIDENCE`, `USER_CONFIRMATION`).

2. **Tier 2: Mandate Authority Tier**
   - If financial tasks (`PAYMENT`) or non-zero estimated costs exist, a linked `mandateId` is strictly required.
   - The linked mandate must exist and belong to the authenticated `userId`.
   - The mandate status must be `"ACTIVE"`. If `PAUSED`, `EXPIRED`, `REVOKED`, or `BUDGET_EXHAUSTED`, validation immediately rejects fail-closed.
   - Mandate expiration date must be in the future.
   - Total plan cost summed via `BigInt` yoctoNEAR must not exceed `mandate.totalBudgetYocto` or remaining available budget (`totalBudgetYocto - spentYocto - reservedYocto`).
   - All proposed payment recipients must exist in `mandate.allowedRecipientsJson`.

3. **Tier 3: Task & DAG Structure Tier**
   - Step definitions must contain at least 1 task.
   - `taskType` must be one of `["RESEARCH", "ANALYSIS", "EXECUTION", "PAYMENT", "VERIFICATION"]`.
   - `failureHandling` must be one of `["FAIL_CLOSED", "RETRY_WITH_BACKOFF", "SKIP_OPTIONAL", "ESCALATE_TO_HUMAN"]`.
   - Required tools must exist in `toolRegistry`. Fabrication of tools is strictly forbidden.
   - The dependency graph must be a valid DAG validated via Kahn's algorithm (no cycles, no self-dependencies, no missing step references, no duplicate edges).

4. **Tier 4: Security & Anti-Tamper Tier**
   - Models or agents cannot escalate budget beyond authorized mandate reserves.
   - AI agents cannot self-assign permissions or bypass human approval gates.
   - Any financial transfer task (`PAYMENT`) must depend on prior research or benchmark tasks.
   - Verification steps must follow execution or payment steps.

5. **Tier 5: Risk Tier**
   - Computes overall plan risk: `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.
   - If any task is `CRITICAL`, overall risk is `CRITICAL`.
   - If any task is `HIGH`, overall risk is `HIGH`.
   - If any task is `MEDIUM` or `taskType === "PAYMENT"`, overall risk is `MEDIUM`.
   - If overall risk is `HIGH`/`CRITICAL` or includes financial transactions, `requiresApproval` is forced to `true`.

---

### 5. AUTOMATED TEST SUITE & VERIFICATION EVIDENCE

The test suite [`tests/milestone-13-2-planning-dag.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/tests/milestone-13-2-planning-dag.ts) was executed against the live dev server on port 3001:

```
=================================================================
   MANDATE — MILESTONE 13.2 PLANNING & TASK DAG VERIFICATION     
=================================================================

BLOCK 1: OBJECTIVE UNDERSTANDING & INTENT NORMALIZATION
  ✓ PASS: Correctly classified category as PROCUREMENT
  ✓ PASS: Normalized concrete desired deliverables
  ✓ PASS: Generated measurable success criteria definitions
  ✓ PASS: Converted 0.05 NEAR to exact 24-decimal integer yoctoNEAR string
  ✓ PASS: Clear procurement prompt does not require clarification
  ✓ PASS: Flags ambiguous prompt 'do something' as needing clarification
  ✓ PASS: Generates structured clarification questions without hallucinating missing details
  ✓ PASS: Identifies unsupported networks (Solana/Mainnet) and flags as unfulfillable policy violation
  ✓ PASS: Strips script tags and malicious HTML safely

BLOCK 2: KAHN TOPOLOGICAL SORTING & DAG VALIDATION ENGINE
  ✓ PASS: Kahn's algorithm validates valid DAG as acyclic
  ✓ PASS: Partitions tasks into 4 parallel execution levels
  ✓ PASS: Identifies concurrent parallel execution tasks in Level 2
  ✓ PASS: Produces deterministic topological execution order
  ✓ PASS: Detects cyclic dependency between step_a and step_b
  ✓ PASS: Returns descriptive cycle detection error message
  ✓ PASS: Traces and reports exact cyclic dependency path
  ✓ PASS: Rejects self-dependency (task depending on itself)
  ✓ PASS: Returns explicit self-dependency rejection error
  ✓ PASS: Rejects dependency on non-existent stepId
  ✓ PASS: Returns explicit missing dependency error
  ✓ PASS: Rejects duplicate dependency edge declarations

BLOCK 3: DETERMINISTIC 5-TIER PLAN VALIDATION SERVICE
  ✓ PASS: Tier 1: Rejects plan with empty title or missing deliverables
  ✓ PASS: Tier 1 explicitly flagged as failed
  ✓ PASS: Tier 2: Rejects financial tasks when no mandate is linked
  ✓ PASS: Tier 2: Rejects plan attempting to exceed mandate budget ceiling (0.5 NEAR > 0.1 NEAR)
  ✓ PASS: Tier 2: Rejects payment step with non-allowlisted recipient 'untrusted.testnet'
  ✓ PASS: Tier 3: Rejects plan specifying unregistered or hallucinated tools
  ✓ PASS: Tier 4: Rejects financial payment step lacking upstream verification dependencies
  ✓ PASS: All 5 tiers pass for well-formed, firewalled procurement plan
  ✓ PASS: Mandatory human approval enforced for financial workflow
  ✓ PASS: Classified overall plan risk as MEDIUM

BLOCK 4: CANONICAL SHA-256 PLAN FINGERPRINT & IMMUTABILITY
  ✓ PASS: Canonical plan hash is deterministic regardless of step array ordering
  ✓ PASS: Any mutation to step definitions or parameters invalidates SHA-256 fingerprint

BLOCK 5: OBJECTIVE LIFECYCLE INTEGRATION & AGENT RESTRICTIONS
  ✓ PASS: Generated plan version 1
  ✓ PASS: Plan requires human approval
  ✓ PASS: Computed and attached canonical planHash
  ✓ PASS: Partitions plan into execution levels
  ✓ PASS: Lifecycle state successfully transitioned from ACTIVE -> PLANNING -> AWAITING_APPROVAL
  ✓ PASS: Security Invariant Enforced: AI Agent is strictly prohibited from transitioning AWAITING_APPROVAL -> READY
  ✓ PASS: Anti-Tamper Enforced: Approval rejected when expected planHash does not match recorded fingerprint
  ✓ PASS: User approval succeeded
  ✓ PASS: Plan status updated to APPROVED
  ✓ PASS: Objective lifecycle state transitioned to READY
  ✓ PASS: Plan marked REJECTED
  ✓ PASS: Objective moved back to PLANNING for revisions
  ✓ PASS: Replanning increments plan version to 2
  ✓ PASS: Generates new immutable planHash for v2

BLOCK 6: MULTI-TENANT ISOLATION & ZERO FINANCIAL DISPATCH
  ✓ PASS: Tenant Isolation Enforced: User B cannot approve or access User A's objective plan
  ✓ PASS: Zero Fund Reservation: Mandate reservedBudget remains 0 yoctoNEAR after planning
  ✓ PASS: Zero Financial Execution: Mandate spentBudget remains 0 yoctoNEAR (no live transactions during M13.2)

BLOCK 7: END-TO-END HTTP API VERIFICATION
  ✓ PASS: HTTP POST /api/objectives/[id]/plan returns 201 Created
  ✓ PASS: HTTP response contains planId
  ✓ PASS: HTTP response contains canonical contentHash
  ✓ PASS: HTTP response includes DAG executionLevels
  ✓ PASS: HTTP GET /api/objectives/[id]/graph returns 200 OK
  ✓ PASS: Graph API confirms DAG is strictly acyclic
  ✓ PASS: Graph API returns nodes with taskType and execution level
  ✓ PASS: Graph API returns directed dependency edges
  ✓ PASS: HTTP POST /api/objectives/[id]/plan/validate confirms 5-tier pass
  ✓ PASS: HTTP POST /api/objectives/[id]/plan/approve returns 200 OK
  ✓ PASS: Objective state transitioned to READY via API approval
  ✓ PASS: HTTP POST /api/objectives/[id]/plan/replan generates v2
  ✓ PASS: API replan increments version to 2

=================================================================
MILESTONE 13.2 PLANNING & DAG VERIFICATION SUMMARY:
TOTAL CHECKS: 63
PASSED:       63
FAILED:       0
=================================================================
```

---

### 6. REGRESSION VERIFICATION MATRIX

| Milestone Suite | Test Script | Checks Run | Pass Rate | Invariants Preserved |
| :--- | :--- | :--- | :--- | :--- |
| **Milestone 13.2** | `tests/milestone-13-2-planning-dag.ts` | 63 / 63 | **100%** | All 7 blocks passed (DAG, 5-tier validation, SHA-256 fingerprint, lifecycle, APIs) |
| **Milestone 13.1** | `tests/milestone-13-1-objective-lifecycle.ts` | 33 / 33 | **100%** | CAS optimistic locking, 11 states, mandate binding, dual-dispatch audit logs |
| **Milestone 12** | `tests/milestone-12-autonomous-spending.ts` | 54 / 54 | **100%** | Atomic yoctoNEAR budget reservation, lease fencing, CAS concurrency |
| **Milestone 12.1 Negative** | `tests/milestone-12-1-negative-tests.ts` | 9 / 9 | **100%** | Zero discrepancy, budget ceiling gate, emergency pause, live FastNEAR RPC state |
| **Production Build** | `npm run build` (`next build`) | 71 / 71 pages | **100%** | Zero TypeScript compilation errors, all routes statically/dynamically optimized |

---

### 7. CERTIFICATION SIGN-OFF

The autonomous planning and task DAG decomposition layer for Milestone 13.2 is certified production-ready. All non-negotiable security requirements have been satisfied:

- **AI proposes. Mandate enforces. The user controls. OutLayer executes.**
- **Zero financial execution or live transaction broadcast occurred during planning.**
- **Integer yoctoNEAR precision maintained across all budget evaluations.**
- **Acyclic DAG validation enforced via Kahn's algorithm with exact cycle path reporting.**
- **Canonical SHA-256 plan fingerprinting binds approvals cryptographically to plan contents.**
- **All 63 automated tests and all regression suites passed with 100% fidelity.**

