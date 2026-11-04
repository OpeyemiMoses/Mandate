import { PlanStepDefinition, TaskType } from "./types";

export interface DAGTaskItem {
  stepId: string;
  title: string;
  taskType?: TaskType | string;
  order: number;
  dependencies: string[];
  riskClassification?: string;
  estimatedCostNear?: string;
  estimatedCostYocto?: string;
}

export interface DAGValidationOutput {
  valid: boolean;
  executionLevels: string[][]; // Array of parallel task groups
  topologicalOrder: string[];   // Flat deterministic order
  cyclePath?: string[];
  error?: string;
}

/**
 * Objective DAG Service
 * Builds and validates directed acyclic task graphs using Kahn's algorithm.
 * Guarantees cycle detection, self-dependency rejection, missing reference checks,
 * and parallel execution level scheduling.
 */
export class ObjectiveDAGService {
  /**
   * Validates task dependency graph and partitions into parallel execution levels
   */
  public static validateAndOrder(tasks: DAGTaskItem[]): DAGValidationOutput {
    if (!tasks || tasks.length === 0) {
      return {
        valid: true,
        executionLevels: [],
        topologicalOrder: [],
      };
    }

    const stepIdSet = new Set(tasks.map((t) => t.stepId));

    // 1. Check for Duplicate Task IDs
    if (stepIdSet.size !== tasks.length) {
      return {
        valid: false,
        executionLevels: [],
        topologicalOrder: [],
        error: "Duplicate stepId detected in task definitions.",
      };
    }

    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>(); // dependency -> dependents

    for (const task of tasks) {
      inDegree.set(task.stepId, 0);
      adjacency.set(task.stepId, []);
    }

    // 2. Validate Edges & Self-Dependencies
    for (const task of tasks) {
      const seenDeps = new Set<string>();

      for (const dep of task.dependencies || []) {
        // Self-dependency check
        if (dep === task.stepId) {
          return {
            valid: false,
            executionLevels: [],
            topologicalOrder: [],
            error: `Self-dependency detected: Task "${task.stepId}" cannot depend on itself.`,
            cyclePath: [task.stepId, task.stepId],
          };
        }

        // Non-existent dependency check
        if (!stepIdSet.has(dep)) {
          return {
            valid: false,
            executionLevels: [],
            topologicalOrder: [],
            error: `Missing dependency: Task "${task.stepId}" depends on non-existent step "${dep}".`,
          };
        }

        // Duplicate dependency check
        if (seenDeps.has(dep)) {
          return {
            valid: false,
            executionLevels: [],
            topologicalOrder: [],
            error: `Duplicate dependency edge: Task "${task.stepId}" declares dependency on "${dep}" multiple times.`,
          };
        }
        seenDeps.add(dep);

        // Add edge dep -> task
        adjacency.get(dep)!.push(task.stepId);
        inDegree.set(task.stepId, (inDegree.get(task.stepId) || 0) + 1);
      }
    }

    // 3. Kahn's Algorithm
    const levels: string[][] = [];
    const topologicalOrder: string[] = [];
    let currentLevel: string[] = [];

    // Find all nodes with in-degree 0
    for (const [stepId, degree] of inDegree.entries()) {
      if (degree === 0) {
        currentLevel.push(stepId);
      }
    }

    let visitedCount = 0;

    while (currentLevel.length > 0) {
      // Deterministically sort tasks in the current parallel level
      currentLevel.sort((a, b) => {
        const taskA = tasks.find((t) => t.stepId === a);
        const taskB = tasks.find((t) => t.stepId === b);
        const orderDiff = (taskA?.order || 0) - (taskB?.order || 0);
        if (orderDiff !== 0) return orderDiff;
        return a.localeCompare(b);
      });

      levels.push([...currentLevel]);
      topologicalOrder.push(...currentLevel);
      visitedCount += currentLevel.length;

      const nextLevel: string[] = [];

      for (const u of currentLevel) {
        for (const v of adjacency.get(u) || []) {
          const currentDegree = inDegree.get(v)! - 1;
          inDegree.set(v, currentDegree);
          if (currentDegree === 0) {
            nextLevel.push(v);
          }
        }
      }

      currentLevel = nextLevel;
    }

    // 4. Cycle Detection Check
    if (visitedCount !== tasks.length) {
      const remainingNodes = tasks.filter((t) => (inDegree.get(t.stepId) || 0) > 0);
      const cyclePath = this.traceCycle(remainingNodes, adjacency);

      return {
        valid: false,
        executionLevels: [],
        topologicalOrder: [],
        cyclePath,
        error: `Cycle detected in task dependency graph (${visitedCount} of ${tasks.length} tasks reachable). Cycle path: ${cyclePath.join(" -> ")}`,
      };
    }

    return {
      valid: true,
      executionLevels: levels,
      topologicalOrder,
    };
  }

  /**
   * Traces and isolates an exact cyclic path for diagnostic reporting
   */
  private static traceCycle(
    remainingTasks: DAGTaskItem[],
    adjacency: Map<string, string[]>
  ): string[] {
    const cycleNodes = new Set(remainingTasks.map((t) => t.stepId));
    const visited = new Set<string>();
    const stack: string[] = [];

    function dfs(current: string): string[] | null {
      visited.add(current);
      stack.push(current);

      for (const neighbor of adjacency.get(current) || []) {
        if (!cycleNodes.has(neighbor)) continue;

        if (stack.includes(neighbor)) {
          const cycleStart = stack.indexOf(neighbor);
          return [...stack.slice(cycleStart), neighbor];
        }

        if (!visited.has(neighbor)) {
          const res = dfs(neighbor);
          if (res) return res;
        }
      }

      stack.pop();
      return null;
    }

    for (const task of remainingTasks) {
      if (!visited.has(task.stepId)) {
        const cycle = dfs(task.stepId);
        if (cycle) return cycle;
      }
    }

    return remainingTasks.map((t) => t.stepId);
  }
}

