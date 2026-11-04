# MANDATE — MILESTONE 13.9
## Independent Verification & Anti-Self-Certification Architecture

**Milestone:** 13.9  
**Architecture:** NEAR Protocol + OutLayer Intel SGX TEE  
**Database:** PostgreSQL 18.6 (`mandate_prod`)  
**Network:** NEAR Testnet ONLY  
**Execution Boundary:** `ExecutionBoundaryService` + OutLayer TEE  
**Audit Standard:** Zero-Trust Verification, Cryptographic Attestation, Dual-Party Assurance  

---

### CORE PRINCIPLE
**AI proposes. Mandate enforces. The user controls. OutLayer executes.**  
*An autonomous agent must never self-certify its own execution, approve its own budget, or validate its own outcomes.*

---

## 1. THREE-TIER EVIDENCE CLASSIFICATION FRAMEWORK

Mandate strictly categorizes all operational and execution evidence into three discrete trust tiers. Systems must never accept lower-tier claims as proof of high-value or financial operations:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   TIER 3: INDEPENDENTLY_VERIFIED                       │
│  External cryptographic proof, SGX TEE quote, NEAR RPC finality state  │
│                   ▲                                                    │
│                   │ Enforced for all Financial & Irreversible Ops       │
├───────────────────┴────────────────────────────────────────────────────┤
│                   TIER 2: SYSTEM_TESTED                                │
│   Platform integration adapters, schema validation, deterministic CAS  │
│                   ▲                                                    │
│                   │ Enforced for Workflow Tasks & State Transitions    │
├───────────────────┴────────────────────────────────────────────────────┤
│                   TIER 1: IMPLEMENTATION_REPORTED                      │
│   Agent telemetry, self-reported success, unverified tool return JSON  │
│                   ▲                                                    │
│                   │ Untrusted: Strictly Insufficient for Task Closure  │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Tier 1: `IMPLEMENTATION_REPORTED`
- **Definition:** Unauthenticated claims generated directly by an autonomous agent, LLM planner, or execution subagent (e.g., `"I successfully completed the transfer"` or `{ "status": "ok" }`).
- **Trust Level:** **ZERO TRUST**.
- **Scope & Limitations:** Cannot transition task status to `COMPLETED`; cannot release escrow or reserved budget; cannot authorize subsequent DAG steps. Used solely as diagnostic input to the verification pipeline.

### 1.2 Tier 2: `SYSTEM_TESTED`
- **Definition:** Evidence collected and verified by Mandate's internal deterministic services, such as schema validators, policy engines, and atomic PostgreSQL database constraints.
- **Trust Level:** **PLATFORM INTEGRITY**.
- **Scope & Limitations:** Sufficient for non-financial task dependencies (e.g., verifying that a research report artifact is valid JSON matching the declared schema, or that an integration health check returned HTTP 200). Enforces tenant isolation, idempotency locks, and monotonic lease fencing.

### 1.3 Tier 3: `INDEPENDENTLY_VERIFIED`
- **Definition:** Evidence backed by independent external cryptographic signatures, blockchain state queries, or hardware-isolated trusted execution environments.
- **Trust Level:** **ABSOLUTE / CRYPTOGRAPHIC TRUST**.
- **Scope & Limitations:** **Mandatory** for all financial executions, settlement completions, and objective-level success criteria. Requires one or more of:
  - **NEAR Testnet Finality:** Transaction hash verified via `nearRpc.getNearAccountState()` and `EXPERIMENTAL_tx_status` confirming finality and yoctoNEAR balance deltas.
  - **OutLayer Intel SGX TEE Attestation:** Remote attestation quote validation (DCAP/EPID) verifying `MRENCLAVE`, `MRSIGNER`, and cryptographic signature over transaction digest.
  - **HMAC Envelope Nonce Signature:** Dual-party execution envelope signed by `ExecutionAuthorizationService` using isolated master secrets.

---

## 2. STRICT ANTI-SELF-CERTIFICATION PROOF

Mandate implements strict structural controls to prevent autonomous agents from validating their own actions or escalating their authority:

### 2.1 Autonomous Task Completion Prevention
1. **Agent Output as Proposal:** When an agent finishes executing a tool, its output is placed into `task.executionData` with status `PENDING_VERIFICATION`.
2. **Independent Verifier Invocation:** The task cannot reach `COMPLETED` status through agent code. The transition is governed exclusively by `ObjectiveEngine` calling independent verification routines (`ProviderVerificationService` or `ObjectiveDAGService.validateTaskCompletion`).
3. **DAG Unlocking Isolation:** Dependent tasks in the DAG are unlocked only by the orchestration engine after independent verification passes.

### 2.2 Financial Settlement Proof Isolation
1. **Zero Agent Custody:** Agents do not possess signing keys, wallet passwords, or OutLayer master credentials.
2. **Tamper-Proof Receipts:** An execution receipt must contain a valid `txHash` generated and signed inside the OutLayer Intel SGX TEE.
3. **Authoritative RPC Verification:** Before `ExecutionBoundaryService` converts reserved budget into spent budget via CAS (`settleMandateBudgetAtomic`), it queries the NEAR Testnet RPC endpoint directly. If the RPC does not confirm the transaction on-chain, settlement is rejected.

### 2.3 Capability Immutability
1. **Human-Only Assignment:** Agent capabilities in `AgentCapabilityRegistry` can only be registered or upgraded through human-authenticated tenant API calls (`POST /api/agents/:id/capabilities`).
2. **Runtime Policy Enforcement:** When an agent requests tool execution, `ToolExecutor` checks the agent's verified capabilities against the static registry in the database. Self-asserted agent parameters are ignored.

---

## 3. CRYPTOGRAPHIC PROOF MATRIX

| Target Domain | Verification Method | Cryptographic Primitive | Anti-Tamper Mechanism |
|---|---|---|---|
| **Execution Authorization** | `ExecutionAuthorizationService` | HMAC-SHA-256 with 32-byte nonce | Single-use monotonic nonce in PostgreSQL |
| **TEE Execution Receipt** | `OutlayerTeeVerificationService` | Intel SGX DCAP Attestation Quote | `MRENCLAVE` & `MRSIGNER` hardware verification |
| **Blockchain Settlement** | `NearRpcService` | Ed25519 NEAR Tx Signature | FastNEAR Testnet RPC consensus state proof |
| **Audit Ledger** | `AuditLedgerService` | SHA-256 Hash Chain (`prevHash`) | Full-chain recomputation (`verifyAuditChain`) |
| **Plan Approval** | `ObjectivePlanValidationService` | Canonical JSON SHA-256 `planHash` | User signature / human approval record match |

---

## 4. ADVERSARIAL VERIFICATION RESULTS

In Milestone 13.9 adversarial testing (`tests/milestone-13-9-security-audit.ts`), the verification controls were tested across multiple attack gates:

| Gate | Verification Scenario | Tested Attack / Failure Mode | Outcome |
|---|---|---|---|
| **Gate 4** | Authorization Envelope Tampering | Attacker modified amount, recipient, or HMAC signature | **FAIL-CLOSED:** Envelope rejected |
| **Gate 5** | Replay of One-Time Nonce | Attacker attempted to reuse execution authorization nonce | **FAIL-CLOSED:** Rejected with `NONCE_ALREADY_CONSUMED` |
| **Gate 8** | Adversarial Agent Bypass | Agent attempted to call OutLayer directly without boundary context | **FAIL-CLOSED:** `UNAUTHORIZED_EXECUTION_BOUNDARY_BYPASS` thrown |
| **Gate 11** | Prompt Injection Authority Escalation | Injected prompt requested financial transfer to rogue address | **FAIL-CLOSED:** Blocked by Mandate recipient allowlist |
| **Gate 12** | Audit Ledger Tamper Detection | Modifying historical audit event type or hash | **FAIL-CLOSED:** `verifyAuditChain` detected breach |
| **Gate 13** | NEAR Testnet Settlement Auditing | Confirmed transactions cross-referenced against RPC finality | **PASSED:** Only finalized testnet transactions settled |
| **Gate 17** | Independent Verification Evidence | Three-tier classification verified in objective execution pipeline | **PASSED:** Zero unverified tasks completed |

---

## 5. AUDIT CONCLUSION

Mandate's independent verification and anti-self-certification systems are formally certified:
- No autonomous agent can mark its own task complete.
- No autonomous agent can sign financial execution requests.
- All irreversible financial settlements require Tier 3 `INDEPENDENTLY_VERIFIED` cryptographic proof.
- **Verdict:** **CERTIFIED PASS**

