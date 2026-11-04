import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { prisma } from "@/lib/db";
import { MultiAgentWorkflowPlanner } from "@/lib/coordination/workflowPlanner";

export const dynamic = "force-dynamic";

/**
 * GET /api/coordination
 * List all coordination runs for the authenticated user
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const objectiveId = searchParams.get("objectiveId");
    const status = searchParams.get("status");

    const where: any = { userId: user.id };
    if (objectiveId) where.objectiveId = objectiveId;
    if (status) where.status = status;

    const runs = await prisma.coordinationRun.findMany({
      where,
      include: {
        objective: { select: { id: true, title: true, priority: true } },
        mandate: { select: { id: true, name: true, totalBudgetYocto: true, spentYocto: true } },
        _count: {
          select: { tasks: true, assignments: true, handoffs: true, artifacts: true, events: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ runs });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * POST /api/coordination
 * Create and plan a new multi-agent coordination run for an approved objective
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { objectiveId, planVersion, concurrencyLimit } = body;

    if (!objectiveId) {
      return NextResponse.json({ error: "Missing required field: objectiveId" }, { status: 400 });
    }

    const planned = await MultiAgentWorkflowPlanner.planWorkflow({
      objectiveId,
      userId: user.id,
      planVersion: planVersion ? parseInt(planVersion, 10) : undefined,
      concurrencyLimit: concurrencyLimit ? parseInt(concurrencyLimit, 10) : 5,
    });

    return NextResponse.json({
      success: true,
      run: planned.run,
      taskCount: planned.tasks.length,
      assignmentCount: planned.assignments.length,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

