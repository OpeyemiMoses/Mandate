import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ObjectivePlanValidationService } from "@/lib/objectives/planValidationService";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/plan/validate
 * Deterministically tests a plan against the 5 validation tiers:
 * Tier 1: Objective Structure & Deliverables
 * Tier 2: Mandate Authority, Active Status & Budget Ceilings
 * Tier 3: Task Typed Definitions & Kahn DAG Validation
 * Tier 4: Security Boundary & Anti-Tamper Invariants
 * Tier 5: Risk Classification & Mandatory Human Approval
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;
    const body = await req.json().catch(() => ({}));

    const objective = await prisma.objective.findFirst({
      where: { id: objectiveId, userId: user.id },
      include: {
        plans: {
          orderBy: { version: "desc" },
          take: 1,
          include: { steps: { orderBy: { order: "asc" } } },
        },
      },
    });

    if (!objective) {
      return NextResponse.json(
        { success: false, error: "Objective not found or unauthorized" },
        { status: 404 }
      );
    }

    let steps = body.steps;
    if (!steps && objective.plans[0]) {
      steps = objective.plans[0].steps.map((s) => ({
        stepId: s.stepId,
        title: s.title,
        description: s.description,
        order: s.order,
        taskType: s.taskType as any,
        agentType: s.agentType,
        requiredCapabilities: JSON.parse(s.requiredCapabilitiesJson || "[]"),
        requiredTools: JSON.parse(s.requiredToolsJson || "[]"),
        dependencies: JSON.parse(s.dependenciesJson || "[]"),
        preconditions: JSON.parse(s.preconditionsJson || "[]"),
        completionConditions: JSON.parse(s.completionConditionsJson || "[]"),
        riskClassification: s.riskClassification as any,
        estimatedCostNear: s.estimatedCostNear || undefined,
        estimatedCostYocto: s.estimatedCostYocto || undefined,
        failureHandling: "FAIL_CLOSED",
      }));
    }

    if (!steps || steps.length === 0) {
      return NextResponse.json(
        { success: false, error: "No tasks provided for validation" },
        { status: 400 }
      );
    }

    let deliverables = body.deliverables || ["Objective deliverable completion"];
    let successCriteria = body.successCriteria || [
      {
        criterionId: "crit_validation_check",
        description: "Outcome verified against specifications",
        measurementType: "BOOLEAN" as const,
        target: "true",
        verificationMethod: "EXTERNAL_EVIDENCE" as const,
      },
    ];

    const report = await ObjectivePlanValidationService.validatePlan({
      userId: user.id,
      objectiveId,
      title: body.title || objective.title,
      category: body.category || objective.category,
      deliverables,
      successCriteria,
      steps,
      constraints: body.constraints,
      mandateId: body.mandateId || objective.mandateId,
    });

    return NextResponse.json({
      success: report.isValid,
      report,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Plan validation failed" },
      { status: 500 }
    );
  }
}

