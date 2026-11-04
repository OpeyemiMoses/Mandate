# MANDATE — MILESTONE 12: TEST EVIDENCE & VERIFICATION LOGS

**Date:** 2026-11-03  
**Status:** 54 / 54 ASSERTIONS PASSED (100%)  
**Test Suite:** [`tests/milestone-12-autonomous-spending.ts`](file:///Users/user/.gemini/antigravity/scratch/mandate/tests/milestone-12-autonomous-spending.ts)  
**Execution Command:** `npx tsx tests/milestone-12-autonomous-spending.ts`  
**Target File:** `docs/operations/MILESTONE_12_TEST_EVIDENCE.md`

---

## 1. Test Execution Summary

```
===============================================================================
   MANDATE MILESTONE 12 — AUTONOMOUS SPENDING & CONCURRENCY SUITE              
===============================================================================

  ✓ Setup: User account resolved
  ✓ Setup: Dedicated agent and OutLayer custody wallet resolved

--- PHASE 1: Milestone 11 Baseline Verification (Read-Only) ---
  ✓ 1a: Milestone 11 tx final_execution_status is FINAL on NEAR RPC
  ✓ 1b: Milestone 11 tx signer is verified agent custody wallet
  ✓ 1c: Milestone 11 tx receiver is verified personal treasury
  ✓ 1d: Milestone 11 tx deposit is exactly 0.001 NEAR (1e21 yocto)
  ✓ 1e: Live agent balance read from FastNEAR RPC is non-zero
  ✓ 1f: Live user balance read from FastNEAR RPC is non-zero

--- PHASE 2: Complete Mandate Spending Lifecycle ---
  ✓ 2a: Mandate created in DRAFT lifecycle state
  ✓ 2b: DRAFT mandate execution strictly rejected fail-closed
  ✓ 2c: Mandate legally transitioned from DRAFT to ACTIVE
  ✓ 2d: Mandate policyVersion incremented on activation
  ✓ 2e: Mandate legally transitioned from ACTIVE to PAUSED
  ✓ 2f: PAUSED mandate execution strictly rejected fail-closed
  ✓ 2g: Mandate legally resumed from PAUSED to ACTIVE
  ✓ 2h: Mandate past expiration automatically synced to EXPIRED
  ✓ 2i: Mandate with 100% budget spent automatically synced to BUDGET_EXHAUSTED
  ✓ 2j: Mandate transitioned to terminal REVOKED state
  ✓ 2k: Illegal reactivation of REVOKED mandate strictly rejected

--- PHASE 3: Multi-Transaction Budget Accounting ---
  ✓ 3a: Initial available budget equals total authorized budget
  ✓ 3b: Initial mandate is mathematically balanced with zero discrepancy
  ✓ 3c: Atomic reservation #1 of 0.015 NEAR succeeded via CAS
  ✓ 3d: Available budget correctly reduced to 0.035 NEAR
  ✓ 3e: Atomic settlement of 0.015 NEAR committed to confirmed spent
  ✓ 3f: Atomic reservation #2 of 0.020 NEAR succeeded via CAS
  ✓ 3g: Confirmed spent is 0.015 NEAR
  ✓ 3h: Active reserved is 0.020 NEAR
  ✓ 3i: Invariant verified: Available (0.015) = Total (0.05) - Spent (0.015) - Reserved (0.020)
  ✓ 3j: Atomic release of 0.020 NEAR returned to available budget without spending
  ✓ 3k: Active reserved returned to 0
  ✓ 3l: Available budget restored to 0.035 NEAR

--- PHASE 4: Recipient and Transaction Policy Enforcement ---
  ✓ 4a: Authorized recipient permitted by preflight allowlist
  ✓ 4b: Unauthorized recipient rejected fail-closed
  ✓ 4c: Amount exceeding per-tx limit rejected fail-closed
  ✓ 4d: Amount exceeding available budget rejected fail-closed
  ✓ 4e: Tampered amount in envelope rejected by constant-time HMAC gate
  ✓ 4f: Mandate config update increments version and invalidates stale authorization envelope
  ✓ 4g: Paused mandate preflight validation rejected fail-closed
  ✓ 4h: Expired mandate preflight validation rejected fail-closed
  ✓ 4i: Revoked mandate preflight validation rejected fail-closed
  ✓ 4j: Idempotency key reuse with modified parameters strictly rejected
  ✓ 4k: Non-testnet network configuration strictly rejected fail-closed

--- PHASE 5: Concurrent Execution and Race-Condition Tests ---
  ✓ 5a: Concurrency race condition: Exactly one of two competing over-allocations succeeded
  ✓ 5b: Concurrency race condition: Second competing allocation strictly rejected with budget exhaustion
  ✓ 5c: Database reserved balance matches exactly the single winning reservation without double-spend
  ✓ 5d: Concurrent job claiming: Exactly one worker secured exclusive monotonic lease on financial job
  ✓ 5e: Stale worker lease generation strictly fenced and rejected pre-dispatch

--- PHASE 6: Failure, Recovery and Ambiguous Settlement ---
  ✓ 6a: Pre-broadcast provider failure permits immediate safe reservation release
  ✓ 6b: Pre-broadcast failure suggests FAILED status
  ✓ 6c: Ambiguous post-broadcast network timeout strictly prohibits immediate budget release
  ✓ 6d: Ambiguous timeout sets requiresPolling to true pending authoritative lookup
  ✓ 6e: Ambiguous timeout sets status to REQUIRES_RECOVERY
  ✓ 6f: Recovery service verified confirmed transaction on NEAR RPC and returned status CONFIRMED
  ✓ 6g: Periodic reconciliation engine completed consistency sweep

===============================================================================
   MILESTONE 12 TEST SUITE: 54 / 54 PASSED (100%) 
===============================================================================
```

---

## 2. Test Classification Matrix

| Category | Classification | Test Target | Assertions | Result |
| :--- | :--- | :--- | :---: | :---: |
| **Phase 1** | Live RPC Read | FastNEAR RPC baseline verification (`BAELTk83H6...`) | 6 | **100% PASS** |
| **Phase 2** | Integration / DB | State machine transitions, invariants, and versioning | 11 | **100% PASS** |
| **Phase 3** | Unit / BigInt Math | Multi-transaction budget accounting and CAS locks | 12 | **100% PASS** |
| **Phase 4** | Integration / Security | Preflight policy, allowlists, limits, tamper detection | 11 | **100% PASS** |
| **Phase 5** | Database Concurrency | Real concurrent promises for budget, worker leases & fencing | 5 | **100% PASS** |
| **Phase 6** | System Recovery | Ambiguous timeouts, RPC polling, CAS budget recovery | 7 | **100% PASS** |
| **Total** | | | **54** | **100% PASS** |

