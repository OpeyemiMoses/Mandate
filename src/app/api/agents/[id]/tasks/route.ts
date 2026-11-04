import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { TaskAssignmentEngine } from "@/lib/agents/assignmentEngine";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/[id]/tasks
 * Lists active and assigned tasks for a given agent.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: agentId } = params;

    const tasks = await TaskAssignmentEngine.listTasksForAgent(agentId, user.id);

    return NextResponse.json({
      success: true,
      tasks,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to list agent tasks" },
      { status: error.message?.includes("unauthorized") || error.message?.includes("not found") ? 404 : 500 }
    );
  }
}

