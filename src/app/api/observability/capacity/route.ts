import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { evaluateWorkerCapacity } from "@/lib/observability";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const evaluation = await evaluateWorkerCapacity(false);

    return NextResponse.json({
      success: true,
      data: evaluation,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
