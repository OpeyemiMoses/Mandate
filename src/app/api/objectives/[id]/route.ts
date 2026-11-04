import { NextResponse } from "next/server";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isValidObjectiveStatusTransition, ObjectiveStatus } from "@/lib/objectives/types";
import { emitObjectiveEvent } from "@/lib/objectives/events";
import { ObjectiveLifecycleService } from "@/lib/objectives/lifecycleService";
import { assertObjectiveMandateValid } from "@/lib/objectives/authority";

export const dynamic = "force-dynamic";

/**
 * GET /api/objectives/[id]
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    const objective = await prisma.objective.findFirst({
      where: { id, userId: user.id },
      include: {
        mandate: {
          select: {
            id: true,
            name: true,
            totalBudgetYocto: true,
            spentYocto: true,
            reservedYocto: true,
            perTxLimitYocto: true,
            approvalThresholdYocto: true,
            allowedRecipientsJson: true,
          },
        },
        plans: {
          orderBy: { version: "desc" },
          include: {
            steps: { orderBy: { order: "asc" } },
            approvals: { orderBy: { createdAt: "desc" } },
          },
        },
        criteria: { orderBy: { createdAt: "asc" } },
        events: { orderBy: { timestamp: "desc" }, take: 25 },
      },
    });

    if (!objective) {
      return NextResponse.json(
        { success: false, error: "Objective not found or unauthorized" },
        { status: 404 }
      );
    }

    let structuredGoal = null;
    let constraints = {};
    let metadata = {};
    try {
      if (objective.structuredGoalJson) structuredGoal = JSON.parse(objective.structuredGoalJson);
    } catch {}
    try {
      if (objective.constraintsJson) constraints = JSON.parse(objective.constraintsJson);
    } catch {}
    try {
      if (objective.metadataJson) metadata = JSON.parse(objective.metadataJson);
    } catch {}

    const formattedPlans = objective.plans.map((p) => {
      let planData = {};
      try {
        if (p.planJson) planData = JSON.parse(p.planJson);
      } catch {}

      return {
        id: p.id,
        version: p.version,
        summary: p.summary,
        status: p.status,
        riskClassification: p.riskClassification,
        estimatedCostNear: p.estimatedCostNear,
        estimatedCostYocto: p.estimatedCostYocto,
        planHash: p.planHash || (planData as any).planHash,
        requiresApproval: p.requiresApproval,
        createdAt: p.createdAt.toISOString(),
        approvals: p.approvals.map((a) => ({
          decision: a.decision,
          comment: a.comment,
          createdAt: a.createdAt.toISOString(),
        })),
        steps: p.steps.map((s) => {
          let deps = [];
          let tools = [];
          let caps = [];
          let output = null;
          try {
            if (s.dependenciesJson) deps = JSON.parse(s.dependenciesJson);
          } catch {}
          try {
            if (s.requiredToolsJson) tools = JSON.parse(s.requiredToolsJson);
          } catch {}
          try {
            if (s.requiredCapabilitiesJson) caps = JSON.parse(s.requiredCapabilitiesJson);
          } catch {}
          try {
            if (s.outputJson) output = JSON.parse(s.outputJson);
          } catch {}

          return {
            id: s.id,
            stepId: s.stepId,
            title: s.title,
            description: s.description,
            order: s.order,
            status: s.status,
            taskType: s.taskType,
            agentType: s.agentType,
            assignedAgentId: s.assignedAgentId,
            dependencies: deps,
            requiredTools: tools,
            requiredCapabilities: caps,
            riskClassification: s.riskClassification,
            estimatedCostNear: s.estimatedCostNear,
            estimatedCostYocto: s.estimatedCostYocto,
            output,
            errorDetails: s.errorDetails,
            completedAt: s.completedAt?.toISOString() || null,
          };
        }),
      };
    });

    return NextResponse.json({
      success: true,
      objective: {
        id: objective.id,
        title: objective.title,
        description: objective.description,
        originalPrompt: objective.originalPrompt,
        structuredGoal,
        category: objective.category,
        status: objective.status,
        priority: objective.priority,
        version: objective.version,
        planningStatus: objective.planningStatus,
        executionStatus: objective.executionStatus,
        deadlineAt: objective.deadlineAt?.toISOString() || null,
        failureReason: objective.failureReason,
        mandate: objective.mandate,
        constraints,
        metadata,
        progressPercent: objective.progressPercent,
        currentPlan: formattedPlans[0] || null,
        plans: formattedPlans,
        criteria: objective.criteria.map((c) => ({
          id: c.criterionId,
          description: c.description,
          measurementType: c.measurementType,
          target: c.target,
          verificationMethod: c.verificationMethod,
          currentState: c.currentState,
          lastEvaluatedAt: c.lastEvaluatedAt?.toISOString() || null,
        })),
        events: objective.events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          auditLogId: e.auditLogId,
          timestamp: e.timestamp.toISOString(),
        })),
        startedAt: objective.startedAt?.toISOString() || null,
        completedAt: objective.completedAt?.toISOString() || null,
        lastEvaluatedAt: objective.lastEvaluatedAt?.toISOString() || null,
        createdAt: objective.createdAt.toISOString(),
        updatedAt: objective.updatedAt.toISOString(),
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * PATCH /api/objectives/[id]
 * Updates objective constraints, priority, title, deadline, or status with transition validation.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;
    const body = await req.json();

    const objective = await prisma.objective.findFirst({
      where: { id, userId: user.id },
    });

    if (!objective) {
      return NextResponse.json(
        { success: false, error: "Objective not found or unauthorized" },
        { status: 404 }
      );
    }

    // 1. If status transition requested, route through deterministic ObjectiveLifecycleService
    if (body.status && body.status !== objective.status) {
      try {
        const transitionResult = await ObjectiveLifecycleService.transitionStatus({
          objectiveId: id,
          targetStatus: body.status,
          actorId: user.id,
          actorRole: "USER",
          isAgent: false,
          reason: body.reason || "User updated objective status via API",
          expectedVersion: body.expectedVersion,
        });

        return NextResponse.json({
          success: true,
          objective: {
            id,
            status: transitionResult.newStatus,
            previousStatus: transitionResult.previousStatus,
            version: transitionResult.version,
          },
        });
      } catch (lifecycleErr: any) {
        const isConflict = lifecycleErr.message.includes("CONCURRENCY_CONFLICT");
        const isNotFound = lifecycleErr.message.includes("OBJECTIVE_NOT_FOUND");
        return NextResponse.json(
          { success: false, error: lifecycleErr.message },
          { status: isNotFound ? 404 : isConflict ? 409 : 400 }
        );
      }
    }

    // 2. Otherwise updating editable objective details
    if (["COMPLETED", "FAILED", "CANCELLED"].includes(objective.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot update objective in terminal state "${objective.status}"` },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (body.title && typeof body.title === "string") updateData.title = body.title;
    if (body.description && typeof body.description === "string") updateData.description = body.description;
    if (body.priority && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(body.priority)) {
      updateData.priority = body.priority;
    }
    if (body.deadlineAt) {
      updateData.deadlineAt = new Date(body.deadlineAt);
    }

    if (body.constraints && typeof body.constraints === "object") {
      // Validate mandate authority against new constraints if mandate linked
      if (objective.mandateId) {
        try {
          await assertObjectiveMandateValid({
            userId: user.id,
            mandateId: objective.mandateId,
            constraints: body.constraints,
          });
        } catch (authErr: any) {
          return NextResponse.json(
            { success: false, error: authErr.message },
            { status: 400 }
          );
        }
      }
      updateData.constraintsJson = JSON.stringify(body.constraints);
    }

    updateData.version = { increment: 1 };

    const updated = await prisma.objective.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      objective: {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        priority: updated.priority,
        version: updated.version,
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * DELETE /api/objectives/[id]
 * Cancels an objective owned by the user via ObjectiveLifecycleService.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    const objective = await prisma.objective.findFirst({
      where: { id, userId: user.id },
    });

    if (!objective) {
      return NextResponse.json(
        { success: false, error: "Objective not found or unauthorized" },
        { status: 404 }
      );
    }

    const result = await ObjectiveLifecycleService.cancelObjective({
      objectiveId: id,
      actorId: user.id,
      actorRole: "USER",
      reason: "User deleted/cancelled objective via API",
    });

    return NextResponse.json({
      success: true,
      objective: {
        id,
        status: result.newStatus,
        version: result.version,
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

