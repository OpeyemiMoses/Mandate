/**
 * Universal Reconciliation Engine Types (Milestone 9.3)
 * Provides deterministic classifications, severities, evidence schemas,
 * and discrepancy definitions for Mandate operational reliability.
 */

export type ReconciliationClassification =
  | "MATCHED"              // Internal and external states agree completely
  | "PENDING_CONFIRMATION" // In-flight transaction within expected SLA
  | "INTERNAL_ONLY"        // Exists internally, not found externally
  | "EXTERNAL_ONLY"        // Verified externally, missing or unsynced internally
  | "STATE_MISMATCH"       // Internal and external states conflict (e.g. FAILED vs CONFIRMED)
  | "AMBIGUOUS"            // Authoritative state cannot be definitively resolved (budget held)
  | "UNAVAILABLE";         // Upstream provider or RPC is unreachable

export type ReconciliationSeverity = "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4" | "INFO";

export type ReconciliationEntityType =
  | "EXECUTION"
  | "JOB"
  | "WORKER"
  | "PROVIDER"
  | "FINANCIAL_RESERVATION";

export type ReconciliationRunType =
  | "FULL"
  | "TARGETED_EXECUTION"
  | "TARGETED_JOB"
  | "TARGETED_WORKER"
  | "TARGETED_PROVIDER";

export type DiscrepancyCategory =
  | "FINANCIAL_AMBIGUITY"
  | "STATE_DESYNC"
  | "ORPHANED_JOB"
  | "STALE_WORKER"
  | "RPC_TIMEOUT"
  | "LEASE_EXPIRED"
  | "PROVIDER_UNAVAILABLE";

export type DiscrepancyStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "RECOVERY_QUEUED"
  | "RESOLVED"
  | "IGNORED";

export interface EvidencePayload {
  sourceProvider: string;
  observedState: string;
  confidence: number;
  data: Record<string, any>;
  observedAt: string;
}

export interface EvaluatedFinding {
  entityType: ReconciliationEntityType;
  entityId: string;
  internalState: string;
  externalState: string | null;
  classification: ReconciliationClassification;
  severity: ReconciliationSeverity;
  details: string;
  recommendedResponse: string;
  evidence: EvidencePayload[];
  metadata?: Record<string, any>;
}

export interface ReconciliationRunOptions {
  tenantId?: string;
  runType?: ReconciliationRunType;
  targetScope?: string;
  entityIds?: string[];
  dryRun?: boolean;
  rpcUrl?: string;
  timeoutMs?: number;
}

export interface ReconciliationRunResult {
  runId: string;
  runType: ReconciliationRunType;
  status: "COMPLETED" | "FAILED" | "PARTIAL";
  totalEvaluated: number;
  matchedCount: number;
  mismatchCount: number;
  ambiguousCount: number;
  findingsCount: number;
  findings: EvaluatedFinding[];
  durationMs: number;
  error?: string;
}

