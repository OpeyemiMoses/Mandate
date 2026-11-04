# MANDATE MILESTONE 9.2 — ARCHITECTURE AUDIT & OBSERVABILITY PLAN

**Date:** 2026-11-03  
**Target:** Milestone 9.2 (Distributed Worker Scaling, Metrics Telemetry & OpenTelemetry Observability)  
**System Thesis:** *"AI proposes. Mandate enforces. The user controls. OutLayer executes."*  

---

## 1. Existing System & Runtime Audit

### A. Runtime & Framework Compatibility
- **Runtime Environment:** macOS Darwin, Node.js `v20.18.0`, npm `10.8.2`.
- **Framework:** Next.js `14.2.35` (App Router), React `18.3.1`.
- **Database & ORM:** Prisma `6.19.3` with SQLite database (`prisma/dev.db`).
- **Telemetry Dependencies Audit:** Zero pre-existing OpenTelemetry packages were present. Official, lightweight packages `@opentelemetry/api`, `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`, `@opentelemetry/sdk-trace-base`, and `@opentelemetry/sdk-metrics` have been verified for clean runtime execution without heavy monolithic dependencies or native binding conflicts.

### B. Worker & Queue Implementation (M9.1)
- **Worker Process Model:** `JobWorkerService` manages the lifecycle of worker instances. Workers can run in-process or as independent Node processes (`workerName`, `instanceId`, `status`, `capabilities`).
- **Job Claim Concurrency:** Database-level atomic compare-and-swap (CAS) via `JobClaimService.claimNextJob` using dynamic UUID `leaseToken` and `leaseExpiresAt` boundaries.
- **Historical Durations & Errors:** Durations are recorded in `JobAttempt.durationMs` and `JobEvent.metadata`. Errors and stack classifications are recorded in `JobAttempt.errorCode`, `JobAttempt.errorMessage`, `BackgroundJob.lastErrorCode`, and `DeadLetterRecord.finalError`.
- **Audit Logging:** Every state transition emits cryptographically chained SHA-256 ledger entries via `recordAuditEvent`.

---

## 2. Answers to Phase Zero Audit Questions

1. **How workers are started:** Workers are registered via `JobWorkerService.registerWorker()` (`status: STARTING`) and activated via `JobWorkerService.start()` (`status: IDLE`), initiating a 10s heartbeat interval and a continuous polling loop (`pollLoop`).
2. **Whether workers run in-process or independently:** Both modes are supported. Leases and heartbeats reside in the shared SQLite database, enabling multiple independent OS processes or in-process timers to cooperate safely without race conditions.
3. **How jobs are claimed and completed:** Jobs in `QUEUED`, `SCHEDULED`, or `RETRY_WAIT` status are selected by priority and scheduled time, claimed using atomic CAS updates with a unique lease token, processed through registered handlers, and finalized to `COMPLETED` or `FAILED`/`RETRY_WAIT`/`DEAD_LETTER`/`REQUIRES_RECOVERY`.
4. **Where job duration and failure information are stored:** In `JobAttempt` (`durationMs`, `outcome`, `errorCode`, `errorMessage`), `JobEvent` (`metadata`), `BackgroundJob` (`lastErrorCode`, `lastErrorMessage`), and `DeadLetterRecord`.
5. **Whether existing metrics are available:** No dedicated OpenTelemetry metrics service existed previously, but comprehensive underlying operational data exists across `BackgroundJob`, `BackgroundWorker`, `JobAttempt`, `ExecutionRecord`, `AgentExecution`, `ToolInvocation`, and `PolicyEvaluation`.
6. **Which telemetry dependencies are installed:** Installed `@opentelemetry/api` (v1.10.0), `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`, `@opentelemetry/sdk-trace-base`, and `@opentelemetry/sdk-metrics`.
7. **Whether the deployment platform supports multiple worker processes:** Yes, Node.js on macOS supports multiple worker processes running concurrently, mediated by database leases.
8. **Whether PostgreSQL is available or SQLite remains active:** SQLite (`file:./dev.db`) remains active. All aggregation queries must utilize portable Prisma ORM constructs and standard SQL.

---

## 3. Milestone 9.2 Extension Design

### A. OpenTelemetry Distributed Tracing & W3C Trace Context
- Extend `BackgroundJob` schema with:
  - `traceParent String?`: W3C traceparent (format: `00-{traceId}-{spanId}-{flags}`)
  - `traceState String?`: W3C tracestate
- Extend `BackgroundWorker` schema with:
  - `maxConcurrency Int @default(1)`: Maximum concurrent slots
  - `activeSlots Int @default(0)`: Currently allocated slots
  - `pollIntervalMs Int @default(1000)`: Polling cadence
- When jobs are submitted via `JobQueueService.submitJob`, the active or newly generated W3C `traceparent` is stored in the job record.
- When `JobWorkerService.processJob` executes, it extracts `traceparent` and creates a child span linked to the parent trace, preserving end-to-end distributed causality across the API-worker process boundary.
- Instrument critical boundaries: API submission, worker claim, handler dispatch, ToolExecutor, Governance evaluation, ExecutionBoundaryService, and settlement.
- Bounded span attributes: strictly omit private keys, secrets, auth headers, and raw envelopes.

### B. Real Metrics Telemetry (Zero Fake Numbers)
- All operational metrics are derived directly from persisted database records:
  - **Queue Metrics:** Counts by status (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `DEAD_LETTER`, `REQUIRES_RECOVERY`), average waiting time, median duration, retry backlog.
  - **Worker Fleet:** Total workers, active workers, idle workers, busy workers, unhealthy workers (heartbeat > 30s stale), utilization percentage.
  - **Agent & Tool Metrics:** Real records from `AgentExecution` and `ToolInvocation`.
  - **Financial Execution Metrics:** Operational states from `ExecutionRecord` (authorized, confirmed settlements, requires recovery, ambiguous broadcast), strictly excluding wallet addresses and sensitive financial amounts from metric label dimensions to prevent unbounded cardinality and privacy leaks.

### C. Worker Capacity Management & Honest Scaling Recommendations
- **Queue Pressure Calculation:** Evaluates queue depth, waiting latency, active worker count, and available processing slots.
- **Scaling Recommendation Engine:** Emits deterministic recommendations:
  - `NO_CHANGE` (healthy capacity)
  - `INCREASE_CAPACITY` (queue pressure high, slots saturated)
  - `REDUCE_CAPACITY` (idle workers with zero queue backlog)
  - `INVESTIGATE_UNHEALTHY_WORKERS` (workers with expired heartbeats or elevated failure rates)
- **Honest Distinction in UI & API:** The system explicitly categorizes recommendations as **advisory operational guidance** and clearly surfaces that recommendations are *not* automatically executed cloud infrastructure provisioning actions.

### D. Operational Alerting & Deduplication
- Database model `OperationalAlert` with deduplication keys, severity (`INFO`, `WARNING`, `ERROR`, `CRITICAL`), status (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`, `SUPPRESSED`), and audit trail.
- Persisted rules for queue backlog threshold, stale worker heartbeats, financial recovery required, and failure rate spikes.
- Permissions: only authorized users can acknowledge or resolve alerts, with all actions recorded in the immutable audit ledger.

### E. Telemetry Exporters & Fail-Closed Safety
- Support standard OTLP environment variables (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`).
- Fallback: in-memory ring buffer (up to 500 recent spans/metrics) for local inspection and internal dashboard visualization when no remote OTLP collector is configured.
- Report exporter status accurately (`NOT_CONFIGURED` vs `EXPORTING` vs `ERROR`), never pretending remote delivery succeeded.
- Telemetry exporter errors are caught and logged; telemetry failure can *never* interrupt or fail core business transactions or background jobs.

