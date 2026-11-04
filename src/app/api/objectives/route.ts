import { NextResponse } from "next/server";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  interpretObjective,
  generateObjectivePlan,
  emitObjectiveEvent,
} from "@/lib/objectives";
import { assertObjectiveMandateValid } from "@/lib/objectives/authority";

export const dynamic = "force-dynamic";

/**
 * GET /api/objectives
 * Lists all objectives owned by the authenticated user with status and progress filters.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const category = searchParams.get("category");

    const where: any = { userId: user.id };
    if (status) where.status = status;
    if (category) where.category = category;

    const objectives = await prisma.objective.findMany({
      where,
      include: {
        mandate: {
          select: { id: true, name: true, totalBudgetYocto: true, spentYocto: true },
        },
        plans: {
          orderBy: { version: "desc" },
          take: 1,
          select: { id: true, version: true, status: true, summary: true, riskClassification: true },
        },
        _count: { select: { steps: true, events: true, criteria: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = objectives.map((obj) => {
      let structuredGoal = null;
      let constraints = {};
      try {
        if (obj.structuredGoalJson) structuredGoal = JSON.parse(obj.structuredGoalJson);
      } catch {}
      try {
        if (obj.constraintsJson) constraints = JSON.parse(obj.constraintsJson);
      } catch {}

      return {
        id: obj.id,
        title: obj.title,
        description: obj.description,
        originalPrompt: obj.originalPrompt,
        category: obj.category,
        status: obj.status,
        priority: obj.priority,
        version: obj.version,
        planningStatus: obj.planningStatus,
        executionStatus: obj.executionStatus,
        deadlineAt: obj.deadlineAt?.toISOString() || null,
        mandate: obj.mandate,
        currentPlan: obj.plans[0] || null,
        constraints,
        progressPercent: obj.progressPercent,
        stepsCount: obj._count.steps,
        criteriaCount: obj._count.criteria,
        startedAt: obj.startedAt?.toISOString() || null,
        completedAt: obj.completedAt?.toISOString() || null,
        createdAt: obj.createdAt.toISOString(),
        updatedAt: obj.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      count: formatted.length,
      objectives: formatted,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * POST /api/objectives
 * Creates a new objective from natural language prompt, runs the interpreter,
 * and optionally generates the initial executable plan.
 * Body: {
 *   prompt: string;
 *   title?: string;
 *   mandateId?: string;
 *   constraints?: ObjectiveConstraints;
 *   categoryOverride?: string;
 *   autoPlan?: boolean; // Defaults to true
 * }
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    const {
      prompt,
      title: customTitle,
      mandateId,
      constraints = {},
      categoryOverride,
      autoPlan = true,
      priority = "MEDIUM",
    } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { success: false, error: "Prompt string is required to define an objective" },
        { status: 400 }
      );
    }

    if (mandateId) {
      // Validate mandate existence, ownership, active status, expiration, and budget
      try {
        await assertObjectiveMandateValid({
          userId: user.id,
          mandateId,
          constraints,
        });
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: err.message },
          { status: err.message.includes("not found") ? 404 : 400 }
        );
      }
    }

    // 1. Natural Language Interpretation
    const interpretation = interpretObjective({
      prompt,
      constraints,
      existingMandateId: mandateId,
      categoryOverride,
    });

    const title = customTitle || interpretation.title;

    let deadlineAt: Date | null = null;
    if (body.deadlineAt) {
      deadlineAt = new Date(body.deadlineAt);
    } else if (constraints.deadlineAt) {
      deadlineAt = new Date(constraints.deadlineAt);
    } else if (constraints.deadline) {
      const parsed = new Date(constraints.deadline);
      if (!isNaN(parsed.getTime())) deadlineAt = parsed;
    }

    // 2. Persist Objective Record (Starts strictly in DRAFT state per M13.1)
    const objective = await prisma.objective.create({
      data: {
        userId: user.id,
        title,
        description: interpretation.structuredGoal.scope,
        originalPrompt: prompt,
        structuredGoalJson: JSON.stringify(interpretation.structuredGoal),
        category: interpretation.category,
        status: "DRAFT",
        priority,
        version: 1,
        planningStatus: "UNPLANNED",
        executionStatus: "NOT_STARTED",
        deadlineAt,
        mandateId: mandateId || null,
        constraintsJson: JSON.stringify(constraints),
        metadataJson: JSON.stringify({
          source: "user_prompt",
          warnings: interpretation.warnings,
          clarificationMessage: interpretation.clarificationMessage,
        }),
      },
    });

    // 3. Emit Lifecycle Event
    await emitObjectiveEvent({
      objectiveId: objective.id,
      userId: user.id,
      eventType: "objective.created",
      metadata: { title: objective.title, category: objective.category },
      mandateId,
    });

    await emitObjectiveEvent({
      objectiveId: objective.id,
      userId: user.id,
      eventType: "objective.interpreted",
      metadata: {
        status: interpretation.status,
        entities: interpretation.structuredGoal.entities,
        requiredCapabilities: interpretation.structuredGoal.requiredCapabilities,
      },
      mandateId,
    });

    // 4. Auto-generate plan if requested and status is DRAFT (not blocked by clarification)
    let generatedPlan = null;
    if (autoPlan && interpretation.status !== "NEEDS_CLARIFICATION") {
      generatedPlan = await generateObjectivePlan({
        objectiveId: objective.id,
        userId: user.id,
        title: objective.title,
        category: objective.category,
        structuredGoal: interpretation.structuredGoal,
        constraints,
        mandateId,
      });

      await emitObjectiveEvent({
        objectiveId: objective.id,
        userId: user.id,
        eventType: "objective.plan_generated",
        metadata: {
          planId: generatedPlan.planId,
          version: generatedPlan.version,
          stepsCount: generatedPlan.steps.length,
        },
        mandateId,
      });
    }

    return NextResponse.json(
      {
        success: true,
        objective: {
          id: objective.id,
          title: objective.title,
          category: objective.category,
          status: generatedPlan ? "AWAITING_USER_APPROVAL" : objective.status,
          priority: objective.priority,
          structuredGoal: interpretation.structuredGoal,
          clarificationMessage: interpretation.clarificationMessage,
          warnings: interpretation.warnings,
          plan: generatedPlan,
          createdAt: objective.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

