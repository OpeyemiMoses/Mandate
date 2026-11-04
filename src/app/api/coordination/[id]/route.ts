import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { prisma } from "@/lib/db";
import { MultiAgentCoordinator } from "@/lib/coordination/coordinator";

export const dynamic = "force-dynamic";

/**
 * GET /api/coordination/[id]
 * Inspect a coordination run with full task graph, assignments, handoffs, artifacts, and summary
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const runId = params.id;

    const run = await prisma.coordinationRun.findFirst({
      where: { id: runId, userId: user.id },
      include: {
        objective: true,
        plan: true,
        mandate: {
          include: { wallet: true },
        },
        tasks: {
          orderBy: [{ priority: "asc" }, { order: "asc" }],
          include: {
            assignment: {
              include: { agent: true },
            },
            lease: true,
          },
        },
        assignments: {
          include: { agent: true },
        },
        handoffs: {
          include: {
            sourceAgent: true,
            destinationAgent: true,
          },
          orderBy: { createdAt: "desc" },
        },
        artifacts: {
          orderBy: [{ artifactId: "asc" }, { version: "desc" }],
          include: { producingAgent: true },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "CoordinationRun not found" }, { status: 404 });
    }

    const progress = await MultiAgentCoordinator.getProgress(runId);

    return NextResponse.json({
      run,
      progress,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

