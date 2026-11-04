import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { evaluateObjectivePlanDiscovery } from "@/lib/objectives/planner";

export const dynamic = "force-dynamic";

/**
 * GET /api/discovery/coverage/[id]
 * Evaluates and returns the Capability Coverage Report for the specified objective.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    const readinessReport = await evaluateObjectivePlanDiscovery({
      objectiveId: id,
      userId: user.id,
      persistRecord: false,
    });

    return NextResponse.json({
      success: true,
      coverage: readinessReport.coverageReport,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to analyze coverage" },
      { status: error.message?.includes("authenticated") ? 401 : error.message?.includes("not found") ? 404 : 500 }
    );
  }
}

