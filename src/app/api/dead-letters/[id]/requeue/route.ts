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

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Optional body
    }

    const requeuedJob = await DeadLetterService.requeueDeadLetter({
      deadLetterId: id,
      tenantId: user.role === "OWNER" || user.role === "ADMIN" ? undefined as any : user.userId,
      reviewedBy: user.nearAccountId || user.userId,
      resetAttempts: body.resetAttempts !== false,
    });

    return NextResponse.json({
      success: true,
      job: requeuedJob,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
