import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { ReconciliationService } from "@/lib/reconciliation/reconciliationService";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin(req);
    const run = await ReconciliationService.getRunDetail(params.id);

    if (!run) {
      return NextResponse.json(
        { success: false, error: "Reconciliation run not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, run });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
