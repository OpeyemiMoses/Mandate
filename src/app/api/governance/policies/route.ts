import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/auditLedger";

export const dynamic = "force-dynamic";

/**
 * GET /api/governance/policies - List policies for authenticated user
 * POST /api/governance/policies - Create a new governance policy
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope");
    const status = searchParams.get("status");

    const where: any = {
      OR: [
        { isSystem: true },
        { userId: user.id },
      ],
    };

    if (scope) where.scope = scope;
    if (status) where.status = status;

    const policies = await prisma.governancePolicy.findMany({
      where,
      include: {
        rules: { orderBy: { order: "asc" } },
        _count: {
          select: {
            evaluations: true,
            violations: true,
            versions: true,
          },
        },
      },
      orderBy: [
        { isSystem: "desc" },
        { priority: "asc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json({ success: true, policies });
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

    const {
      name,
      description,
      scope = "USER",
      targetId,
      priority = 100,
      rules = [],
      expiresAt,
    } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid policy name" },
        { status: 400 }
      );
    }

    // Create policy + version 1 + initial rules in transaction
    const policy = await prisma.$transaction(async (tx) => {
      const newPolicy = await tx.governancePolicy.create({
        data: {
          name,
          description,
          scope,
          targetId: targetId || null,
          priority: Number(priority) || 100,
          isSystem: false,
          status: "ACTIVE",
          version: 1,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          userId: user.id,
        },
      });

      // Insert rules if provided
      if (Array.isArray(rules) && rules.length > 0) {
        for (let i = 0; i < rules.length; i++) {
          const r = rules[i];
          await tx.policyRule.create({
            data: {
              policyId: newPolicy.id,
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

      // Record Version 1 Snapshot
      await tx.policyVersion.create({
        data: {
          policyId: newPolicy.id,
          version: 1,
          snapshotJson: JSON.stringify({
            name,
            description,
            scope,
            targetId,
            priority,
            rules,
          }),
          changeReason: "Initial policy creation",
          createdByUserId: user.id,
        },
      });

      return newPolicy;
    });

    await recordAuditEvent({
      userId: user.id,
      eventType: "GOVERNANCE_POLICY_CREATED",
      verdict: "ACTIVE",
      description: `Created Governance Policy "${name}" (v1)`,
      details: {
        policyId: policy.id,
        name: policy.name,
        scope: policy.scope,
        ruleCount: rules.length,
      },
    });

    const fullPolicy = await prisma.governancePolicy.findUnique({
      where: { id: policy.id },
      include: { rules: true, versions: true },
    });

    return NextResponse.json({ success: true, policy: fullPolicy }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

