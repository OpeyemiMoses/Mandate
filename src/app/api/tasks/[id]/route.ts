import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { yoctoToNear } from "@/lib/yocto";
import { ExecutionBoundaryService } from "@/lib/execution/boundaryService";
import { recordAuditEvent } from "@/lib/auditLedger";

/**
 * GET /api/tasks/[id] - Fetch detailed task state, execution timeline, policy checks, and audit history
 * POST /api/tasks/[id] - Execute or retry an allowed task via OutLayer TEE
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = await params;

    const task = await prisma.task.findFirst({
      where: {
        id,
        mandate: { userId: user.id },
      },
      include: {
        agent: {
          include: {
            wallet: {
              select: {
                id: true,
                nearAccountId: true,
                network: true,
                isFrozen: true,
              },
            },
          },
        },
        mandate: {
          select: {
            id: true,
            name: true,
            status: true,
            totalBudgetYocto: true,
            spentYocto: true,
            reservedYocto: true,
            perTxLimitYocto: true,
            approvalThresholdYocto: true,
            allowedRecipientsJson: true,
            expiresAt: true,
          },
        },
        approval: {
          include: {
            approver: {
              select: {
                id: true,
                nearAccountId: true,
              },
            },
          },
        },
        transaction: true,
        researchSession: true,
        auditLogs: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: "Task not found or access denied" },
        { status: 404 }
      );
    }

    // Extract deterministic policy checks from audit log if available
    let policyDecision = null;
    const policyAudit = task.auditLogs.find(
      (log) => log.eventType === "POLICY_EVALUATED"
    );
    if (policyAudit?.detailsJson) {
      try {
        const parsed = JSON.parse(policyAudit.detailsJson);
        policyDecision = parsed.decision || null;
      } catch {}
    }

    const formatted = {
      id: task.id,
      title: task.title,
      description: task.description,
      rawPrompt: task.rawPrompt,
      taskType: task.taskType,
      requiresPayment: task.requiresPayment,
      status: task.status,
      aiPlannerModel: task.aiPlannerModel,
      proposedRecipient: task.proposedRecipient,
      proposedAmountNear: task.proposedAmountYocto ? yoctoToNear(task.proposedAmountYocto) : "0",
      proposedAmountYocto: task.proposedAmountYocto,
      idempotencyKey: task.idempotencyKey,
      planSteps: JSON.parse(task.planStepsJson || "[]"),
      researchSession: task.researchSession
        ? {
            id: task.researchSession.id,
            query: task.researchSession.query,
            extractedCriteria: JSON.parse(task.researchSession.extractedCriteria || "{}"),
            searchQueriesUsed: JSON.parse(task.researchSession.searchQueriesUsed || "[]"),
            sourcesReviewed: JSON.parse(task.researchSession.sourcesReviewedJson || "[]"),
            candidateOptions: JSON.parse(task.researchSession.candidateOptionsJson || "[]"),
            comparison: JSON.parse(task.researchSession.comparisonJson || "{}"),
            recommendation: JSON.parse(task.researchSession.recommendationJson || "{}"),
            reasoningSummary: task.researchSession.reasoningSummary,
            requiresPayment: task.researchSession.requiresPayment,
            providerOrderRef: task.researchSession.providerOrderRef,
            deliveryProof: task.researchSession.deliveryProof,
            completedAt: task.researchSession.completedAt?.toISOString() || null,
          }
        : null,
      agent: {
        id: task.agent.id,
        name: task.agent.name,
        status: task.agent.status,
        walletAddress: task.agent.wallet?.nearAccountId || null,
      },
      mandate: {
        id: task.mandate.id,
        name: task.mandate.name,
        status: task.mandate.status,
        totalBudgetNear: yoctoToNear(task.mandate.totalBudgetYocto),
        spentNear: yoctoToNear(task.mandate.spentYocto),
        reservedNear: yoctoToNear(task.mandate.reservedYocto),
        perTxLimitNear: yoctoToNear(task.mandate.perTxLimitYocto),
        approvalThresholdNear: yoctoToNear(task.mandate.approvalThresholdYocto),
        allowedRecipients: JSON.parse(task.mandate.allowedRecipientsJson || "[]"),
        expiresAt: task.mandate.expiresAt.toISOString(),
      },
      approval: task.approval
        ? {
            id: task.approval.id,
            status: task.approval.status,
            amountNear: yoctoToNear(task.approval.amountYocto),
            amountYocto: task.approval.amountYocto,
            recipient: task.approval.recipient,
            reason: task.approval.reason,
            createdAt: task.approval.createdAt.toISOString(),
            decidedAt: task.approval.decidedAt?.toISOString() || null,
            approver: task.approval.approver?.nearAccountId || null,
          }
        : null,
      transaction: task.transaction
        ? {
            id: task.transaction.id,
            txHash: task.transaction.txHash,
            status: task.transaction.status,
            recipient: task.transaction.recipient,
            amountNear: yoctoToNear(task.transaction.amountYocto),
            amountYocto: task.transaction.amountYocto,
            outlayerRequestId: task.transaction.outlayerRequestId,
            createdAt: task.transaction.createdAt.toISOString(),
          }
        : null,
      policyDecision,
      auditLogs: task.auditLogs.map((log) => ({
        id: log.id,
        eventType: log.eventType,
        verdict: log.verdict,
        reasonCode: log.reasonCode,
        createdAt: log.createdAt.toISOString(),
      })),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };

    return NextResponse.json({ success: true, task: formatted });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = await params;

    const task = await prisma.task.findFirst({
      where: {
        id,
        mandate: { userId: user.id },
      },
      include: {
        mandate: { include: { wallet: true, agent: true } },
      },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: "Task not found or access denied" },
        { status: 404 }
      );
    }

    if (task.status === "COMPLETED") {
      return NextResponse.json(
        { success: false, error: "Task is already settled and completed" },
        { status: 400 }
      );
    }

    if (task.status === "REJECTED") {
      return NextResponse.json(
        { success: false, error: "Task was rejected by deterministic policy or human approver" },
        { status: 403 }
      );
    }

    if (task.status === "PENDING_APPROVAL") {
      return NextResponse.json(
        { success: false, error: "Task is awaiting human approval in the Approvals queue" },
        { status: 400 }
      );
    }

    // --- CRITICAL POLICY REVALIDATION BEFORE EXECUTION ---
    if (task.mandate.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: `Mandate is not active (current status: ${task.mandate.status})` },
        { status: 403 }
      );
    }

    if (new Date() >= new Date(task.mandate.expiresAt)) {
      return NextResponse.json(
        { success: false, error: "Mandate has expired; execution refused" },
        { status: 403 }
      );
    }

    if (task.mandate.agent.status === "PAUSED" || task.mandate.agent.status === "REVOKED") {
      return NextResponse.json(
        { success: false, error: `Agent is ${task.mandate.agent.status.toLowerCase()}; execution blocked` },
        { status: 403 }
      );
    }

    const recipientToPay = task.proposedRecipient;
    const amountToPayYocto = task.proposedAmountYocto || "0";

    if (!task.requiresPayment || !recipientToPay || amountToPayYocto === "0") {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "COMPLETED" },
      });
      return NextResponse.json({
        success: true,
        message: "Task completed without payment required.",
      });
    }

    const allowedRecipients: string[] = JSON.parse(
      task.mandate.allowedRecipientsJson || "[]"
    ).map((r: string) => r.trim().toLowerCase());

    if (!allowedRecipients.includes(recipientToPay.trim().toLowerCase())) {
      return NextResponse.json(
        { success: false, error: `Recipient "${recipientToPay}" is not in mandate allowlist` },
        { status: 403 }
      );
    }

    if (BigInt(amountToPayYocto) > BigInt(task.mandate.perTxLimitYocto)) {
      return NextResponse.json(
        { success: false, error: "Proposed amount exceeds mandate per-transaction limit" },
        { status: 403 }
      );
    }

    const remainingBudget =
      BigInt(task.mandate.totalBudgetYocto) - BigInt(task.mandate.spentYocto);
    if (BigInt(amountToPayYocto) > remainingBudget) {
      return NextResponse.json(
        { success: false, error: "Proposed amount exceeds remaining available mandate budget" },
        { status: 403 }
      );
    }

    // Execute via ExecutionBoundaryService
    const execResult = await ExecutionBoundaryService.execute({
      mandateId: task.mandate.id,
      agentId: task.mandate.agentId,
      operation: "task_retry_execution",
      recipient: recipientToPay,
      amountYocto: amountToPayYocto,
      idempotencyKey: task.idempotencyKey,
      userId: user.id,
      taskId: task.id,
      parameters: {
        title: task.title,
        recipient: recipientToPay,
        amountYocto: amountToPayYocto,
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
      txHash: execResult.txHash,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

