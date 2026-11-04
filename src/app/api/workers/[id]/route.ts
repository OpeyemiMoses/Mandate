import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { prisma } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin(req);
    const { id } = params;

    const worker = await prisma.backgroundWorker.findUnique({
      where: { id },
      include: {
        claimedJobs: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: { id: true, jobType: true, status: true, priority: true, startedAt: true },
        },
      },
    });

    if (!worker) {
      return NextResponse.json(
        { success: false, error: `Worker not found: ${id}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      worker,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
