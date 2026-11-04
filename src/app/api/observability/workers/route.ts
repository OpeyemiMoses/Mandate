import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { getWorkerFleetMetrics } from "@/lib/observability";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const data = await getWorkerFleetMetrics();

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
