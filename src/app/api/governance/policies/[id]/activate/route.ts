import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/auditLedger";

export const dynamic = "force-dynamic";

/**
 * POST /api/governance/policies/[id]/activate - Toggle ACTIVE or SUSPENDED status
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const policyId = params.id;
    const body = await req.json().catch(() => ({}));
    const { action = "ACTIVATE" } = body; // "ACTIVATE" | "SUSPEND"

    const policy = await prisma.governancePolicy.findFirst({
      where: { id: policyId, userId: user.id },
    });

    if (!policy) {
      return NextResponse.json(
        { success: false, error: "Policy not found or access denied" },
        { status: 404 }
      );
    }

    if (policy.isSystem) {
      return NextResponse.json(
        { success: false, error: "System policies cannot be modified" },
        { status: 403 }
      );
    }

    if (policy.status === "REVOKED") {
      return NextResponse.json(
        { success: false, error: "Revoked policies cannot be reactivated" },
        { status: 400 }
      );
    }

    const newStatus = action === "SUSPEND" ? "SUSPENDED" : "ACTIVE";

    const updated = await prisma.governancePolicy.update({
      where: { id: policyId },
      data: { status: newStatus },
    });

    await recordAuditEvent({
      userId: user.id,
      eventType: `GOVERNANCE_POLICY_${newStatus}`,
      verdict: newStatus,
      description: `Policy "${policy.name}" status changed to ${newStatus}`,
      details: { policyId, previousStatus: policy.status, newStatus },
    });

    return NextResponse.json({ success: true, policy: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

