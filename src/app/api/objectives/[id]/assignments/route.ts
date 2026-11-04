import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { TaskAssignmentEngine } from "@/lib/agents/assignmentEngine";

export const dynamic = "force-dynamic";

/**
 * GET /api/objectives/[id]/assignments
 * Lists all task assignments bound to an objective.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;

    const assignments = await TaskAssignmentEngine.listAssignmentsForObjective(objectiveId, user.id);

    return NextResponse.json({
      success: true,
      assignments,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to list assignments" },
      { status: error.message?.includes("unauthorized") || error.message?.includes("not found") ? 404 : 500 }
    );
  }
}

