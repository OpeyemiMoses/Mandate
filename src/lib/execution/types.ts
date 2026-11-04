/**
 * Autonomous Execution Security Types
 * Milestone 8 - Production Readiness & Boundary Enforcement
 */

export type ExecutionStatus =
  | "PROPOSED"
  | "VALIDATED"
  | "AUTHORIZED"
  | "SIGNED"
  | "BROADCAST"
  | "CONFIRMING"
  | "CONFIRMED"
  | "FAILED"
  | "REQUIRES_RECOVERY"
  | "RECOVERED";

export type ExecutionOperation =
  | "near_transfer"
  | "tool_call"
  | "integration_action"
  | "custody_disbursement"
  | "wallet_withdrawal";

export interface AuthorizationEnvelope {
  executionId: string;
  userId: string;
  agentId?: string;
  mandateId: string;
  operation: string;
  targetChain: string;
  recipient: string;
  token: string;
  amountYocto: string;
  toolOrIntegrationId?: string;
  parameters: Record<string, any>;
  governancePolicyId?: string;
  governancePolicyVersion?: number;
  mandateVersion?: number;
  approvalId?: string;
  actionPayloadHash: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  details?: string;
}

export interface PreflightValidationResult {
  valid: boolean;
  reason?: string;
  checks: ValidationCheck[];
  amountYocto: string;
  amountNear: string;
  balanceAvailableYocto: string;
  storageBufferYocto: string;
  network: string;
  recipient: string;
}

export interface ExecutionRequest {
  userId: string;
  mandateId: string;
  agentId?: string;
  taskId?: string;
  objectiveId?: string;
  operation: ExecutionOperation | string;
  recipient: string;
  amountYocto: string;
  parameters?: Record<string, any>;
  idempotencyKey: string;
  approvalId?: string;
  isSimulated?: boolean;
  alreadyReserved?: boolean;
  jobId?: string;
  leaseGeneration?: number;
}

export interface ExecutionResult {
  success: boolean;
  executionId: string;
  status: ExecutionStatus;
  txHash?: string;
  blockHash?: string;
  blockHeight?: number;
  gasBurnt?: string;
  tokensBurnt?: string;
  error?: string;
  recoveryStatus?: string;
  settled: boolean;
  isSimulated: boolean;
  envelope?: AuthorizationEnvelope;
  durationMs: number;
}
