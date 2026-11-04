import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { MultiAgentCoordinator } from "@/lib/coordination/coordinator";

export const dynamic = "force-dynamic";

/**
 * POST /api/coordination/[id]/start
 * Trigger execution of coordination run
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const runId = params.id;

    const progress = await MultiAgentCoordinator.executeRun({
      runId,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      progress,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
