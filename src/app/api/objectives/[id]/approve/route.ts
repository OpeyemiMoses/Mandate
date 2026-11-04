import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { approveObjectivePlan } from "@/lib/objectives/planner";
import { emitObjectiveEvent } from "@/lib/objectives/events";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/approve
 * Human user approves the pending objective plan.
 * Verifies canonical planHash, records immutable approval decision,
 * and transitions objective from AWAITING_APPROVAL -> READY.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;
    const body = await req.json().catch(() => ({}));
    const { version, comment, planHash, contentHash } = body;

    const result = await approveObjectivePlan({
      objectiveId,
      userId: user.id,
      planVersion: version,
      expectedPlanHash: planHash || contentHash,
      comment,
    });

    await emitObjectiveEvent({
      objectiveId,
      userId: user.id,
      eventType: "objective.plan_approved",
      metadata: {
        planId: result.plan.id,
        version: result.plan.version,
        planHash: result.plan.planHash,
        comment,
      },
    });

    return NextResponse.json({
      success: true,
      approval: {
        id: result.plan.id,
        planVersion: result.plan.version,
        decision: "APPROVED",
        comment: comment || null,
        approvedAt: new Date().toISOString(),
      },
      plan: result.plan,
      objective: result.objective,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to approve plan" },
      { status: 400 }
    );
  }
}
