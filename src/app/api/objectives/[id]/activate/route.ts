import { NextResponse } from "next/server";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { ObjectiveLifecycleService } from "@/lib/objectives/lifecycleService";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/activate
 * Activates an objective in DRAFT state. Enforces mandate authority and tenant ownership.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;

    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const result = await ObjectiveLifecycleService.activateObjective({
      objectiveId,
      actorUserId: user.id,
      reason: body.reason || "Owner activated objective",
      expectedVersion: body.expectedVersion,
    });

    return NextResponse.json({
      success: true,
      objective: {
        id: result.objectiveId,
        status: result.newStatus,
        previousStatus: result.previousStatus,
        version: result.version,
        transitionedAt: result.transitionedAt,
      },
    });
  } catch (error: any) {
    if (error.message?.includes("OBJECTIVE_NOT_FOUND")) {
      return NextResponse.json(
        { success: false, error: "Objective not found or unauthorized" },
        { status: 404 }
      );
    }
    if (error.message?.includes("CONCURRENCY_CONFLICT")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 }
      );
    }
    return toAuthErrorResponse(error);
  }
}

