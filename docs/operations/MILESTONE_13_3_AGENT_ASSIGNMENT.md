# MANDATE — MILESTONE 13.3 OPERATIONAL RUNBOOK
## Agent Capability Registry, Deterministic Assignment & Governed Delegation

**Document Version:** 1.0.0  
**Status:** Certified & Verified  
**Network:** NEAR Testnet ONLY  
**Execution Security:** Intel SGX TEE (OutLayer) + ExecutionBoundaryService  
**Zero Live Broadcast Rule:** Fully Observed (Planning & Assignment only — ZERO financial transactions broadcast in M13.3)

---

## 1. EXECUTIVE SUMMARY & CORE PRINCIPLE

Milestone 13.3 builds directly upon the foundational milestones of the Mandate platform:
- **Milestone 12 & 12.1:** Autonomous Spending Lifecycle, Multi-Transaction Execution, and FastNEAR RPC Settlement.
- **Milestone 13.1:** Deterministic Objective Lifecycle (11 states, CAS optimistic locking, audit ledger).
- **Milestone 13.2:** Autonomous Objective Planning, 5 Typed Task Categories, Kahn Topological Sorting, 5-Tier Validation, and Canonical SHA-256 Plan Fingerprinting.

Milestone 13.3 establishes the production-grade **Agent Capability Registry, Deterministic Task Assignment Engine, and Governed Delegation Manager**.

### Core Architecture Principle
> **"AI proposes. Mandate enforces. The user controls. OutLayer executes."**

In accordance with this principle:
1. **AI Agents never define or modify their own capabilities.** Capability profiles can only be registered or amended by authenticated user administrators or deterministic platform policies.
2. **AI Agents never self-authorize financial privileges.** Financial execution capabilities require an active, user-granted spending mandate and an OutLayer-attested signing wallet.
3. **Governed delegation transfers task execution responsibility only.** Delegation strictly **NEVER** transfers wallet custody, signing credentials, or financial mandate authority to the delegatee.
4. **All assignments and leases are cryptographically and deterministically bound** to the objective, plan version, canonical plan hash (`planHash`), capability version, and policy version.

---

## 2. SYSTEM ARCHITECTURE & COMPONENTS

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER / MANDATE DASHBOARD                        │
│            Objectives UI • Assignments Tab • Delegation Modal          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON API
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY / ROUTE LAYER                       │
│  /api/agents/[id]/capabilities  •  /api/objectives/[id]/assign         │
│  /api/agents/[id]/tasks         •  /api/objectives/[id]/assignments    │
│  /api/objectives/[id]/delegate  •  /api/objectives/[id]/eligibility    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┼──────────────────────────────┐
    ▼                               ▼                              ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  CAPABILITY REGISTRY │  │ ELIGIBILITY ENGINE   │  │  ASSIGNMENT ENGINE   │
│                      │  │                      │  │                      │
│ • Tool Verification  │  │ • 11-Point Checklist │  │ • Deterministic Rank │
│ • Financial Gating   │  │ • Structured Verdict │  │ • Load Balancing     │
│ • Version Increment  │  │ • Failure Diagnoses  │  │ • Plan Hash Binding  │
│ • Immutable Audit    │  │ • Policy Evaluation  │  │ • Lease Fencing      │
└──────────┬───────────┘  └──────────┬───────────┘  └──────────┬───────────┘
           │                         │                         │
           └─────────────────────────┼─────────────────────────┘
                                     ▼
                     ┌──────────────────────────────┐
                     │  GOVERNED DELEGATION MANAGER │
                     │                              │
                     │ • 10 Governance Rules        │
                     │ • Active Lease Verification  │
                     │ • Anti-Tamper & Zero Leaks   │
                     │ • Acyclic Cycle Detection    │
                     │ • Delegation Audit Trail     │
                     └───────────────┬──────────────┘
                                     │
                                     ▼
                     ┌──────────────────────────────┐
                     │ PRISMA PERSISTENCE (SQLite)  │
                     │                              │
                     │ • AgentCapabilityProfile     │
                     │ • ObjectiveAssignment        │
                     │ • AgentHandoff               │
                     │ • AuditLog                   │
                     └──────────────────────────────┘
```

---

## 3. AGENT CAPABILITY REGISTRY (`capabilityRegistry.ts`)

The `AgentCapabilityRegistry` provides a centralized, server-controlled catalog of agent competencies, constraints, and financial privileges.

### Database Model (`AgentCapabilityProfile`)
```prisma
model AgentCapabilityProfile {
  id                      String    @id @default(cuid())
  agentId                 String    @unique
  agent                   Agent     @relation(fields: [agentId], references: [id], onDelete: Cascade)
  status                  String    @default("ACTIVE") // ACTIVE, PAUSED, REVOKED
  supportedTaskTypesJson  String    // ["RESEARCH", "ANALYSIS", "VALIDATION", "COORDINATION", "PAYMENT"]
  supportedToolsJson      String    // ["duckduckgo_search", "near_view", "outlayer_transfer", ...]
  maxAuthorizedTaskRisk   String    @default("LOW") // LOW, MEDIUM, HIGH, CRITICAL
  requiresHumanApproval   Boolean   @default(false)
  holdsOutLayerWallet     Boolean   @default(false)
  outlayerWalletAddress   String?
  activeMandateId         String?
  mandateBudgetCapYocto   String?
  mandateSpentYocto       String?   @default("0")
  version                 Int       @default(1)
  lastUpdatedBy           String    // Actor ID (must NOT be an autonomous agent)
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
}
```

### Registry Enforcement Rules
1. **Tool Verification:** Every declared tool in `supportedTools` must exist in the platform `toolRegistry` (`registerDefaultTools()`). Unregistered tools are rejected fail-closed with `UNREGISTERED_TOOL`.
2. **Financial Eligibility Gating:** An agent cannot declare `PAYMENT` capabilities unless it is provisioned with an OutLayer TEE custody wallet and possesses a linked, active spending mandate.
3. **AI Modification Immunity:** Self-modification attempts where `actorRole === 'AGENT'` are immediately rejected with `AGENT_SELF_MODIFICATION_BLOCKED`.
4. **Optimistic Versioning:** Updates increment the profile `version` monotonically.
5. **Dual Audit Logging:** All registration, update, pause, and revoke operations are logged to both the database audit table and the SHA-256 cryptographic audit ledger.

---

## 4. DETERMINISTIC ELIGIBILITY ENGINE (`capabilityValidator.ts`)

The `AgentCapabilityValidator` evaluates whether an agent can safely perform a specific objective plan step across 11 deterministic checks:

| # | Check Name | Description | Failure Verdict |
|---|------------|-------------|-----------------|
| 1 | Agent Existence | Agent must exist in database | `INELIGIBLE` |
| 2 | Active Profile | Agent & Capability Profile must be `ACTIVE` | `CAPABILITY_UNAVAILABLE` |
| 3 | Task Type Match | Step `taskType` must be listed in `supportedTaskTypes` | `CAPABILITY_UNAVAILABLE` |
| 4 | Tool Coverage | All step `requiredTools` must be supported by agent | `CAPABILITY_UNAVAILABLE` |
| 5 | Network Safety | Target network must be `testnet` (NEAR Testnet only) | `POLICY_DENIED` |
| 6 | Financial Authorization | Payment steps require `holdsOutLayerWallet` & active mandate | `POLICY_DENIED` |
| 7 | Budget Ceiling | Step estimated cost must not exceed remaining mandate budget | `POLICY_DENIED` |
| 8 | Recipient Allowlist | Step recipient must be explicitly allowed by linked mandate | `POLICY_DENIED` |
| 9 | Risk Threshold | Step risk level must not exceed `maxAuthorizedTaskRisk` | `REQUIRES_APPROVAL` |
| 10 | Human Approval | High/Critical steps or flagged profiles require human sign-off | `REQUIRES_APPROVAL` |
| 11 | Universal Policy Engine | Dynamic policy rules (`UniversalPolicyEngine`) must permit step | `POLICY_DENIED` |

---

## 5. DETERMINISTIC ASSIGNMENT ENGINE (`assignmentEngine.ts`)

The `TaskAssignmentEngine` maps plan tasks to eligible agents deterministically:

### Ranking and Tie-Breaking Algorithm
When multiple agents qualify for a task:
1. **Explicit Preference:** User-preferred agent declared in step configuration.
2. **Workload Balancing:** Agent with lowest active assigned tasks (`activeAssignmentCount`) is chosen first.
3. **Capability Version:** Higher profile version preferred.
4. **Lexicographical Tie-Breaker:** Alphanumeric sort on `agent.id` guarantees 100% deterministic reproducibility across runs.

### Plan Integrity & Lease Fencing
- **Plan Hash Binding:** Assignments are cryptographically bound to `planHash` computed by `computePlanContentHash()`. If the plan is re-planned or tampered with, assignment is rejected with `STALE_PLAN_HASH`.
- **Cryptographic Lease Tokens:** Each assignment issues a secure monotonic token prefixed with `lease_` (e.g. `lease_3e8f...`), expiring in 30 minutes.

---

## 6. GOVERNED DELEGATION MANAGER (`delegationManager.ts`)

Governed delegation allows an assigned agent to transfer task execution to another agent under strict safety rules:

### The 10 Invariant Delegation Rules
1. **Active Assignment & Lease:** Delegator must hold the currently active lease.
2. **Non-Terminal State:** Completed, failed, or cancelled tasks cannot be delegated.
3. **Tenant Boundary:** Delegator, delegatee, task, and objective must belong to the same tenant.
4. **Target Agent Eligibility:** Delegatee must pass full 11-point capability validation for the task.
5. **No Self-Delegation:** Delegator and delegatee cannot be identical.
6. **Acyclic Chain Detection:** Cycle detection prevents circular ping-pong delegation (e.g., A -> B -> A).
7. **Zero Authority Leakage:** Delegation **NEVER** transfers mandate authority or wallet signing keys.
8. **Plan Integrity:** Plan hash must match current objective plan hash.
9. **Lease Revocation & Reissuance:** Delegator's lease is atomically revoked; new `lease_` token is issued to delegatee.
10. **Handoff & Audit Trail:** Structured `AgentHandoff` record logged with context, rationale, and timestamps.

---

## 7. USER INTERFACE (`src/app/objectives/[id]/page.tsx`)

The Objective Detail page provides complete visibility and operational controls:
- **"Assignments" Tab:** Live dashboard displaying all active task assignments, agent roles, lease status, capability versions, and policy versions.
- **DAG & Sequential Badges:** Step cards display assignment badges indicating assigned agent, role, or unassigned status.
- **Quick Action Buttons:** Direct access on step cards to "Assign", "Eligibility", and "Delegate".
- **"Assign Eligible Agents" Action Bar:** One-click batch assignment executing deterministic allocation across all unassigned plan steps.
- **Governed Delegation Modal:** Interactive dialog enabling governed handoffs with real-time target agent selection, rationale specification, and validation feedback.
- **Agent Eligibility Modal:** Transparent breakdown displaying per-agent capability evaluation and diagnostic pass/fail criteria.

---

## 8. HTTP API SPECIFICATION

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/api/agents/[id]/capabilities` | Retrieve capability profile & tool declarations | Yes |
| `POST` | `/api/agents/[id]/capabilities` | Register or update agent capability profile | Yes (User/Admin) |
| `GET` | `/api/agents/[id]/tasks` | List assigned tasks and active lease status | Yes |
| `POST` | `/api/objectives/[id]/assign` | Assign single step or batch-assign entire plan | Yes |
| `GET` | `/api/objectives/[id]/assignments` | Retrieve all assignments for an objective | Yes |
| `POST` | `/api/objectives/[id]/delegate` | Execute governed delegation / handoff | Yes |
| `GET` | `/api/objectives/[id]/delegate` | Retrieve delegation history and audit trail | Yes |
| `POST` | `/api/objectives/[id]/eligibility` | Query agent eligibility for specific step | Yes |

---

## 9. VERIFICATION & TEST EVIDENCE

The comprehensive automated test suite `tests/milestone-13-3-agent-assignment.ts` was executed against the running dev server and database.

### Test Results Breakdown
```
=================================================================
   MANDATE — MILESTONE 13.3 AGENT ASSIGNMENT & DELEGATION SUITE  
=================================================================

SECTION A: AGENT CAPABILITY REGISTRY
  ✓ PASS: Capability profile initialized with version 1
  ✓ PASS: Capability profile is active by default
  ✓ PASS: Profile includes RESEARCH category
  ✓ PASS: Rejected unregistered tool with descriptive UNREGISTERED_TOOL error
  ✓ PASS: Invalid / unregistered tool strictly rejected
  ✓ PASS: Executor profile verified as financially eligible (holds OutLayer wallet and active mandate)
  ✓ PASS: Executor profile registered with PAYMENT capability
  ✓ PASS: Verifier profile registered
  ✓ PASS: AI Agent self-modification strictly blocked by boundary
  ✓ PASS: Agents forbidden from self-declaring capabilities
  ✓ PASS: Capability profile version atomically incremented to 2 on update
  ✓ PASS: Agent capability profile status updated to PAUSED
  ✓ PASS: Suspended agent profile retrieved as PAUSED

SECTION B: DETERMINISTIC ELIGIBILITY ENGINE
  ✓ PASS: Research Specialist is ELIGIBLE for Research Task
  ✓ PASS: Verdict is ELIGIBLE
  ✓ PASS: Research Specialist is INELIGIBLE for Payment Task
  ✓ PASS: Verdict is CAPABILITY_UNAVAILABLE / INELIGIBLE for category mismatch
  ✓ PASS: Includes task type failure reason
  ✓ PASS: Includes missing tool failure reason
  ✓ PASS: Executor Specialist is ELIGIBLE for Payment Task
  ✓ PASS: Suspended agent is INELIGIBLE
  ✓ PASS: Reason flags inactive/suspended agent status
  ✓ PASS: Non-testnet network task is rejected
  ✓ PASS: Policy denies non-testnet network execution

SECTION C: DETERMINISTIC ASSIGNMENT ENGINE & RANKING
  ✓ PASS: Task 1 deterministically assigned to eligible agent
  ✓ PASS: Research task assigned to Research Specialist
  ✓ PASS: Cryptographic lease token generated
  ✓ PASS: Lease expiration set in the future
  ✓ PASS: Assignment cryptographically bound to planHash
  ✓ PASS: Extra research task assigned successfully
  ✓ PASS: Load-balancing correctly picked agent A5 with lowest active assignment count (0 vs 1)
  ✓ PASS: Payment task correctly assigned to Executor A2
  ✓ PASS: Batch assignment executed
  ✓ PASS: All tasks in objective plan assigned
  ✓ PASS: Stale plan hash rejected with integrity error
  ✓ PASS: Assignment strictly rejects stale plan hash

SECTION D: GOVERNED DELEGATION & HANDOFFS
  ✓ PASS: Governed delegation completed successfully
  ✓ PASS: New assignment belongs to delegatee agent A5
  ✓ PASS: Agent handoff record created with COMPLETED status
  ✓ PASS: Delegation of task DID NOT transfer any wallet authority to agent A5
  ✓ PASS: Rejected delegation from agent not holding active lease
  ✓ PASS: Unauthorized delegation strictly rejected
  ✓ PASS: Rejected self-delegation
  ✓ PASS: Self-delegation strictly rejected
  ✓ PASS: Rejected delegation to ineligible agent
  ✓ PASS: Delegation to ineligible agent strictly rejected
  ✓ PASS: Rejected circular delegation ping-pong
  ✓ PASS: Circular delegation cycle strictly prevented
  ✓ PASS: Objective delegation audit history recorded all handoffs

SECTION E: SECURITY, BOUNDARIES & CONCURRENCY
  ✓ PASS: Cross-tenant objective assignment blocked
  ✓ PASS: Tenant B cannot assign tasks on Tenant A objective
  ✓ PASS: Cross-tenant delegation to external agent blocked
  ✓ PASS: Cross-tenant delegation strictly blocked
  ✓ PASS: Assignment on cancelled objective blocked
  ✓ PASS: Assignment strictly prohibited on cancelled objectives
  ✓ PASS: Retrieved assigned tasks for agent
  ✓ PASS: Lease token has strong entropy
  ✓ PASS: Active assignment lease verified

SECTION F: HTTP API ENDPOINTS VERIFICATION
  ✓ PASS: GET /api/agents/[id]/capabilities returned 200 OK
  ✓ PASS: Response success is true
  ✓ PASS: Response contains capability profile
  ✓ PASS: POST /api/agents/[id]/capabilities returned 200 OK
  ✓ PASS: Capability profile version incremented via API
  ✓ PASS: GET /api/agents/[id]/tasks returned 200 OK
  ✓ PASS: Returned task list for agent
  ✓ PASS: POST /api/objectives/[id]/eligibility returned 200 OK
  ✓ PASS: Eligibility check succeeded
  ✓ PASS: Returned eligibility evaluations for all user agents
  ✓ PASS: API reports Executor A2 as eligible for payment task
  ✓ PASS: GET /api/objectives/[id]/assignments returned 200 OK
  ✓ PASS: Returns active assignments list
  ✓ PASS: POST /api/objectives/[id]/assign returned 200 OK
  ✓ PASS: Single task assign returned success
  ✓ PASS: POST /api/objectives/[id]/delegate returned 200 OK
  ✓ PASS: Governed delegation succeeded via API
  ✓ PASS: GET /api/objectives/[id]/delegate returned 200 OK
  ✓ PASS: Returned delegation history list
  ✓ PASS: Cross-tenant objective access returns 404 Not Found or 403 Forbidden

=================================================================
   TEST RESULTS: 78 PASSED / 0 FAILED (100%)
=================================================================
```

### Zero Regressions Across Historical Milestones
- **Milestone 13.2 (Planning & DAG Decomposition):** 63 / 63 passed (100%)
- **Milestone 13.1 (Objective Lifecycle & CAS Locking):** 33 / 33 passed (100%)
- **Milestone 12 (Autonomous Spending Lifecycle):** 54 / 54 passed (100%)
- **Milestone 12.1 (Multi-Transaction Negative Security & RPC Reconciliation):** 9 / 9 passed (100%)
- **TypeScript (`npx tsc --noEmit`):** 0 errors
- **Production Build (`next build`):** 71 static & dynamic routes compiled cleanly

