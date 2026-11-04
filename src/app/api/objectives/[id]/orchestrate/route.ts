import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { ObjectiveOrchestrationService } from "@/lib/orchestration/orchestrationService";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/orchestrate
 * Starts or advances multi-agent orchestration for an approved objective.
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

    const result = await ObjectiveOrchestrationService.orchestrate({
      objectiveId,
      userId: user.id,
      maxIterations: body.maxIterations,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    const isNotFound = error.message?.includes("OBJECTIVE_NOT_FOUND");
    return NextResponse.json(
      {
        success: false,
        error: isNotFound ? "Objective not found or unauthorized" : error.message,
      },
      { status: isNotFound ? 404 : 500 }
    );
  }
}

