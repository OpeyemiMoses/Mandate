# Mandate — Database Migration & Rollback Runbook
## SQLite WAL to PostgreSQL Migration Guide for Production Deployment

**Document Version:** 1.0.0  
**Effective Date:** November 3, 2026  
**Audience:** Infrastructure Engineers, SREs, Database Administrators  

---

## 1. Overview & Current Deployment Topology

### 1.1 Current Architecture: SQLite in WAL Mode
- **Current Database Engine:** SQLite 3.x with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and busy timeout (`PRAGMA busy_timeout = 10000;`).
- **Prisma Datasource:** `file:./dev.db` via `prisma/schema.prisma`.
- **Supported Topology:** Single-host, single-process worker daemon with colocated web server.
- **Fundamental Limitation:** SQLite enforces a database-wide write lock. While multiple readers are supported concurrently, only **one single write transaction** can execute at any instant. Concurrent worker processes or horizontal multi-container deployments will experience `SQLITE_BUSY` lock contention and risks database corruption if mounted over network filesystems (NFS, EFS).
- **Certification Status:**
  - **Single-Node Worker Deployment (Colocated):** **CERTIFIED / PASS**
  - **Horizontal Multi-Node Worker Scaling:** **BLOCKED ON SQLITE** (Requires PostgreSQL)

---

## 2. Production PostgreSQL Target Architecture

To enable horizontal multi-worker scaling across distributed containers or Kubernetes pods, Mandate provides a fully verified PostgreSQL Prisma schema:
`prisma/schema.postgresql.prisma`.

### 2.1 Target Infrastructure
- **PostgreSQL Version:** 15.x or 16.x (AWS RDS, Aurora PostgreSQL, GCP Cloud SQL, or Neon Serverless).
- **Connection Pooler:** PgBouncer (Transaction pooling mode) with a connection limit sized for web serverless functions and dedicated worker pools.
- **Transaction Isolation:** Read Committed (default) with monotonic lease generation checks and optimistic CAS concurrency control.
- **High Concurrency Job Claiming:** In PostgreSQL, worker claiming utilizes `SELECT ... FOR UPDATE SKIP LOCKED` or monotonic CAS generation matching, allowing hundreds of independent worker threads to claim distinct jobs concurrently with 0 lock contention.

---

## 3. Pre-Migration Prerequisites

1. **Target PostgreSQL Instance Provisioned:**
   ```bash
   # Verify PostgreSQL connectivity
   psql -h $PG_HOST -U $PG_USER -d $PG_DATABASE -c "SELECT version();"
   ```
2. **Environment Configuration:**
   Set `POSTGRES_DATABASE_URL`:
   ```bash
   export POSTGRES_DATABASE_URL="postgresql://mandate_user:STRONG_PASSWORD@pg-host:5432/mandate_prod?sslmode=require&connection_limit=50"
   ```
3. **Quiesce Background Workers:**
   Transition Mandate operational control to `MAINTENANCE_MODE` to halt job claims and financial dispatches before data migration:
   ```bash
   curl -X POST http://localhost:3000/api/operations/maintenance \
     -H "Cookie: mandate_session=ADMIN_SESSION_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"action": "ENTER_MAINTENANCE", "reason": "Database migration to PostgreSQL"}'
   ```

---

## 4. Step-by-Step Migration Execution

### Step 1: Export Data from SQLite
Export existing relational tables (excluding ephemeral worker heartbeat rows):
```bash
# Dump SQLite tables to SQL statements or JSON
sqlite3 prisma/dev.db ".dump User Agent Wallet Mandate GovernancePolicy ExecutionRecord BackgroundJob DeadLetterRecord AuditLog" > sqlite_data_export.sql
```

### Step 2: Apply Clean PostgreSQL Schema
Deploy the validated PostgreSQL schema:
```bash
DATABASE_URL=$POSTGRES_DATABASE_URL npx prisma db push --schema=prisma/schema.postgresql.prisma
```
*Note: For production CI/CD, generate versioned migration files:*
```bash
DATABASE_URL=$POSTGRES_DATABASE_URL npx prisma migrate dev --name init_postgresql --schema=prisma/schema.postgresql.prisma
```

### Step 3: Transform & Import Data
Transform SQLite types to PostgreSQL equivalents:
- Convert boolean integers (`0`, `1`) to PostgreSQL booleans (`false`, `true`).
- Verify yoctoNEAR string columns (`totalBudgetYocto`, `spentYocto`, `reservedYocto`, `perTxLimitYocto`) are loaded without scientific notation or precision loss.
- Import sanitized data:
```bash
psql $POSTGRES_DATABASE_URL -f pg_transformed_data.sql
```

### Step 4: Validate Data Integrity & Lossless Arithmetic
Run verification queries:
```sql
-- 1. Verify user and mandate counts
SELECT count(*) FROM "User";
SELECT count(*) FROM "Mandate";

-- 2. Verify yoctoNEAR 24-decimal precision integrity
SELECT "id", "totalBudgetYocto", "spentYocto", "reservedYocto" 
FROM "Mandate" 
WHERE length("totalBudgetYocto") > 20;

-- 3. Verify monotonic lease generations
SELECT "id", "status", "leaseGeneration" 
FROM "BackgroundJob" 
ORDER BY "createdAt" DESC LIMIT 10;
```

### Step 5: Switch Application Datasource
Update production `.env`:
```env
DATABASE_URL=postgresql://mandate_user:STRONG_PASSWORD@pgbouncer-host:6432/mandate_prod?sslmode=require
DATABASE_PROVIDER=postgresql
```
Replace `prisma/schema.prisma` with `prisma/schema.postgresql.prisma`:
```bash
cp prisma/schema.postgresql.prisma prisma/schema.prisma
npx prisma generate
```

### Step 6: Resume Operations
Restart web and worker processes, then resume operational control:
```bash
curl -X POST http://localhost:3000/api/operations/resume \
  -H "Cookie: mandate_session=ADMIN_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Database migration to PostgreSQL completed successfully"}'
```

---

## 5. Rollback Procedure

If unexpected errors, latency spikes, or connection pool exhaustion occur during migration:

1. **Re-enter Maintenance Mode:**
   ```bash
   curl -X POST http://localhost:3000/api/operations/maintenance -d '{"action": "ENTER_MAINTENANCE"}'
   ```
2. **Stop Web and Worker Processes:**
   ```bash
   kill -TERM $(pgrep -f "src/worker.ts")
   kill -TERM $(pgrep -f "next-server")
   ```
3. **Revert Datasource Configuration:**
   Restore SQLite `.env`:
   ```env
   DATABASE_URL="file:./dev.db"
   DATABASE_PROVIDER=sqlite
   ```
   Regenerate SQLite client:
   ```bash
   git checkout prisma/schema.prisma
   npx prisma generate
   ```
4. **Synchronize Delta Records:**
   Query PostgreSQL for any new `ExecutionRecord` or `DispatchIntent` rows created during the maintenance window and replay them into `dev.db` to prevent lost financial history.
5. **Restart Services on SQLite:**
   ```bash
   npm run worker &
   npm start &
   ```
6. **Resume Operational State:**
   ```bash
   curl -X POST http://localhost:3000/api/operations/resume -d '{"reason": "Rollback to SQLite completed"}'
   ```

