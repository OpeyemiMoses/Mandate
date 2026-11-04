import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { prisma } from "@/lib/db";
import { RecoveryPlanner } from "@/lib/recovery/recoveryPlanner";
import { RecoveryPlanStatus } from "@/lib/recovery/types";

export async function GET(req: Request) {
  try {
    const user = await requireAdmin(req);
    const { searchParams } = new URL(req.url);

    const status = (searchParams.get("status") as RecoveryPlanStatus) || undefined;
    const incidentId = searchParams.get("incidentId") || undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    const where: any = {};
    if (user.role !== "OWNER" && user.role !== "ADMIN") {
      where.tenantId = user.userId;
    }
    if (status) where.status = status;
    if (incidentId) where.incidentId = incidentId;

    const plans = await prisma.recoveryPlan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        approvals: true,
        attempts: true,
        verifications: true,
        incident: {
          select: {
            id: true,
            incidentNumber: true,
            title: true,
            severity: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, plans });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin(req);
    const body = await req.json();

    if (!body.targetEntityType || !body.targetEntityId) {
      return NextResponse.json(
        { success: false, error: "targetEntityType and targetEntityId are required" },
        { status: 400 }
      );
    }

    const plan = await RecoveryPlanner.planRecovery({
      incidentId: body.incidentId,
      tenantId: user.userId,
      targetEntityType: body.targetEntityType,
      targetEntityId: body.targetEntityId,
      strategy: body.strategy,
      isFinancial: body.isFinancial,
      actionPayload: body.actionPayload,
      createdBy: user.nearAccountId || user.userId,
    });

    return NextResponse.json({ success: true, plan });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
