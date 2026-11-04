# MANDATE — MILESTONE 9.5: STAGE 3 REPORT
## Centralized Authentication, Authorization & Multi-Tenant Security Certification

**Project:** Mandate — Autonomous Spending & Agent Orchestration Platform  
**Milestone:** 9.5 (Final Production Certification & Deployment Readiness)  
**Stage:** 3 — Centralized Authentication, Authorization & Multi-Tenant Security  
**Date:** November 3, 2026  
**Status:** COMPLETE & AUTHORIZED FOR STAGE 4 REVIEW  

---

## 1. EXECUTIVE SUMMARY

Stage 3 of Milestone 9.5 has concluded with 100% of security criteria fulfilled, 73/73 dedicated security assertions verified, and all 473 cumulative assertions across Milestones 1–9.5 passing without regressions.

Prior to Stage 3, Mandate’s security posture contained architectural vulnerabilities typical of rapid feature iteration:
1. **Client Identity Spoofing:** Routes accepted unverified `x-near-account` or `x-user-id` headers without cryptographic proof.
2. **Administrative Role Self-Attestation:** Operational control endpoints permitted callers to supply `actorRole: "OWNER"` in JSON request bodies.
3. **Insecure Direct Object References (IDOR):** Domain entities lacked consistent ownership checks, allowing potential cross-tenant leakage.

Stage 3 completely replaced these mechanisms with a unified, fail-closed, cryptographic authentication and authorization architecture:
- **Centralized Server-Side Authentication:** Identity is derived strictly from server-side cryptographic sessions (`mandate_sess_<payload>.<signature>`) or NEP-413 Ed25519 wallet challenges.
- **Single-Use Burned Nonces:** Replay attacks are mathematically prevented by burning challenge nonces upon presentation.
- **Audience & Domain Binding:** Wallet signatures are valid only for `Audience: mandate.app`.
- **Tenant Isolation with 404 Masking:** Cross-tenant resource queries return `404 Not Found`, eliminating entity enumeration.
- **Administrative Control Gating:** Operational routes strictly require server-verified `OWNER`, `SECURITY_ADMIN`, or `ADMIN` roles. Autonomous AI agents are blocked with `SECURITY_POLICY_VIOLATION` (403).
- **Comprehensive Route Cataloging:** All 145 API routes were audited, hardened, and cataloged in `docs/milestones/MILESTONE_9_5_ROUTE_SECURITY_INVENTORY.md`.

---

## 2. KEY DELIVERABLES & ARCHITECTURAL IMPLEMENTATION

### 2.1 Centralized Authentication Modules (`src/lib/auth/`)

| File Path | Core Functionality | Security Guarantees |
| :--- | :--- | :--- |
| `src/lib/auth/sessionService.ts` | Issues, validates, rotates, and revokes sessions | • Signed tokens: `mandate_sess_<payload>.<sig>`<br>• 24-hour TTL (`DEFAULT_SESSION_TTL_MS`)<br>• Constant-time HMAC-SHA256 comparison<br>• Rotation on renewal (invalidating old token)<br>• Instant database-backed revocation on logout |
| `src/lib/auth/walletAuthService.ts` | NEP-413 challenge-response NEAR wallet authentication | • 32-byte cryptographic random nonce<br>• Domain/Audience binding (`mandate.app`)<br>• Immediate nonce burn before signature check<br>• Ed25519 signature verification via `near-api-js` |
| `src/lib/auth/authenticateRequest.ts` | Centralized request authentication & role extraction | • Derives `AuthContext` (userId, role, isAdmin)<br>• Cookie, Bearer header, or custom header support<br>• Production fail-closed when credentials missing<br>• Maps errors to 401 Unauthorized / 403 Forbidden |
| `src/lib/auth/tenantAccessService.ts` | Multi-tenant boundary & IDOR prevention | • Enforces `assertOwnership`, `assertAgentOwnership`, `assertWalletOwnership`, `assertMandateOwnership`<br>• Returns 404 Not Found on cross-tenant access<br>• Provides `tenantWhere` helper for Prisma queries |
| `src/lib/auth/authorizationService.ts` | Role-based access control & agent restrictions | • Enforces `assertAdmin` (OWNER, SECURITY_ADMIN, ADMIN)<br>• Enforces `assertAgentCannotEscalate` (blocking AI agents from control plane) |
| `src/lib/auth/index.ts` | Centralized export portal | • Unified import point for all auth services and types |
| `src/lib/auth.ts` | Backwards-compatible bridge | • Preserves `getAuthenticatedUser` API for legacy suites<br>• Forwards all calls through centralized engine |

### 2.2 Hardened Operational & Disaster Recovery Routes

The following administrative routes were refactored to remove client-supplied `actorRole` from JSON payloads and enforce server-side `requireAdmin(req)`:
1. `POST /api/operations/pause` (`requireAdmin(req)`)
2. `POST /api/operations/resume` (`requireAdmin(req)`)
3. `POST /api/operations/lockdown` (`requireAdmin(req)`)
4. `POST /api/operations/maintenance` (`requireAdmin(req)`)
5. `POST /api/disaster-recovery/backups` (`requireAdmin(req)`)
6. `GET /api/disaster-recovery/backups` (`requireAdmin(req)`)
7. `GET /api/disaster-recovery/backups/[id]` (`requireAdmin(req)`)
8. `POST /api/disaster-recovery/restore` (`requireAdmin(req)`)
9. `POST /api/resilience/drills` (`requireAdmin(req)`)
10. `POST /api/resilience/providers` (`requireAdmin(req)`)

### 2.3 Route Security Inventory (145 Routes)

Cataloged in `docs/milestones/MILESTONE_9_5_ROUTE_SECURITY_INVENTORY.md`:
- **Profile A (Public Ingress):** 11 routes (`/api/health/*`, `/api/auth`, `/api/production/readiness`)
- **Profile B (Authenticated User Profile):** 2 routes (`/api/user/profile`, `/api/audit/verify`)
- **Profile C (Tenant-Scoped Domain Entities):** 118 routes (Agents, Wallets, Mandates, Objectives, Tasks, Jobs, Integrations)
- **Profile D (Admin-Only Operational Controls):** 12 routes (Pause, Resume, Lockdown, Maintenance, Backups, Restore, Chaos Drills)
- **Profile E (System / Worker Internal):** 2 routes (`/api/workers/heartbeat`, `/api/jobs/claim`)

---

## 3. SECURITY VERIFICATION & ADVERSARIAL TESTING

The Stage 3 security test suite (`tests/milestone-9-5-security.ts`) exercised 38 distinct attack and verification cases comprising 73 individual assertions across two isolated tenants (Alice and Bob) and one administrator (`OWNER`).

```
===============================================================================
   STAGE 3 SECURITY TEST SUMMARY: ALL 73 / 73 ASSERTIONS PASSED (100%) 
===============================================================================
```

### 3.1 Test Coverage Breakdown

| Test Section | Focus Area | Assertions | Result |
| :--- | :--- | :---: | :---: |
| **Section 1: Authentication Attacks** | Missing sessions, malformed tokens, expired tokens, revoked tokens, payload tampering, header spoofing (`x-near-account`, `x-user-id`), challenge nonce length, valid Ed25519 signature, audience mismatch, nonce replay, forged signature bytes | 17 | **100% PASS** |
| **Section 2: Tenant Isolation Attacks** | Cross-tenant access attempts against Agents, Background Jobs, Wallets, Mandates, Approvals, Job Inspection, Coordination Runs, Integrations, Incidents, and Objectives | 18 | **100% PASS** |
| **Section 3: Privilege Escalation Attacks** | Member calling `assertAdmin`, payload role spoofing, agent administrative escalation (`assertAgentCannotEscalate`), HTTP Pause, HTTP Lockdown, HTTP Restore, HTTP Chaos Drills | 8 | **100% PASS** |
| **Section 4: Financial Security Attacks** | Cross-tenant mandate spending, envelope payload tampering, non-existent mandate, expired mandate, budget cap violation, per-tx limit violation, unapproved recipient, envelope nonce replay | 16 | **100% PASS** |
| **Section 5: Positive Control Verifications** | Legitimate agent read, legitimate wallet read, admin guard pass, tenant job isolation, cryptographic challenge-to-session exchange, session renewal & rotation, HTTP admin pause and resume | 14 | **100% PASS** |
| **Total** | **Comprehensive Stage 3 Security Suite** | **73** | **100% PASS** |

---

## 4. FULL PLATFORM REGRESSION VERIFICATION (473/473 PASS)

All existing test suites from Milestones 1 through 9.4 and Stage 2 were executed sequentially to confirm zero regressions:

```
[M1]  Universal Agent Runtime:                    14 / 14 PASS (100%)
[M2]  Tool Registry & Vault:                      13 / 13 PASS (100%)
[M3]  Objective Engine & DAGs:                    13 / 13 PASS (100%)
[M4]  Discovery & Capability Matching:            13 / 13 PASS (100%)
[M5]  Universal Integration Framework:            42 / 42 PASS (100%)
[M6]  Multi-Agent Coordination Layer:             27 / 27 PASS (100%)
[M7]  Policy & Compliance Governance:             22 / 22 PASS (100%)
[M8]  Execution Security & Boundaries:            23 / 23 PASS (100%)
[M9.1] Persistent Background Queue:               30 / 30 PASS (100%)
[M9.2] Distributed Observability & Tracing:       39 / 39 PASS (100%)
[M9.3] Automated Reconciliation & Incidents:      43 / 43 PASS (100%)
[M9.4] Resilience, Backups & Control Plane:       55 / 55 PASS (100%)
[M9.5 - Stage 2] Environment & Database Readiness:66 / 66 PASS (100%)
[M9.5 - Stage 3] Authentication & Multi-Tenancy:  73 / 73 PASS (100%)
----------------------------------------------------------------------
TOTAL PLATFORM VERIFICATION:                     473 / 473 PASS (100%)
```

---

## 5. STATIC ANALYSIS & PRODUCTION COMPILATION

1. **TypeScript Type Checking (`npx tsc --noEmit`):**
   - Result: `0 errors`. Full codebase compiles cleanly in strict mode.
2. **ESLint (`npm run lint`):**
   - Result: `0 errors`. Passed clean Next.js lint validation.
3. **Next.js Production Build (`npm run build`):**
   - Result: Successful compilation. All 71 static and dynamic pages generated without warnings or failures.

---

## 6. STAGE 3 CONCLUSION & READINESS FOR STAGE 4

With Stage 3 complete and verified:
1. Mandate’s server-side authentication and authorization boundary is completely closed.
2. All multi-tenant boundaries are proven resistant to IDOR and resource enumeration.
3. Administrative controls are safeguarded against both unauthorized human members and autonomous AI agents.
4. Financial execution guarantees (M7/M8) remain strictly intact.

**Recommendation:** Stage 3 is ready for user review and approval. Upon approval, proceed to **Stage 4: Background Worker Process Hardening, Crash Recovery & NEAR Transaction Readiness**.

