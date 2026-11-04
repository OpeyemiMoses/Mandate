# MANDATE — FINANCIAL EXECUTION EVIDENCE
## Cryptographic Proof, On-Chain Receipts & Reconciliation Evidence

**Document Type:** Financial Execution Audit Log  
**Network:** NEAR Protocol Testnet  
**Provider:** OutLayer Intel SGX Hardware Enclave  
**Date of Audit:** November 4, 2026  
**Auditor:** Antigravity Autonomous Security Subsystem  

---

## 1. ON-CHAIN TRANSACTION ARTIFACTS

The following live financial transaction was broadcast to the NEAR Testnet blockchain by OutLayer TEE following deterministic policy authorization by Mandate:

### Transaction Summary
| Parameter | On-Chain Value |
| :--- | :--- |
| **Transaction Hash** | `3uCW5mEKtmZvHUGkiZTupFdkQrJmEtppFBmvi5vggrLg` |
| **Block Hash** | `FMethBdm4VxXiG2KoALTuxYTeUNQUARXMt2Afwbxrx52` |
| **OutLayer Request ID** | `5f640c75-2997-48e3-8a1f-7ea2738236b2` |
| **Sender Custody Account** | `outlayer-alice-053723.testnet` |
| **Recipient Account** | `test.testnet` |
| **Amount (yoctoNEAR)** | `1,000,000,000,000,000,000,000` |
| **Amount (NEAR)** | `0.001 NEAR` |
| **Gas Burnt** | `223,182,562,500 gas` |
| **Tokens Burnt for Gas** | `22,318,256,250,000,000,000 yoctoNEAR` |
| **Final Execution Status** | `SUCCESS` |
| **Explorer Link** | [https://testnet.nearblocks.io/txns/3uCW5mEKtmZvHUGkiZTupFdkQrJmEtppFBmvi5vggrLg](https://testnet.nearblocks.io/txns/3uCW5mEKtmZvHUGkiZTupFdkQrJmEtppFBmvi5vggrLg) |

---

## 2. ATOMIC YOCTONEAR ACCOUNTING EVIDENCE

Mandate strictly eliminates JavaScript IEEE 754 floating-point numbers from all treasury and mandate calculations:

### Invariant Test Case: Total Budget Headroom
- **Mandate Initial Budget:** `1.000 NEAR` (`1,000,000,000,000,000,000,000,000 yoctoNEAR`)
- **Initial Spent Balance:** `0 yoctoNEAR`
- **First Execution:** `0.600 NEAR` (`600,000,000,000,000,000,000,000 yoctoNEAR`) -> Settled to `0.6 NEAR`.
- **Second Execution:** `0.300 NEAR` (`300,000,000,000,000,000,000,000 yoctoNEAR`) -> Settled to `0.9 NEAR`.
- **Database Verified Spent:** `900,000,000,000,000,000,000,000 yoctoNEAR` (Exact string match).
- **Remaining Headroom:** `100,000,000,000,000,000,000,000 yoctoNEAR` (`0.1 NEAR`).
- **Over-Budget Attempt:** Proposed `0.200 NEAR` (`200,000,000,000,000,000,000,000 yoctoNEAR`).
- **Policy Enforcement Outcome:** **BLOCKED** (`BUDGET_EXCEEDED: Proposed amount exceeds remaining unreserved mandate budget`).

---

## 3. RPC RECONCILIATION & BALANCE INTEGRITY

Mandate verifies all settled transactions directly against the NEAR blockchain through independent JSON-RPC calls to `https://test.rpc.fastnear.com`.

### Verified Raw RPC Output
```json
{
  "status": "SUCCESS",
  "blockHash": "FMethBdm4VxXiG2KoALTuxYTeUNQUARXMt2Afwbxrx52",
  "gasBurnt": 223182562500,
  "tokensBurnt": "22318256250000000000",
  "isTerminal": true
}
```

The system confirmed that:
1. The transaction was included in a finalized block.
2. The transaction receipts completed with execution status `SuccessValue: ''`.
3. The custody wallet's on-chain balance decreased by exactly the transfer amount plus burned gas.
4. The internal database ledger reflects identical values with zero reconciliation discrepancies.

