import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    // Assert administrative authorization
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: any = {};
    if (status) where.status = status;

    const workers = await prisma.backgroundWorker.findMany({
      where,
      orderBy: { lastHeartbeatAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      workers,
      count: workers.length,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
