import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { IncidentLifecycleService } from "@/lib/incidents/incidentLifecycleService";
import { IncidentDetectionService } from "@/lib/incidents/incidentDetectionService";
import { IncidentCategory, IncidentSeverity } from "@/lib/incidents/types";

export async function GET(req: Request) {
  try {
    const user = await requireAdmin(req);
    const { searchParams } = new URL(req.url);

    const status = searchParams.get("status") || undefined;
    const severity = searchParams.get("severity") || undefined;
    const category = searchParams.get("category") || undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const result = await IncidentLifecycleService.listIncidents({
      tenantId: user.role === "OWNER" || user.role === "ADMIN" ? undefined : user.userId,
      status,
      severity,
      category,
      limit,
      offset,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin(req);
    const body = await req.json();

    // If detecting from existing discrepancy
    if (body.discrepancyId) {
      const incident = await IncidentDetectionService.detectFromDiscrepancy(
        body.discrepancyId
      );
      return NextResponse.json({ success: true, incident });
    }

    if (!body.title || !body.category || !body.severity) {
      return NextResponse.json(
        { success: false, error: "title, category, and severity are required" },
        { status: 400 }
      );
    }

    const incident = await IncidentDetectionService.createIncident({
      tenantId: user.userId,
      title: body.title,
      description: body.description || body.title,
      category: body.category as IncidentCategory,
      severity: body.severity as IncidentSeverity,
      source: "MANUAL",
      actorId: user.nearAccountId || user.userId,
    });

    return NextResponse.json({ success: true, incident });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
