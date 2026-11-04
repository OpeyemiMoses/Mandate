import { NextResponse } from "next/server";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RecoveryApprovalService } from "@/lib/recovery/recoveryApprovalService";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));

    const plan = await prisma.recoveryPlan.findUnique({
      where: { id: params.id },
    });
    if (!plan) {
      return NextResponse.json(
        { success: false, error: "Recovery plan not found" },
        { status: 404 }
      );
    }

    const isAdmin = user.role === "OWNER" || user.role === "ADMIN" || user.role === "SECURITY_ADMIN";
    if (!isAdmin && plan.tenantId && plan.tenantId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Recovery plan not found" },
        { status: 404 }
      );
    }

    // Approver type must strictly be HUMAN for financial actions
    const approverType = body.approverType || "HUMAN";
    const approverRole = body.approverRole || (user.role === "OWNER" ? "OWNER" : "OPERATOR");

    const approval = await RecoveryApprovalService.approvePlan({
      planId: params.id,
      approverId: user.nearAccountId || user.id,
      approverRole,
      approverType,
      notes: body.notes,
      signature: body.signature,
    });

    return NextResponse.json({ success: true, approval });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}

