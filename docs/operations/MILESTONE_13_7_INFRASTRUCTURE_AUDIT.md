# MANDATE — MILESTONE 13.7 INFRASTRUCTURE AUDIT & ARCHITECTURE INVENTORY

**Date:** 2026-11-04  
**Milestone:** 13.7  
**Scope:** Production Infrastructure, PostgreSQL Migration & Deployment Architecture  
**Core Principle:** *AI proposes. Mandate enforces. The user controls. OutLayer executes.*

---

## 1. Infrastructure Inventory

### 1.1 What Already Exists

| Subsystem | Location | Description & Capabilities |
| :--- | :--- | :--- |
| **Prisma Schema (SQLite)** | `prisma/schema.prisma` | 68 models covering User, Agent, Wallet, Mandate, Objectives (Lifecycle, DAG Steps, Events, Checkpoints, Results, Approvals), ExecutionRecords, AuditLedger, BackgroundJobs, Workers, Leases, Governance, Discrepancies, Backups. |
| **PostgreSQL Schema Draft** | `prisma/schema.postgresql.prisma` | Prototype PostgreSQL schema from M9.5 (needs synchronization with M13.1–M13.6 models). |
| **Database Connection** | `src/lib/db.ts` | Centralized `PrismaClient` singleton with query logging and error handling. |
| **Execution Boundary** | `src/lib/execution/boundaryService.ts` | Atomic yoctoNEAR reservations, policy firewall, constant-time HMAC validation, idempotent settlement. |
| **Background Worker Engine** | `src/lib/jobs/` | Job registry, monotonic lease generation (`claimService.ts`), heartbeat monitoring, dead-letter queue, worker loop. |
| **Durable Checkpoints** | `src/lib/orchestration/checkpointService.ts` | Point-in-time state capture, canonical SHA-256 fingerprinting, tenant isolation, secret filtering. |
| **Disaster Recovery** | `src/lib/disaster-recovery/` | Backup records, integrity hashing, manifest generation, restoration engine with audit logging. |
| **Observability & Tracing** | `src/lib/observability/` | W3C trace context, distributed span creation, metrics counters, remote OTLP JSON dispatch. |
| **Environment Validation** | `src/lib/production/environmentValidation.ts` | Fail-closed validation, entropy checking, insecure default rejection. |

---

### 1.2 What is Production-Capable

1. **Exact BigInt yoctoNEAR Accounting:** Mandate budgets and balances are stored as exact 24-decimal integer strings (`totalBudgetYocto`, `spentYocto`, `reservedYocto`) preventing floating-point drift or 64-bit integer overflow.
2. **Universal Policy & Compliance Engine:** Pre-execution allowlists, per-tx caps, and authorization envelopes enforced prior to any database mutation.
3. **Optimistic Concurrency (CAS):** State machines (`Objective`, `ObjectivePlanStep`, `Mandate`, `AgentAssignment`) enforce atomic version checks (`version: currentVersion + 1`).
4. **Append-Only Cryptographic Audit Ledger:** SHA-256 chained audit logs dual-persisting every security and financial event.
5. **Durable Worker Fencing:** `leaseGeneration` monotonic counter increments on every lease reclaim, rejecting zombie worker updates (`STALE_LEASE_GENERATION`).

---

### 1.3 What is Single-Node Only (Requires Hardening)

1. **SQLite Database Engine:** Currently using `file:./prisma/dev.db` with WAL mode. SQLite cannot handle multi-node write concurrency, network partitions, or distributed replica failover.
2. **In-Memory Orchestration Lock:** `ConcurrencyControlService` stored mutex locks in a local `Map<string, Lock>`. In a multi-instance web/worker deployment, separate node processes cannot see each other's memory locks.
3. **Local Filesystem SQLite Backups:** `BackupService` performed `VACUUM INTO` on the local disk (`prisma/backups/`).
4. **Local Host Process Spawning:** Background jobs ran in the same OS node environment without container isolation or production service orchestration.

---

### 1.4 What Requires Replacement / Migration

1. **Database Provider:** Replace SQLite with PostgreSQL 16+ as the authoritative production database.
2. **Prisma Migrations:** Replace `prisma db push` with version-controlled `prisma migrate` workflow.
3. **Data Migration Pipeline:** Build a robust, non-destructive SQLite-to-PostgreSQL ETL utility that preserves foreign-key relationships, financial balances, audit records, and objective checkpoints.
4. **Distributed Orchestration Locks:** Replace in-memory lock map with PostgreSQL row-level locks (`SELECT ... FOR UPDATE`), transaction-scoped advisory locks, or durable database-backed leases.
5. **PostgreSQL Backup & Restore:** Implement PostgreSQL-native `pg_dump` and SQL restore procedures with pre/post integrity verification and financial reconciliation.
6. **Containerization & Deployment Topology:** Provide production-ready `Dockerfile` (multi-stage, non-root) and `docker-compose.production.yml` defining independent web, worker, and database services.
7. **CI/CD Pipeline:** Establish GitHub Actions workflow enforcing typecheck, lint, migration checks, financial concurrency tests, and build.

---

### 1.5 What Must Remain Unchanged

1. **Core Platform Invariants:** AI proposes. Mandate enforces. The user controls. OutLayer executes.
2. **Zero Live NEAR Transaction Broadcasts in Automated Tests:** Automated tests must never broadcast real financial transactions on NEAR testnet or mainnet.
3. **Financial Accounting Formulas:** $\text{Available} = \text{Total} - \text{Spent} - \text{Reserved}$.
4. **ExecutionBoundaryService & OutLayer Integration:** Mandate spending envelopes and TEE attestation verification remain the authoritative gatekeeper.
5. **Canonical Task Taxonomy:** `RESEARCH`, `ANALYSIS`, `EXECUTION`, `PAYMENT`, `VERIFICATION`, `COORDINATION`, `VALIDATION`.

---

### 1.6 Schema & Architectural Conflicts Identified

1. **Prisma Provider Switch:** Switching `provider = "postgresql"` in `prisma/schema.prisma` requires:
   - Validating all `@default(...)` values.
   - Validating stringified JSON columns (PostgreSQL supports both `Text` and `Json`, but keeping stringified JSON ensures zero client-side breakage while allowing standard JSON queries).
   - Validating foreign key constraints and cascade actions.
2. **Cross-Database Compatibility:** Both local development/testing (SQLite/embedded PostgreSQL) and production PostgreSQL must be cleanly configurable via `DATABASE_URL`.
3. **Checkpoint Restoration Boundary:** Checkpoint restoration must strictly be confined to workflow orchestration state. It must **NEVER** reverse spent financial budgets, cancel settled transaction records, or decrease monotonic lease generations.

