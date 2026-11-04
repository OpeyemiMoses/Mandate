# MANDATE — MILESTONE 13.2 ARCHITECTURE DISCOVERY REPORT
## Autonomous Objective Planning & Task DAG Decomposition

**Project:** Mandate  
**Network:** NEAR Testnet ONLY  
**Execution Engine:** OutLayer Intel SGX TEE  
**Date:** 2026-11-04  
**Author:** DeepMind Agentic Assistant & Engineering Team  
**Status:** Approved for Implementation  

---

### 1. EXECUTIVE SUMMARY

Milestone 13.2 establishes the autonomous planning and dependency decomposition layer of the Mandate platform. The core operating principle remains:

> **AI proposes. Mandate enforces. The user controls. OutLayer executes.**

This report documents our discovery of existing repository architecture, identifies reusable components versus missing capabilities, and establishes the blueprint for the planning engine, dependency DAG resolver (Kahn's algorithm), deterministic 5-tier plan validation, canonical SHA-256 plan hashing, and lifecycle integration.

**CRITICAL INVARIANT:** Milestone 13.2 is strictly about planning, decomposition, and validation. Zero live financial transactions or fund reservations occur during this milestone.

---

### 2. AUDIT OF EXISTING PLANNING & COORDINATION ARCHITECTURE

| Component | File Path | Existing Capability | Milestone 13.2 Status & Utilization |
| :--- | :--- | :--- | :--- |
| **DAG Kahn's Algorithm** | `src/lib/coordination/workflowPlanner.ts` | Cycle detection, in-degree calculation, parallel execution level grouping (`validateDAG`) | **REUSE & EXTEND**: Reuse core Kahn algorithm; extract into dedicated `DAGService` supporting detailed cycle path reporting, self-dependency checks, and duplicate edge rejection. |
| **Objective Interpreter** | `src/lib/objectives/interpreter.ts` | Keyword-based category classification, budget extraction, initial structured goal generation | **REUSE & WRAP**: Wrap with `ObjectiveUnderstandingService` to enforce schema normalization, clarification question generation for ambiguous prompts, and server-side sanitization. |
| **Objective Planner** | `src/lib/objectives/planner.ts` | Plan versioning, step generation for procurement/research, step persistence | **REFENDER & HARDEN**: Enhance to support all 5 task types (`RESEARCH`, `ANALYSIS`, `EXECUTION`, `PAYMENT`, `VERIFICATION`), BigInt yoctoNEAR precision, and immutable hashing. |
| **Plan Hashing** | `src/lib/objectives/types.ts` | `computePlanContentHash` (SHA-256 of sorted steps and constraints) | **REUSE & HARDEN**: Ensure inclusion of canonical parameters, capabilities, tools, dependencies, and yoctoNEAR ceilings. |
| **Objective Authority** | `src/lib/objectives/authority.ts` | Mandate validation, active status check, budget ceiling verification | **REUSE**: Integrate as Tier 2 of the 5-tier plan validator. |
| **Objective Lifecycle** | `src/lib/objectives/lifecycleService.ts` | 11-state deterministic state machine with atomic CAS version checks | **REUSE**: Connect lifecycle transitions: `ACTIVE` $\rightarrow$ `PLANNING` $\rightarrow$ `AWAITING_APPROVAL` / `READY`. |
| **Agent Registry** | `src/lib/runtime/registry.ts` | In-memory singleton registry of agent implementations and capabilities | **REUSE**: Used in Tier 3 task capability validation. |
| **Tool Registry** | `src/lib/tools/registry.ts` | In-memory singleton registry of executable tools | **REUSE**: Used in Tier 3 tool validation to prevent hallucinated tools. |
| **Governance Policy** | `src/lib/governance/policyService.ts` | Universal policy evaluation, risk classification | **REUSE**: Used in Tier 4 and Tier 5 security and risk evaluation. |

---

### 3. ARCHITECTURAL GAPS & REQUIRED ENHANCEMENTS

1. **Objective Understanding & Intent Normalization (`ObjectiveUnderstandingService`)**
   - Natural language inputs from users or AI agents can be underspecified, contradictory, or vague.
   - *Requirement:* A deterministic understanding service that either produces a normalized, structured objective definition or issues explicit clarification questions without hallucinating missing details.

2. **Dedicated Task Decomposition & DAG Engine (`ObjectiveDAGService`)**
   - Generalize the task decomposition model to strictly typed categories:
     - `RESEARCH`: Discovering candidate providers, intelligence gathering
     - `ANALYSIS`: Multi-attribute benchmarking, scoring matrices
     - `EXECUTION`: Off-chain workflows, data aggregation
     - `PAYMENT`: Constructing proposed financial envelopes (proposals only)
     - `VERIFICATION`: Verifying deliverables against criteria
   - Kahn's algorithm implementation must reject:
     - Cycles (with cycle path output)
     - Self-dependencies (`A -> A`)
     - Missing / non-existent dependencies
     - Duplicate dependency edges
   - Provide parallel execution level partitioning ($L_0, L_1, \dots$).

3. **Deterministic 5-Tier Plan Validation Service (`ObjectivePlanValidationService`)**
   - *Tier 1 (Objective):* Non-empty deliverables, title, category, success criteria.
   - *Tier 2 (Mandate):* Valid, active, non-expired linked mandate; proposed spending within authorized budget ceiling; recipient allowlist enforcement; BigInt yoctoNEAR accounting.
   - *Tier 3 (Task):* Valid task types; dependencies form valid DAG; capabilities & tools exist in registries; failure handling strategies defined.
   - *Tier 4 (Security):* Anti-tamper verification; prevent privilege escalation; prevent AI agents from bypassing approvals; prevent unvetted recipients or fake tools.
   - *Tier 5 (Risk):* Risk tiering (LOW, MEDIUM, HIGH, CRITICAL); mandatory human approval enforced for HIGH/CRITICAL or financial actions.

4. **Schema Enhancements (`prisma/schema.prisma`)**
   - Add explicit `planHash` column to `ObjectivePlan` for indexing and fast immutability checks.
   - Add `taskType` to `ObjectivePlanStep` (`RESEARCH`, `ANALYSIS`, `EXECUTION`, `PAYMENT`, `VERIFICATION`).
   - Add `amountYocto` / `estimatedCostYocto` to `ObjectivePlan` and `ObjectivePlanStep` for strict BigInt yoctoNEAR storage.

5. **API & UI Layer**
   - Dedicated plan endpoints: `/api/objectives/[id]/plan` (GET, POST), `/validate`, `/approve`, `/reject`, `/replan`, `/graph`.
   - Enhanced UI dashboard showing interactive DAG level visualization, task details, risk assessment, and approval controls.

---

### 4. NON-NEGOTIABLE SAFETY CONSTRAINTS

1. **NO Live Transactions**: No NEAR transfers, RPC broadcasts, or OutLayer TEE signing in Milestone 13.2.
2. **NO Fund Reservations**: Planning only proposes amounts; it does not reserve or lock mandate funds until execution (Milestone 14).
3. **Fail-Closed Validation**: If mandate, policy, or DAG invariants fail, plan validation must reject immediately.
4. **Tenant Isolation**: Objectives, plans, and approvals must enforce user ownership matching `x-near-account` or session identity.
5. **Plan Immutability**: Any edit or replan produces a new plan version and invalidates existing approvals.

