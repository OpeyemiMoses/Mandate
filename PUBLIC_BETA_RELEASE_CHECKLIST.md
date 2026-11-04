# MANDATE — PUBLIC BETA RELEASE CHECKLIST
## Pre-Launch Operational Verification & Deployment Checklist

**Target:** Mandate Open Public Beta Release  
**Network:** NEAR Protocol Testnet ONLY  
**Database:** PostgreSQL 18.6  
**Auditor:** Release Operations Engineering  
**Date:** November 4, 2026  

---

## 1. PRE-RELEASE GATING CHECKLIST

### 1.1 Infrastructure & Environment
- [x] **PostgreSQL 18.6 Active:** Database is running on port 5432 with native client connection.
- [x] **Database Schema Migrated:** All Prisma migrations applied cleanly to `mandate_prod`.
- [x] **Node.js Environment:** Node.js v20+ with Next.js 16 app router operational.
- [x] **Zero Mock Keys in Production:** OutLayer TEE and Near AI keys verified active against live providers.
- [x] **Cryptographic Secrets Configured:** High-entropy 256-bit keys for session signing, execution envelopes, and credential vault.

### 1.2 Execution Boundary & Idempotency
- [x] **Sealed BoundaryExecutionTicket:** All execution paths require unforgeable tickets.
- [x] **Legacy Flags Removed:** Zero callers passing `{ authorizedBoundaryContext: true }`.
- [x] **PostgreSQL Advisory Locks:** `DistributedIdempotencyManager` active across all transfers.
- [x] **Duplicate Elimination:** Concurrency race tests confirm zero double-spends.
- [x] **Atomic yoctoNEAR Math:** All calculations use integer strings and `BigInt`.

### 1.3 Governance & Access Control
- [x] **Open Public Registration:** Any user can visit the site and onboard without invite codes.
- [x] **No Role Escalation:** Accounts starting with `admin-` receive `MEMBER` role.
- [x] **Admin Gate Protection:** Internal operator and security dashboards require explicit admin accounts.
- [x] **Tenant Scoping:** All queries enforce `where: { userId }`.
- [x] **Anti-Self-Certification:** `assertAntiSelfCertification` enforces independent step verification.

### 1.4 Blockchain & Hardware Custody
- [x] **Testnet-Only Enactment:** Mainnet requests fail closed with `MAINNET_EXECUTION_PROHIBITED`.
- [x] **Testnet UI Labeling:** Prominent badges identify "NEAR Testnet - OutLayer TEE".
- [x] **Zero Real Funds:** Documentation and onboarding state that testnet tokens have no monetary value.
- [x] **OutLayer Intel SGX Active:** Hardware enclave signs transactions with dedicated keys.
- [x] **FastNear RPC Connected:** Independent transaction and receipt confirmation active.

---

## 2. RELEASE ROLLOUT SEQUENCE

```
1. DATABASE RECONCILIATION
   Run `npx prisma db push` or verify schema consistency on PostgreSQL 18.6.
   Verify database connectivity with `SELECT 1;`.

2. ENVIRONMENT VERIFICATION
   Ensure NEAR_NETWORK=testnet is exported.
   Ensure OUTLAYER_API_BASE_URL=https://testnet-api.outlayer.ai is exported.
   Ensure DATABASE_URL points to PostgreSQL.

3. ACCEPTANCE TEST SUITE EXECUTION
   Execute `npx tsx tests/milestone-13-10-acceptance.ts`.
   Confirm 25/25 Release Gates pass with exit code 0.

4. HEALTH & OPERATIONAL CHECK
   Query `/api/health` and verify database, RPC, and TEE status are HEALTHY.
   Verify OperationalMode is set to NORMAL.

5. OPEN PUBLIC REGISTRATION TRAFFIC
   Enable DNS / ingress traffic to public beta endpoints.
   Monitor FastNear RPC rate limits and OutLayer latency.
```

---

## 3. ROLLBACK TRIGGERS

If any of the following occur during public beta:
1. An OutLayer transfer occurs without a corresponding `ExecutionRecord` in PostgreSQL.
2. An agent executes a transaction exceeding mandate limits or approval thresholds.
3. Database advisory locks fail to serialize concurrent requests.

**Action:** Execute immediate emergency lockdown:
```bash
npx tsx -e '
import { OperationalControlService } from "./src/lib/operations/operationalControlService";
OperationalControlService.transitionState({
  newMode: "EMERGENCY_LOCKDOWN",
  reason: "Automated rollback trigger tripped",
  actorId: "sec-admin",
  actorRole: "SECURITY_ADMIN",
  isAgent: false,
  actionType: "LOCKDOWN_SYSTEM"
});
'
```

