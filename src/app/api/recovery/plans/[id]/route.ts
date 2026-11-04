import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const plan = await prisma.recoveryPlan.findUnique({
      where: { id: params.id },
      include: {
        approvals: true,
        attempts: {
          include: { verifications: true },
        },
        verifications: true,
        incident: true,
      },
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

    return NextResponse.json({ success: true, plan });
  } catch (err: any) {
    const status = err.message?.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

