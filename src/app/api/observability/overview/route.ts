import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { getOverviewTelemetry } from "@/lib/observability";

export async function GET(req: Request) {
  try {
    const user = await requireAdmin(req);
    const data = await getOverviewTelemetry(user.userId);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
