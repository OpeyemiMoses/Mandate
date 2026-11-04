import { prisma } from "@/lib/db";
import { emitCoordinationEvent } from "./events";
import { agentRegistry } from "@/lib/runtime/registry";
import { AgentHandoffStatus, isValidHandoffTransition } from "./types";
import { PolicyEngine } from "@/lib/governance";

export interface CreateHandoffParams {
  runId: string;
  objectiveId: string;
  userId: string;
  sourceAgentId: string;
  destinationAgentId: string;
  taskId: string;
  targetTaskId?: string;
  outputReference: string;
  structuredPayload: Record<string, any>;
  schemaVersion?: string;
  evidenceReferences?: string[];
  idempotencyKey?: string;
}

export interface AcceptHandoffParams {
  handoffId: string;
  destinationAgentId: string;
  userId: string;
  expectedSchema?: Record<string, any>;
}

export interface RejectHandoffParams {
  handoffId: string;
  destinationAgentId: string;
  userId: string;
  reason: string;
}

/**
 * Agent Handoff Protocol Manager
 * Orchestrates validated, schema-checked, replay-protected handoffs between
 * autonomous specialist agents under a single objective.
 */
export class HandoffManager {
  /**
   * Create a structured handoff from a source agent to a downstream destination agent
   */
  public static async createHandoff(params: CreateHandoffParams): Promise<any> {
    const {
      runId,
      objectiveId,
      userId,
      sourceAgentId,
      destinationAgentId,
      taskId,
      targetTaskId,
      outputReference,
      structuredPayload,
      schemaVersion = "1.0.0",
      evidenceReferences = [],
      idempotencyKey,
    } = params;

    // 1. Validate Run and User Ownership
    const run = await prisma.coordinationRun.findFirst({
      where: { id: runId, userId, objectiveId },
    });
    if (!run) {
      throw new Error(`CoordinationRun "${runId}" not found or unauthorized for user "${userId}".`);
    }

    // 2. Check Idempotency Key
    if (idempotencyKey) {
      const existing = await prisma.agentHandoff.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    // 3. Verify Source and Destination Agents
    const [sourceAgent, destAgent] = await Promise.all([
      prisma.agent.findFirst({ where: { id: sourceAgentId, userId } }),
      prisma.agent.findFirst({ where: { id: destinationAgentId, userId } }),
    ]);

    if (!sourceAgent) {
      throw new Error(`Source agent "${sourceAgentId}" not found or unauthorized.`);
    }
    if (!destAgent) {
      throw new Error(`Destination agent "${destinationAgentId}" not found or unauthorized.`);
    }

    // 4. Verify Source Task ownership and state
    const sourceTask = await prisma.coordinationTask.findFirst({
      where: { id: taskId, runId },
    });
    if (!sourceTask) {
      throw new Error(`Task "${taskId}" does not belong to run "${runId}".`);
    }

    // 4.5 Milestone 7 Governance: Handoff Policy Evaluation
    const govEval = await PolicyEngine.evaluate({
      userId,
      agentId: sourceAgentId,
      coordinationRunId: runId,
      objectiveId,
      operation: "agent_handoff",
      resource: destinationAgentId,
      parameters: { sourceAgentType: sourceAgent.type, destAgentType: destAgent.type, taskId },
    });

    if (!govEval.allowed) {
      throw new Error(`Governance Policy Denied Handoff: ${govEval.humanExplanation}`);
    }

    // 5. Persist PENDING handoff
    const handoff = await prisma.agentHandoff.create({
      data: {
        runId,
        objectiveId,
        sourceAgentId,
        destinationAgentId,
        taskId,
        targetTaskId: targetTaskId || null,
        outputReference,
        structuredPayload: JSON.stringify(structuredPayload),
        schemaVersion,
        evidenceReferences: JSON.stringify(evidenceReferences),
        status: "PENDING",
        idempotencyKey: idempotencyKey || null,
      },
    });

    // 6. Record unified coordination audit event
    await emitCoordinationEvent({
      runId,
      objectiveId,
      userId,
      taskId,
      agentId: sourceAgentId,
      eventType: "coordination.handoff_created",
      metadata: {
        handoffId: handoff.id,
        sourceAgentType: sourceAgent.type,
        destinationAgentType: destAgent.type,
        schemaVersion,
        outputReference,
      },
      recordInAuditChain: true,
    });

    return handoff;
  }

  /**
   * Accept an agent handoff with schema validation and replay protection
   */
  public static async acceptHandoff(params: AcceptHandoffParams): Promise<any> {
    const { handoffId, destinationAgentId, userId, expectedSchema } = params;

    // 1. Fetch handoff with related entities
    const handoff = await prisma.agentHandoff.findUnique({
      where: { id: handoffId },
      include: {
        run: true,
        destinationAgent: true,
      },
    });

    if (!handoff) {
      throw new Error(`Handoff "${handoffId}" not found.`);
    }

    if (handoff.run && handoff.run.userId !== userId) {
      throw new Error(`Unauthorized handoff access.`);
    }

    if (handoff.destinationAgentId !== destinationAgentId) {
      throw new Error(
        `Destination agent mismatch: handoff is addressed to "${handoff.destinationAgentId}", but was attempted by "${destinationAgentId}".`
      );
    }

    // 2. Strict Replay Protection: must be in PENDING state
    if (handoff.status !== "PENDING") {
      throw new Error(
        `Handoff replay rejected: handoff "${handoffId}" is already in state "${handoff.status}".`
      );
    }

    // 3. Schema & Content Validation
    let payload: Record<string, any> = {};
    try {
      payload = JSON.parse(handoff.structuredPayload);
    } catch {
      await prisma.agentHandoff.update({
        where: { id: handoffId },
        data: { status: "REJECTED", validationError: "Malformed JSON structuredPayload" },
      });
      throw new Error(`Malformed JSON structuredPayload in handoff.`);
    }

    // Validate expected payload attributes
    if (expectedSchema) {
      for (const [key, expectedType] of Object.entries(expectedSchema)) {
        if (!(key in payload)) {
          const errMsg = `Handoff validation failed: missing required attribute "${key}".`;
          await prisma.agentHandoff.update({
            where: { id: handoffId },
            data: { status: "REJECTED", validationError: errMsg },
          });
          await emitCoordinationEvent({
            runId: handoff.runId || "",
            objectiveId: handoff.objectiveId,
            userId,
            agentId: destinationAgentId,
            eventType: "coordination.handoff_rejected",
            metadata: { handoffId, error: errMsg },
            recordInAuditChain: true,
          });
          throw new Error(errMsg);
        }
        if (typeof payload[key] !== expectedType) {
          const errMsg = `Handoff validation failed: attribute "${key}" expected type "${expectedType}", got "${typeof payload[key]}".`;
          await prisma.agentHandoff.update({
            where: { id: handoffId },
            data: { status: "REJECTED", validationError: errMsg },
          });
          await emitCoordinationEvent({
            runId: handoff.runId || "",
            objectiveId: handoff.objectiveId,
            userId,
            agentId: destinationAgentId,
            eventType: "coordination.handoff_rejected",
            metadata: { handoffId, error: errMsg },
            recordInAuditChain: true,
          });
          throw new Error(errMsg);
        }
      }
    }

    // 4. Atomic Transition to ACCEPTED
    const updated = await prisma.agentHandoff.update({
      where: { id: handoffId },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });

    // 5. Emit audit event
    await emitCoordinationEvent({
      runId: handoff.runId || "",
      objectiveId: handoff.objectiveId,
      userId,
      agentId: destinationAgentId,
      eventType: "coordination.handoff_accepted",
      metadata: {
        handoffId,
        sourceAgentId: handoff.sourceAgentId,
        destinationAgentId,
        schemaVersion: handoff.schemaVersion,
      },
      recordInAuditChain: true,
    });

    return updated;
  }

  /**
   * Explicitly reject a handoff with audit explanation
   */
  public static async rejectHandoff(params: RejectHandoffParams): Promise<any> {
    const { handoffId, destinationAgentId, userId, reason } = params;

    const handoff = await prisma.agentHandoff.findUnique({
      where: { id: handoffId },
      include: { run: true },
    });

    if (!handoff) {
      throw new Error(`Handoff "${handoffId}" not found.`);
    }

    if (handoff.run && handoff.run.userId !== userId) {
      throw new Error(`Unauthorized handoff rejection.`);
    }

    if (handoff.destinationAgentId !== destinationAgentId) {
      throw new Error(`Destination agent mismatch.`);
    }

    if (handoff.status !== "PENDING") {
      throw new Error(`Cannot reject handoff in status "${handoff.status}".`);
    }

    const updated = await prisma.agentHandoff.update({
      where: { id: handoffId },
      data: {
        status: "REJECTED",
        validationError: reason,
      },
    });

    await emitCoordinationEvent({
      runId: handoff.runId || "",
      objectiveId: handoff.objectiveId,
      userId,
      agentId: destinationAgentId,
      eventType: "coordination.handoff_rejected",
      metadata: { handoffId, reason },
      recordInAuditChain: true,
    });

    return updated;
  }

  /**
   * Mark handoff as COMPLETED once downstream task concludes
   */
  public static async completeHandoff(handoffId: string, userId: string): Promise<any> {
    const handoff = await prisma.agentHandoff.findUnique({
      where: { id: handoffId },
      include: { run: true },
    });
    if (!handoff || (handoff.run && handoff.run.userId !== userId)) {
      throw new Error(`Handoff not found or unauthorized.`);
    }

    return prisma.agentHandoff.update({
      where: { id: handoffId },
      data: { status: "COMPLETED" },
    });
  }
}

