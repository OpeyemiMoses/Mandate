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
    const { destinationAgentId, expectedSchema } = body;

    if (!destinationAgentId) {
      return NextResponse.json({ success: false, error: "Missing destinationAgentId" }, { status: 400 });
    }

    const accepted = await HandoffManager.acceptHandoff({
      handoffId,
      destinationAgentId,
      userId: user.id,
      expectedSchema,
    });

    return NextResponse.json({ success: true, handoff: accepted });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
