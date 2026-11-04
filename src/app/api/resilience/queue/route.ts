import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { BackpressureService } from "@/lib/resilience/backpressureService";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const status = await BackpressureService.getStatus();
    return NextResponse.json({ success: true, status });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
