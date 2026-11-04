import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { evaluateWorkerCapacity } from "@/lib/observability";

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    // Force evaluation and persist snapshot
    const evaluation = await evaluateWorkerCapacity(true);

    return NextResponse.json({
      success: true,
      data: evaluation,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
