import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/tools/activity
 * Queries persisted ToolInvocation records for the authenticated user.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);

    const agentId = searchParams.get("agentId");
    const toolId = searchParams.get("toolId");
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    const whereClause: any = {
      agent: {
        userId: user.id,
      },
    };

    if (agentId) whereClause.agentId = agentId;
    if (toolId) whereClause.toolId = toolId;
    if (status) whereClause.status = status;

    const [total, invocations] = await Promise.all([
      prisma.toolInvocation.count({ where: whereClause }),
      prisma.toolInvocation.findMany({
        where: whereClause,
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              type: true,
              colorVariant: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
    ]);

    const formatted = invocations.map((inv) => {
      let params = {};
      let result = null;
      try {
        if (inv.inputJson) params = JSON.parse(inv.inputJson);
      } catch {}
      try {
        if (inv.outputJson) result = JSON.parse(inv.outputJson);
      } catch {}

      return {
        id: inv.id,
        invocationId: inv.invocationId,
        executionId: inv.executionId,
        agentId: inv.agentId,
        agentName: inv.agent.name,
        agentColor: inv.agent.colorVariant || "red",
        toolId: inv.toolId,
        operation: inv.operation,
        status: inv.status,
        durationMs: inv.durationMs,
        riskClassification: inv.riskClassification,
        params,
        result,
        errorMessage: inv.errorDetails,
        createdAt: inv.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      total,
      limit,
      offset,
      invocations: formatted,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to query tool activity" },
      { status: 500 }
    );
  }
}
