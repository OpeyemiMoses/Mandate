# MANDATE — MILESTONE 12.1
## CONTROLLED MULTI-TRANSACTION TESTNET EXECUTION & SETTLEMENT REPORT

**Project:** Mandate  
**Milestone:** 12.1 — Controlled Multi-Transaction Testnet Execution & Settlement  
**Execution Date:** November 3, 2026  
**Network:** NEAR Testnet ONLY (`https://test.rpc.fastnear.com`)  
**Execution Provider:** OutLayer Intel SGX Hardware Enclave (`https://api.outlayer.fastnear.com`)  
**Status:** **100% CERTIFIED AND RECONCILED (ZERO DISCREPANCY)**

---

## 1. EXECUTIVE SUMMARY

Milestone 12.1 successfully executed and independently verified multiple separately authorized financial transactions under a single autonomous spending mandate. The campaign verified:

1. **Deterministic Multi-Transaction Execution:** Two genuine, sequential on-chain transfers were executed through the OutLayer Intel SGX TEE hardware enclave.
2. **Strict Cumulative Budget Accounting:** Every transaction passed through integer yoctoNEAR atomic reservation and settlement. The mandate available budget decremented precisely from `0.010 NEAR` $\rightarrow$ `0.009 NEAR` $\rightarrow$ `0.007 NEAR`.
3. **Decoupled Gas Accounting:** Network gas fees were accounted separately from mandate spending without corrupting transfer limits.
4. **Independent Settlement Verification:** All transactions reached `FINAL` execution status and were verified against FastNEAR RPC block receipts.
5. **Comprehensive Negative Security Controls:** 9 out of 9 negative security scenarios (budget exhaustion, limit violations, unauthorized recipients, idempotency tampering, lifecycle pauses, stale versions, and emergency circuit breakers) failed closed with zero budget drift.
6. **Authoritative Ledger Reconciliation:** Authoritative on-chain balances match internal database state with **0 yoctoNEAR discrepancy**.

---

## 2. CAMPAIGN IDENTIFIERS & CONFIGURATION

| Entity / Parameter | Canonical Identifier / Configuration |
| :--- | :--- |
| **Network** | NEAR Testnet (`chain_id: testnet`) |
| **RPC Endpoint** | `https://test.rpc.fastnear.com` |
| **Execution Provider** | OutLayer Intel SGX Hardware Enclave (`https://api.outlayer.fastnear.com`) |
| **Agent Wallet (Signer)** | `04fdfed3a43cd4475e3928457354d51737a5f67e865c540bf4cd35d19b1f724a` |
| **Personal Treasury (Recipient)**| `0x479253b82eb63eb36f140ecabf0237cc338084e7` |
| **Mandate ID** | `cmw19ayhj0001sbyxd9uizeha` |
| **Mandate Name** | `Milestone 12.1 Multi-Transaction Mandate` |
| **Total Authorized Budget** | `0.010 NEAR` (`10,000,000,000,000,000,000,000 yoctoNEAR`) |
| **Per-Transaction Limit** | `0.005 NEAR` (`5,000,000,000,000,000,000,000 yoctoNEAR`) |
| **Approval Threshold** | `0.005 NEAR` |
| **Allowed Recipients** | `["0x479253b82eb63eb36f140ecabf0237cc338084e7"]` |
| **Allowed Tokens** | `["NEAR"]` |
| **Initial Status** | `ACTIVE` |

---

## 3. PRE-EXECUTION VALIDATION (12/12 PASSED)

Prior to any transaction dispatch, preflight verification confirmed:

1. **Sender Balance:** `0.498185 NEAR` (exceeds required storage buffer and gas).
2. **Recipient Syntax & Exists:** `0x479253b82eb63eb36f140ecabf0237cc338084e7` (2.001 NEAR pre-balance).
3. **OutLayer TEE Binding:** Hardware enclave operational, wallet custody active.
4. **Mandate Status:** `ACTIVE` (`policyVersion: 2`).
5. **Authorized Budget:** Exactly `0.010 NEAR`.
6. **Recipient Allowlisted:** Recipient matches configured allowlist.
7. **Per-Tx Limit Permitted:** Both planned transfers (0.001 NEAR and 0.002 NEAR) $\le 0.005$ NEAR limit.
8. **Sufficient Gas Reserve:** Gas buffer verified at `~0.0008 NEAR` per transfer.
9. **Unresolved Execution Records:** 0 pending or unrecovered records for user mandate.
10. **Operational Mode:** `NORMAL` (no circuit breakers or emergency halts active).
11. **Policy Integrity:** Monotonic policy version active.
12. **Execution Pipeline:** Wired strictly to `ExecutionBoundaryService.execute`.

---

## 4. TRANSACTION 1 — EXECUTION & SETTLEMENT

- **Amount:** `0.001 NEAR` (`1,000,000,000,000,000,000,000 yoctoNEAR`)
- **Execution ID:** `exec-d01e15b30f74647216e96fca`
- **Idempotency Key:** `idemp-m12-tx1-1793744805376`
- **Nonce:** `nonce-d7ebab4c4cf53532b5306697f86a8fd4`
- **Human Authorization:** Explicit authorization granted (*"yes"*)
- **Transaction Hash:** `BpJNuyajpeJJhfc2hWjv6ZBW8QoZCtQvwQWB6AbUg96p`
- **FastNEAR Explorer:** [BpJNuyajpeJJhfc2hWjv6ZBW8QoZCtQvwQWB6AbUg96p](https://testnet.nearblocks.io/txns/BpJNuyajpeJJhfc2hWjv6ZBW8QoZCtQvwQWB6AbUg96p)
- **Block Hash:** `B5G5LQdLuhWKtffuryXU1Udp248Jzdk3xRgY2PQnVRtz`
- **RPC Execution Status:** `FINAL` / `SUCCESS`
- **Gas Burnt:** `723,182,562,500` gas
- **Tokens Burnt:** `72,318,256,250,000,000,000 yoctoNEAR` (`~0.000072 NEAR`)

### Post-Transaction 1 Balance & Accounting Ledger:
- **Sender Balance:** Pre `0.498185 NEAR` $\rightarrow$ Post `0.496371 NEAR`
- **Recipient Balance:** Pre `2.001000 NEAR` $\rightarrow$ Post `2.002000 NEAR` (**Exact `+0.001 NEAR` increase**)
- **Mandate Confirmed Spent:** `0.001 NEAR`
- **Mandate Active Reserved:** `0.000 NEAR`
- **Mandate Available Budget:** `0.009 NEAR`
- **Policy Version:** Monotonically incremented from `2` $\rightarrow$ `3`

---

## 5. TRANSACTION 2 — EXECUTION & SETTLEMENT

- **Amount:** `0.002 NEAR` (`2,000,000,000,000,000,000,000 yoctoNEAR`)
- **Execution ID:** `exec-ecfe2d40cb83be0950070f4c`
- **Idempotency Key:** `idemp-m12-tx2-1793744984887`
- **Nonce:** `nonce-c575bc08bc8860fb6dfe4cb1a5a3012e`
- **Human Authorization:** Explicit authorization granted (*"yes"*)
- **Transaction Hash:** `Hwzbu96a2cSCy7njWcVMCez69pPwhKui7fa5oJNo6RWc`
- **FastNEAR Explorer:** [Hwzbu96a2cSCy7njWcVMCez69pPwhKui7fa5oJNo6RWc](https://testnet.nearblocks.io/txns/Hwzbu96a2cSCy7njWcVMCez69pPwhKui7fa5oJNo6RWc)
- **Block Hash:** `5S9sna6DasAFmgfMcg2VdgnsoYT2tZpkHerq3BnzMmM7`
- **RPC Execution Status:** `FINAL` / `SUCCESS`
- **Gas Burnt:** `723,182,562,500` gas
- **Tokens Burnt:** `72,318,256,250,000,000,000 yoctoNEAR` (`~0.000072 NEAR`)

### Post-Transaction 2 Balance & Accounting Ledger:
- **Sender Balance:** Pre `0.496371 NEAR` $\rightarrow$ Post `0.493557 NEAR`
- **Recipient Balance:** Pre `2.002000 NEAR` $\rightarrow$ Post `2.004000 NEAR` (**Exact `+0.002 NEAR` increase**)
- **Mandate Confirmed Spent:** `0.003 NEAR` (`0.001 + 0.002`)
- **Mandate Active Reserved:** `0.000 NEAR`
- **Mandate Available Budget:** `0.007 NEAR`
- **Policy Version:** Monotonically incremented to `5`

---

## 6. CUMULATIVE ACCOUNTING & INVARIANTS PROOF

All financial accounting is calculated strictly using 128-bit integer yoctoNEAR representation:

$$\text{Total Budget} = \text{Confirmed Spent} + \text{Active Reserved} + \text{Available Budget}$$

$$10{,}000{,}000{,}000{,}000{,}000{,}000{,}000 = 3{,}000{,}000{,}000{,}000{,}000{,}000{,}000 + 0 + 7{,}000{,}000{,}000{,}000{,}000{,}000{,}000$$

- **Total Budget:** `0.010 NEAR`
- **Confirmed Spent:** `0.003 NEAR`
- **Active Reserved:** `0.000 NEAR`
- **Available Budget:** `0.007 NEAR`
- **Discrepancy:** **`0 yoctoNEAR`**
- **Ledger Invariant Status:** **`BALANCED (TRUE)`**

### Gas Decoupling Guarantee:
Gas consumed on-chain (`72,318,256,250,000,000,000 yoctoNEAR` per transfer) was deducted by the NEAR Testnet protocol directly from the sender's native wallet balance. Mandate spending ledger tracks pure transfer value without corrupting spending mandates.

---

## 7. NEGATIVE SECURITY TEST SUITE (9/9 PASSED)

Following the execution of Transaction 1 and Transaction 2, nine negative security assertions were tested against mandate `cmw19ayhj0001sbyxd9uizeha`:

| # | Test Scenario | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :---: |
| **1** | Attempt transfer exceeding remaining budget (`0.008 NEAR > 0.007 NEAR`) | Rejection by preflight guardrail | `Requested amount exceeds available mandate budget (0.007 NEAR)` | **PASS** |
| **2** | Attempt transfer exceeding per-tx limit (`0.006 NEAR > 0.005 NEAR`) | Rejection by preflight guardrail | `Proposed amount exceeds per-transaction limit (0.005 NEAR)` | **PASS** |
| **3** | Attempt transfer to unapproved recipient (`unauthorized-actor.testnet`) | Rejection by recipient allowlist | `Recipient is not permitted by mandate allowlist` | **PASS** |
| **4** | Replayed authorization envelope / Reused idempotency key with identical payload | Idempotent safe return; zero double-spend | Returned existing settled tx hash (`BpJNuyajpe...`) without double broadcast | **PASS** |
| **5** | Reused idempotency key with modified payload (amount tampered to `0.004 NEAR`) | Rejection by idempotency hash check | `Idempotency key previously used with different execution payload` | **PASS** |
| **6** | Attempt transfer while mandate is `PAUSED` | Rejection by lifecycle state check | `Mandate is PAUSED. Spending execution is suspended.` | **PASS** |
| **7** | Attempt transfer while mandate is `REVOKED` | Rejection by lifecycle fail-closed | `Mandate was permanently REVOKED by its owner.` | **PASS** |
| **8** | Stale policy version rejection (CAS Concurrency) | Rejection by envelope version check | `Mandate policy version mismatch: envelope issued for version 10, current is 11` | **PASS** |
| **9** | Global Emergency Pause / Circuit Breaker Active | Blocked by `ExecutionGateService` | `OPERATIONAL_CONTROL_BLOCKED: Financial execution halted (FINANCIAL_EXECUTION_PAUSED)` | **PASS** |

### Accounting Integrity Under Attack:
- **Available Budget Before Negative Tests:** `0.007 NEAR`
- **Available Budget After Negative Tests:** `0.007 NEAR`
- **Budget Corruption or Drift:** **`0 yoctoNEAR`**

---

## 8. AUTHORITATIVE ON-CHAIN RECONCILIATION

Direct queries to FastNEAR Testnet RPC confirmed zero discrepancy between internal database records and on-chain reality:

```json
{
  "network": "NEAR Testnet",
  "rpcEndpoint": "https://test.rpc.fastnear.com",
  "senderAddress": "04fdfed3a43cd4475e3928457354d51737a5f67e865c540bf4cd35d19b1f724a",
  "recipientAddress": "0x479253b82eb63eb36f140ecabf0237cc338084e7",
  "senderOnChainBalanceNear": "0.493",
  "recipientOnChainBalanceNear": "2.004",
  "executions": [
    {
      "execId": "exec-d01e15b30f74647216e96fca",
      "idempotencyKey": "idemp-m12-tx1-1793744805376",
      "txHash": "BpJNuyajpeJJhfc2hWjv6ZBW8QoZCtQvwQWB6AbUg96p",
      "amountNear": "0.001",
      "dbStatus": "CONFIRMED",
      "rpcFinalStatus": "FINAL",
      "blockHash": "B5G5LQdLuhWKtffuryXU1Udp248Jzdk3xRgY2PQnVRtz",
      "gasBurnt": 723182562500
    },
    {
      "execId": "exec-ecfe2d40cb83be0950070f4c",
      "idempotencyKey": "idemp-m12-tx2-1793744984887",
      "txHash": "Hwzbu96a2cSCy7njWcVMCez69pPwhKui7fa5oJNo6RWc",
      "amountNear": "0.002",
      "dbStatus": "CONFIRMED",
      "rpcFinalStatus": "FINAL",
      "blockHash": "5S9sna6DasAFmgfMcg2VdgnsoYT2tZpkHerq3BnzMmM7",
      "gasBurnt": 723182562500
    }
  ],
  "mandateAccounting": {
    "totalBudgetNear": "0.010",
    "spentNear": "0.003",
    "reservedNear": "0.000",
    "availableBudgetNear": "0.007",
    "confirmedTxCount": 2,
    "isBalanced": true,
    "discrepancyYocto": "0"
  }
}
```

---

## 9. IMMUTABLE CRYPTOGRAPHIC AUDIT TRAIL

All campaign actions are permanently anchored in the SHA-256 cryptographic audit trail:
- `seq #70` $\rightarrow$ `GOVERNANCE_EVALUATION_ALLOW` (Tx 1 Policy Approval)
- `seq #72` $\rightarrow$ `BUDGET_RESERVED` (Atomic CAS Reservation: 0.001 NEAR)
- `seq #73` $\rightarrow$ `EXECUTION_AUTHORIZED` (Envelope: `exec-d01e15b30f74647216e96fca`, nonce: `nonce-d7ebab...`)
- `seq #74` $\rightarrow$ `TRANSACTION_BROADCAST` (Dispatched to OutLayer Intel SGX TEE)
- `seq #75` $\rightarrow$ `TRANSACTION_CONFIRMED` (On-Chain Finality Verified: `BpJNuyajpe...`)
- `seq #76` $\rightarrow$ `GOVERNANCE_EVALUATION_ALLOW` (Tx 2 Policy Approval)
- `seq #78` $\rightarrow$ `BUDGET_RESERVED` (Atomic CAS Reservation: 0.002 NEAR)
- `seq #79` $\rightarrow$ `EXECUTION_AUTHORIZED` (Envelope: `exec-ecfe2d40cb83be0950070f4c`, nonce: `nonce-c575bc...`)
- `seq #80` $\rightarrow$ `TRANSACTION_BROADCAST` (Dispatched to OutLayer Intel SGX TEE)
- `seq #81` $\rightarrow$ `TRANSACTION_CONFIRMED` (On-Chain Finality Verified: `Hwzbu96a2...`)
- `seq #82-87` $\rightarrow$ `MANDATE_STATUS_PAUSED` / `ACTIVE` (Immutable transition logging)

---

## 10. FINAL READINESS DECISION & OPERATIONAL STATUS

- **Milestone 12.1 Execution Decision:** **ACCEPTED AND CERTIFIED**
- **Multi-Transaction Reliability:** **VERIFIED**
- **Cumulative Budget Invariants:** **100% BALANCED**
- **Negative Security Posture:** **9/9 ASSERTIONS PASSED**
- **Authoritative On-Chain State:** **MATCHES AUTHORITATIVE RPC EVIDENCE WITH 0 YOCTONEAR DRIFT**
- **Operational Mode:** **NORMAL**

