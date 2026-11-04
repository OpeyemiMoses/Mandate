# MANDATE — MILESTONE 13.9
## Threat Model & Security Boundary Analysis

**Project:** Mandate  
**Standard:** STRIDE & Zero-Trust Agent Security Model  
**Network Boundary:** NEAR Testnet ONLY  
**Hardware Boundary:** Intel SGX TEE (OutLayer)  

---

## 1. TRUST BOUNDARIES & ARCHITECTURE OVERVIEW

```
  ┌─────────────────────────────────────────────────────────────┐
  │ Untrusted External World (LLM Output, Web Search, RPC Responses)
  └──────────────────────────────┬──────────────────────────────┘
                                 │ Prompt Injection / Tampering
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ Boundary 1: Autonomous Agent Runtime (AI Proposes)          │
  │ - Proposes tasks, tools, parameters, spending recommendations│
  │ - Zero financial authority, cannot approve own actions      │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ Policy Request / Task Proposal
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ Boundary 2: Mandate Centralized Governance (Mandate Enforces)│
  │ - Deterministic PolicyEngine (Server-Side TypeScript)       │
  │ - ValidationService (Strict yoctoNEAR BigInt, Allowlist)     │
  │ - CAS Atomic Budget Locks (PostgreSQL 18.6 ACID)            │
  │ - Cryptographic HMAC-SHA256 Authorization Envelopes          │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ Explicit Approval Required
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ Boundary 3: Human-in-the-Loop Authority (The User Controls) │
  │ - Cryptographic Approval Signature (Single-Use Nonce)        │
  │ - One-Time Atomic Consumption                               │
  │ - Unilateral Revocation & Emergency Lockdown                │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ Validated & Signed Envelope
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ Boundary 4: Execution Gateway & TEE (OutLayer Executes)     │
  │ - ExecutionBoundaryService (Single Authoritative Entrypoint)│
  │ - Intel SGX Enclave Custody Wallet                          │
  │ - NEAR Testnet Blockchain Broadcast & Settlement            │
  └─────────────────────────────────────────────────────────────┘
```

---

## 2. THREAT ACTORS & ATTACK VECTORS

### 2.1 Threat Actor Archetypes
1. **Rogue or Compromised Agent:**
   - Attempts to elevate its capability profile, access financial tools directly, bypass user approval, or expand its mandate budget.
2. **Malicious Web Page / Research Content (Prompt Injection):**
   - Injects instructions into DuckDuckGo search results or scraped websites instructing the agent to transfer funds to an attacker's address.
3. **Malicious Multi-Tenant Neighbor:**
   - Attempts to access other tenants' mandates, objectives, credentials, execution records, or wallet balances via API parameter tampering or object ID substitution.
4. **Stale or Crashed Worker Process:**
   - Restarts after network partition or crash and attempts to re-execute a completed job or overwrite newer checkpoint state.
5. **Adversarial / Compromised External Provider:**
   - Returns duplicate webhooks, forged transaction hashes, stale balance responses, or connection dropouts.

---

## 3. STRIDE ANALYSIS

| STRIDE Category | Threat Scenario | Attack Vector | Mandate Enforcement Mechanism |
|---|---|---|---|
| **Spoofing** | Attacker impersonates authorized user or agent | Forged session token, cross-tenant ID substitution | Multi-tenant auth middleware, tenant-scoped database queries, strict ownership asserts. |
| **Tampering** | Recipient or amount mutated after user approval | Intercepting approval ID and executing with modified payload | Canonical SHA-256 `actionPayloadHash` binding recipient, amount, mandateVersion, and policyVersion. |
| **Repudiation** | Agent denies executing unauthorized transfer | Action executed without audit trail | Chronological SHA-256 hash-chain audit ledger with cryptographic sequence numbers. |
| **Information Disclosure** | Secret key or signing material leak | Tool error stack trace, OpenTelemetry traces, LLM prompts | AES-256-GCM Credential Vault, strict regex secret redaction, zero private keys stored on server. |
| **Denial of Service** | High-concurrency exhaustion attack | Flooding concurrent reservation requests to exhaust budget | PostgreSQL CAS (`policyVersion`), in-memory mutex, rate-limiting on tool invocations. |
| **Elevation of Privilege** | Agent calls financial execution tool directly | Direct invocation of `executeOutlayerTransfer` or `execute_custody_transfer` | Centralized `ExecutionBoundaryService` fail-closed gateway with authorized context check. |

---

## 4. FAIL-CLOSED SECURITY GUARANTEES

1. **Zero Financial Drift:**
   - All accounting uses integer `BigInt` yoctoNEAR ($10^{24}$). No floats or rounding exist in financial calculations.
2. **Zero Unauthorized Broadcasts:**
   - Every financial dispatch requires an unexpired, unconsumed, cryptographically signed `AuthorizationEnvelope` issued exclusively by `ExecutionBoundaryService`.
3. **Atomic CAS Locks:**
   - Budgets are reserved prior to dispatch. If dispatch fails, reservation is released atomically. If dispatch outcome is ambiguous, reservation is retained until independent on-chain reconciliation.
4. **Anti-Self-Certification:**
   - The executing agent cannot verify its own task outcome. Independent evidence verification requires a distinct auditing agent.
5. **Fail-Closed Execution Control:**
   - Any unknown error, signature mismatch, version drift, or rate limit breach results in immediate rejection and audit logging.

