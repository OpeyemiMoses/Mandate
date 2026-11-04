import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/auditLedger";

export const dynamic = "force-dynamic";

/**
 * GET /api/governance/exceptions - List policy exceptions
 * POST /api/governance/exceptions - Create a time-bounded policy exception
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const exceptions = await prisma.policyException.findMany({
      where: { userId: user.id },
      include: {
        policy: { select: { id: true, name: true, scope: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, exceptions });
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

    const { policyId, agentId, resource, reason, durationSeconds = 3600 } = body;

    if (!policyId || !reason) {
      return NextResponse.json(
        { success: false, error: "Missing policyId or reason for exception" },
        { status: 400 }
      );
    }

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
        { success: false, error: "Exceptions cannot be granted on system policies" },
        { status: 403 }
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationSeconds * 1000);

    const exception = await prisma.policyException.create({
      data: {
        policyId,
        userId: user.id,
        grantedByUserId: user.id,
        agentId: agentId || null,
        resource: resource || null,
        reason,
        validFrom: now,
        expiresAt,
        status: "ACTIVE",
      },
    });

    await recordAuditEvent({
      userId: user.id,
      eventType: "GOVERNANCE_EXCEPTION_GRANTED",
      verdict: "ACTIVE",
      description: `Granted exception for Policy "${policy.name}": ${reason} (expires ${expiresAt.toISOString()})`,
      details: { exceptionId: exception.id, policyId, reason, expiresAt: expiresAt.toISOString() },
    });

    return NextResponse.json({ success: true, exception }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

