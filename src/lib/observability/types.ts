/**
 * Mandate Universal Observability & Telemetry Types
 * Milestone 9.2 - Distributed Tracing, Real Operational Metrics & Capacity Telemetry
 */

export type SpanKind = "INTERNAL" | "SERVER" | "CLIENT" | "PRODUCER" | "CONSUMER";
export type SpanStatusCode = "UNSET" | "OK" | "ERROR";

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface W3CTraceContext {
  version: string;
  traceId: string;
  spanId: string;
  traceFlags: string;
}

export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTimeUnixNano: number;
  endTimeUnixNano: number;
  durationMs: number;
  statusCode: SpanStatusCode;
  statusMessage?: string;
  attributes: Record<string, string | number | boolean>;
  events: Array<{
    name: string;
    timeUnixNano: number;
    attributes?: Record<string, string | number | boolean>;
  }>;
}

export interface TraceDetail {
  traceId: string;
  rootSpan?: SpanRecord;
  spans: SpanRecord[];
  totalDurationMs: number;
  hasErrors: boolean;
  correlationId?: string;
  jobId?: string;
  workerId?: string;
  executionId?: string;
}

export interface ExporterStatus {
  serviceName: string;
  configured: boolean;
  endpoint?: string;
  protocol?: string;
  status: "NOT_CONFIGURED" | "ACTIVE" | "ERROR";
  lastExportAt?: string;
  lastError?: string;
}

// Operational Queue Metrics
export interface QueueMetrics {
  totalSubmitted: number;
  currentlyQueued: number;
  currentlyRunning: number;
  scheduled: number;
  awaitingRetry: number;
  completed: number;
  failed: number;
  deadLettered: number;
  requiresRecovery: number;
  averageWaitTimeMs: number;
  averageProcessingDurationMs: number;
  successRate: number;
  failureRate: number;
}

// Operational Worker Fleet Metrics
export interface WorkerFleetMetrics {
  totalRegistered: number;
  activeWorkers: number;
  idleWorkers: number;
  busyWorkers: number;
  unhealthyWorkers: number;
  drainingWorkers: number;
  totalSlots: number;
  availableSlots: number;
  utilizationRate: number;
  workers: Array<{
    id: string;
    workerName: string;
    instanceId: string;
    status: string;
    currentJobId: string | null;
    jobsProcessed: number;
    recentFailures: number;
    maxConcurrency: number;
    activeSlots: number;
    lastHeartbeatAt: string;
    heartbeatAgeSeconds: number;
    isHealthy: boolean;
  }>;
}

// Real Agent Execution Metrics
export interface AgentMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  runningExecutions: number;
  successRate: number;
  averageDurationMs: number;
  byStatus: Record<string, number>;
}

// Real Tool Execution Metrics
export interface ToolMetrics {
  totalInvocations: number;
  successfulInvocations: number;
  failedInvocations: number;
  successRate: number;
  averageDurationMs: number;
  byTool: Record<string, { count: number; successes: number; failures: number }>;
}

// Real Financial Execution Metrics (Bounded, zero private financial data)
export interface FinancialExecutionMetrics {
  totalRequests: number;
  authorizedAttempts: number;
  confirmedSettlements: number;
  failedExecutions: number;
  requiresRecovery: number;
  policyDenials: number;
  approvalRequiredCount: number;
  ambiguousBroadcastCount: number;
  averageSettlementDurationMs: number;
}

// Scaling Recommendations & Capacity Analysis
export type ScalingRecommendationType =
  | "NO_CHANGE"
  | "INCREASE_CAPACITY"
  | "REDUCE_CAPACITY"
  | "INVESTIGATE_UNHEALTHY_WORKERS";

export interface ScalingEvidence {
  eligibleQueuedJobs: number;
  activeWorkers: number;
  unhealthyWorkers: number;
  totalCapacitySlots: number;
  availableSlots: number;
  queuePressure: number;
  averageWaitTimeMs: number;
  recentFailureCount: number;
}

export interface CapacityEvaluation {
  recommendation: ScalingRecommendationType;
  currentWorkers: number;
  recommendedWorkers: number;
  currentSlots: number;
  recommendedSlots: number;
  queuePressure: number;
  reason: string;
  evidence: ScalingEvidence;
  isAdvisoryOnly: true;
  evaluatedAt: string;
}

// Operational Alerts
export type AlertSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
export type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "SUPPRESSED";
export type AlertType =
  | "QUEUE_BACKLOG"
  | "WORKER_STALE"
  | "RECOVERY_REQUIRED"
  | "FAILURE_SPIKE"
  | "DEAD_LETTER_GROWTH"
  | "DATABASE_POOL_EXHAUSTION"
  | "DATABASE_SLOW_QUERY"
  | "FINANCIAL_RESERVATION_COLLISION"
  | "LEASE_THEFT_ATTEMPT";

export interface OperationalAlertInput {
  tenantId?: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  observedValue: number;
  threshold: number;
  unit?: string;
  resourceType: "QUEUE" | "WORKER" | "EXECUTION" | "DEAD_LETTER" | "DATABASE" | "MANDATE" | "LEASE";
  resourceId?: string;
  deduplicationKey: string;
  metadata?: Record<string, any>;
}

// Full Observability Overview
export interface ObservabilityOverview {
  systemStatus: "HEALTHY" | "DEGRADED" | "CRITICAL";
  queue: QueueMetrics;
  workers: WorkerFleetMetrics;
  agents: AgentMetrics;
  tools: ToolMetrics;
  financial: FinancialExecutionMetrics;
  capacity: CapacityEvaluation;
  openAlertsCount: number;
  exporter: ExporterStatus;
  timestamp: string;
}

