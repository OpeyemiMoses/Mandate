import { prisma } from "@/lib/db";
import { agentRegistry } from "@/lib/runtime/registry";
import { selectAgentForRequirement } from "@/lib/objectives/agentSelector";
import { emitCoordinationEvent } from "./events";
import { CoordinationTaskDefinition, CoordinationWorkflowPlan } from "./types";

export interface PlanCoordinationRunParams {
  objectiveId: string;
  userId: string;
  planVersion?: number;
  concurrencyLimit?: number;
}

export interface DAGValidationResult {
  valid: boolean;
  cycles?: string[][];
  executionLevels?: string[][]; // Array of parallel task groups
  error?: string;
}

/**
 * Validates a DAG dependency graph and computes parallel execution levels using Kahn's algorithm
 */
export function validateDAG(tasks: CoordinationTaskDefinition[]): DAGValidationResult {
  const stepIds = new Set(tasks.map((t) => t.stepId));
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>(); // dependency -> dependents

  for (const t of tasks) {
    inDegree.set(t.stepId, 0);
    graph.set(t.stepId, []);
  }

  // Build edges
  for (const t of tasks) {
    for (const dep of t.dependencies) {
      if (!stepIds.has(dep)) {
        return {
          valid: false,
          error: `Task "${t.stepId}" depends on non-existent step "${dep}".`,
        };
      }
      graph.get(dep)!.push(t.stepId);
      inDegree.set(t.stepId, (inDegree.get(t.stepId) || 0) + 1);
    }
  }

  // Kahn's algorithm for topological sorting and level generation
  const levels: string[][] = [];
  let currentLevel: string[] = [];

  for (const [stepId, degree] of inDegree.entries()) {
    if (degree === 0) {
      currentLevel.push(stepId);
    }
  }

  let visitedCount = 0;

  while (currentLevel.length > 0) {
    // Sort current level by task priority
    currentLevel.sort((a, b) => {
      const taskA = tasks.find((t) => t.stepId === a);
      const taskB = tasks.find((t) => t.stepId === b);
      return (taskA?.priority || 100) - (taskB?.priority || 100);
    });

    levels.push([...currentLevel]);
    visitedCount += currentLevel.length;

    const nextLevel: string[] = [];
    for (const u of currentLevel) {
      for (const v of graph.get(u) || []) {
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) {
          nextLevel.push(v);
        }
      }
    }

    currentLevel = nextLevel;
  }

  if (visitedCount !== tasks.length) {
    return {
      valid: false,
      error: `Cycle detected in workflow dependency graph (${visitedCount} of ${tasks.length} tasks reachable).`,
    };
  }

  return {
    valid: true,
    executionLevels: levels,
  };
}

/**
 * Multi-Agent Workflow Planner
 * Converts an approved objective plan into an executable, dependency-aware
 * coordination graph with validated agent assignments.
 */
export class MultiAgentWorkflowPlanner {
  /**
   * Create and plan a CoordinationRun for an approved objective
   */
  public static async planWorkflow(
    params: PlanCoordinationRunParams
  ): Promise<{ run: any; tasks: any[]; assignments: any[] }> {
    const { objectiveId, userId, planVersion, concurrencyLimit = 5 } = params;

    // 1. Fetch Objective and Approved Plan
    const objective = await prisma.objective.findFirst({
      where: { id: objectiveId, userId },
      include: {
        mandate: true,
        plans: {
          where: planVersion ? { version: planVersion } : { status: "APPROVED" },
          orderBy: { version: "desc" },
          take: 1,
          include: {
            steps: { orderBy: { order: "asc" } },
            approvals: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    });

    if (!objective) {
      throw new Error(`Objective "${objectiveId}" not found or unauthorized for user "${userId}".`);
    }

    const plan = objective.plans[0];
    if (!plan) {
      throw new Error(`No approved plan found for objective "${objective.title}".`);
    }

    if (plan.status !== "APPROVED") {
      throw new Error(
        `Plan version ${plan.version} has status "${plan.status}". Only APPROVED plans can be coordinated.`
      );
    }

    // 2. Map plan steps to CoordinationTask definitions
    const taskDefinitions: CoordinationTaskDefinition[] = plan.steps.map((step) => {
      let reqCaps: string[] = [];
      let reqTools: string[] = [];
      let deps: string[] = [];
      try {
        reqCaps = JSON.parse(step.requiredCapabilitiesJson || "[]");
      } catch {}
      try {
        reqTools = JSON.parse(step.requiredToolsJson || "[]");
      } catch {}
      try {
        deps = JSON.parse(step.dependenciesJson || "[]");
      } catch {}

      return {
        stepId: step.stepId,
        title: step.title,
        description: step.description,
        order: step.order,
        priority: 100 - step.order, // default priority derived from order
        agentType: step.agentType,
        requiredCapabilities: reqCaps,
        requiredTools: reqTools,
        dependencies: deps,
        estimatedCostNear: step.estimatedCostNear || undefined,
        financialRequired: Boolean(step.estimatedCostNear && parseFloat(step.estimatedCostNear) > 0),
      };
    });

    // 3. Strict DAG Validation & Cycle Detection
    const dagResult = validateDAG(taskDefinitions);
    if (!dagResult.valid) {
      throw new Error(`Invalid workflow DAG: ${dagResult.error}`);
    }

    // 4. Match Agents Using Real Capabilities in Registry
    const assignmentsToCreate: Array<{
      stepId: string;
      agentId: string;
      capabilities: string[];
    }> = [];

    for (const taskDef of taskDefinitions) {
      const match = await selectAgentForRequirement({
        userId,
        requirement: {
          agentType: taskDef.agentType,
          requiredCapabilities: taskDef.requiredCapabilities,
          requiredTools: taskDef.requiredTools,
        },
        mandateId: objective.mandateId,
      });

      if (!match.matched || !match.selectedAgent) {
        throw new Error(
          `Capability match failed for task "${taskDef.stepId}" (${taskDef.title}): ` +
            `Missing capabilities: [${match.missingCapabilities.join(", ")}]. ${match.reasons.join(". ")}`
        );
      }

      // Verify that the agent actually exists in the runtime registry
      const agentImpl = agentRegistry.get(match.selectedAgent.type, match.selectedAgent.version);
      if (!agentImpl) {
        throw new Error(
          `Agent implementation for "${match.selectedAgent.type}" is not registered in Universal Agent Runtime.`
        );
      }

      assignmentsToCreate.push({
        stepId: taskDef.stepId,
        agentId: match.selectedAgent.id,
        capabilities: taskDef.requiredCapabilities,
      });
    }

    // 5. Create CoordinationRun in Database
    const run = await prisma.coordinationRun.create({
      data: {
        userId,
        objectiveId,
        planId: plan.id,
        planVersion: plan.version,
        mandateId: objective.mandateId || null,
        status: "PENDING",
        concurrencyLimit,
        totalTasksCount: taskDefinitions.length,
        configJson: JSON.stringify({
          executionLevels: dagResult.executionLevels,
          priorityOrdering: "ASC",
        }),
      },
    });

    // 6. Create CoordinationTask and AgentAssignment records atomically
    const createdTasks: any[] = [];
    const createdAssignments: any[] = [];

    for (const taskDef of taskDefinitions) {
      const isInitial = taskDef.dependencies.length === 0;
      const initialStatus = isInitial ? "READY" : "PENDING";
      const assigned = assignmentsToCreate.find((a) => a.stepId === taskDef.stepId);

      const task = await prisma.coordinationTask.create({
        data: {
          runId: run.id,
          stepId: taskDef.stepId,
          title: taskDef.title,
          description: taskDef.description,
          order: taskDef.order,
          priority: taskDef.priority || 100,
          agentType: taskDef.agentType,
          requiredCapabilitiesJson: JSON.stringify(taskDef.requiredCapabilities),
          requiredToolsJson: JSON.stringify(taskDef.requiredTools || []),
          dependenciesJson: JSON.stringify(taskDef.dependencies),
          status: initialStatus,
          assignedAgentId: assigned?.agentId || null,
          financialRequired: taskDef.financialRequired || false,
          estimatedCostNear: taskDef.estimatedCostNear || null,
        },
      });
      createdTasks.push(task);

      if (assigned) {
        const assignment = await prisma.agentAssignment.create({
          data: {
            runId: run.id,
            taskId: task.id,
            agentId: assigned.agentId,
            assignedCapabilitiesJson: JSON.stringify(assigned.capabilities),
            status: "ASSIGNED",
          },
        });
        createdAssignments.push(assignment);
      }
    }

    // 7. Emit Unified Coordination Event
    await emitCoordinationEvent({
      runId: run.id,
      objectiveId,
      userId,
      mandateId: objective.mandateId,
      eventType: "coordination.run_created",
      metadata: {
        planId: plan.id,
        planVersion: plan.version,
        taskCount: createdTasks.length,
        executionLevels: dagResult.executionLevels,
      },
      recordInAuditChain: true,
    });

    return {
      run,
      tasks: createdTasks,
      assignments: createdAssignments,
    };
  }
}

