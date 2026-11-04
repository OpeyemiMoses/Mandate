# Mandate — Background Worker Operations Runbook
## Resilient Worker Lifecycle, Monotonic Fencing & Failure Recovery

**Document Version:** 1.0.0  
**Effective Date:** November 3, 2026  
**Audience:** Site Reliability Engineers, On-Call Operators, Backend Engineers  

---

## 1. Worker Daemon Architecture

Mandate's background execution engine is built around fail-closed reliability and deterministic state safety. The worker process operates as an independent OS process (`src/worker.ts`) executing asynchronous workloads decoupled from web traffic.

### Core Architecture Principles:
1. **Decoupled Process:** Operates via `npm run worker`. Never shares memory space or event loop blocking with HTTP server requests.
2. **Atomic CAS Claims:** Uses Compare-And-Swap database primitives to claim jobs exclusively.
3. **Monotonic Generation Fencing:** Every claim increments `leaseGeneration` by 1. Stale workers attempting mutations on superseded generations are rejected immediately.
4. **Durable Dispatch Intent:** Financial transactions write a `DispatchIntent` record prior to touching external providers, preventing duplicate dispatches across crashes.

---

## 2. Monotonic Generation Fencing Explained

```
Worker 1 (PID A)                 Database (BackgroundJob)             Worker 2 (PID B)
      |                                     |                                |
      |--- Claim (Generation = 0) --------->|                                |
      |<-- Claim Success (Gen = 1) ---------|                                |
      |                                     |                                |
   [Stalls 35s]                             |                                |
   (Lease expires)                          |                                |
      |                                     |--- Reclaim (Gen = 1) --------->|
      |                                     |<-- Claim Success (Gen = 2) ----|
      |                                     |                                |
      |                                     |                                |===> Executes Job cleanly
      |                                     |<-- Complete (Gen = 2) ---------|
      |                                     |                                |
   [Awakes]                                 |                                |
      |--- Complete (Gen = 1) ------------->|                                |
      |                                     | [Checks: Gen 1 == Gen 2? NO!]  |
      |<-- STALE_LEASE_REJECTED ------------|                                |
   (Aborts code 0, 0 side effects)          |                                |
```

### Safety Guarantees:
- **No Split-Brain Execution:** Even if two processes believe they own a job, the database strictly requires matching `leaseGeneration` and unexpired timestamp.
- **Fail-Closed Stale Rejection:** A stale worker receiving `STALE_LEASE_REJECTED` or `STALE_LEASE_GENERATION` is strictly prohibited from updating the job to `FAILED` or `RETRY_WAIT`. It aborts immediately without touching the row.

---

## 3. Financial Dispatch Intent & Provider Boundary

To protect against process crashes occurring between lease checks and blockchain broadcasts:

1. **Reservation & Preflight:** Verifies mandate budget, allowlist, and balance.
2. **Authorization Envelope:** Generates HMAC-signed envelope with cryptographic single-use nonce.
3. **Pre-Dispatch Generation Check:** Verifies current `leaseGeneration` on the job immediately prior to invoking OutLayer/NEAR.
4. **Durable Intent Write:** Atomically upserts `DispatchIntent` record with status `DISPATCHED` and stable idempotency key (`job_tx_${job.id}`).
5. **Provider Invocation:** Dispatches transfer to OutLayer TEE.
6. **Settlement & Confirmation:** Updates `DispatchIntent` and `ExecutionRecord` to `CONFIRMED`.

### If a Crash Occurs Post-Dispatch Pre-Commit:
When another worker reclaims the job:
- It checks `idempotencyKey` against existing `ExecutionRecord` and `DispatchIntent`.
- It finds the existing record and queries NEAR RPC / OutLayer receipt.
- If already confirmed on-chain, it adopts the receipt, settles the budget, and completes the job.
- **Double-disbursement probability: 0.000%.**

---

## 4. Dead-Letter Queue (DLQ) Management

Jobs that exceed their maximum retry budget (`maxAttempts = 5`) or encounter non-retryable fatal errors (e.g. policy denial) are quarantined into the `DeadLetterRecord` table.

### 4.1 Inspecting Quarantined Jobs
```bash
curl -H "Cookie: mandate_session=OPERATOR_SESSION" \
  "http://localhost:3000/api/jobs?status=DEAD_LETTER"
```

### 4.2 Replaying a Dead-Letter Job
Once the underlying issue (e.g. policy configuration or provider outage) is resolved, operators can re-enqueue the job:
```bash
curl -X POST "http://localhost:3000/api/jobs/JOB_ID_HERE/retry" \
  -H "Cookie: mandate_session=OPERATOR_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"resetAttempts": true}'
```

---

## 5. Ambiguous Transaction Reconciliation

When OutLayer TEE or NEAR RPC encounters network timeouts post-broadcast, the job enters status `REQUIRES_RECOVERY` with `recoveryStatus = "PENDING_RECOVERY"`.

### Operating Rule:
**Never blindly re-broadcast or cancel an ambiguous transaction.**

### Resolution Steps:
1. Locate the execution record:
   ```bash
   curl -H "Cookie: mandate_session=OPERATOR_SESSION" \
     "http://localhost:3000/api/reconciliation/runs"
   ```
2. Run automated transaction reconciliation:
   ```bash
   curl -X POST "http://localhost:3000/api/transactions/reconcile" \
     -H "Cookie: mandate_session=OPERATOR_SESSION" \
     -H "Content-Type: application/json" \
     -d '{"executionId": "EXEC_ID_HERE"}'
   ```
3. The reconciliation service queries NEAR Testnet RPC using the transaction hash or wallet account history. If the transaction was included on-chain, it finalizes `CONFIRMED`. If definitively not found after the timeout window, it releases the reserved budget.

