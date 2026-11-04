# MANDATE — MILESTONE 13.3 ARCHITECTURE DISCOVERY REPORT
## Agent Capability Registry, Deterministic Assignment & Governed Delegation

**Project:** Mandate  
**Network:** NEAR Testnet ONLY  
**Architecture:** NEAR Protocol + OutLayer Intel SGX TEE  
**Date:** 2026-11-04  
**Author:** DeepMind Agentic Assistant & Engineering Team  
**Status:** Approved for Implementation  

---

### 1. EXECUTIVE SUMMARY

Milestone 13.3 builds upon the validated task DAGs and immutable plan fingerprints established in Milestone 13.2. Its purpose is to transition from:

> **"We have an approved, dependency-ordered plan of typed tasks."**

To:

> **"Each approved task is deterministically assigned to a verified, capable, and authorized specialist agent under strict tenant isolation, immutable lease fencing, and governed delegation."**

Core Operating Principle:
> **AI proposes. Mandate enforces. The user controls. OutLayer executes.**

---

### 2. AUDIT OF EXISTING SYSTEM INFRASTRUCTURE

| Component | File Location | Existing Capability | Milestone 13.3 Reuse & Extension Strategy |
| :--- | :--- | :--- | :--- |
| **Agent Model** | `prisma/schema.prisma` | Defines `Agent`, `type`, `version`, `status`, `userId`, `Wallet` relation | **REUSE & EXTEND**: Utilize database `Agent` model; add server-validated capability metadata/versioning. |
| **Agent Runtime Registry** | `src/lib/runtime/registry.ts` | In-memory `agentRegistry` registering `UniversalAgent` adapters and capabilities | **REUSE**: Source of truth for built-in capability definitions (`procurement`, `treasury`, `operations`, `auditor`). |
| **Tool Registry** | `src/lib/tools/registry.ts` | Central catalog of tools (`duckduckgo_search`, `near_rpc_reader`, etc.) | **REUSE**: Used in Tier 2 capability validation to ensure agent capability profiles only claim real, registered tools. |
| **Agent Selector** | `src/lib/objectives/agentSelector.ts` | Initial capability scoring & heuristic matching | **REPLACE / UPGRADE**: Replace heuristic scoring with deterministic `AgentCapabilityValidator` and `TaskAssignmentEngine`. |
| **Task Models** | `prisma/schema.prisma` | `ObjectivePlanStep` (Milestone 13.2) & `CoordinationTask` | **REUSE**: `ObjectivePlanStep` holds plan task definitions; `AgentAssignment` binds to tasks. |
| **Agent Handoffs** | `src/lib/coordination/handoffManager.ts` | Inter-agent structured handoff with payload validation | **REUSE & HARDEN**: Extend with strict delegation governance (no authority escalation, no self-delegation, cycle prevention). |
| **Lease Manager** | `src/lib/coordination/leaseManager.ts` | Monotonic database lease fencing with TTL and recovery | **REUSE**: Enforce exclusive single-agent assignment claims and worker fencing. |
| **Policy Engine** | `src/lib/governance/engine.ts` | Deterministic evaluation of permissions, operations, and risk | **REUSE**: Wire into eligibility checks (`PolicyEngine.evaluate`) to enforce governance. |
| **Objective State Machine** | `src/lib/objectives/lifecycleService.ts` | 11-state CAS lifecycle (`PLANNING`, `AWAITING_APPROVAL`, `READY`, etc.) | **REUSE**: Task assignment operates strictly on approved plans of `READY` objectives. Re-planning invalidates assignments. |

---

### 3. ARCHITECTURAL GAPS & REQUIRED IMPLEMENTATIONS

1. **Agent Capability Registry (`AgentCapabilityRegistry`)**
   - *Existing:* Static in-memory capabilities on `UniversalAgent` classes; no persisted, tenant-isolated capability profile.
   - *Requirement:* A centralized capability registry that maintains verified agent profiles (`supportedTaskTypes`, `supportedTools`, `supportedIntegrations`, `supportedNetworks`, `financialEligibility`, `maxAuthorizedTaskRisk`, `capabilityVersion`).
   - *Security Rule:* Server-controlled only. AI agents cannot self-declare or modify capabilities.

2. **Deterministic Capability Validation Engine (`AgentCapabilityValidator`)**
   - *Existing:* Basic capability matching in `agentSelector.ts`.
   - *Requirement:* A deterministic 11-criteria validator returning structured results (`ELIGIBLE`, `INELIGIBLE`, `REQUIRES_APPROVAL`, `CAPABILITY_UNAVAILABLE`, `POLICY_DENIED`) with machine-readable diagnostic reasons.

3. **Deterministic Task Assignment Engine (`TaskAssignmentEngine`)**
   - *Existing:* Direct creation of assignments in `workflowPlanner.ts` without load awareness or tie-breaking rules.
   - *Requirement:* A deterministic assignment engine that assigns approved tasks to eligible agents using a transparent ranking strategy:
     1. Explicit task assignment request (if eligible).
     2. Lowest active assignment load (load balancing).
     3. Highest capability version / matching capability count.
     4. Deterministic alphanumeric `agent.id` ascending tie-breaker.

4. **Plan & Assignment Integrity Binding**
   - *Requirement:* Assignments must bind to `objectiveId`, `objectiveVersion`, `planVersion`, `planHash`, `taskId`, `agentId`, `capabilityVersion`, `policyVersion`.
   - *Rule:* If the approved plan is revised or superseded, affected assignments are invalidated immediately.

5. **Governed Delegation Protocol (`GovernedDelegationManager`)**
   - *Existing:* `HandoffManager` supports message handoffs.
   - *Requirement:* Governed delegation that transfers task execution responsibility between agents under strict security rules:
     - Must stay within the same objective.
     - Cannot expand spending authority or create new financial permissions.
     - Delegated agent must independently pass 11-point capability validation.
     - Rejection of self-delegation and cyclic delegation ($A \rightarrow B \rightarrow A$).

6. **Lease Fencing & Assignment Concurrency**
   - *Requirement:* Monotonic database leases prevent race conditions, duplicate claims, and concurrent assignment corruption.

---

### 4. NON-NEGOTIABLE SAFETY CONSTRAINTS

1. **Zero Financial Dispatch**: No NEAR transfers, signing requests, or OutLayer TEE broadcasts during Milestone 13.3.
2. **Anti-Escalation**: An agent capability profile does not grant spending authority. Spending authority originates solely from user-owned, active mandates via `ExecutionBoundaryService`.
3. **Fail-Closed Validation**: If capability, tool, network, or policy checks fail, assignment is strictly rejected.
4. **Tenant Isolation**: All registry lookups, assignments, and delegations are tenant-scoped (`userId`). Cross-tenant operations return `404 Not Found` or `UNAUTHORIZED`.
5. **No Self-Declared Capabilities**: AI models cannot mutate capability profiles.

