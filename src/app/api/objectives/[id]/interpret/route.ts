import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { interpretObjective } from "@/lib/objectives/interpreter";
import { emitObjectiveEvent } from "@/lib/objectives/events";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/interpret
 * Re-interprets objective requirements with updated constraints or prompt clarification.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;
    const body = await req.json().catch(() => ({}));

    const objective = await prisma.objective.findFirst({
      where: { id, userId: user.id },
    });

    if (!objective) {
      return NextResponse.json(
        { success: false, error: "Objective not found or unauthorized" },
        { status: 404 }
      );
    }

    let existingConstraints = {};
    try {
      if (objective.constraintsJson) existingConstraints = JSON.parse(objective.constraintsJson);
    } catch {}

    const constraints = body.constraints || existingConstraints;
    const prompt = body.prompt || objective.originalPrompt;

    const interpretation = interpretObjective({
      prompt,
      constraints,
      existingMandateId: objective.mandateId || undefined,
      categoryOverride: body.category || (objective.category as any),
    });

    const updated = await prisma.objective.update({
      where: { id },
      data: {
        title: interpretation.title,
        description: interpretation.structuredGoal.scope,
        originalPrompt: prompt,
        structuredGoalJson: JSON.stringify(interpretation.structuredGoal),
        category: interpretation.category,
        status: interpretation.status,
        constraintsJson: JSON.stringify(constraints),
      },
    });

    await emitObjectiveEvent({
      objectiveId: id,
      userId: user.id,
      eventType: "objective.interpreted",
      metadata: {
        status: interpretation.status,
        clarificationMessage: interpretation.clarificationMessage,
      },
      mandateId: objective.mandateId || undefined,
    });

    return NextResponse.json({
      success: true,
      objective: {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        category: updated.category,
        structuredGoal: interpretation.structuredGoal,
        clarificationMessage: interpretation.clarificationMessage,
        warnings: interpretation.warnings,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to interpret objective" },
      { status: 500 }
    );
  }
}

