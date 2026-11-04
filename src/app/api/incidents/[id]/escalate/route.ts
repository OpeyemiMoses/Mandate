import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { IncidentLifecycleService } from "@/lib/incidents/incidentLifecycleService";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));

    const incident = await IncidentLifecycleService.transitionStage({
      incidentId: params.id,
      newStage: "ESCALATED",
      actorId: user.nearAccountId || user.id,
      actorType: "OPERATOR",
      notes: body.notes || "Manually escalated by operator.",
      evidenceHash: body.evidenceHash,
    });

    return NextResponse.json({ success: true, incident });
  } catch (err: any) {
    const status = err.message?.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

