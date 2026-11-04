/**
 * Incident Management Types (Milestone 9.3)
 * Full lifecycle, severities, stage transitions, and timeline definitions.
 */

export type IncidentSeverity = "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4";

export type IncidentStage =
  | "DETECTED"
  | "TRIAGED"
  | "ACKNOWLEDGED"
  | "INVESTIGATING"
  | "MITIGATING"
  | "RECOVERY_PENDING"
  | "VERIFYING"
  | "RESOLVED"
  | "ESCALATED"
  | "MANUAL_INTERVENTION_REQUIRED";

export type IncidentStatus =
  | "DETECTED"
  | "ACKNOWLEDGED"
  | "INVESTIGATING"
  | "RECOVERY_PENDING"
  | "RESOLVED"
  | "ESCALATED"
  | "MANUAL_INTERVENTION_REQUIRED";

export type IncidentCategory =
  | "FINANCIAL_AMBIGUITY"
  | "SYSTEM_DEGRADATION"
  | "PROVIDER_OUTAGE"
  | "WORKER_STARVATION"
  | "RECOVERY_FAILURE";

export type IncidentSource =
  | "RECONCILIATION"
  | "TELEMETRY_ALERT"
  | "DEAD_LETTER"
  | "MANUAL";

export type IncidentEventType =
  | "CREATED"
  | "STAGE_CHANGED"
  | "STATUS_CHANGED"
  | "ASSIGNED"
  | "ESCALATED"
  | "RECOVERY_PLANNED"
  | "RECOVERY_APPROVED"
  | "RECOVERY_EXECUTED"
  | "RECOVERY_VERIFIED"
  | "RESOLVED"
  | "COMMENT";

export type IncidentActorType = "SYSTEM" | "USER" | "OPERATOR";

export interface CreateIncidentParams {
  tenantId?: string;
  title: string;
  description: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  source?: IncidentSource;
  targetEntityType?: string;
  targetEntityId?: string;
  deduplicationKey?: string;
  assignedTeam?: string;
  assignedTo?: string;
  actorId?: string;
  actorType?: IncidentActorType;
  metadata?: Record<string, any>;
  evidenceHash?: string;
}

export interface TransitionIncidentParams {
  incidentId: string;
  newStage: IncidentStage;
  actorId?: string;
  actorType?: IncidentActorType;
  notes: string;
  evidenceHash?: string;
  metadata?: Record<string, any>;
}

export interface AssignIncidentParams {
  incidentId: string;
  assignedTo: string;
  assignedBy: string;
  assignedTeam?: string;
  role?: string;
  notes?: string;
}

export interface ResolveIncidentParams {
  incidentId: string;
  resolutionSummary: string;
  resolvedBy: string;
  actorType?: IncidentActorType;
}

