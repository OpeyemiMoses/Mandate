import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { ObjectiveProgressService } from "@/lib/orchestration/progressService";
import { getObjectiveProgress } from "@/lib/objectives/executor";

export const dynamic = "force-dynamic";

/**
 * GET /api/objectives/[id]/progress
 * Returns verified step progress, 12-state metrics breakdown, and criteria evaluation.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;

    const [metrics, legacyProgress] = await Promise.all([
      ObjectiveProgressService.calculateProgress({ objectiveId }).catch(() => null),
      getObjectiveProgress(objectiveId, user.id).catch(() => null),
    ]);

    return NextResponse.json({
      success: true,
      metrics,
      progress: legacyProgress,
    });
  } catch (error: any) {
    const isNotFound = error.message?.includes("OBJECTIVE_NOT_FOUND");
    return NextResponse.json(
      { success: false, error: isNotFound ? "Objective not found or unauthorized" : error.message },
      { status: isNotFound ? 404 : 500 }
    );
  }
}
