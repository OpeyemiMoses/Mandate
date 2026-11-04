import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { nearToYocto, yoctoToNear } from "@/lib/yocto";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { MandateLifecycleService } from "@/lib/mandate/lifecycleService";
import { MandateAccountingService } from "@/lib/mandate/accountingService";

/**
 * GET /api/mandates/[id] - Fetch single mandate with multi-transaction accounting breakdown
 * PATCH /api/mandates/[id] - Lifecycle transition (pause, resume, revoke, complete) or config update
 * DELETE /api/mandates/[id] - Revoke mandate
 */

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    
    // Evaluate and sync any dynamic status changes (e.g. expiration or budget exhaustion)
    await MandateLifecycleService.evaluateAndSyncStatus(params.id).catch(() => {});

    const mandate = await prisma.mandate.findFirst({
      where: { id: params.id, userId: user.id },
      include: {
        agent: true,
        wallet: true,
        executionRecords: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!mandate) {
      return NextResponse.json(
        { success: false, error: "Mandate not found" },
        { status: 404 }
      );
    }

    const accounting = await MandateAccountingService.getAccountingBreakdown(mandate.id, user.id);

    return NextResponse.json({
      success: true,
      mandate: {
        id: mandate.id,
        name: mandate.name,
        description: mandate.description,
        status: mandate.status,
        policyVersion: mandate.policyVersion,
        agentId: mandate.agentId,
        agentName: mandate.agent?.name,
        walletAddress: mandate.wallet?.nearAccountId,
        totalBudgetNear: accounting.totalBudgetNear,
        spentNear: accounting.spentNear,
        reservedNear: accounting.reservedNear,
        availableBudgetNear: accounting.availableBudgetNear,
        pendingSettlementNear: accounting.pendingSettlementNear,
        failedExecutionNear: accounting.failedExecutionNear,
        releasedReservationNear: accounting.releasedReservationNear,
        perTxLimitNear: yoctoToNear(mandate.perTxLimitYocto),
        approvalThresholdNear: yoctoToNear(mandate.approvalThresholdYocto),
        allowedRecipients: JSON.parse(mandate.allowedRecipientsJson || "[]"),
        expiresAt: mandate.expiresAt.toISOString(),
        recentExecutions: mandate.executionRecords.map((r) => ({
          id: r.id,
          status: r.status,
          operation: r.operation,
          recipient: r.recipient,
          amountNear: yoctoToNear(r.amountYocto),
          txHash: r.txHash,
          createdAt: r.createdAt.toISOString(),
        })),
        accounting,
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const {
      status,
      name,
      description,
      totalBudgetNear,
      perTxLimitNear,
      approvalThresholdNear,
      allowedRecipients,
      expiresAt,
      reason,
    } = body;

    const mandate = await prisma.mandate.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!mandate) {
      return NextResponse.json(
        { success: false, error: "Mandate not found" },
        { status: 404 }
      );
    }

    // 1. Lifecycle Status Transition
    if (status && status !== mandate.status) {
      const transitionReason = reason || `User requested transition to ${status}`;
      switch (status) {
        case "PAUSED":
          await MandateLifecycleService.pauseMandate({
            mandateId: mandate.id,
            actorUserId: user.id,
            reason: transitionReason,
          });
          break;
        case "ACTIVE":
          if (mandate.status === "PAUSED") {
            await MandateLifecycleService.resumeMandate({
              mandateId: mandate.id,
              actorUserId: user.id,
              reason: transitionReason,
            });
          } else {
            await MandateLifecycleService.activateMandate({
              mandateId: mandate.id,
              actorUserId: user.id,
              reason: transitionReason,
            });
          }
          break;
        case "REVOKED":
          await MandateLifecycleService.revokeMandate({
            mandateId: mandate.id,
            actorUserId: user.id,
            reason: transitionReason,
          });
          break;
        case "COMPLETED":
          await MandateLifecycleService.completeMandate({
            mandateId: mandate.id,
            actorUserId: user.id,
            reason: transitionReason,
          });
          break;
        default:
          return NextResponse.json(
            { success: false, error: `Invalid target lifecycle status: ${status}` },
            { status: 400 }
          );
      }
    }

    // 2. Configuration Parameters Update
    const hasConfigUpdates =
      name !== undefined ||
      description !== undefined ||
      totalBudgetNear !== undefined ||
      perTxLimitNear !== undefined ||
      approvalThresholdNear !== undefined ||
      allowedRecipients !== undefined ||
      expiresAt !== undefined;

    if (hasConfigUpdates) {
      await MandateLifecycleService.updateConfig({
        mandateId: mandate.id,
        actorUserId: user.id,
        name,
        description,
        totalBudgetYocto: totalBudgetNear ? nearToYocto(String(totalBudgetNear)) : undefined,
        perTxLimitYocto: perTxLimitNear ? nearToYocto(String(perTxLimitNear)) : undefined,
        approvalThresholdYocto: approvalThresholdNear ? nearToYocto(String(approvalThresholdNear)) : undefined,
        allowedRecipients,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        reason: reason || "User updated mandate configuration",
      });
    }

    // Fetch updated record and accounting breakdown
    const updated = await prisma.mandate.findUnique({
      where: { id: mandate.id },
      include: { agent: true, wallet: true },
    });
    const accounting = await MandateAccountingService.getAccountingBreakdown(mandate.id, user.id);

    return NextResponse.json({
      success: true,
      mandate: {
        id: updated!.id,
        name: updated!.name,
        status: updated!.status,
        policyVersion: updated!.policyVersion,
        agentId: updated!.agentId,
        agentName: updated!.agent?.name,
        totalBudgetNear: accounting.totalBudgetNear,
        spentNear: accounting.spentNear,
        reservedNear: accounting.reservedNear,
        availableBudgetNear: accounting.availableBudgetNear,
        perTxLimitNear: yoctoToNear(updated!.perTxLimitYocto),
        approvalThresholdNear: yoctoToNear(updated!.approvalThresholdYocto),
        allowedRecipients: JSON.parse(updated!.allowedRecipientsJson || "[]"),
        expiresAt: updated!.expiresAt.toISOString(),
        accounting,
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);

    const mandate = await prisma.mandate.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!mandate) {
      return NextResponse.json(
        { success: false, error: "Mandate not found" },
        { status: 404 }
      );
    }

    const result = await MandateLifecycleService.revokeMandate({
      mandateId: mandate.id,
      actorUserId: user.id,
      reason: "Owner revoked mandate via DELETE endpoint",
    });

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
