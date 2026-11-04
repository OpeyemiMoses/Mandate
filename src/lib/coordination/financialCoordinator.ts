import { prisma } from "@/lib/db";
import {
  reserveMandateBudgetAtomic,
  settleMandateBudgetAtomic,
  releaseMandateBudgetAtomic,
} from "@/lib/objectives/authority";
import { emitCoordinationEvent } from "./events";
import { yoctoToNear } from "@/lib/yocto";
import { PolicyEngine } from "@/lib/governance";
import { ExecutionRecoveryService } from "@/lib/execution/recoveryService";
import { ExecutionGateService } from "@/lib/operations/executionGateService";

export interface ExecuteFinancialActionParams<T = any> {
  runId: string;
  taskId: string;
  agentId: string;
  userId: string;
  amountYocto: string;
  recipient: string;
  purpose: string;
  idempotencyKey?: string;
  operationName?: string;
  action: () => Promise<T>;
}

export interface FinancialActionResult<T = any> {
  success: boolean;
  result?: T;
  amountYocto: string;
  amountNear: string;
  recipient: string;
  transactionRecordId?: string;
  error?: string;
  settled: boolean;
  released: boolean;
}

/**
 * Shared Multi-Agent Financial Coordinator
 * Mediates all autonomous financial disbursements under a coordination run.
 * Enforces atomic CAS reservations, prevents parallel double-spending,
 * deduplicates financial side effects, and preserves authority boundaries.
 */
export class FinancialCoordinator {
  public static async executeWithAuthority<T>(
    params: ExecuteFinancialActionParams<T>
  ): Promise<FinancialActionResult<T>> {
    // 0. OPERATIONAL CONTROL PLANE CHECK (Milestone 9.4)
    await ExecutionGateService.assertFinancialExecutionAllowed("FinancialCoordinator.executeWithAuthority");

    const {
      runId,
      taskId,
      agentId,
      userId,
      amountYocto,
      recipient,
      purpose,
      idempotencyKey,
      operationName = "financial_disbursement",
      action,
    } = params;

    // 1. Verify Run, Task, and User Ownership
    const run = await prisma.coordinationRun.findFirst({
      where: { id: runId, userId },
      include: { mandate: { include: { wallet: true } }, objective: true },
    });

    if (!run) {
      throw new Error(`CoordinationRun "${runId}" not found or unauthorized.`);
    }

    if (!run.mandateId || !run.mandate) {
      throw new Error(
        `Financial execution rejected: CoordinationRun "${runId}" has no bound active Mandate.`
      );
    }

    const mandate = run.mandate;
    if (mandate.status !== "ACTIVE") {
      throw new Error(`Mandate "${mandate.id}" is ${mandate.status}; disbursements are forbidden.`);
    }

    // 2. Verify Task ownership and status
    const task = await prisma.coordinationTask.findFirst({
      where: { id: taskId, runId },
    });
    if (!task) {
      throw new Error(`Task "${taskId}" does not belong to run "${runId}".`);
    }

    // 3. Duplicate Financial Action Prevention (Idempotency)
    if (idempotencyKey) {
      const existingTx = await prisma.transactionRecord.findFirst({
        where: { mandateId: mandate.id, outlayerRequestId: idempotencyKey, status: "CONFIRMED" },
      });
      if (existingTx) {
        throw new Error(
          `Duplicate financial action rejected: Action with idempotency key "${idempotencyKey}" already settled.`
        );
      }
    }

    // 4. Validate Recipient Whitelist
    const recipientsRaw = mandate.allowedRecipientsJson || (mandate as any).allowedRecipients;
    if (recipientsRaw) {
      try {
        const allowed: string[] = JSON.parse(recipientsRaw);
        if (allowed.length > 0 && !allowed.includes("*") && !allowed.includes(recipient)) {
          throw new Error(
            `Recipient "${recipient}" is not whitelisted on Mandate "${mandate.name}". Allowed: [${allowed.join(", ")}]`
          );
        }
      } catch (e: any) {
        if (!e.message.includes("is not whitelisted")) {
          // ignore JSON parse fallback
        } else {
          throw e;
        }
      }
    }

    // 4.5 Milestone 7 Governance: Centralized Policy Evaluation
    const govEval = await PolicyEngine.evaluate({
      userId,
      agentId,
      coordinationRunId: runId,
      objectiveId: run.objectiveId,
      mandateId: mandate.id,
      operation: operationName,
      recipient,
      amountYocto,
      resource: "mandate_custody_vault",
      parameters: { purpose, taskId, idempotencyKey },
    });

    if (!govEval.allowed) {
      throw new Error(`Governance Policy Denied: ${govEval.humanExplanation}`);
    }

    // 5. Pre-Execution Atomic CAS Budget Reservation
    const reservation = await reserveMandateBudgetAtomic({
      mandateId: mandate.id,
      amountYocto,
      objectiveId: run.objectiveId,
      taskId: task.id,
    });

    if (!reservation.success) {
      await emitCoordinationEvent({
        runId,
        objectiveId: run.objectiveId,
        userId,
        taskId: task.id,
        agentId,
        mandateId: mandate.id,
        eventType: "coordination.financial_blocked",
        metadata: {
          amountYocto,
          amountNear: yoctoToNear(amountYocto),
          reason: reservation.reason || "Insufficient funds or CAS concurrency timeout",
        },
        recordInAuditChain: true,
      });

      throw new Error(
        `Financial reservation failed: ${reservation.reason || "Insufficient funds"}`
      );
    }

    // Track reserved amount on task record
    await prisma.coordinationTask.update({
      where: { id: task.id },
      data: {
        financialRequired: true,
        reservedAmountYocto: amountYocto,
        estimatedCostNear: yoctoToNear(amountYocto),
      },
    });

    await emitCoordinationEvent({
      runId,
      objectiveId: run.objectiveId,
      userId,
      taskId: task.id,
      agentId,
      mandateId: mandate.id,
      eventType: "coordination.financial_reserved",
      metadata: {
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        recipient,
        purpose,
      },
      recordInAuditChain: true,
    });

    // 6. Execute Operation within Fail-Safe Boundaries
    let actionResult: T;
    try {
      actionResult = await action();
    } catch (execError: any) {
      // Milestone 8 Failure Classification:
      // If error occurs post-broadcast, NEVER release a financial reservation on ambiguous network timeout.
      // Pre-broadcast errors safely release immediately.
      const failureStage = (execError as any)?.stage || "BEFORE_SIGNING";
      const classification = ExecutionRecoveryService.classifyFailure({
        stage: failureStage,
        error: execError,
        txHash: (execError as any)?.txHash,
      });

      if (classification.canReleaseReservationImmediately) {
        await releaseMandateBudgetAtomic({
          mandateId: mandate.id,
          amountYocto,
        });

        await prisma.coordinationTask.update({
          where: { id: task.id },
          data: { reservedAmountYocto: "0" },
        });

        await emitCoordinationEvent({
          runId,
          objectiveId: run.objectiveId,
          userId,
          taskId: task.id,
          agentId,
          mandateId: mandate.id,
          eventType: "coordination.financial_released",
          metadata: {
            amountYocto,
            amountNear: yoctoToNear(amountYocto),
            reason: execError?.message || "Execution failure",
          },
          recordInAuditChain: true,
        });

        return {
          success: false,
          amountYocto,
          amountNear: yoctoToNear(amountYocto),
          recipient,
          error: execError?.message || "Execution failure",
          settled: false,
          released: true,
        };
      } else {
        // Ambiguous timeout: Retain reservation and mark BLOCKED / REQUIRES_RECOVERY
        await emitCoordinationEvent({
          runId,
          objectiveId: run.objectiveId,
          userId,
          taskId: task.id,
          agentId,
          mandateId: mandate.id,
          eventType: "coordination.financial_blocked",
          metadata: {
            amountYocto,
            amountNear: yoctoToNear(amountYocto),
            reason: classification.reason,
            recoveryStatus: classification.suggestedStatus,
          },
          recordInAuditChain: true,
        });

        return {
          success: false,
          amountYocto,
          amountNear: yoctoToNear(amountYocto),
          recipient,
          error: `Ambiguous execution timeout: ${execError?.message || "RPC timeout"}. Budget reservation held locked to prevent double-spending.`,
          settled: false,
          released: false,
        };
      }
    }

    // 7. On Verified Success: Settle the Reservation via CAS
    const settlement = await settleMandateBudgetAtomic({
      mandateId: mandate.id,
      amountYocto,
      wasReserved: true,
    });

    if (!settlement.success) {
      // Emergency: Settlement failed CAS, attempt release
      await releaseMandateBudgetAtomic({
        mandateId: mandate.id,
        amountYocto,
      });
      throw new Error(`Failed to atomically settle spending: ${settlement.reason}`);
    }

    // Clear task reservedAmountYocto
    await prisma.coordinationTask.update({
      where: { id: task.id },
      data: { reservedAmountYocto: "0" },
    });

    // 8. Record Immutable Transaction Record
    const txRecord = await prisma.transactionRecord.create({
      data: {
        mandateId: mandate.id,
        recipient,
        amountYocto,
        status: "CONFIRMED",
        outlayerRequestId: idempotencyKey || null,
        confirmedAt: new Date(),
      },
    });

    await emitCoordinationEvent({
      runId,
      objectiveId: run.objectiveId,
      userId,
      taskId: task.id,
      agentId,
      mandateId: mandate.id,
      eventType: "coordination.financial_settled",
      metadata: {
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        recipient,
        transactionRecordId: txRecord.id,
        newSpentYocto: settlement.newSpentYocto,
      },
      recordInAuditChain: true,
    });

    return {
      success: true,
      result: actionResult,
      amountYocto,
      amountNear: yoctoToNear(amountYocto),
      recipient,
      transactionRecordId: txRecord.id,
      settled: true,
      released: false,
    };
  }
}
