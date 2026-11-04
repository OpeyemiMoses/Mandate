import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { evaluateObjectivePlanDiscovery } from "@/lib/objectives/planner";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/discover
 * Runs on-demand capability discovery and execution readiness evaluation for the specified objective.
 * Strictly READ-ONLY with respect to plans — does not alter approved plan versions or steps.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    const report = await evaluateObjectivePlanDiscovery({
      objectiveId: id,
      userId: user.id,
      persistRecord: true,
    });

    return NextResponse.json({
      success: true,
      discovery: report,
    });
  } catch (error: any) {
    console.error("[POST /api/objectives/[id]/discover] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to run capability discovery" },
      { status: error.message?.includes("authenticated") ? 401 : error.message?.includes("not found") ? 404 : 500 }
    );
  }
}

