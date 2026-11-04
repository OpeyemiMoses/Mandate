import { prisma } from "@/lib/db";
import { executionOrchestrator } from "@/lib/runtime/orchestrator";
import { emitObjectiveEvent } from "./events";
import {
  computePlanContentHash,
  isValidObjectiveStatusTransition,
  ObjectiveStatus,
  StepStatus,
} from "./types";
import { evaluateObjectiveSuccessCriteria } from "./criteriaEvaluator";
import { PolicyEngine } from "@/lib/governance";
import { ObjectiveLifecycleService } from "./lifecycleService";

export interface ExecuteObjectiveResult {
  objectiveId: string;
  status: ObjectiveStatus;
  progressPercent: number;
  completedSteps: number;
  totalSteps: number;
  currentStepTitle?: string;
  isComplete: boolean;
  error?: string;
}

/**
 * Objective Plan Execution Engine
 * Executes approved structured plan steps through the Universal Agent Runtime.
 * Resolves dependency graph (DAG), maintains atomic step state, and tracks real progress.
 */
export async function executeObjectivePlan(params: {
  objectiveId: string;
  userId: string;
  signal?: AbortSignal;
}): Promise<ExecuteObjectiveResult> {
  const { objectiveId, userId } = params;

  // 1. Verify Objective and Ownership
  const objective = await prisma.objective.findFirst({
    where: { id: objectiveId, userId },
    include: {
      plans: {
        where: { status: "APPROVED" },
        orderBy: { version: "desc" },
        take: 1,
        include: { steps: { orderBy: { order: "asc" } } },
      },
      criteria: true,
      mandate: true,
    },
  });

  if (!objective) {
    throw new Error(`Objective "${objectiveId}" not found or unauthorized`);
  }

  const activePlan = objective.plans[0];
  if (!activePlan) {
    throw new Error(`Objective "${objective.title}" does not have an APPROVED plan to execute.`);
  }

  // 1a. Milestone 7 Governance: Centralized Policy Evaluation
  const govEval = await PolicyEngine.evaluate({
    userId,
    objectiveId,
    mandateId: objective.mandateId || undefined,
    operation: "execute_objective_plan",
    resource: objective.id,
    parameters: { planId: activePlan.id, version: activePlan.version },
  });

  if (!govEval.allowed) {
    throw new Error(`Governance Policy Denied Objective Execution: ${govEval.humanExplanation}`);
  }

  // 1b. Verify Approval Security & Content Hash Binding
  const latestApproval = await prisma.objectivePlanApproval.findFirst({
    where: { planId: activePlan.id, version: activePlan.version, decision: "APPROVED" },
    orderBy: { createdAt: "desc" },
  });

  if (!latestApproval) {
    throw new Error(`Plan v${activePlan.version} does not have a recorded user approval.`);
  }

  // Verify content hash integrity if recorded in approval
  let approvedHash: string | undefined = undefined;
  try {
    if (latestApproval.constraintsJson) {
      const parsed = JSON.parse(latestApproval.constraintsJson);
      approvedHash = parsed.planContentHash;
    }
  } catch {}

  if (approvedHash) {
    const currentHash = computePlanContentHash({
      version: activePlan.version,
      steps: activePlan.steps.map((s) => {
        let tools: string[] = [];
        let deps: string[] = [];
        try {
          if (s.requiredToolsJson) tools = JSON.parse(s.requiredToolsJson);
        } catch {}
        try {
          if (s.dependenciesJson) deps = JSON.parse(s.dependenciesJson);
        } catch {}
        return {
          stepId: s.stepId,
          title: s.title,
          agentType: s.agentType,
          requiredTools: tools,
          dependencies: deps,
          riskClassification: s.riskClassification,
          estimatedCostNear: s.estimatedCostNear,
        };
      }),
      constraints: objective.constraintsJson ? JSON.parse(objective.constraintsJson) : {},
    });

    if (currentHash !== approvedHash) {
      throw new Error(
        `Plan integrity violation: Plan contents have changed since approval was granted (Current: ${currentHash}, Approved: ${approvedHash}). Re-approval required.`
      );
    }
  }

  // 2. Transition Objective status to ACTIVE
  if (objective.status !== "ACTIVE") {
    if (!isValidObjectiveStatusTransition(objective.status as ObjectiveStatus, "ACTIVE")) {
      throw new Error(`Cannot transition objective from "${objective.status}" to "ACTIVE"`);
    }

    await prisma.objective.update({
      where: { id: objectiveId },
      data: {
        status: "ACTIVE",
        startedAt: objective.startedAt || new Date(),
      },
    });

    await emitObjectiveEvent({
      objectiveId,
      userId,
      eventType: "objective.execution_started",
      metadata: { planId: activePlan.id, planVersion: activePlan.version },
      mandateId: objective.mandateId || undefined,
    });
  }

  const steps = activePlan.steps;
  const totalSteps = steps.length;
  let completedCount = steps.filter((s) => s.status === "COMPLETED").length;

  // 3. Dependency DAG Resolution
  // Find steps that are PENDING or READY and have all dependencies COMPLETED
  const completedStepIds = new Set(
    steps.filter((s) => s.status === "COMPLETED").map((s) => s.stepId)
  );

  for (const step of steps) {
    if (
      step.status === "COMPLETED" ||
      step.status === "SKIPPED" ||
      step.status === "FAILED" ||
      step.status === "BLOCKED"
    ) {
      continue;
    }

    let deps: string[] = [];
    try {
      deps = JSON.parse(step.dependenciesJson || "[]");
    } catch {}

    // Check if ANY dependency is FAILED or BLOCKED
    const failedDep = steps.find(
      (s) => deps.includes(s.stepId) && (s.status === "FAILED" || s.status === "BLOCKED")
    );
    if (failedDep) {
      const blockReason = `Prerequisite dependency "${failedDep.stepId}" (${failedDep.title}) has status ${failedDep.status}. Downstream execution halted.`;
      await prisma.objectivePlanStep.update({
        where: { id: step.id },
        data: { status: "BLOCKED", errorDetails: blockReason },
      });
      await emitObjectiveEvent({
        objectiveId,
        userId,
        eventType: "objective.step_blocked",
        metadata: { stepId: step.stepId, reason: blockReason, failedDependencyId: failedDep.stepId },
        stepId: step.stepId,
        mandateId: objective.mandateId || undefined,
      });
      await prisma.objective.update({
        where: { id: objectiveId },
        data: { status: "BLOCKED" },
      });
      return {
        objectiveId,
        status: "BLOCKED",
        progressPercent: Math.round((completedCount / totalSteps) * 100),
        completedSteps: completedCount,
        totalSteps,
        currentStepTitle: step.title,
        isComplete: false,
        error: blockReason,
      };
    }

    const allDepsSatisfied = deps.every((depId) => completedStepIds.has(depId));

    if (!allDepsSatisfied) {
      // Step dependencies not yet met, keep PENDING
      continue;
    }

    // Step is ready to execute!
    await prisma.objectivePlanStep.update({
      where: { id: step.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    await emitObjectiveEvent({
      objectiveId,
      userId,
      eventType: "objective.step_started",
      metadata: { stepId: step.stepId, title: step.title, order: step.order },
      stepId: step.stepId,
      mandateId: objective.mandateId || undefined,
    });

    // Resolve assigned agent or fallback to available agent for this type
    let targetAgentId = step.assignedAgentId;
    if (!targetAgentId) {
      const fallbackAgent = await prisma.agent.findFirst({
        where: { userId, type: step.agentType, status: "ACTIVE" },
      });
      targetAgentId = fallbackAgent?.id || null;
    }

    if (!targetAgentId) {
      // Fail closed: No agent available to run this step
      const errReason = `No active agent of type "${step.agentType}" found to execute step "${step.title}"`;
      await prisma.objectivePlanStep.update({
        where: { id: step.id },
        data: { status: "FAILED", errorDetails: errReason },
      });

      await prisma.objective.update({
        where: { id: objectiveId },
        data: { status: "BLOCKED" },
      });

      await emitObjectiveEvent({
        objectiveId,
        userId,
        eventType: "objective.step_blocked",
        metadata: { stepId: step.stepId, reason: errReason },
        stepId: step.stepId,
        mandateId: objective.mandateId || undefined,
      });

      return {
        objectiveId,
        status: "BLOCKED",
        progressPercent: Math.round((completedCount / totalSteps) * 100),
        completedSteps: completedCount,
        totalSteps,
        currentStepTitle: step.title,
        isComplete: false,
        error: errReason,
      };
    }

    // Execute through Universal Agent Runtime Orchestrator
    try {
      const execResult = await executionOrchestrator.startExecution({
        agentId: targetAgentId,
        userId,
        mandateId: objective.mandateId || undefined,
        input: {
          objectiveId,
          stepId: step.stepId,
          stepTitle: step.title,
          stepDescription: step.description,
          prompt: `${step.title}: ${step.description}`,
        },
      });

      if (execResult.status === "COMPLETED") {
        await prisma.objectivePlanStep.update({
          where: { id: step.id },
          data: {
            status: "COMPLETED",
            executionId: execResult.executionId,
            outputJson: JSON.stringify(execResult.result?.output || {}),
            completedAt: new Date(),
          },
        });

        completedStepIds.add(step.stepId);
        completedCount++;

        await emitObjectiveEvent({
          objectiveId,
          userId,
          eventType: "objective.step_completed",
          metadata: {
            stepId: step.stepId,
            executionId: execResult.executionId,
            summary: execResult.result?.summary,
          },
          stepId: step.stepId,
          mandateId: objective.mandateId || undefined,
        });
      } else if (execResult.status === "WAITING_FOR_APPROVAL") {
        await prisma.objectivePlanStep.update({
          where: { id: step.id },
          data: {
            status: "WAITING_APPROVAL",
            executionId: execResult.executionId,
          },
        });

        const progressPercent = Math.round((completedCount / totalSteps) * 100);
        await prisma.objective.update({
          where: { id: objectiveId },
          data: { progressPercent },
        });

        return {
          objectiveId,
          status: "ACTIVE",
          progressPercent,
          completedSteps: completedCount,
          totalSteps,
          currentStepTitle: step.title,
          isComplete: false,
        };
      } else {
        // Step failed
        const errDetails = execResult.error || "Agent execution failed";
        await prisma.objectivePlanStep.update({
          where: { id: step.id },
          data: {
            status: "FAILED",
            executionId: execResult.executionId,
            errorDetails: errDetails,
          },
        });

        // Proactively block all downstream dependent steps
        for (const s of steps) {
          let sDeps: string[] = [];
          try {
            if (s.dependenciesJson) sDeps = JSON.parse(s.dependenciesJson);
          } catch {}
          if (sDeps.includes(step.stepId) && s.status === "PENDING") {
            await prisma.objectivePlanStep.update({
              where: { id: s.id },
              data: {
                status: "BLOCKED",
                errorDetails: `Prerequisite dependency "${step.stepId}" failed: ${errDetails}`,
              },
            });
          }
        }

        await prisma.objective.update({
          where: { id: objectiveId },
          data: { status: "FAILED" },
        });

        await emitObjectiveEvent({
          objectiveId,
          userId,
          eventType: "objective.failed",
          metadata: { stepId: step.stepId, error: errDetails },
          stepId: step.stepId,
          mandateId: objective.mandateId || undefined,
        });

        return {
          objectiveId,
          status: "FAILED",
          progressPercent: Math.round((completedCount / totalSteps) * 100),
          completedSteps: completedCount,
          totalSteps,
          currentStepTitle: step.title,
          isComplete: false,
          error: errDetails,
        };
      }
    } catch (stepErr: any) {
      await prisma.objectivePlanStep.update({
        where: { id: step.id },
        data: { status: "FAILED", errorDetails: stepErr.message },
      });

      // Proactively block all downstream dependent steps
      for (const s of steps) {
        let sDeps: string[] = [];
        try {
          if (s.dependenciesJson) sDeps = JSON.parse(s.dependenciesJson);
        } catch {}
        if (sDeps.includes(step.stepId) && s.status === "PENDING") {
          await prisma.objectivePlanStep.update({
            where: { id: s.id },
            data: {
              status: "BLOCKED",
              errorDetails: `Prerequisite dependency "${step.stepId}" failed: ${stepErr.message}`,
            },
          });
        }
      }

      await prisma.objective.update({
        where: { id: objectiveId },
        data: { status: "FAILED" },
      });

      return {
        objectiveId,
        status: "FAILED",
        progressPercent: Math.round((completedCount / totalSteps) * 100),
        completedSteps: completedCount,
        totalSteps,
        isComplete: false,
        error: stepErr.message,
      };
    }
  }

  // 4. Update Progress & Evaluate Real-World Success Criteria
  const evaluation = await evaluateObjectiveSuccessCriteria({
    objectiveId,
    planId: activePlan.id,
  });

  const isAllComplete = completedCount === totalSteps && evaluation.allMet;
  const progressPercent =
    totalSteps + evaluation.totalCount > 0
      ? Math.round(
          ((completedCount + evaluation.metCount) /
            (totalSteps + evaluation.totalCount)) *
            100
        )
      : completedCount === totalSteps
      ? 100
      : 0;

  if (isAllComplete) {
    await prisma.objective.update({
      where: { id: objectiveId },
      data: {
        status: "COMPLETED",
        progressPercent: 100,
        completedAt: new Date(),
        lastEvaluatedAt: new Date(),
      },
    });

    await emitObjectiveEvent({
      objectiveId,
      userId,
      eventType: "objective.completed",
      metadata: { completedSteps: totalSteps, totalSteps, criteriaMet: evaluation.metCount },
      mandateId: objective.mandateId || undefined,
    });
  } else {
    // If all steps executed but success criteria verification failed
    const hasUnmetCriteria = completedCount === totalSteps && !evaluation.allMet;
    const targetStatus: ObjectiveStatus = hasUnmetCriteria ? "REQUIRES_INTERVENTION" : "RUNNING";

    await prisma.objective.update({
      where: { id: objectiveId },
      data: {
        status: targetStatus,
        progressPercent,
        lastEvaluatedAt: new Date(),
      },
    });

    if (hasUnmetCriteria) {
      const unmetReasons = evaluation.criteriaResults
        .filter((c) => !c.isMet)
        .map((c) => `${c.criterionId}: ${c.reason}`)
        .join("; ");

      await emitObjectiveEvent({
        objectiveId,
        userId,
        eventType: "objective.verification_incomplete",
        metadata: {
          reasons: unmetReasons,
          unmetCriteria: evaluation.criteriaResults.filter((c) => !c.isMet),
        },
        mandateId: objective.mandateId || undefined,
      });

      return {
        objectiveId,
        status: "REQUIRES_INTERVENTION",
        progressPercent,
        completedSteps: completedCount,
        totalSteps,
        isComplete: false,
        error: `Steps executed successfully, but real-world outcome criteria verification failed: ${unmetReasons}`,
      };
    }
  }

  return {
    objectiveId,
    status: isAllComplete ? "COMPLETED" : "RUNNING",
    progressPercent: isAllComplete ? 100 : progressPercent,
    completedSteps: completedCount,
    totalSteps,
    isComplete: isAllComplete,
  };
}

/**
 * Pause Objective Execution
 */
export async function pauseObjective(objectiveId: string, userId: string) {
  await ObjectiveLifecycleService.pauseObjective({
    objectiveId,
    actorId: userId,
    actorRole: "USER",
    reason: "User paused objective",
  });
  return await prisma.objective.findUniqueOrThrow({ where: { id: objectiveId } });
}

/**
 * Resume Objective Execution
 */
export async function resumeObjective(objectiveId: string, userId: string) {
  await ObjectiveLifecycleService.resumeObjective({
    objectiveId,
    actorId: userId,
    actorRole: "USER",
    targetStatus: "RUNNING",
    reason: "User resumed objective",
  });

  // Continue execution of remaining steps
  return await executeObjectivePlan({ objectiveId, userId });
}

/**
 * Cancel Objective Execution
 */
export async function cancelObjective(objectiveId: string, userId: string) {
  await ObjectiveLifecycleService.cancelObjective({
    objectiveId,
    actorId: userId,
    actorRole: "USER",
    reason: "User cancelled objective",
  });
  return await prisma.objective.findUniqueOrThrow({ where: { id: objectiveId } });
}

/**
 * Calculate verifiable objective progress
 */
export async function getObjectiveProgress(objectiveId: string, userId: string) {
  const objective = await prisma.objective.findFirst({
    where: { id: objectiveId, userId },
    include: {
      plans: {
        where: { status: { in: ["APPROVED", "ACTIVE", "COMPLETED"] } },
        orderBy: { version: "desc" },
        take: 1,
        include: { steps: { orderBy: { order: "asc" } } },
      },
      criteria: true,
    },
  });

  if (!objective) throw new Error("Objective not found or unauthorized");

  const plan = objective.plans[0];
  const steps = plan?.steps || [];
  const totalSteps = steps.length;
  const completedSteps = steps.filter((s) => s.status === "COMPLETED").length;
  const runningSteps = steps.filter((s) => s.status === "RUNNING").length;
  const failedSteps = steps.filter((s) => s.status === "FAILED").length;
  const blockedSteps = steps.filter((s) => s.status === "BLOCKED").length;

  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return {
    objectiveId: objective.id,
    title: objective.title,
    status: objective.status,
    progressPercent,
    planVersion: plan?.version || 1,
    stepsTotal: totalSteps,
    stepsCompleted: completedSteps,
    stepsRunning: runningSteps,
    stepsFailed: failedSteps,
    stepsBlocked: blockedSteps,
    stepsRemaining: totalSteps - completedSteps,
    criteria: objective.criteria.map((c) => ({
      id: c.criterionId,
      description: c.description,
      measurementType: c.measurementType,
      target: c.target,
      currentState: c.currentState,
    })),
    lastEvaluatedAt: objective.lastEvaluatedAt?.toISOString() || null,
  };
}

