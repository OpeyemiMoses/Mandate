# MANDATE — MILESTONE 13.9
## Recovery & Reconciliation Security Audit

**Milestone:** 13.9  
**Component:** `ExecutionRecoveryService` & `TransactionReconciler`  
**Execution Standard:** Financial Irreversibility & Zero Blind Retries  
**Database:** PostgreSQL 18.6 (`mandate_prod`)  

---

## 1. RECOVERY SYSTEM CONSTRAINTS

The core mandate for failure recovery in an autonomous financial system is **financial irreversibility**:
1. **Never Blindly Retry:** An ambiguous transaction outcome must never trigger an automated blind re-broadcast.
2. **Never Double-Settle:** A confirmed on-chain transaction cannot be settled a second time upon recovery or reconciliation.
3. **Never Reverse Settled Spend via Restore:** Restoring an objective checkpoint or database backup must never erase or roll back confirmed blockchain transfers.
4. **Hold Reservations During Uncertainty:** If an egress request to OutLayer or NEAR drops out before a response is received, the budget reservation is held locked to prevent subsequent tasks from double-spending the unconfirmed funds.

---

## 2. AMBIGUOUS FAILURE SCENARIO MATRIX

| Failure Scenario | Classification | Immediate Reservation Action | Automated Recovery Path |
|---|---|---|---|
| **OutLayer accepts request, HTTP response drops** | `AFTER_BROADCAST_BEFORE_RESPONSE` | Retained locked (`canRelease = false`) | Polling via `verifyNearTransaction` using idempotency key / request ID |
| **NEAR RPC timeout during broadcast confirmation** | `AFTER_TX_HASH_BEFORE_CONFIRMATION` | Retained locked | Asynchronous polling of NEAR RPC with archival fallback |
| **Worker crashes immediately post-dispatch** | `DURING_DISPATCH` | Protected by durable `DispatchIntent` | Monotonic fencing lease generation prevents stale worker takeover |
| **Worker restarts before confirmation** | `PENDING_CONFIRMATION` | Retained locked | Next scheduled recovery run queries on-chain state without re-broadcasting |
| **RPC temporarily returns HTTP 503** | `NETWORK_ERROR` | Retained locked | Exponential jittered backoff; max 5 attempts before manual escalation |
| **Two recovery workers process same execution** | Concurrency race | Protected by CAS (`ExecutionRecord.status`) | Exactly one worker succeeds in transitioning status to `CONFIRMED` |
| **Checkpoint predates completed transaction** | Stale state | Checkpoint restoration cannot overwrite newer settled spend | Checkpoint engine verifies version sequence monotonicity |
| **Unresolvable transaction outcome** | `TIMEOUT` | Retained locked | Escalated to `MANUAL_INTERVENTION_REQUIRED` with alert incident |

---

## 3. AUDIT RECONSTRUCTION & VERIFICATION

### 3.1 Idempotency Key Immutability
Every financial dispatch records a deterministic `DispatchIntent` and `ExecutionRecord` bound to a unique `idempotencyKey`. Recovery workers utilize the exact same idempotency key for all provider queries, guaranteeing that neither OutLayer nor NEAR Protocol executes a duplicate side effect.

### 3.2 Monotonic Worker Fencing
Every background execution job is bound to a `leaseGeneration` counter. When a worker claims a job, it acquires a lease with an explicit expiration. If a worker hangs and subsequently resumes, any attempt to dispatch or recover an execution with a stale lease generation is rejected with:
`STALE_FENCING_GENERATION_REJECTED`.

### 3.3 Authoritative External Evidence Over Internal State
If internal database records show an execution as `CONFIRMING` or `REQUIRES_RECOVERY`, but authoritative NEAR Protocol RPC confirms that block inclusion succeeded:
1. `TransactionReconciler` upgrades the execution to `CONFIRMED`.
2. `settleMandateBudgetAtomic` converts reserved budget to confirmed spent balance.
3. Chronological audit event `BUDGET_SETTLED` is appended to the SHA-256 audit chain.

