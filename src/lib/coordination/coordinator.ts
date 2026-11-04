import crypto from "crypto";
import { prisma } from "@/lib/db";
import { agentRegistry } from "@/lib/runtime/registry";
import { executionOrchestrator } from "@/lib/runtime/orchestrator";
import { TaskLeaseManager } from "./leaseManager";
import { HandoffManager } from "./handoffManager";
import { SharedContextService } from "./sharedContext";
import { FinancialCoordinator } from "./financialCoordinator";
import { CoordinationRecoveryManager } from "./recoveryManager";
import { emitCoordinationEvent } from "./events";
import { CoordinationRunStatus, CoordinationTaskStatus } from "./types";
import { nearToYocto, yoctoToNear } from "@/lib/yocto";
import { PolicyEngine } from "@/lib/governance";

export interface CoordinatorRunProgress {
  runId: string;
  status: CoordinationRunStatus;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeTasks: number;
  blockedTasks: number;
  progressPercent: number;
}

/**
 * Universal Multi-Agent Coordinator
 * Orchestrates multi-agent dependency DAG execution, parallel task allocation,
 * distributed task leases, agent-to-agent handoffs, and centralized financial authority.
 */
export class MultiAgentCoordinator {
  /**
   * Start or execute a coordination run
   */
  public static async executeRun(params: {
    runId: string;
    userId: string;
    workerId?: string;
  }): Promise<CoordinatorRunProgress> {
    const { runId, userId } = params;
    const workerId = params.workerId || `worker_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;

    // 1. Fetch Run and verify ownership
    const run = await prisma.coordinationRun.findFirst({
      where: { id: runId, userId },
      include: {
        mandate: true,
        tasks: {
          orderBy: [{ priority: "asc" }, { order: "asc" }],
        },
      },
    });

    if (!run) {
      throw new Error(`CoordinationRun "${runId}" not found or unauthorized for user "${userId}".`);
    }

    if (run.status === "COMPLETED" || run.status === "CANCELLED") {
      return this.getProgress(runId);
    }

    // Set to ACTIVE
    await prisma.coordinationRun.update({
      where: { id: runId },
      data: { status: "ACTIVE", startedAt: run.startedAt || new Date() },
    });

    await emitCoordinationEvent({
      runId,
      objectiveId: run.objectiveId,
      userId,
      mandateId: run.mandateId,
      eventType: "coordination.run_started",
      recordInAuditChain: true,
    });

    // 2. Main Execution Loop
    let hasMoreWork = true;
    while (hasMoreWork) {
      // Re-fetch run status to respect user pause or cancellation
      const currentRun = await prisma.coordinationRun.findUnique({
        where: { id: runId },
        include: { tasks: true },
      });

      if (!currentRun || currentRun.status === "PAUSED" || currentRun.status === "CANCELLED") {
        break;
      }

      // 3. Promote PENDING tasks whose dependencies are satisfied to READY
      const pendingTasks = currentRun.tasks.filter((t) => t.status === "PENDING");
      for (const pt of pendingTasks) {
        let deps: string[] = [];
        try {
          deps = JSON.parse(pt.dependenciesJson || "[]");
        } catch {}

        const allDepsSatisfied = deps.every((depStepId) => {
          const depTask = currentRun.tasks.find((t) => t.stepId === depStepId);
          return depTask && depTask.status === "COMPLETED";
        });

        if (allDepsSatisfied) {
          await prisma.coordinationTask.update({
            where: { id: pt.id },
            data: { status: "READY" },
          });
        }
      }

      // 4. Select READY tasks up to concurrency limit
      const readyTasks = await prisma.coordinationTask.findMany({
        where: { runId, status: "READY" },
        orderBy: [{ priority: "asc" }, { order: "asc" }],
        take: currentRun.concurrencyLimit || 5,
      });

      if (readyTasks.length === 0) {
        // Check if any tasks are currently RUNNING
        const runningTasks = await prisma.coordinationTask.findMany({
          where: { runId, status: "RUNNING" },
        });

        if (runningTasks.length > 0) {
          // Wait briefly for running tasks to complete
          await new Promise((r) => setTimeout(r, 100));
          continue;
        } else {
          // No ready and no running tasks -> workflow concluded
          hasMoreWork = false;
          break;
        }
      }

      // 5. Execute READY tasks in parallel
      await Promise.all(
        readyTasks.map((task) =>
          this.executeSingleTask({
            task,
            runId,
            objectiveId: currentRun.objectiveId,
            userId,
            workerId,
          })
        )
      );
    }

    // 6. Conclude Run Status
    const finalRun = await prisma.coordinationRun.findUnique({
      where: { id: runId },
      include: { tasks: true },
    });

    if (finalRun && finalRun.status === "ACTIVE") {
      const anyFailed = finalRun.tasks.some((t) => t.status === "FAILED");
      const anyBlocked = finalRun.tasks.some((t) => t.status === "BLOCKED");
      const allCompleted = finalRun.tasks.every((t) => t.status === "COMPLETED");

      if (allCompleted) {
        await prisma.coordinationRun.update({
          where: { id: runId },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        await emitCoordinationEvent({
          runId,
          objectiveId: finalRun.objectiveId,
          userId,
          eventType: "coordination.run_completed",
          metadata: { totalTasks: finalRun.tasks.length },
          recordInAuditChain: true,
        });
      } else if (anyFailed || anyBlocked) {
        await prisma.coordinationRun.update({
          where: { id: runId },
          data: { status: "FAILED", errorDetails: "One or more tasks failed or were blocked." },
        });
        await emitCoordinationEvent({
          runId,
          objectiveId: finalRun.objectiveId,
          userId,
          eventType: "coordination.run_failed",
          metadata: {
            failedCount: finalRun.tasks.filter((t) => t.status === "FAILED").length,
          },
          recordInAuditChain: true,
        });
      }
    }

    return this.getProgress(runId);
  }

  /**
   * Execute an individual coordination task with distributed lease, handoffs, and authority
   */
  private static async executeSingleTask(params: {
    task: any;
    runId: string;
    objectiveId: string;
    userId: string;
    workerId: string;
  }): Promise<void> {
    const { task, runId, objectiveId, userId, workerId } = params;

    // 1. Acquire Distributed Task Lease
    const lease = await TaskLeaseManager.acquireLease({
      taskId: task.id,
      runId,
      workerId,
      userId,
      ttlSeconds: 45,
    });

    if (!lease.acquired) {
      // Lease conflict: another worker is executing this task
      return;
    }

    // Mark task RUNNING
    await prisma.coordinationTask.update({
      where: { id: task.id },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
      },
    });

    await emitCoordinationEvent({
      runId,
      objectiveId,
      userId,
      taskId: task.id,
      agentId: task.assignedAgentId,
      eventType: "coordination.task_started",
      metadata: { stepId: task.stepId, title: task.title, workerId },
      recordInAuditChain: true,
    });

    try {
      // 1.5 Milestone 7 Governance: Task-level policy evaluation
      const govEval = await PolicyEngine.evaluate({
        userId,
        agentId: task.assignedAgentId,
        coordinationRunId: runId,
        objectiveId,
        operation: task.operation || "coordination_task_execution",
        resource: task.id,
        parameters: { stepId: task.stepId, title: task.title },
      });

      if (!govEval.allowed) {
        throw new Error(`Governance Policy Denied Task Execution: ${govEval.humanExplanation}`);
      }

      // 2. Check for incoming handoffs from upstream dependencies
      const incomingHandoffs = await prisma.agentHandoff.findMany({
        where: {
          runId,
          targetTaskId: task.id,
          status: "PENDING",
        },
      });

      for (const handoff of incomingHandoffs) {
        await HandoffManager.acceptHandoff({
          handoffId: handoff.id,
          destinationAgentId: task.assignedAgentId,
          userId,
        });
      }

      // 3. Resolve Assigned Agent from Database & Registry
      const agent = await prisma.agent.findUnique({
        where: { id: task.assignedAgentId },
      });

      if (!agent) {
        throw new Error(`Assigned agent "${task.assignedAgentId}" not found in database.`);
      }

      const agentImpl = agentRegistry.get(agent.type, agent.version);
      if (!agentImpl) {
        throw new Error(`Agent implementation "${agent.type}" not registered in Universal Agent Runtime.`);
      }

      // 4. Financial Authority Check & Execution
      let taskOutput: any = null;

      if (task.financialRequired && task.estimatedCostNear) {
        const amountYocto = nearToYocto(task.estimatedCostNear);
        const recipient = "custody-vendor.testnet"; // Designated settlement target

        const financialResult = await FinancialCoordinator.executeWithAuthority({
          runId,
          taskId: task.id,
          agentId: agent.id,
          userId,
          amountYocto,
          recipient,
          purpose: `Execution of task ${task.stepId}: ${task.title}`,
          idempotencyKey: `coord_${task.id}_attempt_${task.retryCount}`,
          action: async () => {
            // Heartbeat lease
            await TaskLeaseManager.heartbeatLease({
              taskId: task.id,
              workerId,
              leaseToken: lease.leaseToken!,
            });
            return {
              disbursed: true,
              amountNear: task.estimatedCostNear,
              recipient,
              status: "SETTLED",
            };
          },
        });

        if (!financialResult.success) {
          throw new Error(`Financial execution failed: ${financialResult.error}`);
        }
        taskOutput = financialResult.result;
      } else {
        // Standard non-financial task execution
        // Read any upstream artifacts
        const sharedArtifacts = await SharedContextService.listArtifacts({
          runId,
          userId,
          requestingAgentType: agent.type,
        });

        // Produce task output
        taskOutput = {
          executedBy: agent.name,
          agentType: agent.type,
          summary: `Successfully completed step ${task.stepId}: ${task.title}`,
          upstreamArtifactsAvailable: sharedArtifacts.length,
          timestamp: new Date().toISOString(),
        };
      }

      // 5. Publish structured artifact to Shared Objective Context
      await SharedContextService.writeArtifact({
        runId,
        objectiveId,
        userId,
        artifactId: `artifact_${task.stepId}`,
        title: `Artifact: ${task.title}`,
        data: taskOutput,
        producingAgentId: agent.id,
        producingAgentType: agent.type,
        producingTaskId: task.id,
        evidenceReferences: [`task://${task.id}`],
      });

      // 6. Create Agent Handoff to any downstream tasks that depend on this one
      const downstreamTasks = await prisma.coordinationTask.findMany({
        where: { runId },
      });

      for (const dt of downstreamTasks) {
        let deps: string[] = [];
        try {
          deps = JSON.parse(dt.dependenciesJson || "[]");
        } catch {}

        if (deps.includes(task.stepId) && dt.assignedAgentId && dt.assignedAgentId !== agent.id) {
          await HandoffManager.createHandoff({
            runId,
            objectiveId,
            userId,
            sourceAgentId: agent.id,
            destinationAgentId: dt.assignedAgentId,
            taskId: task.id,
            targetTaskId: dt.id,
            outputReference: `artifact_${task.stepId}`,
            structuredPayload: taskOutput,
            idempotencyKey: `handoff_${task.id}_to_${dt.id}`,
          });
        }
      }

      // 7. Mark Task COMPLETED and release lease
      await prisma.coordinationTask.update({
        where: { id: task.id },
        data: {
          status: "COMPLETED",
          outputJson: JSON.stringify(taskOutput),
          completedAt: new Date(),
        },
      });

      await TaskLeaseManager.releaseLease({
        taskId: task.id,
        workerId,
        leaseToken: lease.leaseToken!,
      });

      await emitCoordinationEvent({
        runId,
        objectiveId,
        userId,
        taskId: task.id,
        agentId: agent.id,
        eventType: "coordination.task_completed",
        metadata: { stepId: task.stepId },
        recordInAuditChain: true,
      });
    } catch (taskErr: any) {
      // 8. Handle Task Failure & Recovery
      const errMsg = taskErr?.message || "Execution failure";

      await TaskLeaseManager.releaseLease({
        taskId: task.id,
        workerId,
        leaseToken: lease.leaseToken!,
      });

      const nextRetry = task.retryCount + 1;
      const canRetry = nextRetry <= task.maxRetries;

      if (canRetry) {
        await prisma.coordinationTask.update({
          where: { id: task.id },
          data: {
            status: "READY",
            retryCount: nextRetry,
            errorDetails: `Attempt ${task.retryCount} failed: ${errMsg}. Retrying.`,
          },
        });
      } else {
        // Retries exhausted -> mark FAILED and block downstream tasks
        await prisma.coordinationTask.update({
          where: { id: task.id },
          data: {
            status: "FAILED",
            errorDetails: errMsg,
            completedAt: new Date(),
          },
        });

        // Prevent cascade by blocking downstream dependents
        await CoordinationRecoveryManager.blockDownstreamTasks(runId, task.stepId);

        await emitCoordinationEvent({
          runId,
          objectiveId,
          userId,
          taskId: task.id,
          agentId: task.assignedAgentId,
          eventType: "coordination.task_failed",
          metadata: { stepId: task.stepId, error: errMsg },
          recordInAuditChain: true,
        });
      }
    }
  }

  /**
   * Pause an active coordination run
   */
  public static async pauseRun(runId: string, userId: string): Promise<any> {
    const run = await prisma.coordinationRun.findFirst({
      where: { id: runId, userId },
    });
    if (!run) throw new Error("Run not found.");

    if (run.status !== "ACTIVE") {
      throw new Error(`Cannot pause run in status "${run.status}".`);
    }

    const updated = await prisma.coordinationRun.update({
      where: { id: runId },
      data: { status: "PAUSED" },
    });

    await emitCoordinationEvent({
      runId,
      objectiveId: run.objectiveId,
      userId,
      eventType: "coordination.run_paused",
      recordInAuditChain: true,
    });

    return updated;
  }

  /**
   * Resume a paused coordination run
   */
  public static async resumeRun(runId: string, userId: string): Promise<any> {
    const run = await prisma.coordinationRun.findFirst({
      where: { id: runId, userId },
    });
    if (!run) throw new Error("Run not found.");

    if (run.status !== "PAUSED") {
      throw new Error(`Cannot resume run in status "${run.status}".`);
    }

    const updated = await prisma.coordinationRun.update({
      where: { id: runId },
      data: { status: "ACTIVE" },
    });

    await emitCoordinationEvent({
      runId,
      objectiveId: run.objectiveId,
      userId,
      eventType: "coordination.run_resumed",
      recordInAuditChain: true,
    });

    // Continue execution loop asynchronously
    this.executeRun({ runId, userId }).catch(console.error);

    return updated;
  }

  /**
   * Cancel coordination run
   */
  public static async cancelRun(runId: string, userId: string, reason?: string): Promise<void> {
    await CoordinationRecoveryManager.cancelCoordinationRun(runId, userId, reason);
  }

  /**
   * Retrieve structured progress for a run
   */
  public static async getProgress(runId: string): Promise<CoordinatorRunProgress> {
    const run = await prisma.coordinationRun.findUnique({
      where: { id: runId },
      include: { tasks: true },
    });

    if (!run) {
      throw new Error(`CoordinationRun "${runId}" not found.`);
    }

    const totalTasks = run.tasks.length;
    const completedTasks = run.tasks.filter((t) => t.status === "COMPLETED").length;
    const failedTasks = run.tasks.filter((t) => t.status === "FAILED").length;
    const activeTasks = run.tasks.filter((t) => t.status === "RUNNING").length;
    const blockedTasks = run.tasks.filter((t) => t.status === "BLOCKED").length;

    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      runId,
      status: run.status as CoordinationRunStatus,
      totalTasks,
      completedTasks,
      failedTasks,
      activeTasks,
      blockedTasks,
      progressPercent,
    };
  }
}
