import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import {
  listOperationalAlerts,
  evaluateOperationalAlerts,
  AlertStatus,
  AlertSeverity,
} from "@/lib/observability";

export async function GET(req: Request) {
  try {
    const user = await requireAdmin(req);
    const { searchParams } = new URL(req.url);

    const status = (searchParams.get("status") as AlertStatus) || undefined;
    const severity = (searchParams.get("severity") as AlertSeverity) || undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    // Refresh evaluations
    await evaluateOperationalAlerts();

    const alerts = await listOperationalAlerts({
      tenantId: user.role === "OWNER" || user.role === "ADMIN" ? undefined : user.userId,
      status,
      severity,
      limit,
    });

    return NextResponse.json({
      success: true,
      alerts,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
