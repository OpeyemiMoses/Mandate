import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  evaluatePolicyProposal,
  MandateStateForPolicy,
  PaymentProposal,
} from "@/lib/policy";
import { nearToYocto, yoctoToNear } from "@/lib/yocto";
import { ExecutionBoundaryService } from "@/lib/execution/boundaryService";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/auditLedger";
import { runResearchAndProcurementAgent } from "@/lib/agent/procurementAgent";
import { reserveMandateBudgetAtomic } from "@/lib/objectives/authority";

/**
 * GET /api/tasks - List all tasks for authenticated user
 * POST /api/tasks - AI Agent proposes task with structured intent or natural-language prompt
 */

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);

    const tasks = await prisma.task.findMany({
      where: {
        mandate: { userId: user.id },
      },
      include: {
        agent: { select: { id: true, name: true } },
        mandate: { select: { id: true, name: true } },
        approval: true,
        transaction: true,
        auditLogs: {
          where: { eventType: "POLICY_EVALUATED" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = tasks.map((t) => {
      let policyDecision = undefined;
      if (t.auditLogs && t.auditLogs.length > 0 && t.auditLogs[0].detailsJson) {
        try {
          const details = JSON.parse(t.auditLogs[0].detailsJson);
          policyDecision = details.decision || undefined;
        } catch {}
      }

      return {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        proposedRecipient: t.proposedRecipient,
        proposedAmountNear: t.proposedAmountYocto ? yoctoToNear(t.proposedAmountYocto) : "0",
        proposedAmountYocto: t.proposedAmountYocto || "0",
        rawPrompt: t.rawPrompt,
        taskType: t.taskType,
        requiresPayment: t.requiresPayment,
        planSteps: JSON.parse(t.planStepsJson || "[]"),
        agent: t.agent,
        mandate: t.mandate,
        approval: t.approval,
        transaction: t.transaction,
        policyDecision,
        createdAt: t.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ success: true, tasks: formatted });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    // Branch 1: Natural-Language Research & Procurement Agent Workflow
    if (body.prompt && body.mandateId) {
      const mandate = await prisma.mandate.findFirst({
        where: { id: body.mandateId, userId: user.id },
        include: { wallet: true, agent: true },
      });

      if (!mandate) {
        return NextResponse.json(
          { success: false, error: `Mandate '${body.mandateId}' not found or unauthorized` },
          { status: 404 }
        );
      }

      if (mandate.status !== "ACTIVE") {
        return NextResponse.json(
          {
            success: false,
            verdict: "BLOCK",
            reasonCode: `MANDATE_${mandate.status}`,
            message: `Mandate "${mandate.name}" is ${mandate.status.toLowerCase()}. No new tasks or payments permitted.`,
          },
          { status: 403 }
        );
      }

      if (mandate.agent.status === "PAUSED" || mandate.agent.status === "REVOKED") {
        return NextResponse.json(
          {
            success: false,
            verdict: "BLOCK",
            reasonCode: mandate.agent.status === "PAUSED" ? "AGENT_PAUSED" : "AGENT_REVOKED",
            message: `Agent "${mandate.agent.name}" is ${mandate.agent.status.toLowerCase()} by the owner. No new tasks or payments permitted.`,
          },
          { status: 403 }
        );
      }

      const agentOutput = await runResearchAndProcurementAgent({
        prompt: body.prompt,
        mandateId: mandate.id,
        agentId: mandate.agentId,
        userId: user.id,
        idempotencyKey: body.idempotencyKey,
      });

      const httpStatus = agentOutput.status === "REJECTED" ? 403 : 200;
      return NextResponse.json(
        {
          success: agentOutput.status !== "FAILED",
          verdict: agentOutput.policyVerdict || (agentOutput.status === "REJECTED" ? "BLOCK" : "ALLOW"),
          reasonCode: agentOutput.reasonCode,
          task: {
            id: agentOutput.taskId,
            status: agentOutput.status,
            rawPrompt: body.prompt,
            taskType: "PROCUREMENT",
          },
          approvalId: agentOutput.approvalId,
          txHash: agentOutput.txHash,
          research: {
            requirements: agentOutput.parsedRequirements,
            sources: agentOutput.sourcesReviewed,
            candidates: agentOutput.candidatesDiscovered,
            comparison: agentOutput.comparison,
            recommendation: agentOutput.recommendation,
          },
        },
        { status: httpStatus }
      );
    }

    const title = body.title;
    const description = body.description || body.goal || body.purpose;
    const mandateId = body.mandateId;
    const proposedRecipient = body.proposedRecipient || body.recipient;
    const proposedAmountNear = body.proposedAmountNear || body.amountNear;
    const idempotencyKey = body.idempotencyKey;
    const planSteps = body.planSteps;

    if (!title || !mandateId || !proposedRecipient || !proposedAmountNear) {
      return NextResponse.json(
        { success: false, error: "Missing required task proposal parameters" },
        { status: 400 }
      );
    }

    const mandate = await prisma.mandate.findFirst({
      where: { id: mandateId, userId: user.id },
      include: { wallet: true, agent: true },
    });

    if (!mandate) {
      return NextResponse.json(
        { success: false, error: `Mandate '${mandateId}' not found or unauthorized` },
        { status: 404 }
      );
    }

    // Check if agent is paused or revoked
    if (mandate.agent.status === "PAUSED" || mandate.agent.status === "REVOKED") {
      return NextResponse.json(
        {
          success: false,
          verdict: "BLOCK",
          reasonCode: mandate.agent.status === "PAUSED" ? "AGENT_PAUSED" : "AGENT_REVOKED",
          message: `Agent "${mandate.agent.name}" is ${mandate.agent.status.toLowerCase()} by the owner. No new tasks or payments permitted.`,
        },
        { status: 403 }
      );
    }

    const proposedAmountYocto = nearToYocto(String(proposedAmountNear));
    const effectiveIdemKey =
      idempotencyKey ||
      `idem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Query existing idempotency keys for this mandate
    const existingTasks = await prisma.task.findMany({
      where: { mandateId: mandate.id },
      select: { idempotencyKey: true },
    });
    const existingKeys = new Set(existingTasks.map((t) => t.idempotencyKey));

    // Also check global unique idempotencyKey if specified
    if (effectiveIdemKey) {
      const globalDup = await prisma.task.findUnique({
        where: { idempotencyKey: effectiveIdemKey },
        select: { id: true, status: true },
      });
      if (globalDup) {
        existingKeys.add(effectiveIdemKey);
      }
    }

    // 1. Construct policy proposal for deterministic policy engine
    const proposal: PaymentProposal = {
      taskId: `task-prop-${Date.now()}`,
      recipient: proposedRecipient,
      amountAtomic: proposedAmountYocto,
      purpose: title,
      idempotencyKey: effectiveIdemKey,
    };

    const policyState: MandateStateForPolicy = {
      id: mandate.id,
      name: mandate.name,
      status:
        mandate.status.toLowerCase() === "active"
          ? "active"
          : mandate.status.toLowerCase() === "paused"
          ? "paused"
          : mandate.status.toLowerCase() === "revoked"
          ? "revoked"
          : "expired",
      providerPolicyConfirmed: true, // Synced with OutLayer wallet
      budgetAtomic: mandate.totalBudgetYocto,
      spentAtomic: mandate.spentYocto,
      reservedAtomic: mandate.reservedYocto,
      perTxLimitAtomic: mandate.perTxLimitYocto,
      approvalThresholdAtomic: mandate.approvalThresholdYocto,
      allowedRecipients: JSON.parse(mandate.allowedRecipientsJson || "[]"),
      expiresAtIso: mandate.expiresAt.toISOString(),
    };

    // 2. Evaluate through the Deterministic Policy Engine (9 checks)
    const decision = evaluatePolicyProposal(policyState, proposal, existingKeys);

    // If blocked due to duplicate idempotency, reject without inserting duplicate key
    if (!decision.allowed && decision.reason === "DUPLICATE_PAYMENT") {
      const existingTask = await prisma.task.findUnique({
        where: { idempotencyKey: effectiveIdemKey },
      });

      await recordAuditEvent({
        userId: user.id,
        eventType: "POLICY_EVALUATED",
        verdict: "BLOCKED",
        reasonCode: "DUPLICATE_PAYMENT",
        description: `Policy blocked: Duplicate payment proposal rejected (idempotency key "${effectiveIdemKey}")`,
        details: {
          mandateId: mandate.id,
          agentId: mandate.agentId,
          proposal,
          decision,
          existingTaskId: existingTask?.id,
        },
        mandateId: mandate.id,
        taskId: existingTask?.id,
        agentId: mandate.agentId,
        proposalId: proposal.idempotencyKey,
      });

      return NextResponse.json(
        {
          success: false,
          verdict: "BLOCK",
          reasonCode: "DUPLICATE_PAYMENT",
          message: decision.humanExplanation,
          checks: decision.checks,
          task: existingTask ? { id: existingTask.id, status: existingTask.status } : undefined,
        },
        { status: 403 }
      );
    }

    // 3. Create Task record
    const taskStatus = !decision.allowed
      ? "REJECTED"
      : decision.requiresApproval
      ? "PENDING_APPROVAL"
      : "EXECUTING";

    let task;
    try {
      task = await prisma.task.create({
        data: {
          title,
          description: description || "",
          agentId: mandate.agentId,
          mandateId: mandate.id,
          proposedRecipient,
          proposedAmountYocto,
          idempotencyKey: effectiveIdemKey,
          planStepsJson: JSON.stringify(
            planSteps || [
              `1. Verify recipient ${proposedRecipient}`,
              `2. Check deterministic policy firewall`,
              `3. OutLayer TEE enclave custody execution`,
              `4. Settle transaction hash on NEAR testnet`,
            ]
          ),
          status: taskStatus,
        },
      });
    } catch (createErr: any) {
      if (createErr?.code === "P2002") {
        const existingTask = await prisma.task.findUnique({
          where: { idempotencyKey: effectiveIdemKey },
        });

        await recordAuditEvent({
          userId: user.id,
          eventType: "POLICY_EVALUATED",
          verdict: "BLOCKED",
          reasonCode: "DUPLICATE_PAYMENT",
          description: `Policy blocked: Duplicate payment proposal rejected (idempotency key "${effectiveIdemKey}")`,
          details: {
            mandateId: mandate.id,
            agentId: mandate.agentId,
            proposal,
            existingTaskId: existingTask?.id,
          },
          mandateId: mandate.id,
          taskId: existingTask?.id,
          agentId: mandate.agentId,
          proposalId: proposal.idempotencyKey,
        });

        return NextResponse.json(
          {
            success: false,
            verdict: "BLOCK",
            reasonCode: "DUPLICATE_PAYMENT",
            message: "A payment proposal with this idempotency key has already been submitted.",
            task: existingTask ? { id: existingTask.id, status: existingTask.status } : undefined,
          },
          { status: 403 }
        );
      }
      throw createErr;
    }

    // 4. Log Hash-Chained Audit Record
    await recordAuditEvent({
      userId: user.id,
      eventType: "POLICY_EVALUATED",
      verdict: !decision.allowed
        ? "BLOCKED"
        : decision.requiresApproval
        ? "REQUIRES_APPROVAL"
        : "ALLOWED",
      reasonCode: !decision.allowed ? decision.reason : undefined,
      description: !decision.allowed
        ? `Policy blocked: ${decision.humanExplanation || decision.reason}`
        : decision.requiresApproval
        ? "Policy evaluated: requires human approval"
        : "Policy evaluated: allowed autonomously",
      details: {
        taskId: task.id,
        agentId: mandate.agentId,
        proposal,
        decision,
      },
      mandateId: mandate.id,
      taskId: task.id,
      agentId: mandate.agentId,
      proposalId: proposal.idempotencyKey,
    });

    // 5. Handle Verdict Branches:
    // A) BLOCKED
    if (!decision.allowed) {
      return NextResponse.json(
        {
          success: false,
          verdict: "BLOCK",
          reasonCode: decision.reason,
          message: decision.humanExplanation,
          checks: decision.checks,
          task: {
            id: task.id,
            status: "REJECTED",
          },
        },
        { status: 403 }
      );
    }

    // B) REQUIRES_APPROVAL
    if (decision.requiresApproval) {
      const approval = await prisma.approvalRequest.create({
        data: {
          taskId: task.id,
          mandateId: mandate.id,
          amountYocto: proposedAmountYocto,
          recipient: proposedRecipient,
          reason: decision.reasons.join("; ") || "Exceeds approval threshold",
          status: "PENDING",
        },
      });

      // Reserve budget atomically with concurrency protection
      const reserveResult = await reserveMandateBudgetAtomic({
        mandateId: mandate.id,
        amountYocto: proposedAmountYocto,
      });

      if (!reserveResult.success) {
        return NextResponse.json(
          {
            success: false,
            verdict: "BLOCK",
            reason: reserveResult.reason || "Concurrent budget exhaustion",
          },
          { status: 403 }
        );
      }

      return NextResponse.json({
        success: true,
        verdict: "REQUIRES_APPROVAL",
        reasons: decision.reasons,
        checks: decision.checks,
        approvalId: approval.id,
        task: {
          id: task.id,
          status: "PENDING_APPROVAL",
        },
      });
    }

    // C) ALLOW -> Execute via ExecutionBoundaryService
    const execResult = await ExecutionBoundaryService.execute({
      mandateId: mandate.id,
      agentId: mandate.agentId,
      operation: "task_autonomous_execution",
      recipient: proposedRecipient,
      amountYocto: proposedAmountYocto,
      idempotencyKey: effectiveIdemKey,
      userId: user.id,
      taskId: task.id,
      parameters: {
        title: body.title,
        description: body.description,
        recipient: proposedRecipient,
        amountYocto: proposedAmountYocto,
      },
    });

    if (!execResult.success) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "FAILED" },
      });

      return NextResponse.json(
        {
          success: false,
          verdict: "ALLOW_BUT_CHAIN_REFUSED",
          error: execResult.error,
          reasons: execResult.error ? [execResult.error] : [],
          task: {
            id: task.id,
            status: "FAILED",
          },
        },
        { status: 502 }
      );
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { status: "COMPLETED" },
    });

    return NextResponse.json({
      success: true,
      verdict: "ALLOW",
      task: {
        id: task.id,
        status: "COMPLETED",
        txHash: execResult.txHash,
        amountNear: proposedAmountNear,
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
