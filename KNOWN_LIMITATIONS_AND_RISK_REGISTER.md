# MANDATE — KNOWN LIMITATIONS AND RISK REGISTER
## Public Beta Operational Boundaries, Known Constraints & Mitigations

**Release Target:** Open Public Beta  
**Scope:** NEAR Protocol Testnet ONLY  
**Review Date:** November 4, 2026  
**Status:** **ACTIVE RISK GOVERNANCE**

---

## 1. KNOWN SYSTEM LIMITATIONS

In alignment with Milestone 13.10 requirements, Mandate explicitly discloses all known operational limitations:

### 1.1 Testnet-Only Execution
- **Limitation:** Mandate Public Beta operates strictly on NEAR Protocol Testnet (`testnet`).
- **Impact:** Tokens have zero monetary value. Real-world commercial transactions on Ethereum, Solana, or NEAR Mainnet are disabled.
- **Mitigation:** Prominent UI badges, API rejection guards, and documentation clarify testnet status.

### 1.2 Rate Limits & Third-Party RPC Throttling
- **Limitation:** Public testnet RPC nodes (e.g., `https://test.rpc.fastnear.com` or `https://rpc.testnet.near.org`) enforce rate limits on high-frequency transaction volume.
- **Impact:** Heavy bursts of concurrent agent activity can experience 429 throttling or transient latency spikes.
- **Mitigation:** Exponential backoff, jittered retries, and asynchronous transaction confirmation via background reconciliation workers.

### 1.3 OutLayer Enclave API Latency
- **Limitation:** Hardware enclave attestation, cryptographic signing, and transaction construction inside an Intel SGX enclave introduces latency of 1,000–2,000 ms per transfer.
- **Impact:** Microsecond high-frequency trading is not supported.
- **Mitigation:** Optimistic UI updates, asynchronous task polling, and clear status progression (`PROPOSED` -> `AUTHORIZED` -> `CONFIRMING` -> `CONFIRMED`).

### 1.4 Single Chain Native Settlement
- **Limitation:** Native financial transfers currently support NEAR Protocol and NEP-141 tokens. Cross-chain bridging (e.g., NEAR-to-EVM via Chain Signatures) is in experimental preview.
- **Mitigation:** Documented in Public Documentation Centre under *"Networks & Integrations"*.

---

## 2. RISK REGISTER

| Risk ID | Category | Risk Description | Severity | Likelihood | Mitigation Strategy | Residual Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RSK-01** | Financial | AI agent hallucinates an incorrect recipient or amount | **HIGH** | Medium | Universal Policy Engine evaluates 15 deterministic invariants, limits, and allowlists | **LOW** |
| **RSK-02** | Security | Prompt injection attack prompts agent to bypass mandate rules | **HIGH** | Medium | Agent output is treated as untrusted proposal; policy engine enforces hard rules regardless of prompt contents | **NEGLIGIBLE** |
| **RSK-03** | Concurrency | Clustered workers race to double-execute same task | **CRITICAL** | Low | PostgreSQL `pg_advisory_xact_lock` serializes execution at database engine level | **NEGLIGIBLE** |
| **RSK-04** | Operational | Host machine crash during active transaction signing | **MEDIUM** | Low | Single-use nonces and background reconciliation recover confirming transactions | **LOW** |
| **RSK-05** | Identity | Attacker attempts to claim admin privileges via account name | **HIGH** | Medium | Explicit server-side environment variables required for admin roles; public signup defaults to MEMBER | **NEGLIGIBLE** |
| **RSK-06** | Third-Party | OutLayer TEE gateway temporary outage | **MEDIUM** | Medium | Fail-closed execution gate safely rolls back reserved budgets and notifies user | **LOW** |

---

## 3. AUDIT SIGN-OFF

The risks associated with Mandate's Open Public Beta have been cataloged, mitigated with defense-in-depth architectural controls, and accepted for public testnet deployment.

