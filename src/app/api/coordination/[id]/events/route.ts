import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const runId = params.id;

    const run = await prisma.coordinationRun.findFirst({
      where: { id: runId, userId: user.id },
    });
    if (!run) return NextResponse.json({ success: false, error: "CoordinationRun not found or unauthorized" }, { status: 404 });

    const events = await prisma.coordinationEvent.findMany({
      where: { runId },
      include: {
        task: { select: { id: true, stepId: true, title: true } },
      },
      orderBy: { timestamp: "desc" },
    });

    return NextResponse.json({ success: true, events });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
