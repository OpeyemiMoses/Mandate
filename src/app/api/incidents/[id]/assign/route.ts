import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { IncidentLifecycleService } from "@/lib/incidents/incidentLifecycleService";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    if (!body.assignedTo) {
      return NextResponse.json(
        { success: false, error: "assignedTo is required" },
        { status: 400 }
      );
    }

    const incident = await IncidentLifecycleService.assignIncident({
      incidentId: params.id,
      assignedTo: body.assignedTo,
      assignedBy: user.nearAccountId || user.id,
      assignedTeam: body.assignedTeam,
      role: body.role,
      notes: body.notes,
    });

    return NextResponse.json({ success: true, incident });
  } catch (err: any) {
    const status = err.message?.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

