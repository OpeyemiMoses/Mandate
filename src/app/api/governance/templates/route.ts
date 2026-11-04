import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { getAvailableTemplates, POLICY_TEMPLATES } from "@/lib/governance";
import { recordAuditEvent } from "@/lib/auditLedger";

export const dynamic = "force-dynamic";

/**
 * GET /api/governance/templates - List all available pre-built policy templates
 * POST /api/governance/templates - Instantiate a template as an active user policy
 */
export async function GET(req: Request) {
  try {
    await getAuthenticatedUser(req);
    const templates = getAvailableTemplates();
    return NextResponse.json({ success: true, templates });
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
    const { templateId, targetId, customName } = body;

    const template = POLICY_TEMPLATES[templateId];
    if (!template) {
      return NextResponse.json(
        { success: false, error: `Template "${templateId}" not found.` },
        { status: 404 }
      );
    }

    const policyName = customName || template.name;

    const policy = await prisma.$transaction(async (tx) => {
      const p = await tx.governancePolicy.create({
        data: {
          name: policyName,
          description: template.description,
          scope: template.scope,
          targetId: targetId || null,
          priority: template.riskLevel === "HIGH" ? 50 : 100,
          isSystem: false,
          status: "ACTIVE",
          version: 1,
          userId: user.id,
        },
      });

      for (let i = 0; i < template.rules.length; i++) {
        const r = template.rules[i];
        await tx.policyRule.create({
          data: {
            policyId: p.id,
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

      await tx.policyVersion.create({
        data: {
          policyId: p.id,
          version: 1,
          snapshotJson: JSON.stringify({
            templateId,
            name: policyName,
            rules: template.rules,
          }),
          changeReason: `Instantiated from template "${templateId}"`,
          createdByUserId: user.id,
        },
      });

      return p;
    });

    await recordAuditEvent({
      userId: user.id,
      eventType: "GOVERNANCE_TEMPLATE_INSTANTIATED",
      verdict: "ACTIVE",
      description: `Created Policy "${policyName}" from template "${templateId}"`,
      details: { policyId: policy.id, templateId },
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

