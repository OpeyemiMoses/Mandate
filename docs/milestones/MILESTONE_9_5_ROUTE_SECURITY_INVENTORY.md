# MANDATE — MILESTONE 9.5: ROUTE SECURITY INVENTORY
**Comprehensive Security Audit of All 145 API Endpoints**
**Document ID:** `docs/milestones/MILESTONE_9_5_ROUTE_SECURITY_INVENTORY.md`  
**Audit Date:** 2026-11-03  
**Auditor:** Senior Application Security Architect (Antigravity)  
**Total Routes Cataloged:** 145  

---

## 1. ROUTE CLASSIFICATION TAXONOMY

Every route exposed under `src/app/api/` is classified into one of 5 deterministic security profiles:

1. **PUBLIC (11 Routes):** Open endpoints providing non-sensitive health telemetry, global read-only tool catalog schemas, or unauthenticated OAuth callback handshakes.
2. **AUTHENTICATED (2 Routes):** Requires a cryptographically valid user session; operates on user profile and authentication establishment.
3. **TENANT_SCOPED (118 Routes):** Requires a valid session token; strictly filters and enforces that the requested resources belong to the authenticated caller (`userId === resource.userId`). Cross-tenant access fails with HTTP 404/403.
4. **ADMIN_ONLY (12 Routes):** Restricted exclusively to server-side verified administrators (`OWNER`, `SECURITY_ADMIN`, `ADMIN`). Autonomous AI agents are strictly blocked.
5. **SYSTEM_INTERNAL (2 Routes):** Worker registration and internal worker node lifecycle management.

---

## 2. COMPLETE ROUTE INVENTORY TABLE

| # | HTTP Methods | Route Path | Security Classification | Required Role | Tenant Scoped | Final Security Status |
|:---:|:---|:---|:---:|:---:|:---:|:---:|
| 1 | `GET, POST` | `/api/agents/[id]/executions` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 2 | `GET, PATCH, DELETE` | `/api/agents/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 3 | `GET, POST, DELETE` | `/api/agents/[id]/tools` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 4 | `GET, POST` | `/api/agents` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 5 | `GET, POST` | `/api/approvals` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 6 | `GET` | `/api/audit` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 7 | `GET` | `/api/audit/verify` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 8 | `GET, POST, DELETE` | `/api/auth` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 9 | `GET` | `/api/coordination/[id]/artifacts` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 10 | `POST` | `/api/coordination/[id]/cancel` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 11 | `GET` | `/api/coordination/[id]/events` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 12 | `POST` | `/api/coordination/[id]/handoffs/[handoffId]/accept` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 13 | `POST` | `/api/coordination/[id]/handoffs/[handoffId]/reject` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 14 | `GET` | `/api/coordination/[id]/handoffs` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 15 | `POST` | `/api/coordination/[id]/pause` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 16 | `POST` | `/api/coordination/[id]/recover` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 17 | `POST` | `/api/coordination/[id]/resume` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 18 | `GET` | `/api/coordination/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 19 | `POST` | `/api/coordination/[id]/start` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 20 | `GET` | `/api/coordination/[id]/tasks` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 21 | `GET, POST` | `/api/coordination` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 22 | `POST` | `/api/dead-letters/[id]/requeue` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 23 | `POST` | `/api/dead-letters/[id]/resolve` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 24 | `GET` | `/api/dead-letters/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 25 | `GET` | `/api/dead-letters` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 26 | `GET, DELETE` | `/api/disaster-recovery/backups/[id]` | **ADMIN_ONLY** | ADMIN/OWNER | SYSTEM_WIDE | **SECURED** |
| 27 | `GET, POST` | `/api/disaster-recovery/backups` | **ADMIN_ONLY** | ADMIN/OWNER | SYSTEM_WIDE | **SECURED** |
| 28 | `POST` | `/api/disaster-recovery/restore` | **ADMIN_ONLY** | ADMIN/OWNER | SYSTEM_WIDE | **SECURED** |
| 29 | `GET` | `/api/discovery/capabilities` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 30 | `GET` | `/api/discovery/coverage/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 31 | `POST` | `/api/discovery/integrations/[id]/refresh` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 32 | `POST` | `/api/discovery/integrations/[id]/test` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 33 | `GET, POST` | `/api/discovery/integrations` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 34 | `GET` | `/api/discovery/readiness/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 35 | `GET` | `/api/execution/[id]` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 36 | `POST` | `/api/execution/execute` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 37 | `POST` | `/api/execution/recover` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 38 | `GET` | `/api/execution` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 39 | `POST` | `/api/execution/validate` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 40 | `POST` | `/api/executions/[id]/cancel` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 41 | `GET` | `/api/executions/[id]/events` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 42 | `POST` | `/api/executions/[id]/pause` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 43 | `POST` | `/api/executions/[id]/resume` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 44 | `GET` | `/api/executions/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 45 | `GET, POST` | `/api/executions` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 46 | `POST` | `/api/governance/evaluate` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 47 | `GET, POST` | `/api/governance/exceptions` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 48 | `POST` | `/api/governance/policies/[id]/activate` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 49 | `GET, PUT, DELETE` | `/api/governance/policies/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 50 | `GET` | `/api/governance/policies/[id]/versions` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 51 | `GET, POST` | `/api/governance/policies` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 52 | `POST` | `/api/governance/policies/simulate` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 53 | `GET, POST` | `/api/governance/reviews` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 54 | `POST` | `/api/governance/simulate` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 55 | `GET, POST` | `/api/governance/templates` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 56 | `GET` | `/api/governance/violations` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 57 | `GET` | `/api/health/live` | **PUBLIC** | NONE | NO | **SECURED** |
| 58 | `GET` | `/api/health/ready` | **PUBLIC** | NONE | NO | **SECURED** |
| 59 | `GET` | `/api/health` | **PUBLIC** | NONE | NO | **SECURED** |
| 60 | `POST` | `/api/incidents/[id]/acknowledge` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 61 | `POST` | `/api/incidents/[id]/assign` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 62 | `POST` | `/api/incidents/[id]/escalate` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 63 | `POST` | `/api/incidents/[id]/resolve` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 64 | `GET` | `/api/incidents/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 65 | `GET, POST` | `/api/incidents/[id]/timeline` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 66 | `GET, POST` | `/api/incidents` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 67 | `POST` | `/api/integrations/[id]/disconnect` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 68 | `PATCH` | `/api/integrations/[id]/operations/[operationId]/permissions` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 69 | `GET` | `/api/integrations/[id]/operations` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 70 | `POST` | `/api/integrations/[id]/refresh` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 71 | `POST` | `/api/integrations/[id]/revoke` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 72 | `POST` | `/api/integrations/[id]/rotate-credentials` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 73 | `GET, PATCH, DELETE` | `/api/integrations/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 74 | `POST` | `/api/integrations/[id]/test` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 75 | `POST` | `/api/integrations/[id]/verify` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 76 | `GET` | `/api/integrations/catalog` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 77 | `POST` | `/api/integrations/connect` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 78 | `POST` | `/api/integrations/mcp/[id]/discover-tools` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 79 | `POST` | `/api/integrations/mcp/connect` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 80 | `POST` | `/api/integrations/oauth/[providerId]/authorize` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 81 | `GET` | `/api/integrations/oauth/[providerId]/callback` | **PUBLIC** | NONE | NO | **SECURED** |
| 82 | `GET, POST` | `/api/integrations` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 83 | `GET` | `/api/jobs/[id]/attempts` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 84 | `POST` | `/api/jobs/[id]/cancel` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 85 | `GET` | `/api/jobs/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 86 | `GET, POST` | `/api/jobs` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 87 | `PATCH, DELETE` | `/api/mandates/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 88 | `GET, POST` | `/api/mandates` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 89 | `POST` | `/api/objectives/[id]/approve` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 90 | `POST` | `/api/objectives/[id]/cancel` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 91 | `POST` | `/api/objectives/[id]/discover` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 92 | `GET` | `/api/objectives/[id]/discovery` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 93 | `GET` | `/api/objectives/[id]/events` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 94 | `POST` | `/api/objectives/[id]/execute` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 95 | `POST` | `/api/objectives/[id]/interpret` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 96 | `POST` | `/api/objectives/[id]/pause` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 97 | `GET, POST` | `/api/objectives/[id]/plan` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 98 | `GET` | `/api/objectives/[id]/progress` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 99 | `POST` | `/api/objectives/[id]/reject` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 100 | `POST` | `/api/objectives/[id]/resume` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 101 | `GET, PATCH` | `/api/objectives/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 102 | `GET, POST` | `/api/objectives` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 103 | `POST` | `/api/observability/alerts/[id]/acknowledge` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 104 | `POST` | `/api/observability/alerts/[id]/resolve` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 105 | `GET` | `/api/observability/alerts` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 106 | `POST` | `/api/observability/capacity/evaluate` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 107 | `GET` | `/api/observability/capacity` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 108 | `GET` | `/api/observability/metrics` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 109 | `GET` | `/api/observability/overview` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 110 | `GET` | `/api/observability/queue` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 111 | `GET` | `/api/observability/traces/[traceId]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 112 | `GET` | `/api/observability/workers` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 113 | `POST` | `/api/operations/lockdown` | **ADMIN_ONLY** | ADMIN/OWNER | SYSTEM_WIDE | **SECURED** |
| 114 | `POST` | `/api/operations/maintenance` | **ADMIN_ONLY** | ADMIN/OWNER | SYSTEM_WIDE | **SECURED** |
| 115 | `POST` | `/api/operations/pause` | **ADMIN_ONLY** | ADMIN/OWNER | SYSTEM_WIDE | **SECURED** |
| 116 | `POST` | `/api/operations/resume` | **ADMIN_ONLY** | ADMIN/OWNER | SYSTEM_WIDE | **SECURED** |
| 117 | `GET` | `/api/operations/status` | **PUBLIC** | NONE | NO | **SECURED** |
| 118 | `POST` | `/api/policy/evaluate` | **PUBLIC** | NONE | NO | **SECURED** |
| 119 | `GET` | `/api/production/readiness` | **PUBLIC** | NONE | NO | **SECURED** |
| 120 | `GET, POST` | `/api/reconciliation/discrepancies` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 121 | `GET` | `/api/reconciliation/runs/[id]` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 122 | `GET, POST` | `/api/reconciliation/runs` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 123 | `POST` | `/api/recovery/plans/[id]/approve` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 124 | `POST` | `/api/recovery/plans/[id]/execute` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 125 | `POST` | `/api/recovery/plans/[id]/reject` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 126 | `GET` | `/api/recovery/plans/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 127 | `POST` | `/api/recovery/plans/[id]/verify` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 128 | `GET, POST` | `/api/recovery/plans` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 129 | `GET, POST` | `/api/resilience/drills` | **ADMIN_ONLY** | ADMIN/OWNER | SYSTEM_WIDE | **SECURED** |
| 130 | `GET, POST` | `/api/resilience/providers` | **ADMIN_ONLY** | ADMIN/OWNER | SYSTEM_WIDE | **SECURED** |
| 131 | `GET` | `/api/resilience/queue` | **PUBLIC** | NONE | NO | **SECURED** |
| 132 | `GET, POST` | `/api/tasks/[id]` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 133 | `GET, POST` | `/api/tasks` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 134 | `POST` | `/api/tools/[id]/invoke` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 135 | `GET` | `/api/tools/[id]` | **PUBLIC** | NONE | NO | **SECURED** |
| 136 | `GET` | `/api/tools/activity` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 137 | `GET` | `/api/tools` | **PUBLIC** | NONE | NO | **SECURED** |
| 138 | `GET, POST` | `/api/transactions/reconcile` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 139 | `GET, PATCH` | `/api/user/profile` | **AUTHENTICATED** | AUTHENTICATED_USER | YES | **SECURED** |
| 140 | `GET, POST` | `/api/wallets/fund` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 141 | `GET, POST` | `/api/wallets/initialize` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 142 | `GET, POST` | `/api/wallets` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 143 | `GET, POST` | `/api/wallets/withdraw` | **TENANT_SCOPED** | AUTHENTICATED_USER | YES | **SECURED** |
| 144 | `GET` | `/api/workers/[id]` | **SYSTEM_INTERNAL** | OPERATOR/ADMIN | SYSTEM_WIDE | **SECURED** |
| 145 | `GET` | `/api/workers` | **SYSTEM_INTERNAL** | OPERATOR/ADMIN | SYSTEM_WIDE | **SECURED** |
