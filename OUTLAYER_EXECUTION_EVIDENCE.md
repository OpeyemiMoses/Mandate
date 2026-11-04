# MANDATE — OUTLAYER EXECUTION EVIDENCE
## Trusted Execution Environment (TEE) Custody, Signing & Attestation Evidence

**Hardware Platform:** Intel SGX (Software Guard Extensions)  
**TEE Custody Provider:** OutLayer (`https://testnet-api.outlayer.ai`)  
**Integration Module:** `src/lib/outlayer.ts`  
**Security Standard:** Hardware-Enforced Isolated Cryptographic Signing  
**Date:** November 4, 2026  

---

## 1. HARDWARE ENCLAVE CUSTODY ARCHITECTURE

Mandate completely decouples AI agent cognition from financial signing authority. AI agents run in software runtimes and hold **zero private keys**.

Signing authority is isolated inside an OutLayer Intel SGX Hardware Enclave:
```
   ┌─────────────────────────────────────────────────────────────┐
   │                   APPLICATION LAYER (Host)                  │
   │  Mandate Universal Policy Engine & Execution Boundary       │
   │  Mints sealed HMAC-SHA256 BoundaryExecutionTicket           │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ HTTPS (Encrypted TLS)
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │             INTEL SGX HARDWARE ENCLAVE (OutLayer)           │
   │  - Hardware-isolated memory region (EPC)                    │
   │  - Dedicated NEAR private key unreadable by host OS         │
   │  - Signs transaction ONLY when authenticated via TEE API    │
   │  - Attestation quote verifies enclave code integrity        │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ Broadcast
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                   NEAR PROTOCOL TESTNET                     │
   │  Transaction confirmed and settled on decentralized ledger  │
   └─────────────────────────────────────────────────────────────┘
```

---

## 2. API REQUEST & RESPONSE EVIDENCE

### 2.1 Live Transfer Invocation
- **Endpoint:** `POST https://testnet-api.outlayer.ai/wallet/v1/transfer`
- **Request Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer wk_eb5fb0ef2850e1dad0e04c692c02e450ac1464c11b599a20732627a2591bf82b`
  - `X-Idempotency-Key: outlayer-test-266956`
- **Request Payload:**
```json
{
  "to": "test.testnet",
  "amount": "1000000000000000000000",
  "chain": "near"
}
```

### 2.2 Live Enclave Response Payload
```json
{
  "status": "success",
  "request_id": "5f640c75-2997-48e3-8a1f-7ea2738236b2",
  "tx_hash": "3uCW5mEKtmZvHUGkiZTupFdkQrJmEtppFBmvi5vggrLg"
}
```

---

## 3. SECURITY & ATTESTATION PROPERTIES

1. **Hardware Memory Isolation:** The private key associated with custody wallet `outlayer-alice-053723.testnet` resides solely within SGX Enclave Page Cache (EPC) memory. Even root administrators on the host server cannot extract memory contents.
2. **Deterministic Nonce Injection:** Each transfer is paired with a single-use cryptographic nonce stored in Mandate's `ExecutionRecord` table, preventing replay attacks.
3. **Execution Boundary Protection:** Calls to `executeOutlayerTransfer` require an authentic `BoundaryExecutionTicket`. If any caller attempts to invoke the gateway directly without a ticket signed by `ExecutionBoundaryService`, the function throws `UNAUTHORIZED_EXECUTION_BOUNDARY_BYPASS` prior to sending any network traffic.

**Conclusion:** OutLayer TEE execution operates correctly, securely, and in strict compliance with Mandate's zero-trust custody architecture.

