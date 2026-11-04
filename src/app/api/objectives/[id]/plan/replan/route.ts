import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { replanObjective } from "@/lib/objectives/planner";
import { emitObjectiveEvent } from "@/lib/objectives/events";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/plan/replan
 * Re-runs objective planning with revised guidance or constraints.
 * Generates an incremented plan version and invalidates old approvals.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;
    const body = await req.json().catch(() => ({}));
    const { guidance, constraints } = body;

    const planResult = await replanObjective({
      objectiveId,
      userId: user.id,
      guidance,
      revisedConstraints: constraints,
    });

    await emitObjectiveEvent({
      objectiveId,
      userId: user.id,
      eventType: "objective.plan_revised",
      metadata: {
        planId: planResult.planId,
        version: planResult.version,
        planHash: planResult.contentHash,
        guidance,
      },
    });

    return NextResponse.json({
      success: true,
      plan: planResult,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to replan objective" },
      { status: 400 }
    );
  }
}

