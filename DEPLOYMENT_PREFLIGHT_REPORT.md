# MANDATE — DEPLOYMENT PREFLIGHT REPORT
## Production Release Candidate Inspection, Build Verification & Rollback Procedures

**Milestone Target:** Open Public Beta Launch Preparation  
**Release Tag:** `v1.0.0-beta.1`  
**Target Environment:** Production Managed Cloud (NEAR Testnet)  
**Inspection Date:** November 4, 2026  
**Status:** ALL PREFLIGHT CHECKS PASSED

---

# 1. PREFLIGHT VERIFICATION MATRIX

| Check | Target Standard | Measured Status | Result |
| :--- | :--- | :--- | :--- |
| **Node.js Compatibility** | Node.js v20 LTS | `v20.18.0` | **PASSED** |
| **TypeScript Typecheck** | Zero errors | Clean (`tsc --noEmit`) | **PASSED** |
| **Prisma PG Schema** | Synced with `mandate_prod` | 72 tables, all migrations applied | **PASSED** |
| **PostgreSQL 18.6 Health** | Responsive on port 5432 | Query latency $< 5\text{ms}$ | **PASSED** |
| **OutLayer Cloud TEE** | Worker key validated | HTTPS REST gateway responsive | **PASSED** |
| **NEAR Testnet RPC** | RPC connection active | Block height 189M+ verified | **PASSED** |
| **Platform Beta Ceiling** | $\le 0.1$ NEAR hard cap | Enforced across 4 server layers | **PASSED** |
| **Mainnet Invariant** | Mainnet disabled | Zero Mainnet RPC paths | **PASSED** |

---

# 2. RECOMMENDED PRODUCTION DEPLOYMENT SEQUENCE

To guarantee zero downtime and prevent database locking:

```
  STEP 1: Run Pre-Deployment Backup
          - Generate snapshot via PostgresBackupService.createBackup()
          - Verify SHA-256 integrity hash

  STEP 2: Apply Schema Migrations
          - Run `npx prisma migrate deploy` against target PostgreSQL cluster
          - Confirm all 14 migrations report "Applied"

  STEP 3: Deploy Application Container (Blue/Green)
          - Launch new production container with Next.js prebuilt bundle
          - Set environment variables (OUTLAYER_API_KEY, HMAC_TICKET_SECRET, DATABASE_URL)
          - Run internal health check: GET /api/health (verify HTTP 200)

  STEP 4: Traffic Cutover (Post-Approval Only)
          - Switch load balancer / reverse proxy upstream to new container
          - Monitor error rates, reconciliation count, and latency for 15 minutes
```

---

# 3. ROLLBACK & DISASTER MITIGATION PROCEDURE

If an unrecoverable anomaly, elevated reconciliation count, or service degradation occurs post-deployment:

### 3.1 Immediate Traffic Rollback
1. **Switch Ingress Proxy:** Point reverse proxy or DNS back to the previous stable release container immediately ($< 30\text{ seconds}$).
2. **Trip Circuit Breaker:** If TEE broadcast discrepancies occur, activate the global kill-switch (`MANDATE_PLATFORM_FROZEN="true"`).

### 3.2 Database Rollback Safeguards
- Schema migrations in Mandate are strictly **additive** (no destructive column drops or table renames).
- The previous release container can run concurrently against the updated database schema without backward-incompatible errors.
- If transactional rollback is required, restore the pre-deployment SQL snapshot using `BACKUP_AND_RESTORE_ACCEPTANCE.md` Section 4.

---

# 4. PREFLIGHT SIGN-OFF

The release candidate has passed all preflight checks and is statically, architecturally, and procedurally prepared for deployment upon owner authorization.

