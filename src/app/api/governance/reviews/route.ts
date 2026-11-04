import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/auditLedger";

export const dynamic = "force-dynamic";

/**
 * GET /api/governance/reviews - List policy reviews
 * POST /api/governance/reviews - Submit a policy review verdict
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const reviews = await prisma.policyReview.findMany({
      where: { policy: { userId: user.id } },
      include: {
        policy: { select: { id: true, name: true, version: true } },
        reviewedByUser: { select: { id: true, nearAccountId: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, reviews });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    const { policyId, status = "APPROVED", notes } = body;

    const policy = await prisma.governancePolicy.findFirst({
      where: { id: policyId, userId: user.id },
    });

    if (!policy) {
      return NextResponse.json(
        { success: false, error: "Policy not found or access denied" },
        { status: 404 }
      );
    }

    const review = await prisma.policyReview.create({
      data: {
        policyId,
        reviewedByUserId: user.id,
        status,
        notes: notes || null,
      },
    });

    await recordAuditEvent({
      userId: user.id,
      eventType: "GOVERNANCE_POLICY_REVIEWED",
      verdict: status,
      description: `Policy "${policy.name}" reviewed: ${status}`,
      details: { reviewId: review.id, policyId, status, notes },
    });

    return NextResponse.json({ success: true, review }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

