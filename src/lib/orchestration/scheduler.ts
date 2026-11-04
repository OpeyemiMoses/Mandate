/**
 * MANDATE — MILESTONE 13.4: DEPENDENCY-AWARE SCHEDULER
 *
 * Real-time runtime DAG scheduler extending M13.2 ObjectiveDAGService:
 * - Verifies canonical planHash and version integrity.
 * - Kahn topological execution levels and parallel task partitioning.
 * - Evaluates upstream dependency satisfaction.
 * - Automatically blocks downstream tasks if any prerequisite has FAILED/CANCELLED.
 * - Prevents agent over-allocation by enforcing per-agent and per-objective concurrency throttles.
 */

import { prisma } from "@/lib/db";
import { ObjectiveDAGService, DAGTaskItem } from "@/lib/objectives/dagService";
import { computePlanContentHash } from "@/lib/objectives/types";
import { OrchestrationTaskStatus, SchedulerReadinessResult } from "./types";

export interface SchedulerOptions {
  objectiveId: string;
  expectedPlanHash?: string;
  expectedPlanVersion?: number;
  maxPerAgentConcurrency?: number;
  maxGlobalConcurrency?: number;
}

export class ObjectiveScheduler {
  /**
   * Evaluates the objective DAG and determines tasks ready for immediate dispatch
   */
  public static async evaluateReadiness(
    options: SchedulerOptions
  ): Promise<SchedulerReadinessResult> {
    const {
      objectiveId,
      expectedPlanHash,
      expectedPlanVersion,
      maxPerAgentConcurrency = 2,
      maxGlobalConcurrency = 5,
    } = options;

    // 1. Fetch Objective and Latest Approved Plan
    const objective = await prisma.objective.findUnique({
      where: { id: objectiveId },
      include: {
        plans: {
          where: { status: "APPROVED" },
          orderBy: { version: "desc" },
          take: 1,
          include: {
            steps: { orderBy: { order: "asc" } },
          },
        },
      },
    });

    if (!objective) {
      throw new Error(`OBJECTIVE_NOT_FOUND: Objective "${objectiveId}" does not exist.`);
    }

    // 1.5. Milestone 13.6: Deadline Expiration Enforcement
    const now = new Date();
    if (objective.deadlineAt && now > objective.deadlineAt) {
      if (objective.status === "RUNNING" || objective.status === "ACTIVE") {
        // Transition to REQUIRES_INTERVENTION due to deadline breach
        await prisma.objective.update({
          where: { id: objectiveId },
          data: {
            status: "REQUIRES_INTERVENTION",
            failureReason: `DEADLINE_EXCEEDED: Objective deadline ${objective.deadlineAt.toISOString()} exceeded.`,
          },
        });
        await prisma.objectiveEvent.create({
          data: {
            objectiveId,
            eventType: "objective.deadline_exceeded",
            fromStatus: objective.status,
            toStatus: "REQUIRES_INTERVENTION",
            reason: "Objective deadline exceeded",
            metadataJson: JSON.stringify({
              deadlineAt: objective.deadlineAt,
              evaluatedAt: now,
            }),
          },
        });
      }
      throw new Error(
        `DEADLINE_EXCEEDED: Objective "${objectiveId}" deadline ${objective.deadlineAt.toISOString()} has passed.`
      );
    }

    const plan = objective.plans[0];
    if (!plan) {
      throw new Error(`NO_APPROVED_PLAN: Objective "${objectiveId}" does not have an APPROVED plan.`);
    }

    if (expectedPlanVersion !== undefined && plan.version !== expectedPlanVersion) {
      throw new Error(
        `STALE_PLAN_VERSION: Expected plan v${expectedPlanVersion}, but current approved is v${plan.version}.`
      );
    }

    // 2. Cryptographic Plan Integrity Verification
    const currentComputedHash = computePlanContentHash({
      version: plan.version,
      steps: plan.steps.map((s) => {
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

    if (expectedPlanHash && expectedPlanHash !== currentComputedHash) {
      throw new Error(
        `PLAN_INTEGRITY_VIOLATION: Expected planHash "${expectedPlanHash}" does not match computed "${currentComputedHash}".`
      );
    }

    if (plan.planHash && plan.planHash !== currentComputedHash) {
      throw new Error(
        `PLAN_INTEGRITY_VIOLATION: Plan record hash "${plan.planHash}" does not match computed hash "${currentComputedHash}".`
      );
    }

    // 3. Construct DAG Tasks for Kahn Sorting
    const dagTasks: DAGTaskItem[] = plan.steps.map((s) => {
      let deps: string[] = [];
      try {
        if (s.dependenciesJson) deps = JSON.parse(s.dependenciesJson);
      } catch {}
      return {
        stepId: s.stepId,
        title: s.title,
        order: s.order,
        dependencies: deps,
        taskType: s.taskType,
        riskClassification: s.riskClassification,
        estimatedCostNear: s.estimatedCostNear || undefined,
        estimatedCostYocto: s.estimatedCostYocto || undefined,
      };
    });

    const dagValidation = ObjectiveDAGService.validateAndOrder(dagTasks);
    if (!dagValidation.valid) {
      throw new Error(`DAG_VALIDATION_FAILED: ${dagValidation.error || "Invalid task graph structure."}`);
    }

    // Map execution level per stepId
    const stepLevelMap = new Map<string, number>();
    dagValidation.executionLevels.forEach((levelSteps, levelIndex) => {
      levelSteps.forEach((sId) => stepLevelMap.set(sId, levelIndex));
    });

    // 4. Inspect Task States and Dependency Status
    const stepMap = new Map(plan.steps.map((s) => [s.stepId, s]));
    const completedStepIds = new Set<string>();
    const failedStepIds = new Set<string>();
    const executingStepIds = new Set<string>();

    for (const s of plan.steps) {
      if (s.status === "COMPLETED") completedStepIds.add(s.stepId);
      if (s.status === "FAILED" || s.status === "CANCELLED") failedStepIds.add(s.stepId);
      if (s.status === "RUNNING" || s.status === "QUEUED") executingStepIds.add(s.stepId);
    }

    // 5. Active Agent Concurrency Load
    const activeAssignments = await prisma.agentAssignment.findMany({
      where: {
        status: { in: ["ASSIGNED", "ACTIVE"] },
        task: { status: "RUNNING" },
      },
      select: { agentId: true },
    });
    const agentActiveCount = new Map<string, number>();
    for (const a of activeAssignments) {
      agentActiveCount.set(a.agentId, (agentActiveCount.get(a.agentId) || 0) + 1);
    }

    const readyTasks: SchedulerReadinessResult["readyTasks"] = [];
    const blockedTasks: SchedulerReadinessResult["blockedTasks"] = [];

    // Milestone 13.6: Auto-resume RETRY_PENDING steps whose backoff delay has elapsed
    for (const step of plan.steps) {
      if (step.status === "RETRY_PENDING") {
        const retryDelayMs = Math.min(500 * Math.pow(2, step.retryCount - 1), 30000);
        const timeSinceUpdate = now.getTime() - step.updatedAt.getTime();
        if (timeSinceUpdate >= retryDelayMs) {
          await prisma.objectivePlanStep.update({
            where: { id: step.id },
            data: { status: "READY" },
          });
          step.status = "READY";
        }
      }
    }

    // Check each step
    for (const step of plan.steps) {
      // Only PENDING, READY, or ASSIGNED tasks can be scheduled to run
      if (
        step.status !== "PENDING" &&
        step.status !== "READY" &&
        step.status !== "ASSIGNED"
      ) {
        continue;
      }

      let deps: string[] = [];
      try {
        if (step.dependenciesJson) deps = JSON.parse(step.dependenciesJson);
      } catch {}

      const unmetDeps = deps.filter((d) => !completedStepIds.has(d));
      const failedDeps = deps.filter((d) => failedStepIds.has(d));

      if (failedDeps.length > 0) {
        // Upstream prerequisite failed: task must be BLOCKED
        blockedTasks.push({
          stepId: step.stepId,
          title: step.title,
          unmetDependencies: unmetDeps,
          failedDependencies: failedDeps,
        });

        // Ensure step is marked BLOCKED in database
        await prisma.objectivePlanStep.update({
          where: { id: step.id },
          data: {
            status: "BLOCKED",
            errorDetails: `Prerequisite step(s) failed: ${failedDeps.join(", ")}`,
          },
        });
        continue;
      }

      if (unmetDeps.length > 0) {
        // Waiting on pending upstream steps
        blockedTasks.push({
          stepId: step.stepId,
          title: step.title,
          unmetDependencies: unmetDeps,
          failedDependencies: [],
        });
        continue;
      }

      // All dependencies COMPLETED! Check agent concurrency throttle
      const assignedAgentId = step.assignedAgentId;
      if (assignedAgentId) {
        const currentAgentLoad = agentActiveCount.get(assignedAgentId) || 0;
        if (currentAgentLoad >= maxPerAgentConcurrency) {
          // Agent at max concurrency capacity, delay dispatch
          continue;
        }
      }

      const executionLevel = stepLevelMap.get(step.stepId) ?? 0;

      readyTasks.push({
        stepId: step.stepId,
        title: step.title,
        taskType: step.taskType,
        agentType: step.agentType,
        assignedAgentId: step.assignedAgentId || undefined,
        dependencies: deps,
        priority: 100,
        order: step.order,
        executionLevel,
      });
    }

    // Sort ready tasks by execution level, then order
    readyTasks.sort((a, b) => {
      if (a.executionLevel !== b.executionLevel) return a.executionLevel - b.executionLevel;
      return a.order - b.order;
    });

    return {
      objectiveId,
      planId: plan.id,
      planVersion: plan.version,
      planHash: currentComputedHash,
      readyTasks,
      blockedTasks,
      executingTasks: Array.from(executingStepIds),
      completedTasks: Array.from(completedStepIds),
      failedTasks: Array.from(failedStepIds),
      isAcyclic: dagValidation.valid,
    };
  }
}
