import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { DeadLetterService } from "@/lib/jobs/deadLetterService";

export async function GET(req: Request) {
  try {
    const user = await requireAdmin(req);
    const { searchParams } = new URL(req.url);

    const resolution = searchParams.get("resolution") || undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const result = await DeadLetterService.listDeadLetters({
      tenantId: user.userId,
      resolution,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      records: result.records,
      total: result.total,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
