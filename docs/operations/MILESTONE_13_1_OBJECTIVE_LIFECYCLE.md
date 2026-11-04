# MANDATE — MILESTONE 13.1
## OBJECTIVE LIFECYCLE, OWNERSHIP & EXECUTION FOUNDATION REPORT

**Project:** Mandate  
**Milestone:** 13.1 — Objective Lifecycle, Ownership & Execution Foundation  
**Execution Date:** November 3, 2026  
**Status:** **100% COMPLETE & CERTIFIED**  
**Core Architectural Principle:** *AI proposes. Mandate enforces. The user controls. OutLayer executes.*

---

## 1. ARCHITECTURE DISCOVERY & REUSE SUMMARY

Milestone 13.1 evaluated all pre-existing subsystems across the Mandate codebase to establish a production-grade foundation for autonomous objective planning, decomposition, and execution without duplicating or replacing functioning systems:

- **Reused Components:**
  - `ExecutionBoundaryService` (`src/lib/execution/boundaryService.ts`): Preserved OutLayer Intel SGX hardware enclave execution, authorization envelopes, and FastNEAR Testnet settlement.
  - `MandateAccountingService` (`src/lib/mandate/accountingService.ts`): Preserved strict 128-bit integer yoctoNEAR accounting, atomic CAS reservations, and available budget invariants (`Total == Spent + Reserved + Available`).
  - `PolicyEngine` (`src/lib/policy.ts`): Preserved deterministic, non-LLM policy evaluation and compliance verification.
  - `Objective Interpreter` (`src/lib/objectives/interpreter.ts`): Reused natural language prompt decomposition and capability requirement extraction.
  - `Success Criteria Evaluator` (`src/lib/objectives/criteriaEvaluator.ts`): Reused multi-modal outcome verification (`NUMERIC`, `BOOLEAN`, `ON_CHAIN_VERIFICATION`, `TOOL_RESULT`).
  - `Audit Ledger` (`src/lib/auditLedger.ts`): Reused tamper-evident SHA-256 cryptographic audit hash chains.
- **Identified Gaps Addressed:**
  - Lack of atomic CAS versioning on `Objective` records leading to concurrency race conditions.
  - Missing deterministic server-side lifecycle state machine across the mandated 11 states.
  - Permissive agent actions that could bypass user ownership boundaries.
  - Weak coupling between objective budget limits and mandate authority.

---

## 2. FILES CREATED AND MODIFIED

### Created Files:
1. `src/lib/objectives/lifecycleService.ts`: Core deterministic state machine service implementing atomic CAS transitions, agent boundaries, mandate authority validation, and dual-dispatch cryptographic audit logging.
2. `src/app/api/objectives/[id]/activate/route.ts`: Dedicated REST endpoint to activate objectives from `DRAFT` state with tenant authorization and mandate validation.
3. `tests/milestone-13-1-objective-lifecycle.ts`: Comprehensive test suite verifying 33 assertions covering all valid transitions, invalid transitions, CAS concurrency, stale versions, cross-tenant isolation, agent boundaries, mandate mismatches, and regressions.
4. `docs/operations/MILESTONE_13_1_ARCHITECTURE_DISCOVERY.md`: Initial architectural discovery report.
5. `docs/operations/MILESTONE_13_1_OBJECTIVE_LIFECYCLE.md`: Full milestone operational documentation.

### Modified Files:
1. `prisma/schema.prisma`:
   - Added `version Int @default(1)` to `Objective` for optimistic concurrency control.
   - Added `planningStatus`, `executionStatus`, `completionEvidenceJson`, `failureReason`, and `deadlineAt` to `Objective`.
   - Added `actorId`, `actorRole`, `fromStatus`, `toStatus`, `reason`, and `version` to `ObjectiveEvent`.
2. `src/lib/objectives/types.ts`:
   - Updated `ObjectiveStatus` to support the full 11-state enum plus legacy aliases.
   - Defined `VALID_OBJECTIVE_TRANSITIONS` transition table.
   - Added `ActorRole`, `ObjectiveConstraints` with `maxBudgetYocto` and `deadlineAt`, and lifecycle transition types.
3. `src/lib/objectives/authority.ts`:
   - Enhanced `validateObjectiveAuthority` to support exact integer string `maxBudgetYocto`.
   - Added budget exhaustion and expiration checks.
   - Added `assertObjectiveMandateValid` helper function.
4. `src/lib/objectives/index.ts`:
   - Exported `ObjectiveLifecycleService`.
5. `src/lib/objectives/executor.ts`:
   - Delegated `pauseObjective`, `resumeObjective`, and `cancelObjective` directly to `ObjectiveLifecycleService`.
   - Mapped unmet criteria verification to `REQUIRES_INTERVENTION`.
6. `src/app/api/objectives/route.ts`:
   - Mandate authority validation on creation.
   - Ensured initial state is strictly `DRAFT`.
   - Exposed `version`, `planningStatus`, `executionStatus`, and `deadlineAt`.
7. `src/app/api/objectives/[id]/route.ts`:
   - Routed status mutations through `ObjectiveLifecycleService.transitionStatus`.
   - Added mandate re-validation when editing constraints.
   - Enforced 404 masking on unauthorized cross-tenant requests.
8. `src/app/api/objectives/[id]/pause/route.ts`:
   - Routed through `ObjectiveLifecycleService.pauseObjective`.
9. `src/app/api/objectives/[id]/resume/route.ts`:
   - Routed through `ObjectiveLifecycleService.resumeObjective`.
10. `src/app/api/objectives/[id]/cancel/route.ts`:
    - Routed through `ObjectiveLifecycleService.cancelObjective`.
11. `src/app/api/objectives/[id]/events/route.ts`:
    - Returned transition metadata (`actorId`, `actorRole`, `fromStatus`, `toStatus`, `reason`, `version`).
12. `src/app/objectives/page.tsx`:
    - Updated UI to display all 11 lifecycle state badges with minimalist black/red aesthetic.
    - Added inline interactive lifecycle controls (Activate, Pause, Resume, Cancel).
13. `src/app/objectives/[id]/page.tsx`:
    - Updated action bar with Activate and Cancel buttons.
    - Added deadline and version display.
14. `tsconfig.json`:
    - Excluded standalone test scripts from web application Next.js build.

---

## 3. PRISMA SCHEMA CHANGES

```prisma
model Objective {
  id                    String                    @id @default(cuid())
  userId                String                    // Owner ID
  user                  User                      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title                 String
  description           String?
  originalPrompt        String
  structuredGoalJson    String?
  category              String                    @default("CUSTOM")
  status                String                    @default("DRAFT") // 11 Lifecycle States
  priority              String                    @default("MEDIUM")
  version               Int                       @default(1) // Optimistic CAS concurrency version
  
  mandateId             String?
  mandate               Mandate?                  @relation(fields: [mandateId], references: [id], onDelete: SetNull)
  
  planningStatus        String                    @default("UNPLANNED") // UNPLANNED, PLANNING, PLANNED, FAILED
  executionStatus       String                    @default("NOT_STARTED") // NOT_STARTED, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED
  completionEvidenceJson String                   @default("{}")
  failureReason         String?
  deadlineAt            DateTime?

  assignedAgentsJson    String                    @default("[]")
  constraintsJson       String                    @default("{}")
  metadataJson          String                    @default("{}")
  progressPercent       Int                       @default(0)
  
  startedAt             DateTime?
  completedAt           DateTime?
  lastEvaluatedAt       DateTime?
  createdAt             DateTime                  @default(now())
  updatedAt             DateTime                  @updatedAt
  ...
}

model ObjectiveEvent {
  id           String     @id @default(cuid())
  objectiveId  String
  objective    Objective  @relation(fields: [objectiveId], references: [id], onDelete: Cascade)
  eventType    String
  actorId      String?
  actorRole    String?    // USER, AGENT, SYSTEM, OPERATOR
  fromStatus   String?
  toStatus     String?
  reason       String?
  version      Int?
  metadataJson String     @default("{}")
  auditLogId   String?
  timestamp    DateTime   @default(now())

  @@index([objectiveId, timestamp])
}
```

---

## 4. DETERMINISTIC LIFECYCLE TRANSITION TABLE

The server-side state machine strictly enforces permitted transitions:

| State | Permitted Transitions | Forbidden Transitions | Agent Allowed? |
| :--- | :--- | :--- | :---: |
| **DRAFT** | `ACTIVE`, `CANCELLED` | Direct jump to `RUNNING`, `COMPLETED`, `PAUSED` | User Only (Activation & Cancellation) |
| **ACTIVE** | `PLANNING`, `PAUSED`, `CANCELLED` | `COMPLETED`, `DRAFT`, `READY` | Agent can initiate `PLANNING` |
| **PLANNING** | `READY`, `AWAITING_APPROVAL`, `FAILED`, `PAUSED`, `CANCELLED` | `ACTIVE`, `COMPLETED`, `RUNNING` | Agent can propose `READY` or `AWAITING_APPROVAL` |
| **AWAITING_APPROVAL** | `READY`, `PLANNING`, `CANCELLED`, `PAUSED` | `RUNNING`, `COMPLETED`, `ACTIVE` | User Only (Approval or Cancellation) |
| **READY** | `RUNNING`, `PAUSED`, `CANCELLED` | `DRAFT`, `COMPLETED` | Agent can trigger task dispatch |
| **RUNNING** | `COMPLETED`, `REQUIRES_INTERVENTION`, `FAILED`, `PAUSED`, `CANCELLED` | `DRAFT`, `ACTIVE`, `READY` | Agent reports success or anomalies |
| **REQUIRES_INTERVENTION** | `RUNNING`, `PAUSED`, `FAILED`, `CANCELLED` | `COMPLETED`, `ACTIVE`, `DRAFT` | User/Operator Only |
| **PAUSED** | `ACTIVE`, `PLANNING`, `READY`, `RUNNING`, `REQUIRES_INTERVENTION`, `CANCELLED` | `COMPLETED` | User/Operator Only |
| **COMPLETED** | **None (Terminal)** | All transitions rejected | Immutable |
| **FAILED** | **None (Terminal)** | All transitions rejected | Immutable |
| **CANCELLED** | **None (Terminal)** | All transitions rejected | Immutable |

---

## 5. MANDATE BINDING & ACCOUNTING INVARIANTS

Milestone 13.1 strictly enforces that:

1. **No Separate Objective Balance:** Objectives never introduce synthetic token balances or separate ledgers.
2. **Authority Validation:** Every financially actionable objective must bind an `ACTIVE`, unexpired mandate owned by the authenticated tenant.
3. **Budget Caps:** An objective's requested budget (`maxBudgetYocto`) cannot exceed the unreserved available budget of the linked mandate.
4. **Mandate Budget Expansion Blocked:** An objective cannot expand or alter the mandate's total budget.
5. **Inherited Spending Restrictions:** All future tasks decompose under the mandate's immutable per-transaction limits and recipient allowlists.
6. **Milestone 12 Accounting Preservation:** The core invariant is continuously maintained:
   $$\text{Mandate Total Budget} = \text{Confirmed Spent} + \text{Active Reserved} + \text{Available Budget}$$

---

## 6. TENANT SECURITY & AUTHORIZATION

- **Session-Derived Identity:** All endpoints extract the tenant identity via `getAuthenticatedUser(req)`. Client-supplied user identifiers are ignored.
- **Object-Level Authorization:** Queries strictly filter by `where: { id: objectiveId, userId: user.id }`.
- **404 Masking:** Any cross-tenant access attempt (retrieval, update, activation, cancellation) returns `HTTP 404: Objective not found or unauthorized` to prevent ID enumeration.
- **Agent Sandbox Scoping:** AI agents (`actorRole === "AGENT"`) are prohibited from executing user-only transitions (`DRAFT->ACTIVE`, `CANCELLED`, `PAUSED->ACTIVE`, `REQUIRES_INTERVENTION->RUNNING`).

---

## 7. TEST EVIDENCE & EXACT ARITHMETIC

The Milestone 13.1 test suite (`tests/milestone-13-1-objective-lifecycle.ts`) ran and verified **33 out of 33 assertions passed (100%)**:

```
=================================================================
   MANDATE — MILESTONE 13.1 OBJECTIVE LIFECYCLE VERIFICATION     
=================================================================

--- 1. VALID LIFECYCLE TRANSITIONS ---
  ✓ PASS: 1a: DRAFT -> ACTIVE successful with version increment
  ✓ PASS: 1b: ACTIVE -> PLANNING successful with version increment
  ✓ PASS: 1c: PLANNING -> READY successful
  ✓ PASS: 1d: READY -> RUNNING successful
  ✓ PASS: 1e: RUNNING -> COMPLETED successful (Terminal)
  ✓ PASS: 1f: ACTIVE -> PAUSED successful
  ✓ PASS: 1g: PAUSED -> ACTIVE resume successful
  ✓ PASS: 1h: RUNNING -> REQUIRES_INTERVENTION successful
  ✓ PASS: 1i: REQUIRES_INTERVENTION -> RUNNING resolution successful

--- 2. INVALID LIFECYCLE TRANSITIONS ---
  ✓ PASS: 2a: DRAFT -> RUNNING illegal transition strictly rejected
  ✓ PASS: 2b: DRAFT -> COMPLETED illegal transition strictly rejected
  ✓ PASS: 2c: COMPLETED -> ACTIVE terminal state mutation strictly rejected
  ✓ PASS: 2d: READY -> DRAFT illegal backward transition rejected

--- 3. CONCURRENT TRANSITION ATTEMPTS (CAS OPTIMISTIC LOCKING) ---
  ✓ PASS: 3a: Exactly one concurrent update succeeded, second failed
  ✓ PASS: 3b: Concurrent failure threw CONCURRENCY_CONFLICT

--- 4. STALE OBJECTIVE VERSION REJECTION ---
  ✓ PASS: 4a: Update with stale expectedVersion strictly rejected fail-closed

--- 5. CROSS-TENANT ACCESS MASKING (HTTP 404) ---
  ✓ PASS: 5a: Cross-tenant objective retrieval masked with OBJECTIVE_NOT_FOUND (404)
  ✓ PASS: 5b: Cross-tenant objective transition attempt masked with OBJECTIVE_NOT_FOUND (404)

--- 6. UNAUTHORIZED AGENT OPERATIONS ---
  ✓ PASS: 6a: Agent cannot override user-only DRAFT -> ACTIVE activation
  ✓ PASS: 6b: Agent cannot cancel objective (user-only command)

--- 7. EXPIRED & REVOKED MANDATES BINDING REJECTION ---
  ✓ PASS: 7a: Activating objective with EXPIRED mandate strictly rejected fail-closed
  ✓ PASS: 7b: Activating objective with REVOKED mandate strictly rejected fail-closed

--- 8. OBJECTIVE / MANDATE CONSTRAINT MISMATCHES ---
  ✓ PASS: 8a: Objective requesting budget exceeding mandate capacity strictly rejected

--- 9. CANCELLATION DURING ACTIVE WORK ---
  ✓ PASS: 9a: Objective cancelled from RUNNING state
  ✓ PASS: 9b: Execution status updated to CANCELLED

--- 10. AUDIT EVENT INTEGRITY ---
  ✓ PASS: 10a: Recorded 5 chronological ObjectiveEvent records for obj1
  ✓ PASS: 10b: Every event records actorId and actorRole
  ✓ PASS: 10c: Explicit fromStatus and toStatus tracked on event records
  ✓ PASS: 10d: Dual-dispatched 11 events to cryptographic audit ledger

--- 11. REGRESSION: M1–M12 INVARIANTS & OPERATIONAL STATE ---
  ✓ PASS: 11a: Milestone 12.1 campaign mandate accounting remains 100% BALANCED
  ✓ PASS: 11b: Milestone 12.1 confirmed spent intact: 0.003 NEAR
  ✓ PASS: 11c: Milestone 12.1 available budget intact: 0.007 NEAR
  ✓ PASS: 11d: Platform operational mode remains NORMAL (NORMAL)

=================================================================
   TOTAL TESTS: 33 | PASSED: 33 | FAILED: 0
=================================================================
```

### Regression Verification:
- **Milestone 12 Test Suite:** **54 / 54 PASSED (100%)**
- **Milestone 12.1 Negative Test Suite:** **9 / 9 PASSED (100%)**
- **Production Build (`next build`):** **CLEAN EXIT (71/71 static/dynamic pages compiled)**

---

## 8. KNOWN LIMITATIONS

1. **Static Task DAG Decomposition:** Milestone 13.1 establishes the objective lifecycle foundation. Autonomous multi-agent DAG task decomposition and live scheduling will be activated in Milestone 13.2.
2. **Interactive Plan Approval UI:** The approval flow currently operates via API and modal actions; detailed step-by-step diff review will be enhanced in Milestone 13.2.

---

## 9. RECOMMENDATION FOR MILESTONE 13.2

**Recommendation:** **GO FOR MILESTONE 13.2**

The objective lifecycle foundation is fully certified, atomic versioning is active, mandate authority is enforced fail-closed, and all regression suites pass 100%. The system is ready to proceed to Milestone 13.2 (Autonomous Objective Planning & Task Decomposition).

