import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { TaskAssignmentEngine } from "@/lib/agents/assignmentEngine";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/assign
 * Deterministically assigns or reassigns an approved task to an eligible agent.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;
    const body = await req.json().catch(() => ({}));

    const stepId = body.stepId || body.taskId;

    if (!stepId) {
      // Batch assign all unassigned steps in latest plan
      const batchResult = await TaskAssignmentEngine.assignObjectivePlan(
        objectiveId,
        user.id,
        body.agentId || body.preferredAgentId
      );
      return NextResponse.json({
        success: true,
        assignments: batchResult.assignments,
      });
    }

    const result = await TaskAssignmentEngine.assignTask({
      objectiveId,
      stepId,
      userId: user.id,
      agentId: body.agentId || body.preferredAgentId,
      expectedPlanHash: body.planHash,
      expectedPlanVersion: body.planVersion,
      expectedObjectiveVersion: body.objectiveVersion,
      reason: body.reason,
    });

    return NextResponse.json({
      success: true,
      assignment: result,
      assignments: [result],
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Task assignment failed" },
      { status: error.message?.includes("unauthorized") || error.message?.includes("not found") ? 404 : 400 }
    );
  }
}
