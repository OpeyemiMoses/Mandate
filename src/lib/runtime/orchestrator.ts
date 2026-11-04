import { prisma } from "@/lib/db";
import { agentRegistry, registerDefaultAgents } from "./registry";
import { emitRuntimeEvent } from "./events";
import { toolExecutor } from "../tools/executor";
import { toolRegistry } from "../tools/registry";
import { getPermittedToolsForAgent } from "../tools/access";
import {
  ExecutionStatus,
  StartExecutionParams,
  AgentExecutionContext,
  AgentExecutionResult,
  isValidTransition,
  isTerminalStatus,
} from "./types";
import crypto from "crypto";
import { PolicyEngine } from "@/lib/governance";
import { agentExecutionCounter } from "@/lib/observability";
import { ExecutionGateService } from "@/lib/operations/executionGateService";

// Ensure default specialist agents are registered
registerDefaultAgents();

export interface ExecutionFilterOptions {
  agentId?: string;
  userId: string;
  status?: ExecutionStatus;
  limit?: number;
  offset?: number;
}

const MAX_CONCURRENT_PER_USER = 5;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class ExecutionOrchestrator {
  /**
   * Start a new agent execution instance
   */
  public async startExecution(params: StartExecutionParams): Promise<{
    executionId: string;
    status: ExecutionStatus;
    result?: AgentExecutionResult;
    error?: string;
  }> {
    // 0. OPERATIONAL CONTROL PLANE CHECK (Milestone 9.4)
    await ExecutionGateService.assertAgentExecutionAllowed("AgentExecutionOrchestrator.startExecution");

    const { agentId, userId, input, mandateId, idempotencyKey } = params;

    // 1. Validate Owner Authorization & Retrieve Agent Definition
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
      include: {
        user: { select: { id: true, nearAccountId: true } },
        mandates: true,
      },
    });

    if (!agent) {
      throw new Error(`Agent "${agentId}" not found or unauthorized for this user`);
    }

    if (agent.status === "PAUSED") {
      throw new Error(`Agent "${agent.name}" is paused. Unfreeze agent card before execution.`);
    }

    if (agent.status === "REVOKED") {
      throw new Error(`Agent "${agent.name}" has been revoked.`);
    }

    // 2. Resolve Registered Agent Implementation
    const agentImpl = agentRegistry.get(agent.type, agent.version);
    if (!agentImpl) {
      throw new Error(
        `Agent type "${agent.type}" (v${agent.version}) is not registered in the Universal Agent Runtime`
      );
    }

    // 3. Validate Assigned Mandate if provided
    let effectiveMandateId = mandateId;
    if (!effectiveMandateId && agent.mandates.length > 0) {
      const activeMandate = agent.mandates.find((m) => m.status === "ACTIVE");
      if (activeMandate) effectiveMandateId = activeMandate.id;
    }

    if (effectiveMandateId) {
      const mandate = await prisma.mandate.findFirst({
        where: { id: effectiveMandateId, userId },
      });
      if (!mandate) {
        throw new Error(`Mandate "${effectiveMandateId}" not found or unauthorized`);
      }
      if (mandate.status !== "ACTIVE") {
        throw new Error(`Mandate "${mandate.name}" is ${mandate.status.toLowerCase()}. Cannot execute.`);
      }
    }

    // 3.5 Milestone 7 Governance: Centralized Policy Evaluation
    const govEval = await PolicyEngine.evaluate({
      userId,
      agentId: agent.id,
      agentType: agent.type,
      capabilities: agentImpl.getCapabilities().map((c) => c.id),
      mandateId: effectiveMandateId || undefined,
      operation: "agent_execution",
      resource: agent.id,
      parameters: typeof input === "object" ? (input as any) : { prompt: input },
    });

    if (!govEval.allowed) {
      throw new Error(`Governance Policy Denied Agent Execution: ${govEval.humanExplanation}`);
    }

    // 4. Idempotency Check
    if (idempotencyKey) {
      const existing = await prisma.agentExecution.findUnique({
        where: { idempotencyKey },
        include: { events: { orderBy: { timestamp: "asc" } } },
      });

      if (existing) {
        if (existing.userId !== userId) {
          throw new Error("Idempotency key collision across user boundary");
        }

        let parsedOutput: AgentExecutionResult | undefined = undefined;
        try {
          if (existing.outputJson) parsedOutput = JSON.parse(existing.outputJson);
        } catch {}

        return {
          executionId: existing.id,
          status: existing.status as ExecutionStatus,
          result: parsedOutput,
        };
      }
    }

    // 5. Concurrency Limit Check per User
    const activeCount = await prisma.agentExecution.count({
      where: {
        userId,
        status: { in: ["INITIALIZING", "RUNNING"] },
      },
    });

    if (activeCount >= MAX_CONCURRENT_PER_USER) {
      throw new Error(
        `User concurrency limit reached (${MAX_CONCURRENT_PER_USER} active executions). Please wait for prior executions to complete.`
      );
    }

    // 6. Create Persistent Execution Record (Initial State: QUEUED)
    const lockToken = crypto.randomUUID();
    const effectiveIdemKey = idempotencyKey || `exec-idem-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const rawInputJson = typeof input === "string" ? JSON.stringify({ prompt: input }) : JSON.stringify(input);

    const executionRecord = await prisma.agentExecution.create({
      data: {
        agentId: agent.id,
        userId: agent.userId,
        mandateId: effectiveMandateId || null,
        status: "QUEUED",
        inputJson: rawInputJson,
        contextJson: JSON.stringify({
          agentName: agent.name,
          agentType: agent.type,
          version: agent.version,
          startedBy: agent.user.nearAccountId,
        }),
        currentStep: "Queued for runtime execution",
        idempotencyKey: effectiveIdemKey,
        lockToken,
        lockedAt: new Date(),
      },
    });

    try {
      agentExecutionCounter.add(1, { agentType: agent.type, status: "STARTED" });
    } catch {}

    await emitRuntimeEvent({
      executionId: executionRecord.id,
      agentId: agent.id,
      userId: agent.userId,
      eventType: "execution.created",
      metadata: { idempotencyKey: effectiveIdemKey, mandateId: effectiveMandateId },
      mandateId: effectiveMandateId,
    });

    await emitRuntimeEvent({
      executionId: executionRecord.id,
      agentId: agent.id,
      userId: agent.userId,
      eventType: "execution.queued",
      metadata: { queuedAt: new Date().toISOString() },
      mandateId: effectiveMandateId,
    });

    // 7. Transition to INITIALIZING and Execute
    return await this.runExecutionLoop({
      executionId: executionRecord.id,
      agentImpl,
      agent,
      userId,
      mandateId: effectiveMandateId,
      lockToken,
      input,
      contextJson: executionRecord.contextJson || "{}",
      retryCount: 0,
    });
  }

  /**
   * Internal Execution Driver
   */
  private async runExecutionLoop(params: {
    executionId: string;
    agentImpl: any;
    agent: any;
    userId: string;
    mandateId?: string;
    lockToken: string;
    input: Record<string, unknown> | string;
    contextJson: string;
    retryCount: number;
  }): Promise<{
    executionId: string;
    status: ExecutionStatus;
    result?: AgentExecutionResult;
    error?: string;
  }> {
    const { executionId, agentImpl, agent, userId, mandateId, lockToken, input, retryCount } = params;

    const abortController = new AbortController();

    // Context helper functions for the executing agent
    const contextObj: AgentExecutionContext = {
      executionId,
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.type,
      userId,
      ownerNearAccountId: agent.user.nearAccountId,
      mandateId,
      input,
      context: JSON.parse(params.contextJson || "{}"),
      capabilities: agentImpl.getCapabilities().map((c: any) => c.id),
      cancellationSignal: abortController.signal,
      currentStep: "Initializing",
      retryCount,
      emitEvent: async (eventType: string, metadata?: Record<string, unknown>) => {
        await emitRuntimeEvent({
          executionId,
          agentId: agent.id,
          userId,
          eventType,
          metadata,
          mandateId,
        });
      },
      updateStep: async (step: string, contextPatch?: Record<string, unknown>) => {
        const nextContext = contextPatch
          ? { ...contextObj.context, ...contextPatch }
          : contextObj.context;
        contextObj.context = nextContext;
        contextObj.currentStep = step;

        await prisma.agentExecution.update({
          where: { id: executionId },
          data: {
            currentStep: step,
            contextJson: JSON.stringify(nextContext),
          },
        });
      },
      checkAborted: () => {
        return abortController.signal.aborted;
      },
      tools: {
        listTools: async () => {
          return await getPermittedToolsForAgent(agent.id, userId);
        },
        getTool: async (toolId: string) => {
          return toolRegistry.getSummary(toolId) || null;
        },
        invokeTool: async (
          toolId: string,
          operation: string,
          params: Record<string, unknown>,
          idempotencyKey?: string
        ) => {
          return await toolExecutor.execute({
            agentId: agent.id,
            userId,
            executionId,
            toolId,
            operation,
            params,
            idempotencyKey,
            signal: abortController.signal,
          });
        },
      },
    };

    try {
      // Transition QUEUED -> INITIALIZING
      await this.transitionStatus(executionId, "INITIALIZING", lockToken);
      await agentImpl.initialize(contextObj);

      // Transition INITIALIZING -> RUNNING
      await this.transitionStatus(executionId, "RUNNING", lockToken);
      await emitRuntimeEvent({
        executionId,
        agentId: agent.id,
        userId,
        eventType: "execution.started",
        metadata: { startedAt: new Date().toISOString() },
        mandateId,
      });

      // Update agent last execution timestamp and execution count
      await prisma.agent.update({
        where: { id: agent.id },
        data: {
          lastExecutedAt: new Date(),
          executionCount: { increment: 1 },
        },
      });

      // Execute Agent Logic
      const result: AgentExecutionResult = await agentImpl.execute(contextObj, abortController.signal);

      // Handle Result Status Transitions
      if (result.status === "WAITING_FOR_APPROVAL") {
        await this.transitionStatus(executionId, "WAITING_FOR_APPROVAL", lockToken);
        await prisma.agentExecution.update({
          where: { id: executionId },
          data: {
            outputJson: JSON.stringify(result),
            lockToken: null,
            lockedAt: null,
          },
        });
        return { executionId, status: "WAITING_FOR_APPROVAL", result };
      }

      if (result.status === "FAILED") {
        await this.transitionStatus(executionId, "FAILED", lockToken);
        await prisma.agentExecution.update({
          where: { id: executionId },
          data: {
            outputJson: JSON.stringify(result),
            errorDetails: result.errors.join("; ") || "Agent execution returned failed status",
            completedAt: new Date(),
            lockToken: null,
            lockedAt: null,
          },
        });
        await emitRuntimeEvent({
          executionId,
          agentId: agent.id,
          userId,
          eventType: "execution.failed",
          metadata: { errors: result.errors },
          mandateId,
        });
        return { executionId, status: "FAILED", result, error: result.errors.join("; ") };
      }

      if (result.status === "CANCELLED") {
        await this.transitionStatus(executionId, "CANCELLED", lockToken);
        await prisma.agentExecution.update({
          where: { id: executionId },
          data: {
            outputJson: JSON.stringify(result),
            completedAt: new Date(),
            lockToken: null,
            lockedAt: null,
          },
        });
        await emitRuntimeEvent({
          executionId,
          agentId: agent.id,
          userId,
          eventType: "execution.cancelled",
          metadata: { cancelledAt: new Date().toISOString() },
          mandateId,
        });
        return { executionId, status: "CANCELLED", result };
      }

      // Transition RUNNING -> COMPLETED
      await this.transitionStatus(executionId, "COMPLETED", lockToken);
      await prisma.agentExecution.update({
        where: { id: executionId },
        data: {
          outputJson: JSON.stringify(result),
          currentStep: "Execution completed successfully",
          completedAt: new Date(),
          lockToken: null,
          lockedAt: null,
        },
      });

      await emitRuntimeEvent({
        executionId,
        agentId: agent.id,
        userId,
        eventType: "execution.completed",
        metadata: {
          completedAt: new Date().toISOString(),
          summary: result.summary,
          proposedActionsCount: result.proposedActions.length,
        },
        mandateId,
      });

      try {
        agentExecutionCounter.add(1, { agentType: agent.type, status: "COMPLETED" });
      } catch {}

      return { executionId, status: "COMPLETED", result };
    } catch (err: any) {
      const isAbort = abortController.signal.aborted || err.name === "AbortError";
      const finalStatus: ExecutionStatus = isAbort ? "CANCELLED" : "FAILED";

      try {
        await prisma.agentExecution.update({
          where: { id: executionId },
          data: {
            status: finalStatus,
            errorDetails: err.message || "Unknown runtime exception",
            completedAt: new Date(),
            lockToken: null,
            lockedAt: null,
          },
        });

        await emitRuntimeEvent({
          executionId,
          agentId: agent.id,
          userId,
          eventType: isAbort ? "execution.cancelled" : "execution.failed",
          metadata: { error: err.message, stack: err.stack },
          mandateId,
        });

        try {
          agentExecutionCounter.add(1, { agentType: agent.type, status: finalStatus });
        } catch {}
      } catch (logErr) {
        console.error("Failed to persist execution error state:", logErr);
      }

      return {
        executionId,
        status: finalStatus,
        error: err.message || "Execution failed",
      };
    }
  }

  /**
   * Request Pause of a Running Execution
   */
  public async pauseExecution(
    executionId: string,
    userId: string
  ): Promise<{ ok: boolean; status: ExecutionStatus; error?: string }> {
    const execution = await prisma.agentExecution.findFirst({
      where: { id: executionId, userId },
      include: { agent: true },
    });

    if (!execution) {
      throw new Error(`Execution "${executionId}" not found or access denied`);
    }

    const currentStatus = execution.status as ExecutionStatus;
    if (currentStatus !== "RUNNING") {
      throw new Error(`Cannot pause execution in status "${currentStatus}". Only RUNNING executions can be paused.`);
    }

    await this.transitionStatus(executionId, "PAUSE_REQUESTED");
    await emitRuntimeEvent({
      executionId,
      agentId: execution.agentId,
      userId,
      eventType: "execution.pause_requested",
      metadata: { requestedAt: new Date().toISOString() },
      mandateId: execution.mandateId || undefined,
    });

    // Notify agent implementation
    const agentImpl = agentRegistry.get(execution.agent.type, execution.agent.version);
    if (agentImpl) {
      await agentImpl.pause(executionId);
    }

    // Transition to PAUSED
    await this.transitionStatus(executionId, "PAUSED");
    await prisma.agentExecution.update({
      where: { id: executionId },
      data: { lockToken: null, lockedAt: null },
    });

    await emitRuntimeEvent({
      executionId,
      agentId: execution.agentId,
      userId,
      eventType: "execution.paused",
      metadata: { pausedAt: new Date().toISOString() },
      mandateId: execution.mandateId || undefined,
    });

    return { ok: true, status: "PAUSED" };
  }

  /**
   * Resume a Paused Execution
   */
  public async resumeExecution(
    executionId: string,
    userId: string
  ): Promise<{ ok: boolean; status: ExecutionStatus; error?: string }> {
    const execution = await prisma.agentExecution.findFirst({
      where: { id: executionId, userId },
      include: {
        agent: {
          include: { user: { select: { nearAccountId: true } } },
        },
      },
    });

    if (!execution) {
      throw new Error(`Execution "${executionId}" not found or access denied`);
    }

    const currentStatus = execution.status as ExecutionStatus;
    if (currentStatus !== "PAUSED") {
      throw new Error(`Cannot resume execution in status "${currentStatus}". Only PAUSED executions can be resumed.`);
    }

    // Check if agent itself is active
    if (execution.agent.status !== "ACTIVE") {
      throw new Error(`Agent is ${execution.agent.status.toLowerCase()}. Cannot resume execution.`);
    }

    const agentImpl = agentRegistry.get(execution.agent.type, execution.agent.version);
    if (!agentImpl) {
      throw new Error(`Agent implementation "${execution.agent.type}" not found`);
    }

    const lockToken = crypto.randomUUID();
    await this.transitionStatus(executionId, "RUNNING", lockToken);
    await emitRuntimeEvent({
      executionId,
      agentId: execution.agentId,
      userId,
      eventType: "execution.resumed",
      metadata: { resumedAt: new Date().toISOString() },
      mandateId: execution.mandateId || undefined,
    });

    await agentImpl.resume(executionId);

    // Continue execution loop asynchronously or inline
    let inputParsed = {};
    try {
      inputParsed = JSON.parse(execution.inputJson);
    } catch {}

    // Continue execution loop asynchronously in background
    void this.runExecutionLoop({
      executionId,
      agentImpl,
      agent: execution.agent,
      userId,
      mandateId: execution.mandateId || undefined,
      lockToken,
      input: inputParsed,
      contextJson: execution.contextJson || "{}",
      retryCount: execution.retryCount,
    }).catch((err) => {
      console.error(`Unhandled error during resumed execution ${executionId}:`, err);
    });

    return { ok: true, status: "RUNNING" };
  }

  /**
   * Cancel an In-Progress or Pending Execution
   */
  public async cancelExecution(
    executionId: string,
    userId: string
  ): Promise<{ ok: boolean; status: ExecutionStatus; error?: string }> {
    const execution = await prisma.agentExecution.findFirst({
      where: { id: executionId, userId },
      include: { agent: true },
    });

    if (!execution) {
      throw new Error(`Execution "${executionId}" not found or access denied`);
    }

    const currentStatus = execution.status as ExecutionStatus;
    if (isTerminalStatus(currentStatus)) {
      throw new Error(`Execution "${executionId}" is already in terminal state "${currentStatus}"`);
    }

    await this.transitionStatus(executionId, "CANCEL_REQUESTED");
    await emitRuntimeEvent({
      executionId,
      agentId: execution.agentId,
      userId,
      eventType: "execution.cancel_requested",
      metadata: { requestedAt: new Date().toISOString() },
      mandateId: execution.mandateId || undefined,
    });

    // Notify implementation to abort
    const agentImpl = agentRegistry.get(execution.agent.type, execution.agent.version);
    if (agentImpl) {
      await agentImpl.cancel(executionId);
    }

    // Acknowledge terminal cancellation
    await this.transitionStatus(executionId, "CANCELLED");
    await prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        completedAt: new Date(),
        lockToken: null,
        lockedAt: null,
      },
    });

    await emitRuntimeEvent({
      executionId,
      agentId: execution.agentId,
      userId,
      eventType: "execution.cancelled",
      metadata: { cancelledAt: new Date().toISOString() },
      mandateId: execution.mandateId || undefined,
    });

    return { ok: true, status: "CANCELLED" };
  }

  /**
   * Retrieve Single Execution with Full Timeline
   */
  public async getExecution(
    executionId: string,
    userId: string
  ): Promise<any> {
    const execution = await prisma.agentExecution.findFirst({
      where: { id: executionId, userId },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            type: true,
            version: true,
            status: true,
            colorVariant: true,
          },
        },
        mandate: {
          select: {
            id: true,
            name: true,
            totalBudgetYocto: true,
            spentYocto: true,
          },
        },
        events: { orderBy: { timestamp: "asc" } },
      },
    });

    if (!execution) {
      throw new Error(`Execution "${executionId}" not found or unauthorized`);
    }

    let parsedInput = {};
    let parsedOutput = null;
    let parsedContext = {};

    try {
      parsedInput = JSON.parse(execution.inputJson);
    } catch {}
    try {
      if (execution.outputJson) parsedOutput = JSON.parse(execution.outputJson);
    } catch {}
    try {
      if (execution.contextJson) parsedContext = JSON.parse(execution.contextJson);
    } catch {}

    return {
      id: execution.id,
      agentId: execution.agentId,
      agent: execution.agent,
      userId: execution.userId,
      mandateId: execution.mandateId,
      mandate: execution.mandate,
      status: execution.status,
      currentStep: execution.currentStep,
      input: parsedInput,
      inputJson: execution.inputJson,
      output: parsedOutput,
      outputJson: execution.outputJson,
      context: parsedContext,
      contextJson: execution.contextJson,
      errorDetails: execution.errorDetails,
      retryCount: execution.retryCount,
      maxRetries: execution.maxRetries,
      idempotencyKey: execution.idempotencyKey,
      startedAt: execution.startedAt?.toISOString() || execution.createdAt.toISOString(),
      completedAt: execution.completedAt?.toISOString() || null,
      updatedAt: execution.updatedAt.toISOString(),
      events: execution.events.map((e) => {
        let meta = {};
        try {
          meta = JSON.parse(e.metadataJson || "{}");
        } catch {}
        return {
          id: e.id,
          eventType: e.eventType,
          timestamp: e.timestamp.toISOString(),
          metadata: meta,
        };
      }),
    };
  }

  /**
   * List Executions with Filtering
   */
  public async listExecutions(options: ExecutionFilterOptions): Promise<any[]> {
    const { agentId, userId, status, limit = 50, offset = 0 } = options;

    const where: any = { userId };
    if (agentId) where.agentId = agentId;
    if (status) where.status = status;

    const executions = await prisma.agentExecution.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true, type: true, colorVariant: true } },
        mandate: { select: { id: true, name: true } },
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    return executions.map((e) => {
      let parsedOutput = null;
      try {
        if (e.outputJson) parsedOutput = JSON.parse(e.outputJson);
      } catch {}

      return {
        id: e.id,
        agentId: e.agentId,
        agent: e.agent,
        mandateId: e.mandateId,
        mandate: e.mandate,
        status: e.status,
        currentStep: e.currentStep,
        summary: parsedOutput?.summary || e.currentStep || "Runtime Execution",
        errorDetails: e.errorDetails,
        eventCount: e._count.events,
        startedAt: e.startedAt?.toISOString() || e.createdAt.toISOString(),
        completedAt: e.completedAt?.toISOString() || null,
        createdAt: e.createdAt.toISOString(),
      };
    });
  }

  /**
   * Recover Orphaned Executions (Post-restart recovery)
   */
  public async recoverOrphanedExecutions(timeoutMs: number = LOCK_TIMEOUT_MS): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMs);

    const orphaned = await prisma.agentExecution.findMany({
      where: {
        status: { in: ["INITIALIZING", "RUNNING", "PAUSE_REQUESTED", "CANCEL_REQUESTED"] },
        lockedAt: { lt: cutoff },
      },
      include: { agent: true },
    });

    let recoveredCount = 0;

    for (const exec of orphaned) {
      if (exec.retryCount < exec.maxRetries) {
        // Safe to retry / requeue
        await prisma.agentExecution.update({
          where: { id: exec.id },
          data: {
            status: "QUEUED",
            retryCount: { increment: 1 },
            currentStep: `Recovered orphaned execution after server restart (Attempt ${exec.retryCount + 1}/${exec.maxRetries})`,
            lockToken: null,
            lockedAt: null,
          },
        });

        await emitRuntimeEvent({
          executionId: exec.id,
          agentId: exec.agentId,
          userId: exec.userId,
          eventType: "execution.recovered",
          metadata: { previousStatus: exec.status, attempt: exec.retryCount + 1 },
          mandateId: exec.mandateId || undefined,
        });

        recoveredCount++;
      } else {
        // Exceeded max retries -> Fail closed
        await prisma.agentExecution.update({
          where: { id: exec.id },
          data: {
            status: "FAILED",
            errorDetails: `Orphaned execution exceeded max retries (${exec.maxRetries}). Failed closed for safety.`,
            completedAt: new Date(),
            lockToken: null,
            lockedAt: null,
          },
        });

        await emitRuntimeEvent({
          executionId: exec.id,
          agentId: exec.agentId,
          userId: exec.userId,
          eventType: "execution.failed",
          metadata: { reason: "ORPHANED_EXCEEDED_MAX_RETRIES" },
          mandateId: exec.mandateId || undefined,
        });

        recoveredCount++;
      }
    }

    // Also reconcile and recover any orphaned budget reservations
    try {
      const { reconcileAndRecoverAbandonedReservations } = await import("@/lib/objectives/reservationRecovery");
      await reconcileAndRecoverAbandonedReservations();
    } catch (err) {
      console.error("[recoverOrphanedExecutions] Error reconciling abandoned reservations:", err);
    }

    return recoveredCount;
  }

  /**
   * Public interface to request a centrally enforced state transition
   */
  public async transition(
    executionId: string,
    targetStatus: ExecutionStatus,
    options?: { reason?: string; lockToken?: string }
  ): Promise<void> {
    return await this.transitionStatus(executionId, targetStatus, options?.lockToken);
  }

  /**
   * Centrally Enforced State Transition
   */
  private async transitionStatus(
    executionId: string,
    targetStatus: ExecutionStatus,
    newLockToken?: string
  ): Promise<void> {
    const current = await prisma.agentExecution.findUnique({
      where: { id: executionId },
      select: { status: true },
    });

    if (!current) {
      throw new Error(`Execution "${executionId}" not found`);
    }

    const currentStatus = current.status as ExecutionStatus;
    if (!isValidTransition(currentStatus, targetStatus)) {
      throw new Error(
        `Invalid execution status transition from "${currentStatus}" to "${targetStatus}". Enforced by Universal Agent Runtime.`
      );
    }

    const updateData: any = {
      status: targetStatus,
    };

    if (targetStatus === "INITIALIZING" || targetStatus === "RUNNING") {
      updateData.startedAt = new Date();
    }
    if (newLockToken !== undefined) {
      updateData.lockToken = newLockToken;
      updateData.lockedAt = new Date();
    }

    await prisma.agentExecution.update({
      where: { id: executionId },
      data: updateData,
    });
  }
}

// Global Singleton Orchestrator Instance
export const executionOrchestrator = new ExecutionOrchestrator();
