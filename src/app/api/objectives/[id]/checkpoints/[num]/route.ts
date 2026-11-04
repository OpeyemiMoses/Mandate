import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { ObjectiveCheckpointService } from "@/lib/orchestration/checkpointService";

export const dynamic = "force-dynamic";

/**
 * GET /api/objectives/[id]/checkpoints/[num]
 * Retrieves a specific checkpoint by number with integrity verification.
 * Strictly verifies tenant authorization (masked with 404).
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string; num: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId, num } = params;
    const checkpointNumber = parseInt(num, 10);

    if (isNaN(checkpointNumber)) {
      return NextResponse.json(
        { success: false, error: "Invalid checkpoint number parameter" },
        { status: 400 }
      );
    }

    const checkpoint = await ObjectiveCheckpointService.getCheckpoint(
      objectiveId,
      checkpointNumber,
      user.id
    );

    const integrity = ObjectiveCheckpointService.verifyCheckpointIntegrity(checkpoint);

    return NextResponse.json({
      success: true,
      checkpoint,
      integrity,
    });
  } catch (error: any) {
    const isNotFound =
      error.message?.includes("OBJECTIVE_NOT_FOUND") ||
      error.message?.includes("CHECKPOINT_NOT_FOUND");
    const status = isNotFound ? 404 : (error.statusCode || (error.name === "AuthenticationError" ? 401 : 500));
    return NextResponse.json(
      {
        success: false,
        error: isNotFound ? "Objective or checkpoint not found" : error.message,
      },
      { status }
    );
  }
}

