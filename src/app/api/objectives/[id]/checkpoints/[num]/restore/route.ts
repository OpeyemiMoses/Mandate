import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { ObjectiveCheckpointService } from "@/lib/orchestration/checkpointService";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/checkpoints/[num]/restore
 * Restores an objective to a previous verified checkpoint.
 * Strictly verifies tenant authorization (masked with 404).
 */
export async function POST(
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

    let reason: string | undefined;
    try {
      const body = await req.json();
      reason = body.reason;
    } catch {}

    const result = await ObjectiveCheckpointService.restoreFromCheckpoint({
      objectiveId,
      checkpointNumber,
      userId: user.id,
      actorId: user.id,
      actorRole: "USER",
      reason,
    });

    return NextResponse.json({
      success: true,
      result,
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

