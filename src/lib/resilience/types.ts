/**
 * Resilience & Worker Lifecycle Types (Milestone 9.4)
 */

export type LifecycleState =
  | "INITIALIZING"
  | "READY"
  | "DRAINING"
  | "STOPPED"
  | "TERMINATED";

export interface ShutdownOptions {
  gracePeriodMs?: number;
  reason?: string;
  saveProgress?: boolean;
}

export interface ShutdownResult {
  completed: boolean;
  drainedJobsCount: number;
  preservedFinancialJobsCount: number;
  durationMs: number;
  state: LifecycleState;
}

export interface RestartRecoveryResult {
  recoveredLeasesCount: number;
  reconciledExecutionsCount: number;
  ambiguousFinancialJobsPreserved: number;
  staleWorkersMarkedStopped: number;
  durationMs: number;
}

export interface LivenessStatus {
  status: "ALIVE" | "SHUTTING_DOWN" | "TERMINATED";
  pid: number;
  uptimeSeconds: number;
  memoryUsageMb: number;
  timestamp: string;
}

export interface ReadinessStatus {
  status: "READY" | "NOT_READY";
  databaseHealthy: boolean;
  operationalMode: string;
  circuitBreakersHealthy: boolean;
  checks: {
    database: boolean;
    operationalGate: boolean;
    workerFleet: boolean;
  };
  databaseTarget?: {
    databaseName: string;
    hostname: string;
    classification: "DISPOSABLE_TEST" | "PRODUCTION" | "UNAPPROVED";
    isDisposableTestDatabase: boolean;
    testModeActive: boolean;
  };
  timestamp: string;
  error?: string;
}

