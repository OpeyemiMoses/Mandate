import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ObjectiveDAGService } from "@/lib/objectives/dagService";

export const dynamic = "force-dynamic";

/**
 * GET /api/objectives/[id]/graph
 * Returns the DAG structure for visualization:
 * - Nodes: tasks with statuses, risk levels, and execution levels
 * - Edges: directed dependency links (from dependency -> to dependent)
 * - Parallel execution levels
 * - Topological order
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
        objective: { select: { userId: true, title: true, status: true } },
      },
    });

    if (!plan || plan.objective.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Plan graph not found or unauthorized" },
        { status: 404 }
      );
    }

    const parsedSteps = plan.steps.map((s) => {
      let deps: string[] = [];
      let tools: string[] = [];
      try {
        if (s.dependenciesJson) deps = JSON.parse(s.dependenciesJson);
      } catch {}
      try {
        if (s.requiredToolsJson) tools = JSON.parse(s.requiredToolsJson);
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
        dependencies: deps,
        requiredTools: tools,
        riskClassification: s.riskClassification,
        estimatedCostNear: s.estimatedCostNear,
        estimatedCostYocto: s.estimatedCostYocto,
      };
    });

    // Run Kahn DAG analysis
    const dagResult = ObjectiveDAGService.validateAndOrder(
      parsedSteps.map((s) => ({
        stepId: s.stepId,
        title: s.title,
        order: s.order,
        dependencies: s.dependencies,
      }))
    );

    // Build Node Level Map
    const nodeLevelMap = new Map<string, number>();
    dagResult.executionLevels.forEach((lvl, lvlIdx) => {
      lvl.forEach((stepId) => nodeLevelMap.set(stepId, lvlIdx));
    });

    // Construct Graph Nodes
    const nodes = parsedSteps.map((s) => ({
      id: s.stepId,
      dbId: s.id,
      title: s.title,
      description: s.description,
      taskType: s.taskType,
      agentType: s.agentType,
      status: s.status,
      risk: s.riskClassification,
      order: s.order,
      level: nodeLevelMap.get(s.stepId) ?? 0,
      dependencies: s.dependencies,
      tools: s.requiredTools,
      costNear: s.estimatedCostNear,
      costYocto: s.estimatedCostYocto,
    }));

    // Construct Directed Graph Edges
    const edges: Array<{ from: string; to: string; label?: string }> = [];
    for (const step of parsedSteps) {
      for (const dep of step.dependencies) {
        edges.push({
          from: dep,
          to: step.stepId,
          label: "requires",
        });
      }
    }

    return NextResponse.json({
      success: true,
      graph: {
        objectiveId: plan.objectiveId,
        planId: plan.id,
        planVersion: plan.version,
        planHash: plan.planHash,
        riskClassification: plan.riskClassification,
        requiresApproval: plan.requiresApproval,
        nodes,
        edges,
        executionLevels: dagResult.executionLevels,
        topologicalOrder: dagResult.topologicalOrder,
        isAcyclic: dagResult.valid,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate graph" },
      { status: 500 }
    );
  }
}

