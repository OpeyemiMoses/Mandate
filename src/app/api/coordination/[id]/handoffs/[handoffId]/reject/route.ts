import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { HandoffManager } from "@/lib/coordination/handoffManager";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string; handoffId: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { handoffId } = params;
    const body = await req.json();
    const { destinationAgentId, reason } = body;

    if (!destinationAgentId || !reason) {
      return NextResponse.json({ success: false, error: "Missing destinationAgentId or reason" }, { status: 400 });
    }

    const rejected = await HandoffManager.rejectHandoff({
      handoffId,
      destinationAgentId,
      userId: user.id,
      reason,
    });

    return NextResponse.json({ success: true, handoff: rejected });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
