# Mandate — Final Route Security & Authorization Inventory
## Comprehensive API Classification, RBAC Policy & Tenant Isolation Audit

**Document Version:** 1.0.0  
**Effective Date:** November 3, 2026  
**Security Model:** Multi-Tenant Isolation with Defense-in-Depth  

---

## 1. Security Classification Tiers

Every API route across Mandate is assigned an explicit, server-enforced security classification:

| Classification | Definition | Auth Enforcement | Unauthenticated Response | Unauthorized Response |
|:---|:---|:---:|:---:|:---:|
| **PUBLIC** | Unauthenticated endpoints (health checks, login challenge, public status) | None | N/A (Accessible) | N/A |
| **AUTHENTICATED** | Standard authenticated user endpoints (profile, personal settings) | Valid Session Cookie | 401 Unauthorized | N/A |
| **TENANT_SCOPED** | Entity-level endpoints (Agents, Mandates, Wallets, Jobs, Runs, Objectives) | Valid Session + Tenant Ownership | 401 Unauthorized | **404 Not Found (IDOR Masking)** |
| **ADMIN_ONLY** | System-wide controls (Operations pause, Lockdown, Backups, Policy reviews) | Valid Session + `SECURITY_ADMIN` or `OPERATOR` | 401 Unauthorized | **403 Forbidden (RBAC Denial)** |
| **SYSTEM_INTERNAL** | Worker / System internal callbacks | Server Signature / Internal Context | 401 / 403 | 403 Forbidden |

---

## 2. Architectural Reconciliation: HTTP 404 vs. HTTP 403

### 2.1 Object-Level IDOR Protection: HTTP 404 (Resource Masking)
- **Principle:** If Tenant A attempts to read or mutate a resource owned by Tenant B (e.g. `GET /api/agents/bob-agent-123`), the platform intentionally responds with **HTTP 404 (`NotFoundError`)**, exactly as if the resource did not exist.
- **Security Rationale:** Returning HTTP 403 on cross-tenant resource IDs confirms to attackers that the resource exists, enabling brute-force ID enumeration and reconnaissance. HTTP 404 completely conceals resource existence.
- **Affected Route Families:** `/api/agents/[id]/*`, `/api/mandates/[id]/*`, `/api/wallets/[id]/*`, `/api/jobs/[id]/*`, `/api/objectives/[id]/*`, `/api/coordination/[id]/*`.

### 2.2 Operation-Level RBAC Protection: HTTP 403 (Permission Denial)
- **Principle:** If an authenticated non-administrative tenant attempts an administrative operational action (e.g. `POST /api/operations/pause` or `POST /api/disaster-recovery/restore`), the platform responds with **HTTP 403 (`ForbiddenError`)**.
- **Security Rationale:** The caller has authenticated and the operational route exists, but the caller's server-derived role lacks the requisite privileges (`SECURITY_ADMIN`, `OPERATOR`).
- **Affected Route Families:** `/api/operations/*`, `/api/disaster-recovery/*`, `/api/resilience/drills`, `/api/recovery/plans/[id]/approve`.

---

## 3. Exhaustive Route Inventory & Audit Matrix

### 3.1 Authentication & Profile
| Endpoint | Method | Classification | Required Role | Enforcement Method |
|:---|:---:|:---:|:---:|:---|
| `/api/auth` | POST | PUBLIC | Any | Challenge issuance & signature validation |
| `/api/auth` | DELETE | AUTHENTICATED | Any | Session revocation |
| `/api/user/profile` | GET / PUT | TENANT_SCOPED | Authenticated | `context.userId` derived from session |

### 3.2 Platform Health & Readiness
| Endpoint | Method | Classification | Required Role | Enforcement Method |
|:---|:---:|:---:|:---:|:---|
| `/api/health/live` | GET | PUBLIC | Any | Process liveness probe |
| `/api/health/ready` | GET | PUBLIC | Any | Database & RPC readiness probe |
| `/api/production/readiness` | GET | PUBLIC | Any | Production readiness dashboard status |

### 3.3 Agents & Execution
| Endpoint | Method | Classification | Required Role | Enforcement Method |
|:---|:---:|:---:|:---:|:---|
| `/api/agents` | GET / POST | TENANT_SCOPED | Authenticated | `TenantAccessService.tenantWhere` |
| `/api/agents/[id]` | GET / PUT / DEL | TENANT_SCOPED | Owner | `TenantAccessService.assertAgentOwnership` (404) |
| `/api/agents/[id]/executions` | GET / POST | TENANT_SCOPED | Owner | `assertAgentOwnership` + `ExecutionBoundaryService` |
| `/api/agents/[id]/tools` | GET / POST | TENANT_SCOPED | Owner | `assertAgentOwnership` |

### 3.4 Mandates & Wallets (Financial Boundary)
| Endpoint | Method | Classification | Required Role | Enforcement Method |
|:---|:---:|:---:|:---:|:---|
| `/api/wallets` | GET / POST | TENANT_SCOPED | Authenticated | Scoped by `agent.userId = context.userId` |
| `/api/wallets/fund` | POST | TENANT_SCOPED | Owner | `assertWalletOwnership` |
| `/api/wallets/withdraw` | POST | TENANT_SCOPED | Owner | `assertWalletOwnership` |
| `/api/execution/execute` | POST | TENANT_SCOPED | Owner | `ExecutionBoundaryService.execute` |
| `/api/execution/validate` | POST | TENANT_SCOPED | Authenticated | `ExecutionValidationService.validateNearTransferPreflight` |
| `/api/transactions/reconcile`| POST | TENANT_SCOPED / ADMIN | Owner / Operator | On-chain settlement reconciliation |

### 3.5 Background Jobs & Scaling
| Endpoint | Method | Classification | Required Role | Enforcement Method |
|:---|:---:|:---:|:---:|:---|
| `/api/jobs` | GET / POST | TENANT_SCOPED | Authenticated | `where: { tenantId: context.userId }` |
| `/api/jobs/[id]` | GET | TENANT_SCOPED | Owner | `TenantAccessService.assertJobOwnership` (404) |
| `/api/jobs/[id]/cancel` | POST | TENANT_SCOPED | Owner | `TenantAccessService.assertJobOwnership` (404) |
| `/api/jobs/[id]/retry` | POST | TENANT_SCOPED / ADMIN | Owner / Operator | Replays job within tenant boundary |
| `/api/workers` | GET | ADMIN_ONLY | Operator / Admin | `assertAdmin` (403) |
| `/api/dead-letters` | GET | ADMIN_ONLY | Operator / Admin | `assertAdmin` (403) |

### 3.6 Objectives & Multi-Agent Coordination
| Endpoint | Method | Classification | Required Role | Enforcement Method |
|:---|:---:|:---:|:---:|:---|
| `/api/objectives` | GET / POST | TENANT_SCOPED | Authenticated | Scoped to caller `userId` |
| `/api/objectives/[id]` | GET / PUT / DEL | TENANT_SCOPED | Owner | `TenantAccessService.assertObjectiveOwnership` (404) |
| `/api/coordination` | GET / POST | TENANT_SCOPED | Authenticated | Scoped to caller `userId` |
| `/api/coordination/[id]`| GET / PUT | TENANT_SCOPED | Owner | `TenantAccessService.assertCoordinationOwnership` (404) |

### 3.7 Operational Control Plane & Disaster Recovery (ADMIN ONLY)
| Endpoint | Method | Classification | Required Role | Enforcement Method |
|:---|:---:|:---:|:---:|:---|
| `/api/operations/pause` | POST | ADMIN_ONLY | `SECURITY_ADMIN` | `assertAdmin` / `assertSecurityAdmin` (403) |
| `/api/operations/lockdown`| POST | ADMIN_ONLY | `SECURITY_ADMIN` | `assertSecurityAdmin` (403) |
| `/api/operations/resume` | POST | ADMIN_ONLY | `SECURITY_ADMIN` | `assertSecurityAdmin` (403) |
| `/api/operations/maintenance`| POST | ADMIN_ONLY | `OPERATOR` | `assertOperator` (403) |
| `/api/disaster-recovery/backups` | GET / POST | ADMIN_ONLY | `SECURITY_ADMIN` | `assertSecurityAdmin` (403) |
| `/api/disaster-recovery/restore` | POST | ADMIN_ONLY | `SECURITY_ADMIN` | `assertSecurityAdmin` (403) |
| `/api/resilience/drills` | POST | ADMIN_ONLY | `SECURITY_ADMIN` | `assertSecurityAdmin` (403) |

