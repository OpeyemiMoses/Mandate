import { prisma } from "@/lib/db";
import { refundMandateBudgetAtomic } from "./authority";
import { recordAuditEvent } from "@/lib/auditLedger";
import { yoctoToNear } from "@/lib/yocto";

export interface ReservationRecoveryResult {
  mandatesChecked: number;
  mandatesReconciled: number;
  timedOutApprovalsCount: number;
  recoveredReservationsYocto: string;
  recoveredReservationsNear: string;
  reconciledMandateIds: string[];
}

/**
 * Reservation Recovery & Reconciliation Engine
 *
 * Guarantees that abandoned or orphaned budget reservations (caused by server crashes,
 * process kills, abandoned human approval requests, or unhandled network dropouts)
 * are safely reclaimed and cannot permanently lock spendable mandate budget.
 */
export async function reconcileAndRecoverAbandonedReservations(params?: {
  mandateId?: string;
  timeoutMinutes?: number;
  userId?: string;
}): Promise<ReservationRecoveryResult> {
  const { mandateId, timeoutMinutes = 60, userId } = params || {};
  const timeoutThreshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);
  const now = new Date();

  let timedOutApprovalsCount = 0;
  let totalRecoveredYocto = BigInt(0);
  const reconciledMandateIds = new Set<string>();

  // 1. Identify and time-out stale ApprovalRequests
  const staleApprovals = await prisma.approvalRequest.findMany({
    where: {
      status: "PENDING",
      ...(mandateId ? { mandateId } : {}),
      ...(userId ? { mandate: { userId } } : {}),
      OR: [
        { createdAt: { lt: timeoutThreshold } },
        { mandate: { expiresAt: { lt: now } } },
      ],
    },
    include: {
      mandate: true,
      task: true,
    },
  });

  for (const approval of staleApprovals) {
    try {
      // Release reserved budget atomically via CAS
      const refundResult = await refundMandateBudgetAtomic({
        mandateId: approval.mandateId,
        amountYocto: approval.amountYocto,
        refundFromReserved: true,
      });

      if (refundResult.success) {
        await prisma.approvalRequest.update({
          where: { id: approval.id },
          data: {
            status: "TIMED_OUT",
            decidedAt: now,
          },
        });

        if (approval.taskId) {
          await prisma.task.update({
            where: { id: approval.taskId },
            data: { status: "FAILED" },
          });
        }

        timedOutApprovalsCount++;
        totalRecoveredYocto += BigInt(approval.amountYocto);
        reconciledMandateIds.add(approval.mandateId);

        await recordAuditEvent({
          userId: approval.mandate.userId,
          eventType: "ABANDONED_RESERVATION_RECOVERED",
          verdict: "SUCCESS",
          description: `Recovered abandoned reservation of ${yoctoToNear(approval.amountYocto, 3)} NEAR from timed-out approval #${approval.id}`,
          details: {
            approvalId: approval.id,
            mandateId: approval.mandateId,
            recoveredAmountYocto: approval.amountYocto,
            reason: "Approval request timed out after inactivity or mandate expiration",
          },
          mandateId: approval.mandateId,
          taskId: approval.taskId || undefined,
        });
      }
    } catch (err) {
      console.error(`[reconcileAndRecover] Error timing out approval ${approval.id}:`, err);
    }
  }

  // 2. Reconcile Mandates: detect orphan reserved amounts with no active approval or task
  const mandateWhere: any = {};
  if (mandateId) mandateWhere.id = mandateId;
  if (userId) mandateWhere.userId = userId;

  const mandates = await prisma.mandate.findMany({
    where: mandateWhere,
    include: {
      approvals: {
        where: { status: "PENDING" },
      },
      tasks: {
        where: { status: { in: ["AWAITING_APPROVAL", "EXECUTING"] } },
      },
    },
  });

  for (const m of mandates) {
    const currentReserved = BigInt(m.reservedYocto || "0");
    if (currentReserved === BigInt(0)) continue;

    // Calculate legitimate active reservations
    let legitimateReserved = BigInt(0);
    for (const app of m.approvals) {
      legitimateReserved += BigInt(app.amountYocto);
    }

    if (currentReserved > legitimateReserved) {
      const orphanedYocto = currentReserved - legitimateReserved;

      // Reclaim orphaned reservation using CAS
      const reclaimResult = await refundMandateBudgetAtomic({
        mandateId: m.id,
        amountYocto: orphanedYocto.toString(),
        refundFromReserved: true,
      });

      if (reclaimResult.success) {
        totalRecoveredYocto += orphanedYocto;
        reconciledMandateIds.add(m.id);

        await recordAuditEvent({
          userId: m.userId,
          eventType: "ABANDONED_RESERVATION_RECOVERED",
          verdict: "SUCCESS",
          description: `Reconciled and restored ${yoctoToNear(orphanedYocto.toString(), 4)} NEAR of orphaned reservation on mandate "${m.name}"`,
          details: {
            mandateId: m.id,
            orphanedYocto: orphanedYocto.toString(),
            previousReservedYocto: currentReserved.toString(),
            reconciledReservedYocto: legitimateReserved.toString(),
            reason: "Orphaned budget reservation detected with no active pending approvals or tasks",
          },
          mandateId: m.id,
        });
      }
    }
  }

  return {
    mandatesChecked: mandates.length,
    mandatesReconciled: reconciledMandateIds.size,
    timedOutApprovalsCount,
    recoveredReservationsYocto: totalRecoveredYocto.toString(),
    recoveredReservationsNear: yoctoToNear(totalRecoveredYocto.toString()),
    reconciledMandateIds: Array.from(reconciledMandateIds),
  };
}

