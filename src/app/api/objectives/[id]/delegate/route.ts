import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { GovernedDelegationManager } from "@/lib/agents/delegationManager";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/delegate
 * Requests governed task delegation between agents under policy and capability validation.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;
    const body = await req.json().catch(() => ({}));

    const stepId = body.stepId || body.taskId;
    const sourceAgentId = body.sourceAgentId || body.fromAgentId;
    const destinationAgentId = body.destinationAgentId || body.toAgentId;
    const reason = body.reason;
    const planHash = body.planHash;

    if (!stepId || !sourceAgentId || !destinationAgentId || !reason) {
      return NextResponse.json(
        { success: false, error: "stepId (or taskId), sourceAgentId (or fromAgentId), destinationAgentId (or toAgentId), and reason are required." },
        { status: 400 }
      );
    }

    const result = await GovernedDelegationManager.requestDelegation({
      objectiveId,
      stepId,
      sourceAgentId,
      destinationAgentId,
      userId: user.id,
      reason,
      expectedPlanHash: planHash,
    });

    return NextResponse.json({
      success: true,
      delegation: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Delegation request failed" },
      { status: error.message?.includes("unauthorized") || error.message?.includes("not found") ? 404 : 400 }
    );
  }
}

/**
 * GET /api/objectives/[id]/delegate
 * Retrieves delegation and handoff history for a task.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;
    const { searchParams } = new URL(req.url);
    const stepId = searchParams.get("stepId") || searchParams.get("taskId");

    const history = stepId
      ? await GovernedDelegationManager.getDelegationHistory(objectiveId, stepId, user.id)
      : await GovernedDelegationManager.getObjectiveHandoffs(objectiveId, user.id);

    return NextResponse.json({
      success: true,
      history,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve delegation history" },
      { status: error.message?.includes("unauthorized") || error.message?.includes("not found") ? 404 : 500 }
    );
  }
}
