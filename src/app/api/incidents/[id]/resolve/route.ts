import { NextResponse } from "next/server";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { IncidentLifecycleService } from "@/lib/incidents/incidentLifecycleService";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    if (!body.resolutionSummary) {
      return NextResponse.json(
        { success: false, error: "resolutionSummary is required" },
        { status: 400 }
      );
    }

    const incidentRecord = await IncidentLifecycleService.getIncidentDetail(params.id);
    if (!incidentRecord) {
      return NextResponse.json(
        { success: false, error: "Incident not found" },
        { status: 404 }
      );
    }

    const isAdmin = user.role === "OWNER" || user.role === "ADMIN" || user.role === "SECURITY_ADMIN";
    if (!isAdmin && incidentRecord.tenantId && incidentRecord.tenantId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Incident not found" },
        { status: 404 }
      );
    }

    const incident = await IncidentLifecycleService.resolveIncident({
      incidentId: params.id,
      resolutionSummary: body.resolutionSummary,
      resolvedBy: user.nearAccountId || user.id,
    });

    return NextResponse.json({ success: true, incident });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}

