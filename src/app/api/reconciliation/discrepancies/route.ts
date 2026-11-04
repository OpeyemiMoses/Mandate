import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { DiscrepancyService } from "@/lib/reconciliation/discrepancyService";
import { DiscrepancyStatus, ReconciliationSeverity } from "@/lib/reconciliation/types";

export async function GET(req: Request) {
  try {
    const user = await requireAdmin(req);
    const { searchParams } = new URL(req.url);

    const status = (searchParams.get("status") as DiscrepancyStatus) || undefined;
    const severity = (searchParams.get("severity") as ReconciliationSeverity) || undefined;
    const entityType = searchParams.get("entityType") || undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const result = await DiscrepancyService.listDiscrepancies({
      tenantId: user.role === "OWNER" || user.role === "ADMIN" ? undefined : user.userId,
      status,
      severity,
      entityType,
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

    if (!body.discrepancyId || !body.resolutionNotes) {
      return NextResponse.json(
        { success: false, error: "discrepancyId and resolutionNotes are required" },
        { status: 400 }
      );
    }

    const resolved = await DiscrepancyService.resolveDiscrepancy(
      body.discrepancyId,
      body.resolutionNotes,
      user.nearAccountId || user.userId
    );

    return NextResponse.json({ success: true, discrepancy: resolved });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
