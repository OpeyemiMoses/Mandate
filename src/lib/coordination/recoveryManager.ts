import { prisma } from "@/lib/db";
import { emitCoordinationEvent } from "./events";
import { selectAgentForRequirement } from "@/lib/objectives/agentSelector";
import { releaseMandateBudgetAtomic } from "@/lib/objectives/authority";

export interface ReassignTaskParams {
  runId: string;
  taskId: string;
  userId: string;
  reason: string;
  excludeAgentId?: string;
}

export interface ReassignTaskResult {
  success: boolean;
  newAgentId?: string;
  assignmentId?: string;
  reason?: string;
}

/**
 * Coordination Recovery Manager
 * Manages task failure recovery, safe agent reassignment, cascade failure prevention,
 * and cancellation propagation.
 */
export class CoordinationRecoveryManager {
  /**
   * Reassign a failed, timed out, or blocked task to an alternative capable agent
   */
  public static async reassignTask(params: ReassignTaskParams): Promise<ReassignTaskResult> {
    const { runId, taskId, userId, reason, excludeAgentId } = params;

    // 1. Fetch task and current run
    const task = await prisma.coordinationTask.findFirst({
      where: { id: taskId, runId },
      include: { run: { include: { objective: true } }, assignment: true },
    });

    if (!task) {
      return { success: false, reason: "Task not found." };
    }

    if (task.run.userId !== userId) {
      return { success: false, reason: "Unauthorized." };
    }

    // Safety invariant: do not reassign if active unreleased reservation exists
    if (task.reservedAmountYocto && BigInt(task.reservedAmountYocto) > BigInt(0)) {
      if (task.run.mandateId) {
        await releaseMandateBudgetAtomic({
          mandateId: task.run.mandateId,
          amountYocto: task.reservedAmountYocto,
        });
        await prisma.coordinationTask.update({
          where: { id: taskId },
          data: { reservedAmountYocto: "0" },
        });
      }
    }

    // 2. Find alternative capable agent
    let reqCaps: string[] = [];
    try {
      reqCaps = JSON.parse(task.requiredCapabilitiesJson || "[]");
    } catch {}

    const selection = await selectAgentForRequirement({
      userId,
      requirement: {
        agentType: task.agentType,
        requiredCapabilities: reqCaps,
      },
      mandateId: task.run.mandateId,
    });

    if (!selection.matched || !selection.selectedAgent) {
      return {
        success: false,
        reason: `No alternative capable agent available for capabilities: [${reqCaps.join(", ")}].`,
      };
    }

    const newAgent = selection.selectedAgent;
    const previousAgentId = task.assignedAgentId || task.assignment?.agentId;

    // 3. Update or create assignment
    let updatedAssignment: any;
    if (task.assignment) {
      updatedAssignment = await prisma.agentAssignment.update({
        where: { id: task.assignment.id },
        data: {
          agentId: newAgent.id,
          assignedCapabilitiesJson: JSON.stringify(reqCaps),
          status: "REASSIGNED",
          reassignedFromAgentId: previousAgentId || null,
          reassignmentReason: reason,
          assignedAt: new Date(),
        },
      });
    } else {
      updatedAssignment = await prisma.agentAssignment.create({
        data: {
          runId,
          taskId: task.id,
          agentId: newAgent.id,
          assignedCapabilitiesJson: JSON.stringify(reqCaps),
          status: "ASSIGNED",
          reassignedFromAgentId: previousAgentId || null,
          reassignmentReason: reason,
        },
      });
    }

    // 4. Reset task to READY
    await prisma.coordinationTask.update({
      where: { id: taskId },
      data: {
        assignedAgentId: newAgent.id,
        status: "READY",
        errorDetails: null,
      },
    });

    // 5. Emit unified event
    await emitCoordinationEvent({
      runId,
      objectiveId: task.run.objectiveId,
      userId,
      taskId: task.id,
      agentId: newAgent.id,
      eventType: "coordination.task_reassigned",
      metadata: {
        previousAgentId,
        newAgentId: newAgent.id,
        reason,
      },
      recordInAuditChain: true,
    });

    return {
      success: true,
      newAgentId: newAgent.id,
      assignmentId: updatedAssignment.id,
    };
  }

  /**
   * Block downstream tasks when an upstream dependency fails
   */
  public static async blockDownstreamTasks(runId: string, failedStepId: string): Promise<string[]> {
    const tasks = await prisma.coordinationTask.findMany({
      where: { runId, status: { in: ["PENDING", "READY"] } },
    });

    const blockedIds: string[] = [];

    for (const t of tasks) {
      let deps: string[] = [];
      try {
        deps = JSON.parse(t.dependenciesJson || "[]");
      } catch {}

      if (deps.includes(failedStepId)) {
        await prisma.coordinationTask.update({
          where: { id: t.id },
          data: {
            status: "BLOCKED",
            errorDetails: `Blocked due to failed upstream dependency "${failedStepId}".`,
          },
        });
        blockedIds.push(t.id);
        // Recursively block any tasks that depend on this one
        const furtherBlocked = await this.blockDownstreamTasks(runId, t.stepId);
        blockedIds.push(...furtherBlocked);
      }
    }

    return blockedIds;
  }

  /**
   * Propagate cancellation across entire coordination run, releasing leases & budgets
   */
  public static async cancelCoordinationRun(runId: string, userId: string, reason?: string): Promise<void> {
    const run = await prisma.coordinationRun.findFirst({
      where: { id: runId, userId },
      include: { tasks: { include: { lease: true } } },
    });

    if (!run) {
      throw new Error(`CoordinationRun "${runId}" not found or unauthorized.`);
    }

    // 1. Mark run CANCELLED
    await prisma.coordinationRun.update({
      where: { id: runId },
      data: {
        status: "CANCELLED",
        errorDetails: reason || "Cancelled by user request.",
        completedAt: new Date(),
      },
    });

    // 2. Mark active/pending tasks CANCELLED and release active leases
    for (const task of run.tasks) {
      if (["PENDING", "READY", "ASSIGNED", "RUNNING", "WAITING_HANDOFF"].includes(task.status)) {
        await prisma.coordinationTask.update({
          where: { id: task.id },
          data: {
            status: "CANCELLED",
            errorDetails: reason || "Run was cancelled.",
          },
        });
      }

      if (task.lease && !task.lease.isReleased) {
        await prisma.taskLease.update({
          where: { id: task.lease.id },
          data: { isReleased: true },
        });
      }

      // Safety: Release any remaining active budget reservation
      if (task.reservedAmountYocto && BigInt(task.reservedAmountYocto) > BigInt(0) && run.mandateId) {
        try {
          await releaseMandateBudgetAtomic({
            mandateId: run.mandateId,
            amountYocto: task.reservedAmountYocto,
          });
          await prisma.coordinationTask.update({
            where: { id: task.id },
            data: { reservedAmountYocto: "0" },
          });
        } catch {}
      }
    }

    // 3. Emit event
    await emitCoordinationEvent({
      runId,
      objectiveId: run.objectiveId,
      userId,
      mandateId: run.mandateId,
      eventType: "coordination.cancelled",
      metadata: { reason: reason || "Cancelled by user" },
      recordInAuditChain: true,
    });
  }
}
