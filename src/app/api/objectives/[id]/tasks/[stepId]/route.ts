import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TaskVerificationService } from "@/lib/orchestration/verificationService";
import { TaskLifecycleService } from "@/lib/orchestration/taskLifecycle";

export const dynamic = "force-dynamic";

/**
 * GET /api/objectives/[id]/tasks/[stepId]
 * Retrieves task step details, assignments, verified outputs, and execution events.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string; stepId: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId, stepId } = params;

    const step = await prisma.objectivePlanStep.findFirst({
      where: {
        stepId,
        objective: { id: objectiveId, userId: user.id },
      },
      include: {
        plan: true,
      },
    });

    if (!step) {
      return NextResponse.json(
        { success: false, error: "Task step not found or unauthorized" },
        { status: 404 }
      );
    }

    const plan = step.plan;

    const [assignment, results, events] = await Promise.all([
      prisma.agentAssignment.findFirst({
        where: { objectiveId, stepId },
        include: { agent: true },
      }),
      prisma.objectiveTaskResult.findMany({
        where: { planId: plan.id, stepId },
        orderBy: { executionAttempt: "desc" },
      }),
      prisma.objectiveTaskEvent.findMany({
        where: { planId: plan.id, stepId },
        orderBy: { timestamp: "desc" },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      success: true,
      task: {
        id: step.id,
        stepId: step.stepId,
        title: step.title,
        description: step.description,
        order: step.order,
        status: step.status,
        taskType: step.taskType,
        agentType: step.agentType,
        riskClassification: step.riskClassification,
        estimatedCostNear: step.estimatedCostNear,
        version: step.version,
        retryCount: step.retryCount,
        maxRetries: step.maxRetries,
        verificationStatus: step.verificationStatus,
        resultFingerprint: step.resultFingerprint,
        outputJson: step.outputJson ? JSON.parse(step.outputJson) : null,
        errorDetails: step.errorDetails,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
      },
      assignment: assignment
        ? {
            id: assignment.id,
            agentId: assignment.agentId,
            agentName: assignment.agent.name,
            agentType: assignment.agent.type,
            status: assignment.status,
            leaseToken: assignment.leaseToken,
            leaseExpiresAt: assignment.leaseExpiresAt,
            leaseGeneration: assignment.leaseGeneration,
          }
        : null,
      results: results.map((r) => ({
        id: r.id,
        executionAttempt: r.executionAttempt,
        status: r.status,
        verificationStatus: r.verificationStatus,
        resultFingerprint: r.resultFingerprint,
        output: JSON.parse(r.structuredOutputJson || "{}"),
        evidenceReferences: JSON.parse(r.evidenceReferencesJson || "[]"),
        errorDetails: r.errorDetails,
        completedAt: r.completedAt,
      })),
      events: events.map((e) => ({
        id: e.id,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        actorId: e.actorId,
        actorRole: e.actorRole,
        reason: e.reason,
        timestamp: e.timestamp,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve task details" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/objectives/[id]/tasks/[stepId]
 * Verifies or manual transitions task status.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string; stepId: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId, stepId } = params;
    const body = await req.json();

    const plan = await prisma.objectivePlan.findFirst({
      where: { objectiveId, status: { in: ["APPROVED", "ACTIVE"] } },
      orderBy: { version: "desc" },
    });

    if (!plan) {
      return NextResponse.json(
        { success: false, error: "Active plan not found" },
        { status: 404 }
      );
    }

    if (body.action === "VERIFY") {
      const verification = await TaskVerificationService.evaluateAndRecordResult({
        objectiveId,
        planId: plan.id,
        stepId,
        agentId: body.agentId || "user_manual",
        taskType: body.taskType || "EXECUTION",
        output: body.output || {},
        evidenceReferences: body.evidenceReferences || [],
        verifierRole: "USER",
        verifierId: user.id,
      });

      return NextResponse.json({
        success: true,
        verification,
      });
    }

    if (body.action === "TRANSITION") {
      const transition = await TaskLifecycleService.transitionTaskStatus({
        objectiveId,
        planId: plan.id,
        stepId,
        targetStatus: body.targetStatus,
        actorId: user.id,
        actorRole: "USER",
        reason: body.reason || "Manual user transition",
        expectedVersion: body.expectedVersion,
      });

      return NextResponse.json({
        success: true,
        transition,
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action. Supported: VERIFY, TRANSITION" },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Task action failed" },
      { status: 500 }
    );
  }
}
