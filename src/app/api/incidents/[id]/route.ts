import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { IncidentLifecycleService } from "@/lib/incidents/incidentLifecycleService";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const incident = await IncidentLifecycleService.getIncidentDetail(params.id);

    if (!incident) {
      return NextResponse.json(
        { success: false, error: "Incident not found" },
        { status: 404 }
      );
    }

    const isAdmin = user.role === "OWNER" || user.role === "ADMIN" || user.role === "SECURITY_ADMIN";
    if (!isAdmin && incident.tenantId && incident.tenantId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Incident not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, incident });
  } catch (err: any) {
    const status = err.message?.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

