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

    const incident = await IncidentLifecycleService.acknowledgeIncident(
      params.id,
      user.nearAccountId || user.id,
      body.notes
    );

    return NextResponse.json({ success: true, incident });
  } catch (err: any) {
    const status = err.message?.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

