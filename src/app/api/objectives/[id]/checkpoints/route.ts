import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { ObjectiveCheckpointService } from "@/lib/orchestration/checkpointService";

export const dynamic = "force-dynamic";

/**
 * GET /api/objectives/[id]/checkpoints
 * Retrieves the chronological list of durable state checkpoints for an objective.
 * Strictly verifies tenant authorization (masked with 404).
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;

    const checkpoints = await ObjectiveCheckpointService.listCheckpoints(
      objectiveId,
      user.id
    );

    return NextResponse.json({
      success: true,
      objectiveId,
      totalCheckpoints: checkpoints.length,
      checkpoints,
    });
  } catch (error: any) {
    const isNotFound = error.message?.includes("OBJECTIVE_NOT_FOUND");
    const status = isNotFound ? 404 : (error.statusCode || (error.name === "AuthenticationError" ? 401 : 500));
    return NextResponse.json(
      {
        success: false,
        error: isNotFound ? "Objective not found or unauthorized" : error.message,
      },
      { status }
    );
  }
}

