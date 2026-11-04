import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { MultiAgentCoordinator } from "@/lib/coordination/coordinator";

export const dynamic = "force-dynamic";

/**
 * POST /api/coordination/[id]/pause
 * Pause an active coordination run
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const runId = params.id;

    const paused = await MultiAgentCoordinator.pauseRun(runId, user.id);

    return NextResponse.json({
      success: true,
      run: paused,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
