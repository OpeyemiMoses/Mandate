import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const mandateId = searchParams.get("mandateId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    const where: any = { userId: user.id };
    if (status) where.status = status;
    if (mandateId) where.mandateId = mandateId;

    const executions = await prisma.executionRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        mandate: { select: { id: true, name: true } },
        agent: { select: { id: true, name: true, type: true } },
      },
    });

    return NextResponse.json({
      success: true,
      executions,
      count: executions.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch executions" },
      { status: 500 }
    );
  }
}

