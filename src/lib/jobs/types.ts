/**
 * Mandate Universal Background Execution & Worker Reliability Types
 * Milestone 9.1 - Durable Job Processing & Distributed Worker Lifecycle
 */

import { BackgroundJob, BackgroundWorker, JobAttempt, JobEvent, DeadLetterRecord } from "@prisma/client";

export type JobStatus =
  | "QUEUED"
  | "SCHEDULED"
  | "CLAIMED"
  | "RUNNING"
  | "RETRY_WAIT"
  | "COMPLETED"
  | "FAILED"
  | "DEAD_LETTER"
  | "CANCELLED"
  | "REQUIRES_RECOVERY";

export type WorkerStatus =
  | "STARTING"
  | "IDLE"
  | "BUSY"
  | "UNHEALTHY"
  | "DRAINING"
  | "STOPPED";

export type JobOutcome =
  | "SUCCESS"
  | "FAILED"
  | "TIMED_OUT"
  | "RETRYABLE_ERROR"
  | "NON_RETRYABLE_ERROR";

export type JobCategory =
  | "GENERAL"
  | "FINANCIAL"
  | "INTEGRATION"
  | "GOVERNANCE"
  | "COORDINATION";

export interface RetryPolicy {
  maxAttempts: number;
  initialBackoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  initialBackoffMs: 10000, // 10 seconds
  backoffMultiplier: 3,     // 10s, 30s, 90s (capped at 2m / 10m)
  maxBackoffMs: 600000,    // 10 minutes max
  jitter: true,
};

export interface JobExecutionContext<T = any> {
  job: BackgroundJob;
  payload: T;
  workerId: string;
  leaseToken?: string;
  leaseGeneration?: number;
  correlationId: string;
  signal: AbortSignal;
  heartbeat: () => Promise<boolean>;
  verifyOwnership?: () => Promise<boolean>;
}

export interface JobExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  requiresRecovery?: boolean;
  requiresApproval?: boolean;
  txHash?: string;
  metadata?: Record<string, any>;
}

export interface JobDefinition<T = any> {
  jobType: string;
  category: JobCategory;
  schema: (payload: any) => { valid: boolean; error?: string };
  requiredCapability: string;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  isFinancial: boolean;
  requiresApproval: boolean;
  requiresRecovery: boolean;
  handler: (context: JobExecutionContext<T>) => Promise<JobExecutionResult>;
}

export interface SubmitJobInput {
  tenantId: string;
  jobType: string;
  payload: Record<string, any>;
  priority?: number;
  scheduledAt?: Date;
  idempotencyKey?: string;
  correlationId?: string;
  parentJobId?: string;
  maxAttempts?: number;
  traceParent?: string;
  traceState?: string;
}

export interface JobFilters {
  tenantId: string;
  status?: JobStatus;
  jobType?: string;
  priority?: number;
  limit?: number;
  offset?: number;
  search?: string;
}

export interface ClaimJobResult {
  claimed: boolean;
  job?: BackgroundJob | null;
  leaseToken?: string;
  leaseGeneration?: number;
  leaseExpiresAt?: Date;
  attemptNumber?: number;
  reason?: string;
}
