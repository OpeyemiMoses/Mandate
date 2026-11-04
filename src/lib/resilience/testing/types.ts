/**
 * Resilience & Chaos Engineering Types (Milestone 9.4)
 */

export type DrillType =
  | "WORKER_CRASH_FINANCIAL"
  | "WORKER_CRASH_NON_FINANCIAL"
  | "AMBIGUOUS_NEAR_TIMEOUT"
  | "AMBIGUOUS_OUTLAYER_TIMEOUT"
  | "DB_DISCONNECT_CLAIM"
  | "DB_DISCONNECT_EXECUTION"
  | "QUEUE_BACKPRESSURE_OVERLOAD"
  | "SUDDEN_SIGTERM_SHUTDOWN"
  | "STALE_WORKER_RECLAMATION"
  | "SEV1_BLOCKS_PAUSE_RELEASE"
  | "CORRUPTED_BACKUP_DETECTION"
  | "FULL_RESTORE_DRILL"
  | "EMERGENCY_PAUSE_FINANCIAL"
  | "SECURITY_LOCKDOWN_ENFORCEMENT";

export interface DrillAssertion {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  error?: string;
}

export interface DrillResult {
  drillId: string;
  drillType: DrillType;
  status: "PASSED" | "FAILED";
  durationMs: number;
  assertionsPassed: number;
  assertionsFailed: number;
  assertions: DrillAssertion[];
  report: Record<string, any>;
  initiatedBy: string;
  completedAt: string;
}

