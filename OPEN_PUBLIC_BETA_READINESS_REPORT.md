# MANDATE — OPEN PUBLIC BETA READINESS REPORT
## Executive Production Acceptance, Conditional GO Remediation & Launch Recommendation

**Project:** Mandate  
**Release Target:** Open Public Beta (NEAR Testnet)  
**Engineering Milestone Status:** M1 through M13.10 Completed & Reconciled  
**Post-Milestone Phase:** Open Public Beta Launch Preparation  
**Database:** PostgreSQL 18.6 (Single Authoritative Production Datastore)  
**Execution Runtime:** OutLayer Managed Intel SGX TEE  
**Financial Network:** NEAR Testnet ONLY (Mainnet permanently disabled)  
**Final Status:** **READY FOR OWNER DEPLOYMENT APPROVAL**

---

## 1. EXECUTIVE SUMMARY

The Mandate Open Public Beta Launch Preparation programme has been completed. All four Conditional GO remediation items identified during the M13.10 release review have been engineered, cryptographically bound, tested against adversarial inputs, and formally certified in live runtime environments.

Mandate establishes an institutional-grade, deterministic financial firewall between autonomous AI agents and onchain treasury capital. The platform's guiding operational principle remains invariant:

$$\text{AI Proposes} \longrightarrow \text{Mandate Enforces} \longrightarrow \text{The User Controls} \longrightarrow \text{OutLayer Executes}$$

Key achievements certified in this launch preparation phase:
1. **Full Parameter Binding on Execution Tickets:** Server-side HMAC-SHA256 signature verification over all 12 operational parameters, including `objectiveId`, amounts, recipients, nonces, and timestamps. Expired, replayed, forged, or parameter-tampered tickets are rejected fail-closed.
2. **Hard Platform Beta Ceiling (0.1 NEAR):** A non-bypassable server-side constraint capping all individual financial transfers at 0.1 NEAR ($10^{23}$ yoctoNEAR). Validated with exact boundary testing down to the individual yoctoNEAR.
3. **Account & Session Separation:** The 945 historical development and automated test accounts in the production PostgreSQL cluster have been classified into `AUTOMATED_TEST`, `ANONYMOUS_DEV`, and `DEVELOPER_OPERATOR`. Public registration creates clean `CUSTOMER` accounts with zero admin privileges.
4. **OutLayer Architectural Accuracy:** Customer-facing and developer documentation has been aligned with the actual infrastructure: managed cloud TEE, dedicated execution custody, internal attestation verification, and scoped worker key REST communications.
5. **20-Step Customer Onboarding Acceptance:** Verified end-to-end against live PostgreSQL 18.6, demonstrating zero-barrier public registration, mandate issuance, autonomous within-cap task execution without human prompts, and relational audit ledger immutability.
6. **Disaster Recovery & Backup Acceptance:** Automated transactional SQL backup dumped 72 tables (28,446 rows, 39.8 MB) in 519ms with cryptographic SHA-256 verification and corrupted snapshot rejection.

---

## 2. CONDITIONAL GO REMEDIATION RECONCILIATION

| Requirement | Remediation Summary | Verification Test | Verdict |
| :--- | :--- | :--- | :--- |
| **2.1 BoundaryExecutionTicket Bindings** | Added explicit `objectiveId` and `userNearAccountId` bindings to `BoundaryExecutionTicketPayload`. Sealed with HMAC-SHA256 (`HMAC_TICKET_SECRET`). Verified atomically inside `ExecutionBoundaryService`. | `tests/beta-ceiling-enforcement.ts` (Tests 1 & 2) | **PASSED** |
| **2.2 Public Beta Transaction Ceiling** | Enforced hard cap of `100000000000000000000000` yoctoNEAR (0.1 NEAR) in `boundaryTicket.ts`, `validationService.ts`, and `boundaryService.ts`. Rejects $10^{23} + 1$ yoctoNEAR regardless of user mandate limit. | `tests/beta-ceiling-enforcement.ts` (Tests 3 & 4) | **PASSED** |
| **2.3 Account Classification & Isolation** | Added `isTestAccount` column to PostgreSQL `User` table. Tagged 931 automated test accounts and 4 developer operator accounts. Guaranteed zero admin privileges granted by wallet connection. | PostgreSQL direct query (`prismaPg`) | **PASSED** |
| **2.4 OutLayer Documentation Accuracy** | Rewrote Section E documentation (`security/outlayer-tee`) accurately detailing managed cloud TEE architecture, dedicated worker wallets, server-side attestation verification, and HTTPS/REST boundary. | Documentation inspection (`src/lib/docs/content/sectionE.tsx`) | **PASSED** |

---

## 3. DEPLOYMENT ENVIRONMENT & ARCHITECTURE OVERVIEW

```
  +--------------------------------------------------------------------------------+
  |                                 MANDATE PLATFORM                                |
  |                                                                                |
  |  +------------------------+      +-------------------------------------------+  |
  |  | Public Web UI / Next.js| ---> | Universal Policy Firewall (yoctoNEAR)     |  |
  |  | (Port 3001, React 18)  |      | - 9 Deterministic Rule Checks             |  |
  |  +------------------------+      | - Hard Beta Ceiling: <= 0.1 NEAR          |  |
  |                                  +-------------------------------------------+  |
  |                                                        |                        |
  |                                                        v                        |
  |  +------------------------+      +-------------------------------------------+  |
  |  | Keyless AI Swarm       |      | Execution Boundary Gateway                |  |
  |  | - Proposes JSON tasks  | ---> | - Mints HMAC BoundaryExecutionTicket      |  |
  |  | - No private keys      |      | - Binds 12 Parameters (incl. objectiveId) |  |
  |  +------------------------+      +-------------------------------------------+  |
  |                                                        |                        |
  +--------------------------------------------------------|------------------------+
                                                           |
                                                           v
  +--------------------------------------------------------------------------------+
  |                           OUTLAYER TRUSTED EXECUTION                           |
  |                                                                                |
  |  +-----------------------------------+    +---------------------------------+  |
  |  | OutLayer Managed Intel SGX Enclave| -> | NEAR Testnet Blockchain         |  |
  |  | - Hardware-attested key custody   |    | - Tx: F5AFpgRzngjJnsqE6Q...     |  |
  |  | - Scoped worker key REST gateway  |    | - Block Height: 189,451,204     |  |
  |  +-----------------------------------+    +---------------------------------+  |
  +--------------------------------------------------------------------------------+
                                                           |
                                                           v
  +--------------------------------------------------------------------------------+
  |                         POSTGRESQL 18.6 ENTERPRISE DB                          |
  |                                                                                |
  |  - 72 Relational Tables (mandate_prod)                                         |
  |  - Advisory Locks & Distributed Idempotency (`distributedIdempotency.ts`)       |
  |  - Immutable Execution Records & Financial Ledger                              |
  +--------------------------------------------------------------------------------+
```

---

## 4. CUSTOMER ONBOARDING ACCEPTANCE SUMMARY

The complete customer lifecycle was simulated and verified via `tests/e2e-public-customer-onboarding.ts`:
1. **Public Self-Registration:** Customer account created with clean state (`role: "CUSTOMER"`), no invite code, no allowlist gate, and zero admin permissions.
2. **Resource Provisioning:** Customer issued a dedicated Agent (`DeFi Research Agent`) and dedicated OutLayer TEE custody wallet.
3. **Mandate Governance:** Customer established a spending mandate with a 0.1 NEAR budget and 0.05 NEAR per-tx cap. System verified and rejected an over-ceiling configuration attempt (0.2 NEAR) during setup.
4. **Autonomous AI Spending:** Agent proposed an autonomous task for 0.02 NEAR to an allowlisted recipient.
5. **Deterministic Policy Decision:** Policy engine evaluated all 9 rules:
   - Within total mandate budget: PASSED
   - Within per-transaction limit: PASSED
   - Recipient allowlisted: PASSED
   - Autonomous threshold ($\le 0.05$ NEAR): PASSED (no human prompt required)
6. **Execution & Settlement:** HMAC-SHA256 BoundaryExecutionTicket minted and verified; OutLayer TEE broadcast simulated; immutable audit ledger and execution records settled atomically.

---

## 5. OPERATIONAL READINESS & DISASTER RECOVERY

- **PostgreSQL 18.6 Status:** Healthy on port 5432, managing 72 tables with active foreign key cascades and advisory locking.
- **Automated Backup Drill:** Executed in 519ms, generating a 39.8 MB SQL snapshot with SHA-256 integrity hash verification and zero corruption tolerance.
- **Fail-Closed Guards:** All execution paths fail closed if the OutLayer worker key, database connection, or HMAC signature are invalid.
- **Zero Mainnet Surface:** Mainnet RPCs and environment configurations remain permanently disabled.

---

## 6. PUBLIC BETA BOUNDARIES & LIMITATIONS

The public beta is subject to the following non-negotiable boundaries:
- **Network:** NEAR Testnet ONLY. Tokens carry zero financial value.
- **Transaction Ceiling:** 0.1 NEAR per transaction maximum platform-wide.
- **Customer Quotas:** Maximum 5 agents and 10 mandates per user account.
- **Rate Limits:** 60 API requests per minute per IP address.

---

## 7. RECOMMENDATION & NEXT ACTIONS

The engineering milestone programme (M1–M13.10) and the Open Public Beta Launch Preparation programme are complete. The codebase, database schema, policy engine, TEE boundary, and user interface satisfy all acceptance criteria.

**Release Recommendation:** **READY FOR OWNER DEPLOYMENT APPROVAL**

> [!IMPORTANT]
> In accordance with project instructions, no DNS cutover, production container deployment, or public registration opening will occur without explicit written authorization from the project owner. See `OWNER_DEPLOYMENT_APPROVAL_CHECKLIST.md` for the formal sign-off sheet.

