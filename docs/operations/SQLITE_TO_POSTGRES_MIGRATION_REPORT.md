# Mandate — SQLite to PostgreSQL Migration Report
**Generated:** 2026-11-04T03:00:20.209Z
**Status:** SUCCESS (100% Parity Achieved)

## 1. Executive Summary
- **Source Database:** SQLite (`prisma/dev.db`)
- **Target Database:** PostgreSQL 18.6 (`mandate_prod`)
- **Total Models in Schema:** 72
- **Active Tables with Data:** 70
- **Total Records Extracted:** 27662
- **Total Records Loaded:** 27662
- **Data Loss Rate:** 0.000%

## 2. Financial Integrity Verification (Exact yoctoNEAR)
| Financial Metric | SQLite Value | PostgreSQL Value | Match Status | Discrepancy |
|---|---|---|---|---|
| `Mandate.totalBudgetYocto` | `5301900000000000000000000000` | `5301900000000000000000000000` | ✓ 100% MATCH | `0` yoctoNEAR |
| `Mandate.perTxLimitYocto` | `940353000000000000000000000` | `940353000000000000000000000` | ✓ 100% MATCH | `0` yoctoNEAR |
| `Mandate.approvalThresholdYocto` | `389810000000000000000000000` | `389810000000000000000000000` | ✓ 100% MATCH | `0` yoctoNEAR |
| `FundingRecord.amountYocto` | `229150000000000000000000000` | `229150000000000000000000000` | ✓ 100% MATCH | `0` yoctoNEAR |
| `TransactionRecord.amountYocto` | `46835000000000000000000000` | `46835000000000000000000000` | ✓ 100% MATCH | `0` yoctoNEAR |

## 3. Model-by-Model Record Count Parity
| Model Name | SQLite Rows | PostgreSQL Rows | Duration (ms) | Status |
|---|---|---|---|---|
| `User` | 851 | 851 | 62ms | ✓ OK |
| `Agent` | 794 | 794 | 56ms | ✓ OK |
| `BackgroundWorker` | 243 | 243 | 24ms | ✓ OK |
| `WorkerCapacitySnapshot` | 10 | 10 | 2ms | ✓ OK |
| `OperationalControlState` | 286 | 286 | 17ms | ✓ OK |
| `OperationalAuditRecord` | 421 | 421 | 24ms | ✓ OK |
| `DatabaseBackupRecord` | 10 | 10 | 2ms | ✓ OK |
| `ProviderCircuitBreakerState` | 1 | 1 | 1ms | ✓ OK |
| `ResilienceDrillRun` | 48 | 48 | 5ms | ✓ OK |
| `DispatchIntent` | 57 | 57 | 4ms | ✓ OK |
| `IntegrationConnection` | 218 | 218 | 21ms | ✓ OK |
| `OAuthSession` | 43 | 43 | 4ms | ✓ OK |
| `GovernancePolicy` | 195 | 195 | 16ms | ✓ OK |
| `PolicyEvaluation` | 1601 | 1601 | 488ms | ✓ OK |
| `BackgroundJob` | 347 | 347 | 49ms | ✓ OK |
| `OperationalAlert` | 48 | 48 | 6ms | ✓ OK |
| `ReconciliationRun` | 13 | 13 | 2ms | ✓ OK |
| `Incident` | 113 | 113 | 14ms | ✓ OK |
| `Wallet` | 500 | 500 | 42ms | ✓ OK |
| `AgentToolAccess` | 118 | 118 | 8ms | ✓ OK |
| `AgentCapabilityProfile` | 177 | 177 | 15ms | ✓ OK |
| `DatabaseRestoreRecord` | 7 | 7 | 2ms | ✓ OK |
| `IntegrationOperationPermission` | 119 | 119 | 8ms | ✓ OK |
| `IntegrationOperationExecution` | 28 | 28 | 3ms | ✓ OK |
| `ToolInvocation` | 391 | 391 | 36ms | ✓ OK |
| `PolicyVersion` | 48 | 48 | 3ms | ✓ OK |
| `PolicyRule` | 243 | 243 | 16ms | ✓ OK |
| `PolicyException` | 22 | 22 | 3ms | ✓ OK |
| `JobAttempt` | 163 | 163 | 12ms | ✓ OK |
| `JobEvent` | 769 | 769 | 36ms | ✓ OK |
| `DeadLetterRecord` | 53 | 53 | 6ms | ✓ OK |
| `ReconciliationFinding` | 217 | 217 | 13ms | ✓ OK |
| `ExecutionDiscrepancy` | 109 | 109 | 11ms | ✓ OK |
| `IncidentTimelineEvent` | 179 | 179 | 11ms | ✓ OK |
| `IncidentAssignment` | 13 | 13 | 2ms | ✓ OK |
| `RecoveryPlan` | 89 | 89 | 8ms | ✓ OK |
| `FundingRecord` | 47 | 47 | 4ms | ✓ OK |
| `WithdrawalRecord` | 9 | 9 | 2ms | ✓ OK |
| `Mandate` | 599 | 599 | 57ms | ✓ OK |
| `PolicyViolation` | 158 | 158 | 14ms | ✓ OK |
| `ReconciliationEvidence` | 217 | 217 | 14ms | ✓ OK |
| `RecoveryApproval` | 24 | 24 | 3ms | ✓ OK |
| `RecoveryAttempt` | 57 | 57 | 4ms | ✓ OK |
| `Task` | 295 | 295 | 24ms | ✓ OK |
| `Objective` | 393 | 393 | 50ms | ✓ OK |
| `RecoveryVerification` | 24 | 24 | 2ms | ✓ OK |
| `ResearchSession` | 12 | 12 | 6ms | ✓ OK |
| `ApprovalRequest` | 209 | 209 | 18ms | ✓ OK |
| `AuditLog` | 7425 | 7425 | 667ms | ✓ OK |
| `AgentExecution` | 387 | 387 | 81ms | ✓ OK |
| `ExecutionRecord` | 177 | 177 | 35ms | ✓ OK |
| `ObjectivePlan` | 332 | 332 | 32ms | ✓ OK |
| `ObjectiveSuccessCriteria` | 325 | 325 | 28ms | ✓ OK |
| `ObjectiveEvent` | 750 | 750 | 49ms | ✓ OK |
| `ObjectiveCheckpoint` | 48 | 48 | 8ms | ✓ OK |
| `CapabilityDiscovery` | 94 | 94 | 15ms | ✓ OK |
| `TransactionRecord` | 104 | 104 | 14ms | ✓ OK |
| `ExecutionEvent` | 4440 | 4440 | 210ms | ✓ OK |
| `ObjectivePlanStep` | 757 | 757 | 125ms | ✓ OK |
| `ObjectivePlanApproval` | 111 | 111 | 7ms | ✓ OK |
| `CoordinationRun` | 69 | 69 | 8ms | ✓ OK |
| `CapabilityMatch` | 432 | 432 | 30ms | ✓ OK |
| `ObjectiveTaskEvent` | 428 | 428 | 28ms | ✓ OK |
| `ObjectiveTaskResult` | 72 | 72 | 10ms | ✓ OK |
| `CoordinationTask` | 111 | 111 | 15ms | ✓ OK |
| `SharedObjectiveArtifact` | 70 | 70 | 8ms | ✓ OK |
| `AgentAssignment` | 303 | 303 | 32ms | ✓ OK |
| `AgentHandoff` | 91 | 91 | 12ms | ✓ OK |
| `TaskLease` | 57 | 57 | 5ms | ✓ OK |
| `CoordinationEvent` | 491 | 491 | 28ms | ✓ OK |

## 4. Key Security & Checkpoint Verification
- **Objective Checkpoints:** 100% cryptographically preserved.
- **Audit Logs:** 100% chronologically preserved.
- **Foreign Key Relationships:** Validated with zero orphan records.
- **Secrets Protection:** Zero private keys or raw authorization envelopes migrated in plaintext.

## 5. Certification Sign-off
- **ETL Standard:** Topological Kahn Dependency Ordering
- **Financial Drift:** 0 yoctoNEAR
- **Production Readiness:** CERTIFIED FOR POSTGRESQL PRODUCTION