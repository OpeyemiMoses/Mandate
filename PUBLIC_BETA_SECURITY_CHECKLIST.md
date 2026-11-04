# MANDATE — PUBLIC BETA SECURITY CHECKLIST
## Pre-Release Security Controls, Key Isolation & Adversarial Defense Audit

**Release Target:** Open Public Beta  
**Scope:** Core Infrastructure, Policy Firewall, TEE Boundary, Database & Web API  
**Auditor:** Mandate Security & Architecture Certification  
**Date:** November 4, 2026  
**Status:** 100% CONTROLS VERIFIED

---

# 1. SECURITY CONTROLS VERIFICATION MATRIX

| ID | Security Control Domain | Enforced Mechanism | Test Method | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **Key Isolation** | AI agents and frontend clients never hold private keys; signing occurs exclusively inside OutLayer TEE. | Architectural Review | **VERIFIED** |
| **SEC-02** | **HMAC Ticket Sealing** | Execution tickets sealed with HMAC-SHA256 over 12 parameters (`objectiveId`, `amount`, `to`, nonces, etc.). | Adversarial Tamper Tests | **VERIFIED** |
| **SEC-03** | **Single-Use Tickets** | Tickets consumed atomically inside transaction boundary; replayed tickets rejected. | Concurrency Injection | **VERIFIED** |
| **SEC-04** | **Platform Beta Ceiling** | Non-bypassable 0.1 NEAR ($10^{23}$ yoctoNEAR) hard cap enforced across 4 independent server layers. | Boundary Unit & Integration | **VERIFIED** |
| **SEC-05** | **Tenant Data Isolation** | All Prisma PG queries scoped by authenticated `userId`; cross-tenant access returns 404/403. | Multi-User Scoping Tests | **VERIFIED** |
| **SEC-06** | **Zero Admin via Wallet** | Connecting a NEAR wallet creates `role: "CUSTOMER"`; administrative endpoints check server tokens. | RBAC Elevation Tests | **VERIFIED** |
| **SEC-07** | **Postgres Advisory Locks** | Concurrency conflicts on budget reservation serialized using `pg_advisory_xact_lock`. | Multi-Process Node Tests | **VERIFIED** |
| **SEC-08** | **Immutable Audit Ledger** | Execution events written append-only to relational `AuditLog` table with cryptographic hashes. | Ledger Audit Verification | **VERIFIED** |
| **SEC-09** | **Fail-Closed Policy** | Any missing parameter, unhandled exception, or timeout defaults to `REJECTED`. | Fault-Injection Drills | **VERIFIED** |
| **SEC-10** | **Rate Limiting & Abuse** | API endpoints throttled at 60 requests/minute per IP; quotas limit 5 agents and 10 mandates per user. | Gateway Stress Testing | **VERIFIED** |
| **SEC-11** | **Network Boundary** | RPC endpoints locked to NEAR Testnet; tickets with `network !== "testnet"` rejected immediately. | Network Assertions | **VERIFIED** |
| **SEC-12** | **Disaster Recovery** | Database snapshot automated with SHA-256 integrity verification and tamper detection. | Live Backup Drill | **VERIFIED** |

---

# 2. KEY ARCHITECTURAL PROOFS

### 2.1 Private Key Containment
- Neither the AI agent planner nor the web server application code possesses or manages NEAR private keys.
- Custody addresses are provisioned through OutLayer Managed Intel SGX enclaves.
- The only outbound network action from the Mandate server is an authenticated, TLS 1.3 HTTPS request transmitting an authorized `BoundaryExecutionTicket` to OutLayer.

### 2.2 Replay & Nonce Defense
- Each `BoundaryExecutionTicket` includes a unique 32-character cryptographic `nonce` and a 60-second expiration window (`expiresAt`).
- Upon execution receipt, the ticket is registered inside a PostgreSQL unique constraint table (`ConsumedTicket`). Any subsequent submission of the same nonce or execution ID triggers a unique constraint collision and is rejected.

### 2.3 Timing-Attack Resistance
HMAC verification in `validateBoundaryExecutionTicket` employs `crypto.timingSafeEqual` over fixed-length buffer digests:
```typescript
const hmacBuf = Buffer.from(ticket.hmacSignature, "hex");
const expectedBuf = Buffer.from(expectedHmac, "hex");

if (hmacBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(hmacBuf, expectedBuf)) {
  return { valid: false, error: "TICKET_INVALID_SIGNATURE" };
}
```

---

# 3. CONCLUSION

All 12 security controls are certified active, tested against adversarial inputs, and enforced in the production release candidate.

