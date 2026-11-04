import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { IncidentTimelineService } from "@/lib/incidents/incidentTimelineService";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser(req);
    const timeline = await IncidentTimelineService.getTimeline(params.id);
    return NextResponse.json({ success: true, timeline });
  } catch (err: any) {
    const status = err.message?.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    if (!body.comment) {
      return NextResponse.json(
        { success: false, error: "comment is required" },
        { status: 400 }
      );
    }

    const event = await IncidentTimelineService.addComment({
      incidentId: params.id,
      actorId: user.nearAccountId || user.id,
      actorType: "OPERATOR",
      comment: body.comment,
      evidenceHash: body.evidenceHash,
    });

    return NextResponse.json({ success: true, event });
  } catch (err: any) {
    const status = err.message?.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

