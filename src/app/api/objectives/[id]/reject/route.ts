import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { rejectObjectivePlan } from "@/lib/objectives/planner";
import { emitObjectiveEvent } from "@/lib/objectives/events";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/reject
 * Rejects a proposed plan with feedback.
 * Transitions plan to REJECTED and objective back to PLANNING.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;
    const body = await req.json().catch(() => ({}));
    const { version, comment, reason } = body;

    const rejectionReason = reason || comment || "Rejected by user for revision";

    const result = await rejectObjectivePlan({
      objectiveId,
      userId: user.id,
      planVersion: version,
      reason: rejectionReason,
    });

    await emitObjectiveEvent({
      objectiveId,
      userId: user.id,
      eventType: "objective.plan_rejected",
      metadata: {
        planId: result.plan.id,
        version: result.plan.version,
        comment: rejectionReason,
      },
    });

    return NextResponse.json({
      success: true,
      decision: "REJECTED",
      planVersion: result.plan.version,
      comment: rejectionReason,
      plan: result.plan,
      objective: result.objective,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to reject plan" },
      { status: 400 }
    );
  }
}
