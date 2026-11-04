import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { SharedContextService } from "@/lib/coordination/sharedContext";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const runId = params.id;
    const { searchParams } = new URL(req.url);
    const requestingAgentType = searchParams.get("requestingAgentType") || undefined;

    const artifacts = await SharedContextService.listArtifacts({
      runId,
      userId: user.id,
      requestingAgentType,
    });

    return NextResponse.json({ artifacts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to list artifacts" }, { status: 400 });
  }
}

