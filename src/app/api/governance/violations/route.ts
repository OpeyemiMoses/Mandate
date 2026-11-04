import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/governance/violations - List violation events with rich filtering
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);

    const severity = searchParams.get("severity");
    const agentId = searchParams.get("agentId");
    const policyId = searchParams.get("policyId");
    const limit = Number(searchParams.get("limit")) || 50;
    const offset = Number(searchParams.get("offset")) || 0;

    const where: any = { userId: user.id };
    if (severity) where.severity = severity;
    if (agentId) where.agentId = agentId;
    if (policyId) where.policyId = policyId;

    const [violations, total] = await Promise.all([
      prisma.policyViolation.findMany({
        where,
        include: {
          policy: { select: { id: true, name: true, scope: true } },
          policyRule: { select: { id: true, ruleType: true, field: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.policyViolation.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      total,
      limit,
      offset,
      violations,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

