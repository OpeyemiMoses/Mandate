# MANDATE — OBSERVABILITY AND INCIDENT READINESS
## Monitoring Architecture, Health Metrics, Alert Triggers & Operational Emergency Runbooks

**Milestone Target:** Open Public Beta Launch Preparation  
**Auditor:** Mandate Site Reliability & Operations Team  
**Date:** November 4, 2026  
**Status:** READY & OPERATIONAL

---

# 1. OBSERVABILITY ARCHITECTURE

Mandate provides deep, real-time observability across the end-to-end execution pipeline using structured telemetry:

```
  +--------------------------------------------------------------------------------+
  |                           MANDATE TELEMETRY PIPELINE                           |
  |                                                                                |
  |  +------------------------+      +-------------------------------------------+  |
  |  | Application Telemetry  | ---> | Prometheus / Metrics Gateway              |  |
  |  | - Policy evaluations  |      | - /api/metrics (Scraped every 15s)        |  |
  |  | - Ticket minting count |      | - Latency histograms & counters           |  |
  |  +------------------------+      +-------------------------------------------+  |
  |                                                        |                        |
  |  +------------------------+      +-------------------------------------------+  |
  |  | OpenTelemetry Spans    | ---> | Distributed Tracing                       |  |
  |  | - Request correlation  |      | - Traceparent propagation                 |  |
  |  | - DB transaction time  |      | - OutLayer TEE latency attribution        |  |
  |  +------------------------+      +-------------------------------------------+  |
  |                                                        |                        |
  |  +------------------------+      +-------------------------------------------+  |
  |  | Structured JSON Logs   | ---> | PostgreSQL Audit Ledger & Log Aggregator  |  |
  |  | - Level, correlationId |      | - Queryable operational alerts            |  |
  |  | - Tenant & mandate ID  |      | - Dead-letter queue tracking              |  |
  |  +------------------------+      +-------------------------------------------+  |
  +--------------------------------------------------------------------------------+
```

---

# 2. KEY OPERATIONAL METRICS & PROMETHEUS GAUGES

| Metric Identifier | Type | Description | Target SLA |
| :--- | :--- | :--- | :--- |
| `mandate_policy_evaluation_duration_ms` | Histogram | Latency of 9 deterministic rule evaluations | $p_{99} < 10\text{ms}$ |
| `mandate_ticket_mint_total` | Counter | Total BoundaryExecutionTickets minted | Monotonic |
| `mandate_execution_success_total` | Counter | Successfully settled Testnet transactions | $> 99.5\%$ |
| `mandate_execution_reconciliation_total` | Counter | Transactions entering reconciliation | $0$ (Nominal) |
| `mandate_dead_letter_records_total` | Gauge | Unresolvable execution tasks | $0$ (Nominal) |
| `mandate_postgres_connection_pool_active` | Gauge | Active connections to `mandate_prod` | $< 80\%$ pool |

---

# 3. CRITICAL ALERT DEFINITIONS

| Alert Name | Severity | Condition | Notification Channel | Auto-Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **`ExecutionReconciliationSpike`** | **P1 - CRITICAL** | $> 0$ ambiguous transactions in 5 minutes | PagerDuty / Ops Discord | Pauses affected mandate |
| **`DeadLetterQueueOccupied`** | **P1 - CRITICAL** | `deadLetterRecords > 0` | PagerDuty / Ops Discord | Halts agent objective |
| **`OutLayerApiErrors`** | **P2 - HIGH** | $> 3$ consecutive 5xx errors from TEE | SRE Alert Channel | Trips circuit breaker |
| **`PlatformCeilingAttempt`** | **P2 - HIGH** | $> 5$ over-ceiling attempts in 10 minutes | Security Alert Channel | Rate-limits client IP |
| **`DatabaseHighLatency`** | **P3 - MEDIUM** | $p_{95}$ DB query time $> 100\text{ms}$ for 5m | Monitoring Dashboard | Scales connection pool |

---

# 4. EMERGENCY KILL-SWITCHES & OPERATIONAL CONTROLS

Mandate features three tiers of operational emergency switches:

### 4.1 Global Platform Emergency Freeze (Nuclear Switch)
- **Trigger:** System-wide anomaly or consensus discrepancy.
- **Action:** Sets `MANDATE_PLATFORM_FROZEN="true"` in environment configuration.
- **Effect:** Instantly rejects all incoming transfer proposals at Layer 1; cancels pending approval tickets; prevents all TEE signing calls.

### 4.2 Selective Mandate Kill-Switch
- **Trigger:** Individual customer or agent anomaly.
- **Action:** Customer or operator clicks "Simulate Instant Kill-Switch" or invokes `PATCH /api/mandates/:id/freeze`.
- **Effect:** Immediately flips `mandate.status = "FROZEN"` in PostgreSQL. Active tasks are paused; pending approvals are voided.

### 4.3 OutLayer Gateway Circuit Breaker
- **Trigger:** Elevated latency or intermittent network partitions between Mandate and OutLayer cloud.
- **Action:** Tripped automatically after 3 timeouts (5s).
- **Effect:** Halts new ticket emissions; queues pending tasks in a paused state; prevents broadcast of ambiguous payloads.

---

# 5. INCIDENT RESPONSE RUNBOOK

### Severity 1: Ambiguous Transaction Broadcast
1. **Detection:** Alert `ExecutionReconciliationSpike` fires.
2. **Immediate Action:** The background reconciler locks the affected execution record and pauses the parent mandate.
3. **Investigation:** Query NEAR Testnet RPC via transaction hash to verify final onchain status.
4. **Resolution:**
   - If transaction succeeded onchain: Settle execution record, deduct budget, append audit log.
   - If transaction failed or was not mined: Revert budget reservation, release locked funds, notify user.
5. **Post-Mortem:** Conduct root cause analysis within 24 hours.

