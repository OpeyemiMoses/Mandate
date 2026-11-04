# Mandate — Production Deployment & Operations Runbook
## Autonomous Treasury Operating System — Release Deployment Guide

**Document Version:** 1.0.0  
**Effective Date:** November 3, 2026  
**System Classification:** Production Tier-1 Financial Infrastructure  

---

## 1. System Overview & Deployment Topology

Mandate is an autonomous agent treasury and spending orchestration platform. The runtime architecture is strictly partitioned into two independent OS processes:

1. **Web Server Process:** Next.js 14 server serving the user dashboard, administrative interfaces, and REST API endpoints.
2. **Dedicated Background Worker Daemon:** Standalone Node.js process executing asynchronous jobs, monotonic lease fencing, and OutLayer/NEAR blockchain dispatches.

```
+-----------------------------------------------------------------------------------+
|                              Load Balancer / Ingress                              |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        Web Server Process (Next.js 14)                            |
|  - Command: `npm start` (port 3000)                                               |
|  - Health: GET /api/health/live (Liveness), GET /api/health/ready (Readiness)     |
|  - Enforces: Centralized Session Auth, IDOR Isolation (404), RBAC Rules (403)     |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                            Database / Storage Layer                               |
|  - Single-Node Production: SQLite in WAL Mode (dev.db, busy_timeout=10000)        |
|  - Distributed Production: PostgreSQL 15+ with PgBouncer                          |
+-----------------------------------------------------------------------------------+
                                         ^
                                         |
+-----------------------------------------------------------------------------------+
|                     Background Worker Daemon (Standalone Node.js)                 |
|  - Command: `npm run worker`                                                      |
|  - Polling Loop: Atomic CAS claims, Monotonic Generation Fencing                  |
|  - Financial Boundary: Durable DispatchIntent -> OutLayer TEE -> NEAR Settlement  |
|  - Signal Handling: POSIX SIGTERM / SIGINT graceful drain (10s window)            |
+-----------------------------------------------------------------------------------+
```

---

## 2. Production Process Lifecycle Commands

### 2.1 Web Server Process
```bash
# Build production bundle
npm run build

# Start production server
npm start -- -p 3000
```

### 2.2 Dedicated Background Worker Process
```bash
# Start standalone worker daemon
npm run worker

# Optional: Run single claim cycle for cron / batch execution
npm run worker -- --once

# Optional: Start with specific capabilities
npm run worker -- --capabilities financial_execution,coordination
```

---

## 3. Environment Secret Configuration

All production secrets must meet or exceed the 32-character high-entropy threshold and be provisioned via secret managers (e.g. AWS Secrets Manager, HashiCorp Vault). **Insecure hardcoded fallbacks are strictly rejected fail-closed.**

| Environment Variable | Classification | Description | Minimum Format |
|:---|:---:|:---|:---:|
| `DATABASE_URL` | REQUIRED | SQLite database path or PostgreSQL connection string | `file:./dev.db` or `postgresql://...` |
| `SESSION_SECRET` | REQUIRED | HMAC signing secret for cookie sessions | ≥ 32 characters high entropy |
| `EXECUTION_SIGNING_SECRET` | REQUIRED | HMAC secret for cryptographic spend envelopes | ≥ 32 characters high entropy |
| `CREDENTIAL_VAULT_MASTER_KEY_V1` | REQUIRED | AES-256 key for tool and integration credentials | ≥ 32 characters high entropy |
| `TOOL_ENCRYPTION_KEY` | REQUIRED | Encryption key for tool parameter payloads | ≥ 32 characters high entropy |
| `OUTLAYER_API_BASE_URL` | REQUIRED | OutLayer TEE gateway URL | Valid HTTPS URL |
| `NEAR_RPC_URL` | REQUIRED | FastNEAR or private NEAR RPC endpoint | Valid HTTPS URL |
| `NEAR_NETWORK` | REQUIRED | NEAR network identifier | `testnet` (or `mainnet`) |
| `NODE_ENV` | REQUIRED | Environment runtime flag | `production` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OPTIONAL | Remote OpenTelemetry collector endpoint | URL (or unset for local logging) |

---

## 4. Health Checks & Monitoring Probes

### 4.1 Web Liveness Probe (`GET /api/health/live`)
Returns HTTP 200 if the Node.js event loop is responsive.
```bash
curl -f http://localhost:3000/api/health/live
```
```json
{
  "status": "ALIVE",
  "pid": 53187,
  "uptimeSeconds": 720,
  "memoryUsageMb": 134,
  "timestamp": "2026-11-03T14:12:00.000Z"
}
```

### 4.2 Web Readiness Probe (`GET /api/health/ready`)
Returns HTTP 200 if database connectivity, secret integrity, and RPC network state are operational.
```bash
curl -f http://localhost:3000/api/health/ready
```

### 4.3 Worker Health Monitoring
Worker instances emit heartbeats to the `BackgroundWorker` table every 10 seconds.
Inspect active workers via API:
```bash
curl -H "Cookie: mandate_session=OPERATOR_SESSION" http://localhost:3000/api/workers
```

---

## 5. Operational Emergency Controls

Mandate features a centralized operational control plane capable of halting execution within milliseconds without redeploying code.

### 5.1 Emergency Financial Pause
Immediately stops all outbound OutLayer and NEAR financial disbursements while allowing general non-financial background tasks to continue:
```bash
curl -X POST http://localhost:3000/api/operations/pause \
  -H "Cookie: mandate_session=ADMIN_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"action": "PAUSE_FINANCIAL_EXECUTION", "reason": "Investigating unusual transaction spike"}'
```

### 5.2 Security Lockdown
Immediately terminates all worker claims, blocks all tool invocations, and revokes active API execution envelopes:
```bash
curl -X POST http://localhost:3000/api/operations/lockdown \
  -H "Cookie: mandate_session=ADMIN_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"action": "ENTER_LOCKDOWN", "reason": "Security incident response"}'
```

### 5.3 Normal Operation Resume
```bash
curl -X POST http://localhost:3000/api/operations/resume \
  -H "Cookie: mandate_session=ADMIN_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"action": "RESUME_EXECUTION", "reason": "Incident cleared"}'
```

---

## 6. Disaster Recovery: Backups & Restore

### 6.1 Creating an Immediate Snapshot Backup
```bash
curl -X POST http://localhost:3000/api/disaster-recovery/backups \
  -H "Cookie: mandate_session=ADMIN_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Pre-deployment snapshot"}'
```

### 6.2 Restoring from Backup
```bash
curl -X POST http://localhost:3000/api/disaster-recovery/restore \
  -H "Cookie: mandate_session=ADMIN_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"backupId": "backup_snapshot_id_here", "confirm": true}'
```

---

## 7. Graceful Shutdown & Drain Sequence

When updating or terminating worker instances (e.g. Kubernetes pod termination or rolling update):
1. **Signal Delivery:** Ingress/system sends `SIGTERM`.
2. **Interception:** Worker process catches `SIGTERM`, sets `isShuttingDown = true`, and stops claiming new jobs.
3. **In-Flight Drain:** Active jobs are granted up to 10 seconds to finish execution and release or complete leases cleanly.
4. **Clean Exit:** Once in-flight jobs complete, database connections are closed and process exits code 0.

