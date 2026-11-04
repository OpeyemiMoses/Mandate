import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { MultiAgentCoordinator } from "@/lib/coordination/coordinator";

export const dynamic = "force-dynamic";

/**
 * POST /api/coordination/[id]/cancel
 * Cancel coordination run and release leases and reserved financial allocations
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const runId = params.id;
    let reason = "Cancelled by user";
    try {
      const body = await req.json();
      if (body.reason) reason = body.reason;
    } catch {}

    await MultiAgentCoordinator.cancelRun(runId, user.id, reason);

    return NextResponse.json({
      success: true,
      message: `CoordinationRun ${runId} cancelled successfully.`,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
