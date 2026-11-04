/**
 * MANDATE — MILESTONE 13.5: UNIFIED OBJECTIVE EXECUTION HISTORY & AUDIT TRAIL
 *
 * Chronological, tenant-isolated, tamper-evident audit history combining:
 * - Objective lifecycle transitions
 * - Plan generation and canonical planHash
 * - Human plan approvals
 * - Agent capability assignments and governed delegations
 * - Task dispatches and state transitions
 * - Actual tool executions and outcomes
 * - Independent multi-tier verification decisions and result fingerprints
 * - Recovery, retries, and human interventions
 * - Success criteria evaluations
 */

import { prisma } from "@/lib/db";

export type AuditTrailCategory =
  | "OBJECTIVE_LIFECYCLE"
  | "PLANNING"
  | "APPROVAL"
  | "ASSIGNMENT"
  | "TASK_DISPATCH"
  | "TOOL_EXECUTION"
  | "VERIFICATION"
  | "RECOVERY"
  | "INTERVENTION"
  | "SUCCESS_CRITERIA";

export interface UnifiedAuditTrailItem {
  id: string;
  timestamp: string;
  category: AuditTrailCategory;
  actorId?: string;
  actorRole: string;
  title: string;
  summary: string;
  details?: Record<string, any>;
  stepId?: string;
  verificationStatus?: string;
  resultFingerprint?: string;
}

export interface UnifiedAuditTrailResponse {
  objectiveId: string;
  objectiveTitle: string;
  totalEvents: number;
  items: UnifiedAuditTrailItem[];
}

export class ObjectiveAuditTrailService {
  /**
   * Retrieves the unified, chronological execution history for an objective
   */
  public static async getChronologicalHistory(
    objectiveId: string,
    userId: string
  ): Promise<UnifiedAuditTrailResponse> {
    // 1. Verify Tenant Authorization
    const objective = await prisma.objective.findUnique({
      where: { id: objectiveId },
      include: {
        plans: {
          include: {
            approvals: true,
            steps: true,
          },
        },
        criteria: true,
      },
    });

    if (!objective) {
      throw new Error(`OBJECTIVE_NOT_FOUND: Objective "${objectiveId}" not found.`);
    }

    if (objective.userId !== userId) {
      throw new Error(`OBJECTIVE_NOT_FOUND: Objective "${objectiveId}" not found or unauthorized.`);
    }

    const items: UnifiedAuditTrailItem[] = [];

    // 2. Aggregate Objective Lifecycle Events
    const objEvents = await prisma.objectiveEvent.findMany({
      where: { objectiveId },
      orderBy: { timestamp: "asc" },
    });

    for (const ev of objEvents) {
      let meta: any = {};
      try {
        if (ev.metadataJson) meta = JSON.parse(ev.metadataJson);
      } catch {}

      items.push({
        id: `ev_${ev.id}`,
        timestamp: ev.timestamp.toISOString(),
        category: "OBJECTIVE_LIFECYCLE",
        actorId: ev.actorId || undefined,
        actorRole: ev.actorRole || "SYSTEM",
        title: `Objective Status: ${ev.toStatus || ev.eventType}`,
        summary: ev.reason || `Objective transitioned to ${ev.toStatus}`,
        details: meta,
      });
    }

    // 3. Aggregate Plan Generation & Approvals
    for (const plan of objective.plans) {
      items.push({
        id: `plan_${plan.id}`,
        timestamp: plan.createdAt.toISOString(),
        category: "PLANNING",
        actorId: "SYSTEM",
        actorRole: "SYSTEM",
        title: `Execution Plan v${plan.version} Generated`,
        summary: `Plan created with ${plan.steps.length} steps. Hash: ${plan.planHash ? plan.planHash.slice(0, 16) + "..." : "none"}`,
        details: {
          version: plan.version,
          planHash: plan.planHash,
          risk: plan.riskClassification,
          stepCount: plan.steps.length,
        },
      });

      for (const app of plan.approvals) {
        items.push({
          id: `app_${app.id}`,
          timestamp: app.createdAt.toISOString(),
          category: "APPROVAL",
          actorId: app.userId,
          actorRole: "USER",
          title: `Execution Plan v${plan.version} Decision: ${app.decision}`,
          summary: app.comment || `Plan v${plan.version} ${app.decision.toLowerCase()} by user`,
          details: {
            userId: app.userId,
            decision: app.decision,
            version: app.version,
            planHash: plan.planHash,
            constraints: app.constraintsJson ? JSON.parse(app.constraintsJson) : {},
          },
        });
      }
    }

    // 4. Aggregate Agent Assignments & Handoffs
    const assignments = await prisma.agentAssignment.findMany({
      where: { objectiveId },
      include: { agent: { select: { name: true, type: true } } },
      orderBy: { assignedAt: "asc" },
    });

    for (const ass of assignments) {
      const stepId = (ass.stepId || ass.taskId) ?? undefined;
      items.push({
        id: `ass_${ass.id}`,
        timestamp: ass.assignedAt.toISOString(),
        category: "ASSIGNMENT",
        actorId: ass.agentId,
        actorRole: "SYSTEM",
        title: `Task "${stepId || "unspecified"}" Assigned to Agent`,
        summary: `Agent "${ass.agent.name}" (${ass.agent.type}) assigned under lease gen ${ass.leaseGeneration}`,
        details: {
          stepId,
          agentId: ass.agentId,
          agentName: ass.agent.name,
          leaseGeneration: ass.leaseGeneration,
          policyVersion: ass.policyVersion,
        },
        stepId,
      });
    }

    const handoffs = await prisma.agentHandoff.findMany({
      where: { objectiveId },
      orderBy: { createdAt: "asc" },
    });

    for (const h of handoffs) {
      const stepId = (h.stepId || h.taskId) ?? undefined;
      items.push({
        id: `handoff_${h.id}`,
        timestamp: h.createdAt.toISOString(),
        category: "ASSIGNMENT",
        actorId: h.sourceAgentId,
        actorRole: "AGENT",
        title: `Task "${stepId || "unspecified"}" Delegated`,
        summary: `Delegated from agent "${h.sourceAgentId}" to "${h.destinationAgentId}". Reason: ${h.reason}`,
        details: {
          sourceAgentId: h.sourceAgentId,
          destinationAgentId: h.destinationAgentId,
          reason: h.reason,
        },
        stepId,
      });
    }

    // 5. Aggregate Task Events (Transitions, Dispatches, Retries, Interventions)
    const taskEvents = await prisma.objectiveTaskEvent.findMany({
      where: { objectiveId },
      orderBy: { timestamp: "asc" },
    });

    for (const te of taskEvents) {
      let meta: any = {};
      try {
        if (te.metadataJson) meta = JSON.parse(te.metadataJson);
      } catch {}

      let cat: AuditTrailCategory = "TASK_DISPATCH";
      if (te.toStatus === "RETRY_PENDING") cat = "RECOVERY";
      if (te.toStatus === "REQUIRES_INTERVENTION") cat = "INTERVENTION";
      if (te.toStatus === "COMPLETED" || te.toStatus === "AWAITING_APPROVAL") cat = "VERIFICATION";

      items.push({
        id: `te_${te.id}`,
        timestamp: te.timestamp.toISOString(),
        category: cat,
        actorId: te.actorId || undefined,
        actorRole: te.actorRole,
        title: `Task "${te.stepId}": ${te.fromStatus} → ${te.toStatus}`,
        summary: te.reason || `Task transitioned to ${te.toStatus}`,
        details: meta,
        stepId: te.stepId,
      });
    }

    // 6. Aggregate Task Results & Tool Invocations
    const taskResults = await prisma.objectiveTaskResult.findMany({
      where: { objectiveId },
      include: { step: { select: { taskType: true } } },
      orderBy: { createdAt: "asc" },
    });

    for (const tr of taskResults) {
      let out: any = {};
      try {
        if (tr.structuredOutputJson) out = JSON.parse(tr.structuredOutputJson);
      } catch {}

      let toolExecs: any[] = [];
      try {
        if (tr.toolExecutionsJson) toolExecs = JSON.parse(tr.toolExecutionsJson);
      } catch {}

      // Add Tool Execution entries if present
      for (const [idx, te] of toolExecs.entries()) {
        items.push({
          id: `tool_${tr.id}_${idx}`,
          timestamp: te.executedAt || tr.completedAt.toISOString(),
          category: "TOOL_EXECUTION",
          actorId: tr.agentId,
          actorRole: "AGENT",
          title: `Tool Invocated: ${te.toolId}`,
          summary: `Tool "${te.toolId}" executed with status: ${te.success ? "SUCCESS" : "FAILED"}`,
          details: {
            toolId: te.toolId,
            paramsHash: te.paramsHash,
            success: te.success,
          },
          stepId: tr.stepId,
        });
      }

      const durationMs = tr.completedAt.getTime() - tr.startedAt.getTime();

      // Add Verification decision
      items.push({
        id: `res_${tr.id}`,
        timestamp: tr.completedAt.toISOString(),
        category: "VERIFICATION",
        actorId: tr.agentId,
        actorRole: "SYSTEM",
        title: `Task "${tr.stepId}" Verified: ${tr.verificationStatus}`,
        summary: `Result verified (${tr.verificationStatus}). Fingerprint: ${tr.resultFingerprint.slice(0, 16)}...`,
        details: {
          taskType: tr.step?.taskType || "TASK",
          durationMs,
          verificationDetails: tr.verificationDetailsJson ? JSON.parse(tr.verificationDetailsJson) : {},
        },
        stepId: tr.stepId,
        verificationStatus: tr.verificationStatus,
        resultFingerprint: tr.resultFingerprint,
      });
    }

    // 7. Aggregate Success Criteria Evaluations
    for (const crit of objective.criteria) {
      if (crit.lastEvaluatedAt) {
        items.push({
          id: `crit_${crit.id}`,
          timestamp: crit.lastEvaluatedAt.toISOString(),
          category: "SUCCESS_CRITERIA",
          actorId: "SYSTEM",
          actorRole: "SYSTEM",
          title: `Success Criterion: ${crit.description}`,
          summary: `Status: ${crit.currentState}. Target: ${crit.target}`,
          details: {
            criterionId: crit.criterionId,
            measurementType: crit.measurementType,
            currentState: crit.currentState,
            evidence: crit.evidenceJson ? JSON.parse(crit.evidenceJson) : {},
          },
        });
      }
    }

    // 8. Sort Strictly Chronologically by timestamp ascending
    items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      objectiveId,
      objectiveTitle: objective.title,
      totalEvents: items.length,
      items,
    };
  }
}

