/**
 * Recovery Executor Service (Milestone 9.3)
 * Orchestrates the execution of approved recovery plans with execution tracking
 * and integration with M8 ExecutionRecoveryService and M9.1 JobRecoveryService.
 */

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import { ExecutionRecoveryService } from "@/lib/execution/recoveryService";
import { JobRecoveryService } from "@/lib/jobs/recoveryService";
import { IncidentTimelineService } from "@/lib/incidents/incidentTimelineService";
import { ProviderReconciler } from "@/lib/reconciliation/providerReconciler";
import { ExecutePlanParams } from "./types";
import { RecoveryVerificationService } from "./recoveryVerificationService";
import { ExecutionGateService } from "@/lib/operations/executionGateService";

export class RecoveryExecutor {
  /**
   * Executes an approved recovery plan.
   */
  public static async executePlan(params: ExecutePlanParams) {
    const plan = await prisma.recoveryPlan.findUnique({
      where: { id: params.planId },
      include: {
        approvals: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        attempts: true,
      },
    });

    if (!plan) {
      throw new Error(`RecoveryPlan ${params.planId} not found`);
    }

    // Safety Invariant 1: Plan must be in APPROVED status
    if (plan.status !== "APPROVED") {
      throw new Error(
        `Plan ${plan.id} cannot be executed because status is '${plan.status}' (expected 'APPROVED')`
      );
    }

    // Safety Invariant 2: Financial recovery requires valid human approval with matching hash
    if (plan.isFinancial) {
      // OPERATIONAL CONTROL PLANE CHECK (Milestone 9.4)
      await ExecutionGateService.assertFinancialExecutionAllowed("RecoveryExecutor.executePlan");

      const latestApproval = plan.approvals[0];
      if (!latestApproval || latestApproval.status !== "APPROVED") {
        throw new Error(
          "SECURITY_VIOLATION: Execution blocked. Financial recovery requires an approved authorization record."
        );
      }

      if (latestApproval.approverType !== "HUMAN") {
        throw new Error(
          "SECURITY_VIOLATION: Execution blocked. Financial recovery approved by non-human entity."
        );
      }

      if (latestApproval.payloadHash !== plan.payloadHash) {
        throw new Error(
          "SECURITY_VIOLATION: Approval payload hash does not match current plan payload hash."
        );
      }

      if (latestApproval.expiresAt < new Date()) {
        throw new Error(
          "SECURITY_VIOLATION: Approval has expired. Re-approval required."
        );
      }
    }

    const attemptNumber = plan.attempts.length + 1;
    const attempt = await prisma.recoveryAttempt.create({
      data: {
        planId: plan.id,
        attemptNumber,
        executedBy: params.executedBy,
        status: "RUNNING",
      },
    });

    await prisma.recoveryPlan.update({
      where: { id: plan.id },
      data: { status: "EXECUTING" },
    });

    let executionResult: any = {};
    let isSuccess = false;
    let errorDetails: string | undefined;

    try {
      switch (plan.strategy) {
        case "EXECUTION_STATUS_CHECK":
        case "MANUAL_FINANCIAL_REVIEW": {
          // Route through M8 ExecutionRecoveryService
          const res = await ExecutionRecoveryService.recoverExecution(
            plan.targetEntityId
          );
          executionResult = res;
          isSuccess = res.status === "CONFIRMED" || res.status === "FAILED";
          break;
        }

        case "RECLAIM_EXPIRED_WORKER_LEASE": {
          // Reclaim via M9.1 JobRecoveryService or worker reset
          if (plan.targetEntityType === "JOB") {
            const job = await prisma.backgroundJob.findUnique({
              where: { id: plan.targetEntityId },
            });
            if (job) {
              await prisma.backgroundJob.update({
                where: { id: job.id },
                data: {
                  status: "QUEUED",
                  workerId: null,
                  leaseToken: null,
                  leaseExpiresAt: null,
                  startedAt: null,
                },
              });
              executionResult = { reclaimedJobId: job.id, newStatus: "QUEUED" };
              isSuccess = true;
            }
          } else if (plan.targetEntityType === "WORKER") {
            // Mark worker stopped and recover leases
            await prisma.backgroundWorker.update({
              where: { id: plan.targetEntityId },
              data: { status: "STOPPED", stoppedAt: new Date() },
            });
            const reclaimed = await JobRecoveryService.recoverAbandonedLeases();
            executionResult = { workerId: plan.targetEntityId, reclaimed };
            isSuccess = true;
          }
          break;
        }

        case "RETRY_NON_FINANCIAL_JOB":
        case "RESUME_SAFE_JOB": {
          const job = await prisma.backgroundJob.findUnique({
            where: { id: plan.targetEntityId },
          });
          if (job && job.jobCategory !== "FINANCIAL") {
            await prisma.backgroundJob.update({
              where: { id: job.id },
              data: {
                status: "QUEUED",
                workerId: null,
                leaseToken: null,
                leaseExpiresAt: null,
                startedAt: null,
              },
            });
            executionResult = { jobId: job.id, resetTo: "QUEUED" };
            isSuccess = true;
          } else {
            throw new Error("Job is financial or not found; safe retry denied.");
          }
          break;
        }

        case "RECONNECT_PROVIDER": {
          const endpoint = ProviderReconciler.DEFAULT_ENDPOINTS.find(
            (e) => e.url === plan.targetEntityId
          ) || {
            name: "Target Provider",
            url: plan.targetEntityId,
            providerType: "near_rpc" as const,
          };
          const finding = await ProviderReconciler.reconcileEndpoint(endpoint);
          executionResult = finding;
          isSuccess = finding.classification === "MATCHED";
          break;
        }

        case "RECONCILE_ONLY":
        default: {
          executionResult = { note: "Reconcile only strategy executed" };
          isSuccess = true;
          break;
        }
      }

      // Record successful attempt finish
      await prisma.recoveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: isSuccess ? "SUCCESS" : "FAILED",
          executionResultJson: JSON.stringify(executionResult),
          finishedAt: new Date(),
        },
      });

      await prisma.recoveryPlan.update({
        where: { id: plan.id },
        data: { status: isSuccess ? "EXECUTED" : "FAILED" },
      });

      if (plan.incidentId) {
        await IncidentTimelineService.recordEvent({
          incidentId: plan.incidentId,
          eventType: "RECOVERY_EXECUTED",
          actorId: params.executedBy,
          actorType: "OPERATOR",
          notes: `Recovery attempt #${attemptNumber} executed with outcome: ${isSuccess ? "SUCCESS" : "FAILED"}.`,
        });
      }

      // Trigger independent post-recovery verification
      if (isSuccess) {
        await RecoveryVerificationService.verifyOutcome({
          planId: plan.id,
          attemptId: attempt.id,
          verificationStrategy:
            plan.targetEntityType === "EXECUTION"
              ? "INDEPENDENT_RPC_QUERY"
              : "DATABASE_CONSISTENCY_CHECK",
        });
      }

      // Record audit ledger event
      await recordAuditEvent({
        userId: plan.tenantId || "SYSTEM",
        eventType: "RECOVERY_PLAN_EXECUTED",
        description: `Recovery attempt #${attemptNumber} executed for plan ${plan.id}: ${isSuccess ? "SUCCESS" : "FAILED"}`,
        details: {
          planId: plan.id,
          attemptNumber,
          isSuccess,
          executedBy: params.executedBy,
        },
      });

      return {
        planId: plan.id,
        attemptId: attempt.id,
        status: isSuccess ? "EXECUTED" : "FAILED",
        result: executionResult,
      };
    } catch (err: any) {
      errorDetails = err.message;

      await prisma.recoveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "FAILED",
          errorDetails: err.message,
          finishedAt: new Date(),
        },
      });

      await prisma.recoveryPlan.update({
        where: { id: plan.id },
        data: { status: "FAILED" },
      });

      return {
        planId: plan.id,
        attemptId: attempt.id,
        status: "FAILED",
        error: err.message,
      };
    }
  }
}

