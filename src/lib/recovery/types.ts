/**
 * Recovery Orchestration Types (Milestone 9.3)
 * Deterministic recovery plans, human authorization models,
 * safe execution strategies, and independent verification.
 */

export type RecoveryStrategy =
  | "RECONCILE_ONLY"
  | "RETRY_NON_FINANCIAL_JOB"
  | "RECLAIM_EXPIRED_WORKER_LEASE"
  | "RECONNECT_PROVIDER"
  | "RESUME_SAFE_JOB"
  | "EXECUTION_STATUS_CHECK"
  | "MANUAL_FINANCIAL_REVIEW";

export type RecoveryPlanStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "EXECUTED"
  | "VERIFIED"
  | "FAILED"
  | "CANCELLED";

export type RecoveryApproverRole = "OWNER" | "OPERATOR" | "SECURITY_ADMIN";

export type RecoveryApproverType = "HUMAN" | "AGENT";

export type VerificationStrategy =
  | "INDEPENDENT_RPC_QUERY"
  | "DATABASE_CONSISTENCY_CHECK"
  | "WORKER_STATE_CHECK";

export interface PlanGenerationParams {
  incidentId?: string;
  tenantId?: string;
  targetEntityType: "EXECUTION" | "JOB" | "WORKER" | "PROVIDER";
  targetEntityId: string;
  strategy?: RecoveryStrategy;
  recommendedResponse?: string;
  isFinancial?: boolean;
  actionPayload?: Record<string, any>;
  mandateVersion?: number;
  createdBy?: string;
}

export interface ApprovePlanParams {
  planId: string;
  approverId: string;
  approverRole: RecoveryApproverRole;
  approverType: RecoveryApproverType; // MUST be HUMAN for financial operations!
  notes?: string;
  signature?: string;
}

export interface ExecutePlanParams {
  planId: string;
  executedBy: string;
  dryRun?: boolean;
}

export interface VerificationParams {
  planId: string;
  attemptId?: string;
  verificationStrategy: VerificationStrategy;
}

