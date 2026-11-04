/**
 * Operational Control Plane Types (Milestone 9.4)
 * Centralized reliability, emergency controls, and execution gates.
 */

export type OperationalMode =
  | "NORMAL"
  | "FINANCIAL_EXECUTION_PAUSED"
  | "ALL_AGENT_EXECUTION_PAUSED"
  | "MAINTENANCE_MODE"
  | "SECURITY_LOCKDOWN";

export type OperationalActionType =
  | "EMERGENCY_PAUSE_FINANCIAL"
  | "EMERGENCY_PAUSE_ALL"
  | "EMERGENCY_PAUSE"
  | "RESUME_EXECUTION"
  | "ENTER_MAINTENANCE"
  | "EXIT_MAINTENANCE"
  | "TRIGGER_SECURITY_LOCKDOWN"
  | "RELEASE_SECURITY_LOCKDOWN"
  | "KILL_SWITCH_ACTIVATED"
  | "BACKUP_CREATED"
  | "RESTORE_EXECUTED"
  | "RESTORE_DATABASE"
  | "DRILL_RUN";

export type OperatorRole = "OWNER" | "SECURITY_ADMIN" | "OPERATOR" | "SYSTEM";

export interface ControlCheckResult {
  allowed: boolean;
  mode: OperationalMode;
  reason?: string;
  blockedAt?: string;
}

export interface TransitionControlStateParams {
  newMode: OperationalMode;
  actionType: OperationalActionType;
  actorId: string;
  actorRole: OperatorRole;
  isAgent?: boolean; // Strictly tested: AI agents are NEVER allowed to mutate control states!
  reason: string;
  incidentId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

export interface ResumeExecutionParams {
  actorId: string;
  actorRole: OperatorRole;
  isAgent?: boolean;
  reason: string;
  target?: "FINANCIAL" | "ALL_AGENTS" | "NORMAL";
  targetMode?: "NORMAL" | "FINANCIAL_EXECUTION_PAUSED";
  forceOverrideUnacknowledgedIncidents?: boolean;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

export interface OperationalStatusResponse {
  currentMode: OperationalMode;
  mode?: OperationalMode;
  isFinancialAllowed: boolean;
  isAgentAllowed: boolean;
  isMaintenanceMode: boolean;
  isSecurityLockdown: boolean;
  lastChangedAt: string;
  lastChangedBy: string;
  lastChangedByRole: string;
  reason: string;
  activeIncidentsCount: number;
  updatedAt?: string;
  updatedBy?: string;
  updatedByRole?: string;
}
