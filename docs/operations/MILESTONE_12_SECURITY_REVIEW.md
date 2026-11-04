# MANDATE — MILESTONE 12: SECURITY REVIEW & PRODUCTION READINESS

**Date:** 2026-11-03  
**Status:** COMPLETE & AUDITED  
**Auditor:** Antigravity Security Agent  
**Target File:** `docs/operations/MILESTONE_12_SECURITY_REVIEW.md`

---

## 1. Security Architecture & Threat Model

Milestone 12 hardens Mandate against multi-transaction, multi-tenant, and asynchronous threat vectors.

### Non-Negotiable Invariants Verified:
1. **Agent Self-Modification Prohibition:** AI agents have zero database write permissions to their own mandates, budgets, approval thresholds, whitelist recipients, or governance policies. All lifecycle and config modifications require an authenticated human owner session.
2. **Boundary Enforcement:** 100% of financial transfers must pass through `ExecutionBoundaryService`. Direct RPC transfers, bypass scripts, or simulated bypasses are strictly prevented.
3. **Hardware Enclave Signing:** Signing keys are permanently sealed inside OutLayer Intel SGX memory (`TEE_SGX_V2`) for `04fdfed3a43cd4475e3928457354d51737a5f67e865c540bf4cd35d19b1f724a`. Private keys never appear in application memory, environment variables, database records, or logs.
4. **Integer Arithmetic:** All balance computations use native JavaScript `BigInt` with yoctoNEAR strings ($10^{24}$). Floating-point arithmetic is strictly prohibited in financial paths.
5. **Fail-Closed Under Uncertainty:** If provider connectivity, RPC indexing, policy arbitration, or signature verification fails, execution halts fail-closed without modifying internal or on-chain balances.

---

## 2. Threat Vector Analysis & Mitigation Matrix

| Threat Vector | Severity | Attack Scenario | Implemented Mitigation | Verification Status |
| :--- | :---: | :--- | :--- | :---: |
| **Concurrent Double-Spend** | **Critical** | Two concurrent requests attempt to consume the same remaining budget | Atomic CAS `updateMany` checking `policyVersion` and available balance; serialized per mandate | **VERIFIED (Pass)** |
| **Stale Authorization Envelope** | **High** | Attacker replays an authorization envelope after mandate limit reduced | Version increment (`policyVersion++`) on every mandate update invalidates previous envelopes | **VERIFIED (Pass)** |
| **Envelope Parameter Tampering** | **High** | Attacker intercepts envelope and modifies recipient or amount | Constant-time HMAC-SHA256 signature verification over canonicalized payload | **VERIFIED (Pass)** |
| **Worker Zombie Execution** | **High** | Worker loses lease, a new worker claims job, old worker broadcasts | Monotonic `leaseGeneration` check at execution boundary (`STALE_FENCING_GENERATION_REJECTED`) | **VERIFIED (Pass)** |
| **Ambiguous Broadcast Double-Spend** | **Critical** | Network timeout occurs post-broadcast; naive retry broadcasts duplicate tx | Failure classified as `REQUIRES_RECOVERY`; budget held in CAS reserve pending RPC polling | **VERIFIED (Pass)** |
| **Mainnet Accidental Broadcast** | **Critical** | Misconfiguration directs transaction to NEAR mainnet | Preflight validation enforces `wallet.network === "testnet"`; non-testnet rejected fail-closed | **VERIFIED (Pass)** |
| **Unauthorized Recipient Exfiltration** | **High** | Agent attempts transfer to unapproved third-party address | Allowlist whitelist verification with NEP-145 syntax check; unapproved recipients rejected | **VERIFIED (Pass)** |
| **Cross-Tenant Mandate Manipulation** | **Critical** | User A attempts to pause, edit, or spend User B's mandate | Strict tenant isolation via `userId` constraint in all database lookups and mutations | **VERIFIED (Pass)** |

---

## 3. Production Readiness & Identified Limitations

While Milestone 12 proves complete mathematical and operational safety for autonomous spending on NEAR Testnet, the following production limitations remain and are documented honestly:

1. **Active Database Engine (SQLite):**
   - **Current State:** The current persistence layer uses SQLite (`prisma/dev.db`).
   - **Limitation:** SQLite is single-node only. Concurrency is safe within a single process due to atomic file locks and CAS optimistic concurrency, but multi-node horizontal scaling requires migrating to PostgreSQL (e.g. Neon or Amazon RDS) with `pgBouncer`.
   - **Production Decision:** Do not deploy multi-node replicas until PostgreSQL is linked.
2. **Observability Exporter (OTLP Collector):**
   - **Current State:** In-memory Prometheus/OpenTelemetry metric counters are active (`financialExecutionCounter`).
   - **Limitation:** An external OTLP daemon/collector has not been linked to scrape telemetry snapshots in this local environment.
   - **Production Decision:** Link Datadog, Grafana Cloud, or OpenTelemetry Collector before Mainnet deployment.
3. **Testnet vs Mainnet Economics:**
   - **Current State:** All executions run on NEAR Testnet using FastNEAR RPC.
   - **Limitation:** Testnet network conditions, gas costs, and validator finality dynamics differ slightly from Mainnet congestion spikes.
   - **Production Decision:** Final go-live on Mainnet requires completing Milestone 13 and a dedicated mainnet readiness audit.

---

## 4. Final Security Decision

**Assessment:** **CONDITIONAL GO (READY FOR CONTROLLED TESTNET CAMPAIGN)**  
- All lifecycle invariants, financial accounting formulas, and concurrency defenses are verified and functional.  
- Live on-chain multi-transaction execution may proceed upon explicit human authorization.

