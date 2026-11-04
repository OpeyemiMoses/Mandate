import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RecoveryExecutor } from "@/lib/recovery/recoveryExecutor";

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

    const result = await RecoveryExecutor.executePlan({
      planId: params.id,
      executedBy: user.nearAccountId || user.id,
      dryRun: Boolean(body.dryRun),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    const status = err.message?.includes("SECURITY_VIOLATION")
      ? 403
      : err.message?.includes("Unauthorized")
      ? 401
      : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

