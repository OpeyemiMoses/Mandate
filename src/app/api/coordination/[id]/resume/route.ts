import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { MultiAgentCoordinator } from "@/lib/coordination/coordinator";

export const dynamic = "force-dynamic";

/**
 * POST /api/coordination/[id]/resume
 * Resume a paused coordination run
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const runId = params.id;

    const resumed = await MultiAgentCoordinator.resumeRun(runId, user.id);

    return NextResponse.json({
      success: true,
      run: resumed,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
