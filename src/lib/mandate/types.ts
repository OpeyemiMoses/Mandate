/**
 * Mandate Lifecycle & Accounting Types
 * Milestone 12 - Autonomous Spending Lifecycle & Multi-Transaction Reliability
 */

export type MandateLifecycleStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PAUSED"
  | "EXPIRED"
  | "BUDGET_EXHAUSTED"
  | "REVOKED"
  | "COMPLETED";

export interface MandateTransitionParams {
  mandateId: string;
  actorUserId: string;
  reason: string;
  metadata?: Record<string, any>;
}

export interface MandateUpdateConfigParams {
  mandateId: string;
  actorUserId: string;
  name?: string;
  description?: string;
  totalBudgetYocto?: string;
  perTxLimitYocto?: string;
  approvalThresholdYocto?: string;
  allowedRecipients?: string[];
  expiresAt?: Date;
  reason?: string;
}

export interface MandateLifecycleTransitionResult {
  success: boolean;
  previousStatus: MandateLifecycleStatus;
  newStatus: MandateLifecycleStatus;
  mandateId: string;
  policyVersion: number;
  reason?: string;
  error?: string;
}

export interface MandateAccountingBreakdown {
  mandateId: string;
  name: string;
  status: MandateLifecycleStatus;
  policyVersion: number;
  
  // Core Integer yoctoNEAR balances
  totalBudgetYocto: string;
  spentYocto: string;
  reservedYocto: string;
  availableBudgetYocto: string;
  
  // Multi-transaction aggregation fields
  pendingSettlementYocto: string;
  failedExecutionYocto: string;
  releasedReservationYocto: string;
  
  // Human-readable NEAR formatted strings
  totalBudgetNear: string;
  spentNear: string;
  reservedNear: string;
  availableBudgetNear: string;
  pendingSettlementNear: string;
  failedExecutionNear: string;
  releasedReservationNear: string;
  
  // Transaction counts
  confirmedTxCount: number;
  inFlightTxCount: number;
  failedTxCount: number;
  
  // Integrity flag
  isBalanced: boolean;
  discrepancyYocto: string;
}

