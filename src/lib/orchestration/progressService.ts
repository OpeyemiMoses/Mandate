/**
 * MANDATE — MILESTONE 13.4: OBJECTIVE & TASK PROGRESS SERVICE
 *
 * Implements deterministic progress computation from persisted task states:
 * - Computes exact counts across all 12 task execution statuses.
 * - Counts as COMPLETED only after verification status is SYSTEM_VALIDATED or INDEPENDENTLY_VERIFIED.
 * - Evaluates objective success criteria independently.
 * - Updates objective progressPercent without arbitrary estimates.
 */

import { prisma } from "@/lib/db";
import { ObjectiveProgressMetrics } from "./types";
import { evaluateObjectiveSuccessCriteria } from "@/lib/objectives/criteriaEvaluator";

export class ObjectiveProgressService {
  /**
   * Computes objective progress metrics based on real verified task completions
   */
  public static async calculateProgress(params: {
    objectiveId: string;
    planId?: string;
    userId?: string;
  }): Promise<ObjectiveProgressMetrics> {
    const { objectiveId, planId, userId } = params;

    // 1. Fetch Objective and Active Plan Steps
    const objective = await prisma.objective.findUnique({
      where: { id: objectiveId },
      include: {
        plans: {
          where: planId ? { id: planId } : { status: { in: ["APPROVED", "ACTIVE", "COMPLETED"] } },
          orderBy: { version: "desc" },
          take: 1,
          include: {
            steps: true,
          },
        },
        criteria: true,
      },
    });

    if (!objective) {
      throw new Error(`OBJECTIVE_NOT_FOUND: Objective "${objectiveId}" not found.`);
    }

    if (userId && objective.userId !== userId) {
      throw new Error(`OBJECTIVE_NOT_FOUND: Objective "${objectiveId}" not authorized for user "${userId}".`);
    }

    const plan = objective.plans[0];
    const steps = plan ? plan.steps : [];
    const totalTasks = steps.length;

    let pendingTasks = 0;
    let blockedTasks = 0;
    let assignedTasks = 0;
    let queuedTasks = 0;
    let runningTasks = 0;
    let awaitingApprovalTasks = 0;
    let completedTasks = 0;
    let failedTasks = 0;
    let retryingTasks = 0;
    let cancelledTasks = 0;
    let requiringInterventionTasks = 0;

    for (const s of steps) {
      switch (s.status) {
        case "PENDING":
          pendingTasks++;
          break;
        case "BLOCKED":
          blockedTasks++;
          break;
        case "READY":
        case "ASSIGNED":
          assignedTasks++;
          break;
        case "QUEUED":
          queuedTasks++;
          break;
        case "RUNNING":
          runningTasks++;
          break;
        case "AWAITING_APPROVAL":
          awaitingApprovalTasks++;
          break;
        case "COMPLETED":
          // Count only if verified
          if (
            s.verificationStatus === "SYSTEM_VALIDATED" ||
            s.verificationStatus === "INDEPENDENTLY_VERIFIED"
          ) {
            completedTasks++;
          } else {
            // Unverified completion cannot contribute to progress
            runningTasks++;
          }
          break;
        case "FAILED":
          failedTasks++;
          break;
        case "RETRY_PENDING":
          retryingTasks++;
          break;
        case "CANCELLED":
          cancelledTasks++;
          break;
        case "REQUIRES_INTERVENTION":
          requiringInterventionTasks++;
          break;
        default:
          pendingTasks++;
          break;
      }
    }

    // 2. Evaluate Success Criteria
    let metCriteriaCount = 0;
    const totalCriteria = objective.criteria.length;

    if (plan && totalCriteria > 0) {
      try {
        const evalResult = await evaluateObjectiveSuccessCriteria({
          objectiveId,
          planId: plan.id,
        });
        metCriteriaCount = evalResult.metCount;
      } catch {
        metCriteriaCount = objective.criteria.filter((c) => c.currentState === "MET").length;
      }
    } else {
      metCriteriaCount = objective.criteria.filter((c) => c.currentState === "MET").length;
    }

    // 3. Compute Deterministic Progress Percentage
    const totalUnits = totalTasks + totalCriteria;
    const completedUnits = completedTasks + metCriteriaCount;
    const progressPercent =
      totalUnits > 0 ? Math.floor((completedUnits / totalUnits) * 100) : 0;

    const isComplete =
      totalTasks > 0 &&
      completedTasks === totalTasks &&
      (totalCriteria === 0 || metCriteriaCount === totalCriteria);

    // 4. Update Objective Progress in DB
    await prisma.objective.update({
      where: { id: objectiveId },
      data: {
        progressPercent,
      },
    });

    return {
      totalTasks,
      pendingTasks,
      blockedTasks,
      assignedTasks,
      queuedTasks,
      runningTasks,
      awaitingApprovalTasks,
      completedTasks,
      failedTasks,
      retryingTasks,
      cancelledTasks,
      requiringInterventionTasks,
      progressPercent,
      isComplete,
      successCriteriaMet: metCriteriaCount,
      totalSuccessCriteria: totalCriteria,
    };
  }
}

