/**
 * Multi-Transaction Mandate Budget Accounting Service
 * Milestone 12 - Mathematical Invariants & Multi-Transaction Reliability
 */

import { prisma } from "@/lib/db";
import { yoctoToNear, isValidYoctoString } from "@/lib/yocto";
import {
  reserveMandateBudgetAtomic,
  settleMandateBudgetAtomic,
  releaseMandateBudgetAtomic,
} from "@/lib/objectives/authority";
import { recordAuditEvent } from "@/lib/auditLedger";
import { MandateAccountingBreakdown, MandateLifecycleStatus } from "./types";

export class MandateAccountingService {
  /**
   * Computes the complete multi-transaction accounting breakdown for a mandate.
   * Enforces:
   * Available Budget = Authorized Budget - Confirmed Spending - Active Reservations
   * All internal calculations execute strictly with BigInt integer yoctoNEAR precision.
   */
  public static async getAccountingBreakdown(
    mandateId: string,
    userId: string
  ): Promise<MandateAccountingBreakdown> {
    const mandate = await prisma.mandate.findFirst({
      where: { id: mandateId, userId },
      include: {
        executionRecords: {
          select: {
            id: true,
            status: true,
            amountYocto: true,
            txHash: true,
            createdAt: true,
          },
        },
      },
    });

    if (!mandate) {
      throw new Error(`Mandate ${mandateId} not found or unauthorized for user ${userId}`);
    }

    const totalBudget = BigInt(mandate.totalBudgetYocto);
    const confirmedSpent = BigInt(mandate.spentYocto || "0");
    const activeReserved = BigInt(mandate.reservedYocto || "0");

    // Invariant: committed = confirmedSpent + activeReserved
    const committed = confirmedSpent + activeReserved;
    const available = totalBudget >= committed ? totalBudget - committed : BigInt(0);

    // Aggregate execution records by status
    let pendingSettlementYocto = BigInt(0);
    let failedExecutionYocto = BigInt(0);
    let confirmedTxCount = 0;
    let inFlightTxCount = 0;
    let failedTxCount = 0;

    for (const record of mandate.executionRecords) {
      const amount = isValidYoctoString(record.amountYocto)
        ? BigInt(record.amountYocto)
        : BigInt(0);

      switch (record.status) {
        case "CONFIRMED":
          confirmedTxCount++;
          break;
        case "BROADCAST":
        case "CONFIRMING":
          inFlightTxCount++;
          pendingSettlementYocto += amount;
          break;
        case "FAILED":
        case "REJECTED":
          failedTxCount++;
          failedExecutionYocto += amount;
          break;
        default:
          break;
      }
    }

    // Check discrepancy
    const hasDiscrepancy = committed > totalBudget;
    const discrepancyYocto = hasDiscrepancy ? (committed - totalBudget).toString() : "0";

    // Approximate released reservations from failed records + budget release audit events
    const releasedReservationYocto = failedExecutionYocto.toString();

    return {
      mandateId: mandate.id,
      name: mandate.name,
      status: mandate.status as MandateLifecycleStatus,
      policyVersion: mandate.policyVersion,

      totalBudgetYocto: mandate.totalBudgetYocto,
      spentYocto: mandate.spentYocto,
      reservedYocto: mandate.reservedYocto,
      availableBudgetYocto: available.toString(),

      pendingSettlementYocto: pendingSettlementYocto.toString(),
      failedExecutionYocto: failedExecutionYocto.toString(),
      releasedReservationYocto,

      totalBudgetNear: yoctoToNear(mandate.totalBudgetYocto),
      spentNear: yoctoToNear(mandate.spentYocto),
      reservedNear: yoctoToNear(mandate.reservedYocto),
      availableBudgetNear: yoctoToNear(available.toString()),
      pendingSettlementNear: yoctoToNear(pendingSettlementYocto.toString()),
      failedExecutionNear: yoctoToNear(failedExecutionYocto.toString()),
      releasedReservationNear: yoctoToNear(releasedReservationYocto),

      confirmedTxCount,
      inFlightTxCount,
      failedTxCount,

      isBalanced: !hasDiscrepancy,
      discrepancyYocto,
    };
  }

  /**
   * Asserts whether a proposed transfer amount is within the available authorized budget.
   * Throws fail-closed error if insufficient.
   */
  public static assertAvailableBudget(
    totalBudgetYocto: string,
    spentYocto: string,
    reservedYocto: string,
    requestedYocto: string,
    alreadyReserved: boolean = false
  ): void {
    if (!isValidYoctoString(requestedYocto)) {
      throw new Error(`Invalid requested amount: "${requestedYocto}". Must be integer yoctoNEAR.`);
    }

    const total = BigInt(totalBudgetYocto);
    const spent = BigInt(spentYocto || "0");
    const reserved = BigInt(reservedYocto || "0");
    const requested = BigInt(requestedYocto);

    if (requested <= BigInt(0)) {
      throw new Error("Requested spending amount must be strictly greater than 0 yoctoNEAR");
    }

    const committed = alreadyReserved ? spent : spent + reserved;
    const available = total >= committed ? total - committed : BigInt(0);

    if (requested > available) {
      throw new Error(
        `Insufficient available budget: Requested ${yoctoToNear(requestedYocto)} NEAR exceeds available authorized budget of ${yoctoToNear(available.toString())} NEAR`
      );
    }
  }

  /**
   * Atomically reserve budget on a mandate with optimistic concurrency control (CAS).
   */
  public static async reserveBudget(params: {
    mandateId: string;
    amountYocto: string;
    taskId?: string;
  }) {
    return await reserveMandateBudgetAtomic(params);
  }

  /**
   * Atomically settle confirmed spending on a mandate upon independently verified transaction.
   */
  public static async settleSpending(params: {
    mandateId: string;
    amountYocto: string;
    wasReserved?: boolean;
  }) {
    return await settleMandateBudgetAtomic(params);
  }

  /**
   * Atomically release reserved budget back to available balance upon verified failure.
   */
  public static async releaseReservation(params: {
    mandateId: string;
    amountYocto: string;
  }) {
    return await releaseMandateBudgetAtomic(params);
  }

  /**
   * Reconciles internal mandate accounting against authoritative database execution records.
   * Detects and repairs discrepancies between confirmed records and spentYocto.
   */
  public static async reconcileMandateAccounting(mandateId: string, actorUserId: string): Promise<{
    reconciled: boolean;
    previousSpentYocto: string;
    reconciledSpentYocto: string;
    discrepancyCorrected: boolean;
  }> {
    const result = await prisma.$transaction(async (tx) => {
      const mandate = await tx.mandate.findUnique({
        where: { id: mandateId },
        include: {
          executionRecords: {
            where: { status: "CONFIRMED" },
          },
        },
      });

      if (!mandate) throw new Error("Mandate not found");

      let actualConfirmedSpent = BigInt(0);
      for (const record of mandate.executionRecords) {
        if (isValidYoctoString(record.amountYocto)) {
          actualConfirmedSpent += BigInt(record.amountYocto);
        }
      }

      const recordedSpent = BigInt(mandate.spentYocto || "0");
      const hasDiscrepancy = actualConfirmedSpent !== recordedSpent;

      if (hasDiscrepancy) {
        const nextVersion = (mandate.policyVersion || 1) + 1;
        await tx.mandate.update({
          where: { id: mandateId },
          data: {
            spentYocto: actualConfirmedSpent.toString(),
            policyVersion: nextVersion,
          },
        });

        return {
          reconciled: true,
          mandateName: mandate.name,
          previousSpentYocto: recordedSpent.toString(),
          reconciledSpentYocto: actualConfirmedSpent.toString(),
          discrepancyCorrected: true,
          confirmedCount: mandate.executionRecords.length,
        };
      }

      return {
        reconciled: true,
        mandateName: mandate.name,
        previousSpentYocto: recordedSpent.toString(),
        reconciledSpentYocto: recordedSpent.toString(),
        discrepancyCorrected: false,
        confirmedCount: mandate.executionRecords.length,
      };
    });

    if (result.discrepancyCorrected) {
      await recordAuditEvent({
        userId: actorUserId,
        eventType: "MANDATE_ACCOUNTING_RECONCILED",
        verdict: "RESOLVED",
        description: `Corrected spent balance discrepancy on mandate "${result.mandateName}": recorded ${yoctoToNear(result.previousSpentYocto)} NEAR -> reconciled ${yoctoToNear(result.reconciledSpentYocto)} NEAR`,
        mandateId,
        details: {
          previousSpentYocto: result.previousSpentYocto,
          reconciledSpentYocto: result.reconciledSpentYocto,
          confirmedRecordCount: result.confirmedCount,
        },
      });
    }

    return {
      reconciled: result.reconciled,
      previousSpentYocto: result.previousSpentYocto,
      reconciledSpentYocto: result.reconciledSpentYocto,
      discrepancyCorrected: result.discrepancyCorrected,
    };
  }
}
