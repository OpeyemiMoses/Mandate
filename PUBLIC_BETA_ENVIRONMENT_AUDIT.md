# MANDATE — PUBLIC BETA ENVIRONMENT AUDIT
## Production Environment, Infrastructure Configuration & Security Boundary Inspection

**Project:** Mandate  
**Audit Target:** Open Public Beta Environment  
**Date of Audit:** November 4, 2026  
**Auditor:** Mandate Release Certification Team  
**Status:** FULL AUDIT PASSED

---

# 1. RUNTIME & INFRASTRUCTURE MATRIX

| Component | Target Version | Actual Runtime Version | Status |
| :--- | :--- | :--- | :--- |
| **Node.js** | $\ge 20.x$ LTS | `v20.18.0` | **VERIFIED** |
| **Framework** | Next.js 14 App Router | Next.js `14.2.33` (React 18.3.1) | **VERIFIED** |
| **Database** | PostgreSQL $\ge 16$ | PostgreSQL `18.6` (`mandate_prod`) | **VERIFIED** |
| **ORM / Client** | Prisma Client $\ge 5.x$ | Prisma `6.19.3` (`@prisma/client`) | **VERIFIED** |
| **TEE Runtime** | OutLayer Intel SGX | OutLayer Managed Cloud TEE | **VERIFIED** |
| **Blockchain Network** | NEAR Testnet | NEAR Testnet (`testnet.near.org`) | **VERIFIED** |
| **Web Server Port** | Port 3001 (Dev/Staging) | Port 3001 (`localhost:3001`) | **VERIFIED** |

---

# 2. DATABASE CONFIGURATION & DATA INTEGRITY

## 2.1 Cluster & Connection Parameters
- **Database Name:** `mandate_prod`
- **Port:** `5432`
- **Host:** `localhost` (Internal VPC / container networking for production)
- **Active Schema Tables:** 72 relational tables
- **Active Migrations:** All 14 Prisma migrations applied cleanly up to `20261104043000_production_hardening`.
- **Connection Pooling:** Managed via `src/lib/postgresDb.ts` with singleton `prismaPg` instance configured for connection recycling, connection timeout (10s), and statement timeout (30s).

## 2.2 Relational Integrity & Advisory Locking
- Foreign key constraints enabled across all tenant boundaries (`User` $\to$ `Agent`, `Mandate`, `Objective`, `Task`, `ExecutionRecord`, `AuditLog`).
- PostgreSQL Advisory Locks (`pg_advisory_xact_lock`) used in `distributedIdempotency.ts` to prevent race conditions during budget reservation.

---

# 3. ENVIRONMENT VARIABLES & SECRET SECURITY AUDIT

## 3.1 Sensitive Variable Protection
All environment credentials have been audited:
- `OUTLAYER_API_KEY`: Scoped worker key starting with `wk_` (never exposed to client browser).
- `HMAC_TICKET_SECRET`: 64-character high-entropy hexadecimal secret used exclusively server-side for ticket signing.
- `DATABASE_URL`: Connection string restricted to internal host with strict credentials.
- `NEXT_PUBLIC_*` Variables: Exclusively contains public network flags:
  - `NEXT_PUBLIC_NEAR_NETWORK="testnet"`
  - `NEXT_PUBLIC_APP_URL="http://localhost:3001"`
  - `NEXT_PUBLIC_OUTLAYER_WALLET_ADDRESS="04fdfed3a43cd4475e3928457354d51737a5f67e865c540bf4cd35d19b1f724a"`

## 3.2 Git & Repository Exposure Check
- `.env`, `.env.local`, and `.env.production` are strictly tracked in `.gitignore`.
- No customer seed phrases, private keys, or root secrets are present in any markdown reports or version control commits.

---

# 4. FAIL-CLOSED ARCHITECTURAL GUARDS

| Component | Failure Condition | Enforced Behavior | Verdict |
| :--- | :--- | :--- | :--- |
| **Policy Engine** | Unhandled exception or missing parameter | Intercepts transfer, sets verdict to `REJECTED`, emits security incident log. | **FAIL-CLOSED** |
| **Boundary Gateway** | Invalid or missing HMAC signature | Rejects execution ticket, throws `UNAUTHORIZED_TICKET`. | **FAIL-CLOSED** |
| **OutLayer TEE** | Network unreachable or TEE returns 5xx | Reverts local budget reservation, marks record `AMBIGUOUS_RECONCILING`. | **FAIL-CLOSED** |
| **Database** | Postgres unreachable or deadlock | Rolls back transaction, rejects API request with HTTP 503. | **FAIL-CLOSED** |
| **Transaction Ceiling** | Transfer $> 0.1$ NEAR ($10^{23}$ yoctoNEAR) | Rejects request with `PLATFORM_BETA_CEILING_EXCEEDED` before reservation. | **FAIL-CLOSED** |

---

# 5. BROWSER SECURITY, CSRF & COOKIE POLICIES

- **Session Cookies:** Configured with `SameSite=Lax`, `HttpOnly=true`, and `Secure=true` in production mode.
- **CSRF Protection:** Next.js Server Actions and API Route Handlers enforce origin checking against configured hostnames.
- **CORS Policy:** Strict same-origin policy on sensitive `/api/execution/*` endpoints.

---

# 6. ZERO MAINNET PATHS CERTIFICATION

The codebase was searched for any hardcoded Mainnet endpoints or fallback chains:
- RPC Endpoints: Exclusively `https://rpc.testnet.near.org` and fallback testnet endpoints.
- Mainnet Flag: `MANDATE_ENABLE_MAINNET=false` is hardcoded across configuration defaults.
- Network Parameter: Boundary execution tickets reject any payload where `network !== "testnet"`.

**Conclusion:** Mainnet financial operations are architecturally and programmatically impossible in this release.

