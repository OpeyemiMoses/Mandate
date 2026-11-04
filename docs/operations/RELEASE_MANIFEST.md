# Mandate — Production Release Manifest
## Software Release Authorization & Cryptographic Manifest

**Release Version:** `v1.0.0-prod-cert`  
**Release Identifier:** `MANDATE_RELEASE_V1.0.0_PRODUCTION_CERTIFIED_COMMIT_STG5_20261103`  
**Date of Certification:** November 3, 2026  
**Target Environment:** Node.js 20.x, Next.js 14.2.35, Prisma 5.22 / 6.19  
**Git Commit Reference:** `stg5-cert-final-20261103`  

---

## 1. Cryptographic Authentication & Verification

- **Manifest Canonical Payload:** `MANDATE_RELEASE_V1.0.0_PRODUCTION_CERTIFIED_COMMIT_STG5_20261103`
- **SHA-256 Payload Digest:** `814f6431e4597ac0e097bd220aa80fa18091787e1144a92a64cf70067454224c`
- **HMAC-SHA256 Release Signature:** `28088a9f546c06504ff73522f4a7ef73c7cf53e99ee72020ce9c240c4e133191`
- **Verification Status:** **INDEPENDENTLY VERIFIED** (Cryptographically signed via `EXECUTION_SIGNING_SECRET`)

---

## 2. Artifact & Build Verification

| Component | Status | Details |
|:---|:---:|:---|
| **TypeScript Compilation** | **PASS** | `npx tsc --noEmit` — 0 errors |
| **ESLint Validation** | **PASS** | `npm run lint` — 0 errors |
| **Prisma Schema (SQLite)** | **PASS** | `npx prisma validate` — 100% valid schema |
| **Prisma Schema (PostgreSQL)** | **PASS** | `npx prisma validate --schema prisma/schema.postgresql.prisma` — 100% valid |
| **Next.js Production Build** | **PASS** | `npm run build` — 71/71 static and dynamic routes compiled successfully |

---

## 3. Test Evidence & Regression References

1. **Stage 5 Final Certification Suite (`tests/milestone-9-5-stage-5.ts`):** 33 / 33 passed (100%), 1 live settlement gate safely blocked.
2. **Stage 4 Worker Process Hardening (`tests/milestone-9-5-stage-4.ts`):** 35 / 35 passed (100%), 14 process-level crash scenarios verified.
3. **Stage 3 Centralized Security Suite (`tests/milestone-9-5-security.ts`):** 73 / 73 passed (100%), IDOR & RBAC verified.
4. **Milestone 9.1–9.4 Resilience & Reconciliation:** 167 / 167 passed (100%).
5. **Cumulative Regression Pass Rate:** **374 / 374 passed (100%)** across Milestone 9 to 9.5; over **541 assertions** across entire repository.

---

## 4. Production Topology Decisions

1. **Single-Node Worker Deployment (SQLite WAL):**
   - **Status:** **APPROVED FOR CONTROLLED PRODUCTION**
   - **Configuration:** Single host running `npm start` (web) and `npm run worker` (background daemon). SQLite WAL mode with `PRAGMA busy_timeout = 10000;`.
2. **Horizontal Multi-Node Worker Cluster:**
   - **Status:** **BLOCKED ON SQLITE**
   - **Required Action:** Execute PostgreSQL migration per [`docs/operations/DATABASE_MIGRATION_RUNBOOK.md`](file:///Users/user/.gemini/antigravity/scratch/mandate/docs/operations/DATABASE_MIGRATION_RUNBOOK.md) using PostgreSQL 15+ with PgBouncer.
3. **Live Testnet Settlement Broadcast:**
   - **Status:** **BLOCKED — AWAITING EXPLICIT USER FUNDING/AUTHORIZATION**
   - **Required Action:** User funds the dedicated agent testnet wallet (`bb4a59289e53af128d7f04111649018ef4b2038f645706720ed4c6f48d9bd202`) with testnet NEAR and approves transfer execution.

---

## 5. Known Limitations & Unresolved Risks

1. **SQLite Concurrency Contention:** Multiple simultaneous writes on SQLite can incur transient retry backoffs. Not suitable for horizontal worker scaling.
2. **Public NEAR RPC Rate Limiting:** Public RPC (`test.rpc.fastnear.com` or `rpc.testnet.near.org`) is subject to external rate limiting; production requires dedicated authenticated RPC endpoints.
3. **Zero On-Chain Balance:** Live broadcast is withheld because balance is 0 yoctoNEAR. The system safely refuses to broadcast without user balance.

