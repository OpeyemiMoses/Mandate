import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/governance/policies/[id]/versions - List version history for a policy
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const policyId = params.id;

    const policy = await prisma.governancePolicy.findFirst({
      where: {
        id: policyId,
        OR: [{ isSystem: true }, { userId: user.id }],
      },
    });

    if (!policy) {
      return NextResponse.json(
        { success: false, error: "Policy not found or access denied" },
        { status: 404 }
      );
    }

    const versions = await prisma.policyVersion.findMany({
      where: { policyId },
      include: {
        createdByUser: {
          select: { id: true, nearAccountId: true, displayName: true },
        },
      },
      orderBy: { version: "desc" },
    });

    return NextResponse.json({ success: true, policyId, versions });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

