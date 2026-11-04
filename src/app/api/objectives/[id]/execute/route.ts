import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { executeObjectivePlan } from "@/lib/objectives/executor";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/execute
 * Dispatches execution of the approved plan steps through the Universal Agent Runtime.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;

    const result = await executeObjectivePlan({
      objectiveId,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to execute objective plan" },
      { status: 500 }
    );
  }
}

