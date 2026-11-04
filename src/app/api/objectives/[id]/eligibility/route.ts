import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AgentCapabilityValidator } from "@/lib/agents/capabilityValidator";
import { TaskType } from "@/lib/objectives/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/objectives/[id]/eligibility
 * Evaluates whether an agent is eligible for a task under 11 deterministic criteria.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;
    const body = await req.json().catch(() => ({}));

    const stepId = body.stepId || body.taskId;
    const { agentId, task } = body;

    let taskRequirement = task;
    if (!taskRequirement && stepId) {
      const step = await prisma.objectivePlanStep.findFirst({
        where: { objectiveId, stepId },
      });
      if (step) {
        let reqTools: string[] = [];
        let reqCaps: string[] = [];
        try {
          if (step.requiredToolsJson) reqTools = JSON.parse(step.requiredToolsJson);
        } catch {}
        try {
          if (step.requiredCapabilitiesJson) reqCaps = JSON.parse(step.requiredCapabilitiesJson);
        } catch {}

        taskRequirement = {
          taskId: step.id,
          stepId: step.stepId,
          title: step.title,
          taskType: (step.taskType || "EXECUTION") as TaskType,
          requiredCapabilities: reqCaps,
          requiredTools: reqTools,
          riskClassification: (step.riskClassification || "LOW") as any,
          estimatedCostNear: step.estimatedCostNear || undefined,
          estimatedCostYocto: step.estimatedCostYocto || undefined,
          financialRequired: Boolean(step.estimatedCostYocto && BigInt(step.estimatedCostYocto) > BigInt(0)),
        };
      }
    }

    if (!taskRequirement) {
      return NextResponse.json(
        { success: false, error: "Either stepId, taskId or task object must be provided." },
        { status: 400 }
      );
    }

    if (agentId) {
      const report = await AgentCapabilityValidator.evaluateEligibility({
        agentId,
        userId: user.id,
        objectiveId,
        task: taskRequirement,
      });

      return NextResponse.json({
        success: true,
        report,
        reports: [{ ...report, agentName: (report.metadata as any)?.agentName }],
      });
    }

    // Evaluate all registered agents for the user
    const agents = await prisma.agent.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, type: true },
    });

    const reports = await Promise.all(
      agents.map(async (ag) => {
        const rep = await AgentCapabilityValidator.evaluateEligibility({
          agentId: ag.id,
          userId: user.id,
          objectiveId,
          task: taskRequirement,
        });
        return {
          ...rep,
          agentName: ag.name,
          agentType: ag.type,
        };
      })
    );

    return NextResponse.json({
      success: true,
      reports,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Eligibility evaluation failed" },
      { status: error.message?.includes("unauthorized") || error.message?.includes("not found") ? 404 : 500 }
    );
  }
}
