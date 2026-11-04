import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/auditLedger";

export const dynamic = "force-dynamic";

/**
 * GET /api/governance/policies/[id] - Get policy details
 * PUT /api/governance/policies/[id] - Update policy rules & increment version
 * DELETE /api/governance/policies/[id] - Revoke policy
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
      include: {
        rules: { orderBy: { order: "asc" } },
        versions: { orderBy: { version: "desc" }, take: 10 },
        exceptions: { where: { status: "ACTIVE" } },
        evaluations: { orderBy: { createdAt: "desc" }, take: 20 },
        violations: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });

    if (!policy) {
      return NextResponse.json(
        { success: false, error: "Policy not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, policy });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const policyId = params.id;
    const body = await req.json();

    const {
      name,
      description,
      priority,
      rules,
      changeReason = "Policy rules updated",
    } = body;

    const existing = await prisma.governancePolicy.findFirst({
      where: { id: policyId, userId: user.id },
      include: { rules: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Policy not found or unauthorized to edit" },
        { status: 404 }
      );
    }

    if (existing.isSystem) {
      return NextResponse.json(
        { success: false, error: "System policies cannot be modified by users" },
        { status: 403 }
      );
    }

    if (existing.status === "REVOKED") {
      return NextResponse.json(
        { success: false, error: "Revoked policies cannot be modified" },
        { status: 400 }
      );
    }

    const nextVersion = existing.version + 1;

    // Atomic update with version snapshot
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update policy metadata & version
      const p = await tx.governancePolicy.update({
        where: { id: policyId },
        data: {
          name: name || existing.name,
          description: description !== undefined ? description : existing.description,
          priority: priority !== undefined ? Number(priority) : existing.priority,
          version: nextVersion,
        },
      });

      // 2. If rules are provided, replace existing rules
      if (Array.isArray(rules)) {
        await tx.policyRule.deleteMany({ where: { policyId } });
        for (let i = 0; i < rules.length; i++) {
          const r = rules[i];
          await tx.policyRule.create({
            data: {
              policyId,
              ruleType: r.ruleType,
              operator: r.operator,
              field: r.field,
              valueJson: typeof r.value === "string" ? r.value : JSON.stringify(r.value),
              action: r.action || "DENY",
              description: r.description || null,
              isEnforced: r.isEnforced !== false,
              order: i,
            },
          });
        }
      }

      // 3. Snapshot new version in PolicyVersion
      await tx.policyVersion.create({
        data: {
          policyId,
          version: nextVersion,
          snapshotJson: JSON.stringify({
            name: p.name,
            description: p.description,
            priority: p.priority,
            rules: rules || existing.rules,
          }),
          changeReason,
          createdByUserId: user.id,
        },
      });

      return p;
    });

    await recordAuditEvent({
      userId: user.id,
      eventType: "GOVERNANCE_POLICY_UPDATED",
      verdict: "UPDATED",
      description: `Updated Policy "${updated.name}" to v${nextVersion} (${changeReason})`,
      details: {
        policyId: updated.id,
        newVersion: nextVersion,
        changeReason,
      },
    });

    const fullPolicy = await prisma.governancePolicy.findUnique({
      where: { id: policyId },
      include: { rules: true, versions: true },
    });

    return NextResponse.json({ success: true, policy: fullPolicy });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const policyId = params.id;
    const { searchParams } = new URL(req.url);
    const reason = searchParams.get("reason") || "Revoked by user";

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
        { success: false, error: "System policies cannot be revoked" },
        { status: 403 }
      );
    }

    const updated = await prisma.governancePolicy.update({
      where: { id: policyId },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

    await recordAuditEvent({
      userId: user.id,
      eventType: "GOVERNANCE_POLICY_REVOKED",
      verdict: "REVOKED",
      description: `Revoked Policy "${policy.name}": ${reason}`,
      details: { policyId, reason },
    });

    return NextResponse.json({ success: true, policy: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

