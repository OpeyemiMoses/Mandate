import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateObjectivePlan } from "@/lib/objectives/planner";
import { emitObjectiveEvent } from "@/lib/objectives/events";
import { ObjectiveDAGService } from "@/lib/objectives/dagService";

export const dynamic = "force-dynamic";

/**
 * GET /api/objectives/[id]/plan
 * Retrieves the latest or specific version plan for an objective.
 * Returns DAG execution levels, topological order, canonical planHash, and step definitions.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;
    const { searchParams } = new URL(req.url);
    const versionParam = searchParams.get("version");

    const whereClause: any = { objectiveId };
    if (versionParam) {
      whereClause.version = parseInt(versionParam, 10);
    }

    const plan = await prisma.objectivePlan.findFirst({
      where: whereClause,
      orderBy: { version: "desc" },
      include: {
        steps: { orderBy: { order: "asc" } },
        approvals: { orderBy: { createdAt: "desc" } },
        objective: { select: { userId: true, title: true, status: true, mandateId: true } },
      },
    });

    if (!plan || plan.objective.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Plan not found or unauthorized" },
        { status: 404 }
      );
    }

    const formattedSteps = plan.steps.map((s) => {
      let deps: string[] = [];
      let tools: string[] = [];
      let caps: string[] = [];
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
      };
    });

    // Compute execution levels and topological order using Kahn's algorithm
    const dagResult = ObjectiveDAGService.validateAndOrder(
      formattedSteps.map((s) => ({
        stepId: s.stepId,
        title: s.title,
        order: s.order,
        dependencies: s.dependencies,
      }))
    );

    let parsedPlanJson: any = {};
    try {
      if (plan.planJson) parsedPlanJson = JSON.parse(plan.planJson);
    } catch {}

    return NextResponse.json({
      success: true,
      plan: {
        id: plan.id,
        objectiveId: plan.objectiveId,
        version: plan.version,
        summary: plan.summary,
        status: plan.status,
        riskClassification: plan.riskClassification,
        estimatedCostNear: plan.estimatedCostNear,
        estimatedCostYocto: plan.estimatedCostYocto,
        planHash: plan.planHash || parsedPlanJson.planHash,
        requiresApproval: plan.requiresApproval,
        executionLevels: dagResult.executionLevels,
        topologicalOrder: dagResult.topologicalOrder,
        steps: formattedSteps,
        approvals: plan.approvals.map((a) => ({
          decision: a.decision,
          comment: a.comment,
          createdAt: a.createdAt.toISOString(),
        })),
        createdAt: plan.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve plan" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/objectives/[id]/plan
 * Generates an autonomous plan for the objective.
 * Decomposes tasks into typed DAG, executes 5-tier validation,
 * computes canonical SHA-256 planHash, and transitions lifecycle state.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;
    const body = await req.json().catch(() => ({}));

    const objective = await prisma.objective.findFirst({
      where: { id: objectiveId, userId: user.id },
    });

    if (!objective) {
      return NextResponse.json(
        { success: false, error: "Objective not found or unauthorized" },
        { status: 404 }
      );
    }

    let structuredGoal = null;
    let constraints = {};
    try {
      if (objective.structuredGoalJson) structuredGoal = JSON.parse(objective.structuredGoalJson);
    } catch {}
    try {
      if (objective.constraintsJson) constraints = JSON.parse(objective.constraintsJson);
    } catch {}

    if (body.constraints) {
      constraints = { ...constraints, ...body.constraints };
    }

    const planResult = await generateObjectivePlan({
      objectiveId,
      userId: user.id,
      title: objective.title,
      category: objective.category,
      structuredGoal,
      constraints,
      mandateId: body.mandateId || objective.mandateId,
      reason: body.reason,
      customSteps: body.customSteps,
    });

    await emitObjectiveEvent({
      objectiveId,
      userId: user.id,
      eventType: planResult.version > 1 ? "objective.plan_revised" : "objective.plan_generated",
      metadata: {
        planId: planResult.planId,
        version: planResult.version,
        planHash: planResult.contentHash,
        risk: planResult.riskClassification,
        requiresApproval: planResult.requiresApproval,
      },
      mandateId: objective.mandateId || undefined,
    });

    return NextResponse.json(
      {
        success: true,
        plan: planResult,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate plan" },
      { status: 500 }
    );
  }
}
