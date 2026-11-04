# MANDATE — MILESTONE 13.9
## Complete Security Architecture Audit

**Milestone:** 13.9  
**Architecture:** NEAR Protocol + OutLayer Intel SGX TEE  
**Database:** PostgreSQL 18.6 (`mandate_prod`)  
**Network:** NEAR Testnet ONLY  
**Execution Boundary:** `ExecutionBoundaryService` + OutLayer TEE  
**Audit Standard:** Zero-Trust, Fail-Closed, Production Hardening  

---

### CORE PRINCIPLE
**AI proposes. Mandate enforces. The user controls. OutLayer executes.**  
*An autonomous agent must never gain more authority than the user explicitly granted it.*

---

## 1. COMPREHENSIVE ARCHITECTURAL TRACE

### 1.1 Complete Financial Execution Path
The end-to-end financial execution path across Mandate is strictly traced below:

```
[User Explicit Authorization / Mandate Creation]
                    │
                    ▼
[Mandate Lifecycle & Policy Validation]
(Status == ACTIVE, Not Expired, Within Budget, Recipient in Allowlist)
                    │
                    ▼
[Deterministic Governance Policy Evaluation]
(PolicyEngine.evaluate -> ALLOW, REQUIRE_APPROVAL, or DENY)
                    │
                    ├─────────[REQUIRE_APPROVAL]────────┐
                    │                                   ▼
                    │                   [Human-in-the-Loop Approval]
                    │                   (validateApprovalIntegrity)
                    │                   (One-Time Atomic Consumption)
                    │                                   │
                    ▼◄──────────────────────────────────┘
[Pre-Execution Atomic CAS Budget Reservation]
(reserveMandateBudgetAtomic via PostgreSQL CAS policyVersion)
                    │
                    ▼
[Issue Cryptographic Execution Authorization Envelope]
(ExecutionAuthorizationService: SHA-256 Canonical HMAC + Nonce)
                    │
                    ▼
[Pre-Dispatch Fencing & Monotonic Lease Check]
(BackgroundJob leaseGeneration verification against stale workers)
                    │
                    ▼
[Durable Dispatch Intent Record]
(DispatchIntent upsert: status DISPATCHED)
                    │
                    ▼
[Centralized Execution Boundary Gateway]
(ExecutionBoundaryService -> OutLayer Intel SGX TEE)
                    │
                    ▼
[NEAR Testnet Broadcast & Settlement]
(OutLayer TEE Signs & Broadcasts -> txHash captured)
                    │
                    ▼
[Authoritative NEAR RPC Finality Verification]
(verifyNearTransaction -> Finality & Gas/Token burn verified)
                    │
                    ▼
[Atomic CAS Financial Settlement]
(settleMandateBudgetAtomic: converts reserved balance to spent)
                    │
                    ▼
[Independent Reconciliation & Cryptographic Audit Ledger]
(recordAuditEvent -> SHA-256 hash-chain tamper-proof log)
```

---

## 2. AUDIT FINDINGS REGISTER

| Finding ID | Component | Severity | Title | Status |
|---|---|---|---|---|
| **SEC-001** | `ApprovalManager` & `BoundaryService` | **HIGH** | Approval Request Replay / Lack of Atomic One-Time Consumption | Remediated |
| **SEC-002** | Legacy Routes & `NearIntegrationAdapter` | **CRITICAL** | Direct OutLayer Provider Access Bypassing Boundary | Remediated |
| **SEC-003** | `ExecutionAuthorizationService` | **MEDIUM** | Nonce Atomic Consumption Return Value Unchecked | Remediated |
| **SEC-004** | `wallets/withdraw/route.ts` | **MEDIUM** | Missing Operational Control Plane Gate on Withdrawals | Remediated |
| **SEC-005** | `ObjectiveAuthority` | **LOW** | In-Memory Mutex Boundary Scope across Multi-Node Clusters | Remediated |

---

### Detailed Finding SEC-001
- **Finding ID:** `SEC-001`
- **Affected Component:** `src/lib/governance/approvalManager.ts`, `src/lib/execution/boundaryService.ts`, `src/app/api/approvals/route.ts`
- **Severity:** `HIGH`
- **Attack Scenario:** An agent or malicious actor intercepts an approved `approvalId`. After the approved execution completes, the attacker submits a second transaction request using the same `approvalId` with a different `idempotencyKey`. Because `approval.status` was never updated to a terminal `CONSUMED` state, `validateApprovalIntegrity` evaluated the approval as valid, resulting in duplicate financial authorization.
- **Existing Protection:** Nonce uniqueness on the issued envelope prevented replaying the exact same envelope, and `idempotencyKey` prevented exact duplicate requests, but re-submitting with a new idempotency key bypassed idempotency.
- **Remediation Required:**
  1. Add atomic consumption semantics to `ApprovalRequest`: when an approval is verified and accepted by `ExecutionBoundaryService`, atomically update `status = "CONSUMED"`, set `executionId`, and set `decidedAt`.
  2. In `validateApprovalIntegrity`, immediately reject any approval whose status is not `APPROVED` (specifically rejecting `CONSUMED`, `REJECTED`, `REVOKED`, `TIMED_OUT`).
  3. Ensure that if execution fails or is cancelled, the approval cannot be reused without explicit re-authorization.
- **Verification Test:** Adversarial test submitting the same `approvalId` across two separate execution requests; the second request must fail closed with `APPROVAL_ALREADY_CONSUMED`.

---

### Detailed Finding SEC-002
- **Finding ID:** `SEC-002`
- **Affected Component:** `src/lib/outlayer.ts`, `src/lib/integrations/adapters/nearAdapter.ts`, `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts`, `src/lib/agent/procurementAgent.ts`
- **Severity:** `CRITICAL`
- **Attack Scenario:** Direct invocation of `executeOutlayerTransfer` from legacy task endpoints or integration adapters (`NearIntegrationAdapter.execute("execute_custody_transfer")`) without passing through `ExecutionBoundaryService.execute()`. This bypasses cryptographic HMAC envelopes, preflight validation, governance policy, atomic CAS reservations, and monotonic lease fencing.
- **Existing Protection:** `ExecutionBoundaryService` existed and was used for modern execution paths, but legacy routes from Milestones 1–5 retained direct imports of `executeOutlayerTransfer`.
- **Remediation Required:**
  1. Guard `executeOutlayerTransfer` in `src/lib/outlayer.ts` with an authorized boundary caller check: require `authorizedBoundaryContext: true` or verify that execution originates exclusively from `ExecutionBoundaryService`. Direct calls must immediately throw `UNAUTHORIZED_EXECUTION_BOUNDARY_BYPASS`.
  2. Refactor legacy endpoints (`/api/tasks`, `/api/tasks/[id]`, `procurementAgent.ts`) to delegate to `ExecutionBoundaryService.execute()`.
  3. Refactor `NearIntegrationAdapter` so that financial custody transfers require `ExecutionBoundaryService.execute()`, failing closed otherwise.
- **Verification Test:** Direct invocation test calling `executeOutlayerTransfer` from an external module or untrusted context; assert that `UNAUTHORIZED_EXECUTION_BOUNDARY_BYPASS` is thrown.

---

### Detailed Finding SEC-003
- **Finding ID:** `SEC-003`
- **Affected Component:** `src/lib/execution/authorizationService.ts` (`consumeNonce`) & `src/lib/execution/boundaryService.ts`
- **Severity:** `MEDIUM`
- **Attack Scenario:** In `ExecutionAuthorizationService.consumeNonce`, `updateMany` was called with `where: { nonce, isNonceConsumed: false }`, but the function caught exceptions and returned `true` unconditionally. If a nonce had already been consumed, `res.count` was `0`, yet the function indicated success. Furthermore, `boundaryService.ts` did not check the return value.
- **Existing Protection:** Database schema defines `@unique` on `ExecutionRecord.nonce`, which prevents duplicate record creation with identical nonces.
- **Remediation Required:**
  1. In `consumeNonce`, return `res.count > 0`.
  2. In `ExecutionBoundaryService`, verify `const consumed = await ExecutionAuthorizationService.consumeNonce(...)` and throw `NONCE_ALREADY_CONSUMED` if `!consumed`.
- **Verification Test:** Concurrently invoke `consumeNonce` on the same nonce; assert exactly one succeeds and the second returns `false`.

---

### Detailed Finding SEC-004
- **Finding ID:** `SEC-004`
- **Affected Component:** `src/app/api/wallets/withdraw/route.ts`
- **Severity:** `MEDIUM`
- **Attack Scenario:** If the system is placed in operational emergency lockdown or financial freeze via `ExecutionGateService`, an operator or user calling `POST /api/wallets/withdraw` could still trigger fund movements because the withdrawal route omitted `ExecutionGateService.assertFinancialExecutionAllowed()`.
- **Existing Protection:** User ownership of the agent wallet was validated before withdrawal.
- **Remediation Required:**
  1. Add `await ExecutionGateService.assertFinancialExecutionAllowed("POST /api/wallets/withdraw")` at the beginning of the route.
- **Verification Test:** Put system into lockdown/paused mode; assert `POST /api/wallets/withdraw` throws `OPERATIONAL_CONTROL_BLOCKED`.

---

### Detailed Finding SEC-005
- **Finding ID:** `SEC-005`
- **Affected Component:** `src/lib/objectives/authority.ts`
- **Severity:** `LOW`
- **Attack Scenario:** `acquireMandateLock` serializes concurrent reservation attempts using an in-memory `Map<string, Promise<void>>`. Across multi-node server clusters, node A's mutex does not serialize requests on node B.
- **Existing Protection:** Multi-node safety is enforced by database-level CAS optimistic concurrency (`mandate.policyVersion`), which rejects concurrent modifications with `policyVersion` mismatch.
- **Remediation Required:**
  1. Ensure CAS retry loops include jittered backoff.
  2. Document the dual-layer architecture: in-process mutex handles local throughput, while PostgreSQL CAS guarantees global linearizability and double-spend prevention.
- **Verification Test:** Concurrent multi-client reservation race on PostgreSQL; assert zero overspending across 20 concurrent threads.

