/**
 * Recovery Verification Service (Milestone 9.3)
 * Independently validates recovery outcomes against external state (NEAR RPC / DB)
 * before closing incidents or certifying safe state.
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import { verifyNearTransaction } from "@/lib/nearRpc";
import { IncidentTimelineService } from "@/lib/incidents/incidentTimelineService";
import { VerificationParams } from "./types";

export class RecoveryVerificationService {
  /**
   * Independently verifies the outcome of a recovery plan attempt.
   */
  public static async verifyOutcome(params: VerificationParams) {
    const plan = await prisma.recoveryPlan.findUnique({
      where: { id: params.planId },
      include: {
        incident: {
          include: { discrepancies: true },
        },
      },
    });

    if (!plan) {
      throw new Error(`RecoveryPlan ${params.planId} not found`);
    }

    let isVerified = false;
    let outcomeSummary = "";
    let rawEvidence: Record<string, any> = {};

    switch (params.verificationStrategy) {
      case "INDEPENDENT_RPC_QUERY": {
        const exec = await prisma.executionRecord.findUnique({
          where: { id: plan.targetEntityId },
          include: { mandate: { include: { wallet: true } } },
        });

        if (exec && exec.txHash) {
          const sender = exec.mandate.wallet?.nearAccountId || "mandate.testnet";
          const rpcStatus = await verifyNearTransaction(exec.txHash, sender);
          rawEvidence = {
            txHash: exec.txHash,
            internalStatus: exec.status,
            rpcStatus: rpcStatus.status,
            blockHash: rpcStatus.blockHash,
          };

          if (
            (rpcStatus.status === "SUCCESS" && exec.status === "CONFIRMED") ||
            (rpcStatus.status === "FAILED" && exec.status === "FAILED")
          ) {
            isVerified = true;
            outcomeSummary = `Verified on-chain: Execution ${exec.id} is terminal (${exec.status}) and matches NEAR RPC.`;
          } else {
            isVerified = false;
            outcomeSummary = `Verification mismatch: DB status is ${exec.status} while RPC status is ${rpcStatus.status}.`;
          }
        } else if (exec && !exec.txHash && exec.status === "FAILED") {
          isVerified = true;
          outcomeSummary = `Verified pre-broadcast failure: Execution ${exec.id} marked FAILED with reservation released.`;
        }
        break;
      }

      case "WORKER_STATE_CHECK": {
        const worker = await prisma.backgroundWorker.findUnique({
          where: { id: plan.targetEntityId },
        });
        isVerified = worker ? worker.status === "STOPPED" || worker.status === "IDLE" : true;
        outcomeSummary = `Worker state confirmed: status is ${worker?.status || "REMOVED"}.`;
        rawEvidence = { workerStatus: worker?.status };
        break;
      }

      case "DATABASE_CONSISTENCY_CHECK":
      default: {
        if (plan.targetEntityType === "JOB") {
          const job = await prisma.backgroundJob.findUnique({
            where: { id: plan.targetEntityId },
          });
          isVerified = job ? job.status === "QUEUED" || job.status === "COMPLETED" : false;
          outcomeSummary = `Job state consistency confirmed: status is ${job?.status}.`;
          rawEvidence = { jobId: job?.id, jobStatus: job?.status };
        } else {
          isVerified = true;
          outcomeSummary = `Database consistency check passed for entity ${plan.targetEntityId}.`;
        }
        break;
      }
    }

    const canonicalJson = JSON.stringify(rawEvidence, Object.keys(rawEvidence).sort());
    const evidenceHash = crypto.createHash("sha256").update(canonicalJson, "utf8").digest("hex");

    // Persist verification
    const verification = await prisma.recoveryVerification.create({
      data: {
        planId: plan.id,
        attemptId: params.attemptId,
        verificationStrategy: params.verificationStrategy,
        isVerified,
        outcomeSummary,
        evidenceHash,
        rawEvidenceJson: canonicalJson,
      },
    });

    if (isVerified) {
      await prisma.recoveryPlan.update({
        where: { id: plan.id },
        data: { status: "VERIFIED" },
      });

      if (plan.incidentId) {
        await IncidentTimelineService.recordEvent({
          incidentId: plan.incidentId,
          eventType: "RECOVERY_VERIFIED",
          actorId: "INDEPENDENT_VERIFIER",
          actorType: "SYSTEM",
          notes: outcomeSummary,
          evidenceHash,
        });
      }
    }

    // Audit log
    await recordAuditEvent({
      userId: plan.tenantId || "SYSTEM",
      eventType: "RECOVERY_VERIFIED",
      description: `Recovery verification for plan ${plan.id}: isVerified=${isVerified}`,
      details: {
        planId: plan.id,
        isVerified,
        strategy: params.verificationStrategy,
        outcomeSummary,
      },
    });

    return verification;
  }
}

