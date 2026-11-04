import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { ReconciliationService } from "@/lib/reconciliation/reconciliationService";
import { ReconciliationRunType } from "@/lib/reconciliation/types";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

    const runs = await ReconciliationService.getRunHistory(limit);
    return NextResponse.json({ success: true, runs });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    const runType: ReconciliationRunType = body.runType || "FULL";
    const result = await ReconciliationService.executeRun({
      tenantId: user.userId,
      runType,
      targetScope: body.targetScope,
      entityIds: body.entityIds,
      dryRun: Boolean(body.dryRun),
      rpcUrl: body.rpcUrl,
      timeoutMs: body.timeoutMs,
    });

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
