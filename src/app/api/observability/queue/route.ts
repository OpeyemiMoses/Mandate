import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { getQueueMetrics } from "@/lib/observability";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const user = await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const windowHours = Math.max(1, Math.min(parseInt(searchParams.get("window") || "24", 10), 720));

    const metrics = await getQueueMetrics(windowHours, user.userId);

    // Fetch breakdown by job type
    const cutoff = new Date(Date.now() - windowHours * 3600 * 1000);
    const typeBreakdown = await prisma.backgroundJob.groupBy({
      by: ["jobType", "status"],
      where: {
        tenantId: user.userId,
        createdAt: { gte: cutoff },
      },
      _count: { id: true },
    });

    return NextResponse.json({
      success: true,
      metrics,
      typeBreakdown,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
