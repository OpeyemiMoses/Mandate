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

    const tasks = await prisma.coordinationTask.findMany({
      where: { runId },
      include: {
        assignment: { include: { agent: true } },
        lease: true,
      },
      orderBy: [{ priority: "asc" }, { order: "asc" }],
    });

    return NextResponse.json({ success: true, tasks });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
