import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { RecoveryApprovalService } from "@/lib/recovery/recoveryApprovalService";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    if (!body.rejectionReason) {
      return NextResponse.json(
        { success: false, error: "rejectionReason is required" },
        { status: 400 }
      );
    }

    const approval = await RecoveryApprovalService.rejectPlan({
      planId: params.id,
      approverId: user.nearAccountId || user.id,
      rejectionReason: body.rejectionReason,
    });

    return NextResponse.json({ success: true, approval });
  } catch (err: any) {
    const status = err.message?.includes("Unauthorized") ? 401 : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

