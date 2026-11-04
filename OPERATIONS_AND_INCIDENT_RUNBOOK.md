# MANDATE — OPERATIONS AND INCIDENT RUNBOOK
## Operational Procedures, Incident Triage & Emergency Controls

**System:** Mandate Autonomous Spending & Agent Treasury Platform  
**Target Audience:** Site Reliability Engineers (SRE), Security Operations (SecOps), Platform Operators  
**Release:** Open Public Beta (NEAR Testnet)  
**Date:** November 4, 2026  

---

## 1. INCIDENT SEVERITY LEVELS

| Level | Severity | Description | Response Time | Escalation Path |
| :--- | :--- | :--- | :--- | :--- |
| **SEV-1** | **CRITICAL** | Unauthorized financial signing, double-spending, boundary bypass, or data leakage across tenants | **< 5 minutes** | Immediate Emergency Lockdown; page Lead Security Engineer & Core Team |
| **SEV-2** | **HIGH** | OutLayer TEE gateway unreachable, FastNear RPC outage, or high background job failure rate | **< 15 minutes** | Pause financial executions; switch to secondary RPC node |
| **SEV-3** | **MEDIUM** | Slow RPC responses, high worker queue backlog, or non-critical UI degradation | **< 1 hour** | Scale background worker instances; investigate latency |
| **SEV-4** | **LOW** | Minor UI formatting glitches, documentation typos, non-blocking telemetry warnings | **Next business day** | Standard sprint backlog |

---

## 2. EMERGENCY OPERATIONAL COMMANDS

All emergency commands must be executed using an authorized administrative identity (`SECURITY_ADMIN` or `OPERATOR`). AI agents are strictly blocked from invoking operational state transitions.

### 2.1 Pause Financial Executions (Zero New Transfers)
Halts all new financial execution requests, while allowing users to query existing mandates, view activity, and adjust limits.
```typescript
import { OperationalControlService } from "@/lib/operations/operationalControlService";

await OperationalControlService.transitionState({
  newMode: "FINANCIAL_EXECUTION_PAUSED",
  reason: "Investigating anomalous transaction spike on NEAR Testnet",
  actorId: "operator-ops-1",
  actorRole: "OPERATOR",
  isAgent: false,
  actionType: "PAUSE_FINANCIAL_EXECUTION",
});
```

### 2.2 Emergency Full Platform Lockdown
Immediately terminates all active agent executions, pauses background job dispatchers, and halts all financial signing.
```typescript
await OperationalControlService.transitionState({
  newMode: "EMERGENCY_LOCKDOWN",
  reason: "Critical boundary security alert under investigation",
  actorId: "sec-admin-1",
  actorRole: "SECURITY_ADMIN",
  isAgent: false,
  actionType: "LOCKDOWN_SYSTEM",
});
```

### 2.3 Resume Normal Operations
Restores full autonomous execution, agent planning, and financial transactions.
```typescript
await OperationalControlService.transitionState({
  newMode: "NORMAL",
  reason: "Incident investigation complete; systems verified healthy",
  actorId: "sec-admin-1",
  actorRole: "SECURITY_ADMIN",
  isAgent: false,
  actionType: "RESUME_FINANCIAL_EXECUTION",
});
```

---

## 3. INCIDENT TRIAGE PLAYBOOKS

### Playbook A: Suspected Double-Spend or Replay Attempt
1. Check `DistributedIdempotencyManager` logs for PostgreSQL lock timeouts:
   ```bash
   grep -i "pg_advisory_xact_lock" /var/log/mandate/app.log
   ```
2. Verify unique constraints on `ExecutionRecord`:
   ```sql
   SELECT idempotency_key, COUNT(*) FROM "ExecutionRecord" GROUP BY idempotency_key HAVING COUNT(*) > 1;
   ```
   *(Must return 0 rows).*
3. If duplicate transactions are discovered on NEAR Testnet explorer, immediately trigger **Emergency Lockdown (Section 2.2)**.

### Playbook B: FastNear RPC Outage or Throttling
1. FastNear returns HTTP 429 or 503.
2. Update environment variable in container configuration:
   ```bash
   export NEAR_RPC_URL="https://rpc.testnet.near.org"
   ```
3. Restart Next.js server instance:
   ```bash
   kill -HUP $(pgrep -f "next dev")
   ```
4. Run background reconciliation:
   ```typescript
   import { reconcilePendingTransactions } from "@/lib/reconciliation";
   await reconcilePendingTransactions();
   ```

### Playbook C: Stale Worker Lease Clearance
1. If background worker dies during objective execution, its lease will expire (`leaseExpiresAt < NOW()`).
2. Run automated lease recovery:
   ```typescript
   import { prisma } from "@/lib/db";
   await prisma.backgroundJob.updateMany({
     where: {
       status: "RUNNING",
       leaseExpiresAt: { lt: new Date() },
     },
     data: {
       status: "QUEUED",
       workerId: null,
       leaseExpiresAt: null,
     },
   });
   ```

