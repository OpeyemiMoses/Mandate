import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { DeadLetterService } from "@/lib/jobs/deadLetterService";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAdmin(req);
    const { id } = params;
    const body = await req.json();
    const { resolution, notes } = body;

    if (!resolution || (resolution !== "RESOLVED" && resolution !== "CANCELLED")) {
      return NextResponse.json(
        { success: false, error: 'resolution must be either "RESOLVED" or "CANCELLED"' },
        { status: 400 }
      );
    }

    const updatedRecord = await DeadLetterService.resolveDeadLetter({
      deadLetterId: id,
      tenantId: user.role === "OWNER" || user.role === "ADMIN" ? undefined as any : user.userId,
      reviewedBy: user.nearAccountId || user.userId,
      resolution,
      notes,
    });

    return NextResponse.json({
      success: true,
      record: updatedRecord,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
