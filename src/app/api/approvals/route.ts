import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { yoctoToNear, subYocto } from "@/lib/yocto";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/auditLedger";
import { settleMandateBudgetAtomic, refundMandateBudgetAtomic } from "@/lib/objectives/authority";
import { PolicyEngine, computeActionPayloadHash } from "@/lib/governance";
import { ExecutionBoundaryService } from "@/lib/execution";

export const dynamic = "force-dynamic";

/**
 * GET /api/approvals - List pending/resolved approvals for authenticated user
 * POST /api/approvals - Decision on an approval (APPROVE | REJECT)
 */

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);

    const approvals = await prisma.approvalRequest.findMany({
      where: {
        mandate: { userId: user.id },
      },
      include: {
        mandate: {
          select: {
            id: true,
            name: true,
            totalBudgetYocto: true,
            spentYocto: true,
            reservedYocto: true,
            approvalThresholdYocto: true,
            agent: {
              select: {
                id: true,
                name: true,
                wallet: {
                  select: {
                    nearAccountId: true,
                  },
                },
              },
            },
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            idempotencyKey: true,
            proposedRecipient: true,
            proposedAmountYocto: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = approvals.map((a) => {
      const remainingYocto = subYocto(
        a.mandate.totalBudgetYocto,
        a.mandate.spentYocto
      );

      return {
        id: a.id,
        status: a.status,
        recipient: a.recipient,
        amountNear: yoctoToNear(a.amountYocto),
        amountYocto: a.amountYocto,
        reason: a.reason,
        taskId: a.task?.id,
        taskTitle: a.task?.title || "Autonomous Payment",
        taskGoal: a.task?.description || "",
        mandateId: a.mandate?.id,
        mandateName: a.mandate?.name || "Mandate",
        mandateRemainingNear: yoctoToNear(remainingYocto),
        thresholdNear: yoctoToNear(a.mandate.approvalThresholdYocto),
        agentName: a.mandate.agent?.name || "AI Agent",
        agentWalletAddress:
          a.mandate.agent?.wallet?.nearAccountId || "outlayer-vault.testnet",
        createdAt: a.createdAt.toISOString(),
        decidedAt: a.decidedAt?.toISOString() || null,
      };
    });

    return NextResponse.json({ success: true, approvals: formatted });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { approvalId, decision, signature, signerPublicKey, signatureDetails } = body; // decision: "APPROVE" | "REJECT"

    if (!approvalId || !decision) {
      return NextResponse.json(
        { success: false, error: "Missing approvalId or decision" },
        { status: 400 }
      );
    }

    const approval = await prisma.approvalRequest.findFirst({
      where: {
        id: approvalId,
        mandate: { userId: user.id },
      },
      include: {
        mandate: { include: { wallet: true, agent: true } },
        task: true,
      },
    });

    if (!approval) {
      return NextResponse.json(
        { success: false, error: "Approval request not found or access denied" },
        { status: 404 }
      );
    }

    if (approval.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: `Approval already resolved: ${approval.status}` },
        { status: 400 }
      );
    }

    // Release reserved budget
    const currentReserved = BigInt(approval.mandate.reservedYocto);
    const amount = BigInt(approval.amountYocto);
    const newReserved =
      currentReserved >= amount ? (currentReserved - amount).toString() : "0";

    // 1. REJECT
    if (decision === "REJECT") {
      // Release reserved budget atomically with CAS
      await refundMandateBudgetAtomic({
        mandateId: approval.mandateId,
        amountYocto: approval.amountYocto,
        refundFromReserved: true,
      });

      const updates: any[] = [
        prisma.approvalRequest.update({
          where: { id: approval.id },
          data: {
            status: "REJECTED",
            decidedAt: new Date(),
            approverId: user.id,
          },
        }),
      ];

      if (approval.taskId) {
        updates.push(
          prisma.task.update({
            where: { id: approval.taskId },
            data: { status: "REJECTED" },
          })
        );
      }

      if (approval.executionId) {
        updates.push(
          prisma.agentExecution.update({
            where: { id: approval.executionId },
            data: {
              status: "FAILED",
              currentStep: "Approval rejected by user",
              errorDetails: "Approval request was rejected",
              completedAt: new Date(),
            },
          })
        );
      }

      await prisma.$transaction(updates);

      await recordAuditEvent({
        userId: user.id,
        eventType: "APPROVAL_REJECTED",
        verdict: "REJECTED",
        description: `Rejected payment request of ${yoctoToNear(approval.amountYocto, 3)} NEAR to ${approval.recipient}`,
        details: {
          approvalId: approval.id,
          taskId: approval.taskId,
          executionId: approval.executionId,
          amountYocto: approval.amountYocto,
          recipient: approval.recipient,
        },
        mandateId: approval.mandateId,
        taskId: approval.taskId || undefined,
      });

      return NextResponse.json({
        success: true,
        decision: "REJECTED",
        message: "Approval rejected; budget unreserved.",
      });
    }

    // 0) Milestone 7 Governance: Approval Revocation & Expiration Check
    if ((approval.status as string) === "REVOKED" || approval.revokedAt) {
      await refundMandateBudgetAtomic({
        mandateId: approval.mandateId,
        amountYocto: approval.amountYocto,
        refundFromReserved: true,
      });
      return NextResponse.json(
        { success: false, error: `Approval was revoked: ${approval.revocationReason || "Revoked by user"}` },
        { status: 403 }
      );
    }

    if (approval.expiresAt && new Date() >= new Date(approval.expiresAt)) {
      await refundMandateBudgetAtomic({
        mandateId: approval.mandateId,
        amountYocto: approval.amountYocto,
        refundFromReserved: true,
      });
      return NextResponse.json(
        { success: false, error: "Cannot execute approval: Approval request has expired" },
        { status: 403 }
      );
    }

    // --- CRITICAL REVALIDATION PRIOR TO EXECUTING APPROVED PAYMENT ---
    // A) Mandate Active Status Check
    if (approval.mandate.status !== "ACTIVE") {
      await prisma.mandate.update({
        where: { id: approval.mandateId },
        data: { reservedYocto: newReserved },
      });
      return NextResponse.json(
        { success: false, error: `Cannot execute approval: Mandate is "${approval.mandate.status}"` },
        { status: 403 }
      );
    }

    // B) Mandate Expiration Check
    if (new Date() >= new Date(approval.mandate.expiresAt)) {
      await refundMandateBudgetAtomic({
        mandateId: approval.mandateId,
        amountYocto: approval.amountYocto,
        refundFromReserved: true,
      });
      return NextResponse.json(
        { success: false, error: "Cannot execute approval: Mandate has expired" },
        { status: 403 }
      );
    }

    // C) Agent Status Check
    if (
      approval.mandate.agent.status === "PAUSED" ||
      approval.mandate.agent.status === "REVOKED"
    ) {
      await refundMandateBudgetAtomic({
        mandateId: approval.mandateId,
        amountYocto: approval.amountYocto,
        refundFromReserved: true,
      });
      return NextResponse.json(
        {
          success: false,
          error: `Cannot execute approval: Agent is ${approval.mandate.agent.status.toLowerCase()}`,
        },
        { status: 403 }
      );
    }

    // D) Proposal Integrity / Parameter Tampering Binding
    if (approval.task) {
      if (
        approval.task.proposedRecipient !== approval.recipient ||
        approval.task.proposedAmountYocto !== approval.amountYocto
      ) {
        await refundMandateBudgetAtomic({
          mandateId: approval.mandateId,
          amountYocto: approval.amountYocto,
          refundFromReserved: true,
        });
        return NextResponse.json(
          {
            success: false,
            error: "Approval execution blocked: Task spending proposal parameters have been mutated",
          },
          { status: 403 }
        );
      }
    }

    // E) Recipient Allowlist Check
    const allowedRecipients: string[] = JSON.parse(
      approval.mandate.allowedRecipientsJson || "[]"
    ).map((r: string) => r.trim().toLowerCase());
    if (!allowedRecipients.includes(approval.recipient.trim().toLowerCase())) {
      await prisma.mandate.update({
        where: { id: approval.mandateId },
        data: { reservedYocto: newReserved },
      });
      return NextResponse.json(
        {
          success: false,
          error: `Approval execution blocked: Recipient "${approval.recipient}" is not in mandate allowlist`,
        },
        { status: 403 }
      );
    }

    // F) Action Payload Hash Tamper Binding Check
    if (approval.actionPayloadHash) {
      const currentHash = computeActionPayloadHash({
        operation: "execute_payment",
        recipient: approval.recipient,
        amountYocto: approval.amountYocto,
        mandateId: approval.mandateId,
        policyId: approval.policyId || undefined,
        policyVersion: approval.policyVersion || undefined,
        mandateVersion: approval.mandateVersion || undefined,
      });
      if (approval.actionPayloadHash !== currentHash) {
        await refundMandateBudgetAtomic({
          mandateId: approval.mandateId,
          amountYocto: approval.amountYocto,
          refundFromReserved: true,
        });
        return NextResponse.json(
          {
            success: false,
            error: "Approval execution blocked: Action payload hash mismatch (parameters tampered since approval)",
          },
          { status: 403 }
        );
      }
    }

    // G) Mandate Version Concurrency Binding Check
    if (approval.mandateVersion !== null && approval.mandate.policyVersion !== approval.mandateVersion) {
      await refundMandateBudgetAtomic({
        mandateId: approval.mandateId,
        amountYocto: approval.amountYocto,
        refundFromReserved: true,
      });
      return NextResponse.json(
        {
          success: false,
          error: `Approval invalidated: Mandate version changed from v${approval.mandateVersion} to v${approval.mandate.policyVersion}. Re-approval required.`,
        },
        { status: 403 }
      );
    }

    // H) Immediate Server-Side Governance Policy Re-Evaluation
    const govEval = await PolicyEngine.evaluate({
      userId: user.id,
      agentId: approval.mandate.agentId,
      mandateId: approval.mandateId,
      operation: "execute_payment",
      recipient: approval.recipient,
      amountYocto: approval.amountYocto,
      resource: "outlayer_vault",
    });

    if (govEval.decision === "DENY") {
      await refundMandateBudgetAtomic({
        mandateId: approval.mandateId,
        amountYocto: approval.amountYocto,
        refundFromReserved: true,
      });
      return NextResponse.json(
        {
          success: false,
          error: `Approval execution denied by Governance Policy: ${govEval.humanExplanation}`,
        },
        { status: 403 }
      );
    }

    // 2. APPROVE -> Proceed to ExecutionBoundaryService
    const effectiveIdemKey = approval.task?.idempotencyKey || `appr-${approval.id}`;

    // Mark approval request as APPROVED
    await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        decidedAt: new Date(),
        approverId: user.id,
      },
    });

    const execResult = await ExecutionBoundaryService.execute({
      userId: user.id,
      mandateId: approval.mandateId,
      agentId: approval.mandate.agentId,
      taskId: approval.taskId || undefined,
      operation: "execute_payment",
      recipient: approval.recipient,
      amountYocto: approval.amountYocto,
      idempotencyKey: effectiveIdemKey,
      approvalId: approval.id,
      alreadyReserved: true,
    });

    if (!execResult.success && execResult.status === "FAILED") {
      if (approval.taskId) {
        await prisma.task.update({
          where: { id: approval.taskId },
          data: { status: "FAILED" },
        });
      }

      if (approval.executionId) {
        await prisma.agentExecution.update({
          where: { id: approval.executionId },
          data: {
            status: "FAILED",
            currentStep: "Execution failed",
            errorDetails: execResult.error || "Execution failed",
            completedAt: new Date(),
          },
        });
      }

      return NextResponse.json(
        {
          success: false,
          decision: "APPROVED_BUT_CHAIN_REFUSED",
          error: execResult.error,
        },
        { status: 502 }
      );
    }

    // Success or confirming state
    const postUpdates: any[] = [];
    if (approval.taskId) {
      postUpdates.push(
        prisma.task.update({
          where: { id: approval.taskId },
          data: { status: execResult.status === "CONFIRMED" ? "COMPLETED" : "EXECUTING" },
        })
      );
    }

    if (approval.executionId) {
      postUpdates.push(
        prisma.agentExecution.update({
          where: { id: approval.executionId },
          data: {
            status: execResult.status === "CONFIRMED" ? "COMPLETED" : "RUNNING",
            currentStep:
              execResult.status === "CONFIRMED"
                ? "Payment executed and confirmed on-chain"
                : "Payment broadcast; awaiting on-chain confirmation",
            completedAt: execResult.status === "CONFIRMED" ? new Date() : null,
          },
        })
      );
    }

    if (postUpdates.length > 0) {
      await prisma.$transaction(postUpdates);
    }

    // Record legacy TransactionRecord for backward compatibility with existing views
    const txRecord = await prisma.transactionRecord.create({
      data: {
        txHash: execResult.txHash || null,
        recipient: approval.recipient,
        amountYocto: approval.amountYocto,
        status: execResult.status === "CONFIRMED" ? "CONFIRMED" : "CONFIRMING",
        blockHash: execResult.blockHash || null,
        taskId: approval.taskId || undefined,
        executionId: approval.executionId || undefined,
        mandateId: approval.mandateId,
      },
    });

    await recordAuditEvent({
      userId: user.id,
      eventType: "APPROVAL_GRANTED_AND_SETTLED",
      verdict: "SUCCESS",
      description: `Approved payment of ${yoctoToNear(approval.amountYocto, 3)} NEAR to ${approval.recipient}`,
      details: {
        approvalId: approval.id,
        taskId: approval.taskId,
        executionId: approval.executionId,
        amountYocto: approval.amountYocto,
        txHash: execResult.txHash,
        walletSignature: signature || null,
        signerPublicKey: signerPublicKey || null,
      },
      mandateId: approval.mandateId,
      taskId: approval.taskId || undefined,
      txHash: execResult.txHash || undefined,
    });

    return NextResponse.json({
      success: true,
      decision: "APPROVED",
      txHash: execResult.txHash || txRecord.txHash,
      executionId: execResult.executionId,
      status: execResult.status,
      message: "Human approval granted and dispatched via Execution Boundary.",
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
