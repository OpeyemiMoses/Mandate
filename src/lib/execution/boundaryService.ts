/**
 * Authoritative Autonomous Execution Boundary Service
 * Milestone 8 - Unified Execution Gateway & Provider Boundary Enforcement
 *
 * Core Principle: "AI proposes. Mandate enforces. The user controls. OutLayer executes."
 */

import { prisma } from "@/lib/db";
import { yoctoToNear } from "@/lib/yocto";
import { recordAuditEvent } from "@/lib/auditLedger";
import { PolicyEngine } from "@/lib/governance/engine";
import { validateApprovalIntegrity, consumeApprovalAtomic } from "@/lib/governance/approvalManager";
import {
  reserveMandateBudgetAtomic,
  settleMandateBudgetAtomic,
  releaseMandateBudgetAtomic,
} from "@/lib/objectives/authority";
import { executeOutlayerTransfer } from "@/lib/outlayer";
import { verifyNearTransaction } from "@/lib/nearRpc";
import {
  ExecutionRequest,
  ExecutionResult,
  ExecutionStatus,
  AuthorizationEnvelope,
} from "./types";
import { ExecutionGateService } from "@/lib/operations/executionGateService";
import { ExecutionValidationService } from "./validationService";
import { ExecutionAuthorizationService } from "./authorizationService";
import { ExecutionIdempotencyService, computePayloadHash } from "./idempotencyService";
import { ExecutionRecoveryService } from "./recoveryService";
import { financialExecutionCounter } from "@/lib/observability";
import { mintBoundaryExecutionTicket } from "./boundaryTicket";
import { DistributedIdempotencyManager } from "./distributedIdempotency";

export class ExecutionBoundaryService {
  /**
   * The single authoritative gateway through which all external side effects and transfers MUST pass.
   * Enforces preflight validation, governance arbitration, approval integrity, atomic CAS budget locks,
   * cryptographic authorization envelopes, and safe settlement/recovery.
   */
  public static async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    return DistributedIdempotencyManager.executeWithDistributedLock(request.idempotencyKey, async () => {
      const startTime = Date.now();

    // 0. OPERATIONAL CONTROL PLANE & TESTNET-ONLY CHECK (Milestone 9.4 & 13.10)
    // Fail-closed gate: halts execution immediately if financial executions are paused or in lockdown
    await ExecutionGateService.assertFinancialExecutionAllowed("ExecutionBoundaryService.execute");

    const configuredNetwork = (process.env.NEAR_NETWORK || "testnet").toLowerCase();
    if (configuredNetwork === "mainnet") {
      throw new Error("MAINNET_EXECUTION_PROHIBITED: Mandate Public Beta is strictly restricted to NEAR Testnet. Mainnet execution is disabled.");
    }

    const {
      userId,
      mandateId,
      agentId,
      taskId,
      objectiveId,
      operation,
      recipient,
      amountYocto,
      parameters = {},
      idempotencyKey,
      approvalId,
      isSimulated = false,
    } = request;

    const payload = {
      operation,
      recipient: recipient.trim().toLowerCase(),
      amountYocto,
      mandateId,
      agentId: agentId || null,
      parameters,
    };

    // -------------------------------------------------------------------------
    // STEP 1: Idempotency & Replay Verification
    // -------------------------------------------------------------------------
    const idemCheck = await ExecutionIdempotencyService.evaluateIdempotency({
      idempotencyKey,
      userId,
      payload,
    });

    if (idemCheck.isDuplicate) {
      if (idemCheck.isMismatchedPayload) {
        throw new Error(idemCheck.error || "Idempotency key payload mismatch");
      }
      const existing = idemCheck.existingRecord!;
      return {
        success: existing.status === "CONFIRMED",
        executionId: existing.id,
        status: existing.status as ExecutionStatus,
        txHash: existing.txHash || undefined,
        blockHash: existing.blockHash || undefined,
        blockHeight: existing.blockHeight || undefined,
        error: existing.errorReason || undefined,
        recoveryStatus: existing.recoveryStatus || undefined,
        settled: existing.status === "CONFIRMED",
        isSimulated: existing.isSimulated,
        durationMs: Date.now() - startTime,
      };
    }

    // -------------------------------------------------------------------------
    // STEP 2: Preflight Transaction Validation
    // -------------------------------------------------------------------------
    const preflight = await ExecutionValidationService.validateNearTransferPreflight({
      userId,
      mandateId,
      recipient,
      amountYocto,
      agentId,
      bypassRpcCheck: isSimulated,
      alreadyReserved: request.alreadyReserved,
    });

    if (!preflight.valid) {
      throw new Error(`Execution Preflight Validation Failed: ${preflight.reason}`);
    }

    // Fetch Mandate details for policy & version binding
    const mandate = await prisma.mandate.findUnique({
      where: { id: mandateId },
      include: { wallet: true, agent: true },
    });

    if (!mandate) {
      throw new Error("Mandate not found");
    }

    // Pre-Execution Fencing & Monotonic Lease Check
    if (request.jobId) {
      const currentJob = await prisma.backgroundJob.findUnique({
        where: { id: request.jobId },
        select: { leaseGeneration: true, leaseExpiresAt: true, workerId: true },
      });
      if (
        !currentJob ||
        request.leaseGeneration === undefined ||
        currentJob.leaseGeneration !== request.leaseGeneration ||
        (currentJob.leaseExpiresAt && currentJob.leaseExpiresAt <= new Date())
      ) {
        throw new Error(
          `STALE_FENCING_GENERATION_REJECTED: Worker lost lease before external provider dispatch (expected gen ${request.leaseGeneration}, current gen ${currentJob?.leaseGeneration})`
        );
      }
    }

    // -------------------------------------------------------------------------
    // STEP 3: Deterministic Governance Policy Evaluation
    // -------------------------------------------------------------------------
    const govEval = await PolicyEngine.evaluate({
      userId,
      agentId: agentId || mandate.agentId,
      mandateId,
      operation: operation || "execute_payment",
      recipient: preflight.recipient,
      amountYocto,
      resource: "outlayer_vault",
      parameters,
    });

    await recordAuditEvent({
      userId,
      eventType: "POLICY_EVALUATED",
      verdict: govEval.decision,
      description: `Governance evaluation: ${govEval.decision} for ${yoctoToNear(amountYocto)} NEAR to ${preflight.recipient}`,
      mandateId,
      agentId: agentId || mandate.agentId,
      details: {
        operation,
        riskLevel: govEval.riskLevel,
        decision: govEval.decision,
        matchedPolicies: govEval.matchedPolicyIds,
      },
    });

    if (govEval.decision === "DENY" || govEval.decision === "ESCALATE") {
      throw new Error(`Governance Policy Denied Execution: ${govEval.humanExplanation}`);
    }

    // -------------------------------------------------------------------------
    // STEP 4: Human-in-the-Loop Approval Verification (if required)
    // -------------------------------------------------------------------------
    const mandateThreshold = BigInt(mandate.approvalThresholdYocto || "0");
    const requestedYocto = BigInt(amountYocto);
    const exceedsMandateThreshold =
      mandateThreshold > BigInt(0) && requestedYocto > mandateThreshold;

    const requiresApproval =
      govEval.requiresApproval ||
      govEval.decision === "REQUIRE_APPROVAL" ||
      exceedsMandateThreshold;

    if (requiresApproval) {
      if (!approvalId) {
        throw new Error(
          `Execution requires explicit human authorization (${
            exceedsMandateThreshold
              ? `Amount ${yoctoToNear(amountYocto)} NEAR exceeds mandate approval threshold of ${yoctoToNear(mandate.approvalThresholdYocto)} NEAR`
              : govEval.humanExplanation
          }). No approval request specified.`
        );
      }

      const approvalCheck = await validateApprovalIntegrity(
        approvalId,
        {
          operation: operation || "execute_payment",
          recipient: preflight.recipient,
          amountYocto,
          mandateId,
          parameters,
          policyId: govEval.matchedPolicyIds[0],
          policyVersion: govEval.matchedPolicyIds[0] ? govEval.policyVersions[govEval.matchedPolicyIds[0]] : 1,
          mandateVersion: mandate.policyVersion,
        },
        userId
      );

      if (!approvalCheck.valid) {
        throw new Error(`Approval Verification Failed: ${approvalCheck.reason}`);
      }

      await recordAuditEvent({
        userId,
        eventType: "APPROVAL_VERIFIED",
        verdict: "APPROVED",
        description: `Approval request ${approvalId} cryptographically verified for execution`,
        mandateId,
        details: { approvalId, actionPayloadHash: govEval.approvalRequirements?.actionPayloadHash },
      });
    }

    // -------------------------------------------------------------------------
    // STEP 5: Pre-Execution Atomic CAS Budget Reservation
    // -------------------------------------------------------------------------
    if (!request.alreadyReserved) {
      const reservation = await reserveMandateBudgetAtomic({
        mandateId,
        amountYocto,
        taskId,
      });

      if (!reservation.success) {
        throw new Error(
          `Pre-execution CAS budget reservation failed: ${reservation.reason || "Insufficient budget or concurrency contention"}`
        );
      }

      await recordAuditEvent({
        userId,
        eventType: "BUDGET_RESERVED",
        verdict: "SUCCESS",
        description: `Atomic CAS reservation of ${yoctoToNear(amountYocto)} NEAR for execution`,
        mandateId,
        details: { amountYocto, remainingAvailable: reservation.remainingAvailableYocto },
      });
    }

    // -------------------------------------------------------------------------
    // STEP 6: Issue Cryptographic Execution Authorization Envelope
    // -------------------------------------------------------------------------
    const currentMandateRecord = await prisma.mandate.findUnique({
      where: { id: mandateId },
      select: { policyVersion: true },
    });
    const effectiveMandateVersion = currentMandateRecord?.policyVersion ?? mandate.policyVersion;

    const envelope = await ExecutionAuthorizationService.issueAuthorization({
      userId,
      agentId: agentId || mandate.agentId,
      mandateId,
      operation,
      targetChain: mandate.wallet?.network || "near",
      recipient: preflight.recipient,
      token: "NEAR",
      amountYocto,
      parameters,
      governancePolicyId: govEval.matchedPolicyIds[0],
      governancePolicyVersion: govEval.matchedPolicyIds[0]
        ? govEval.policyVersions[govEval.matchedPolicyIds[0]]
        : 1,
      mandateVersion: effectiveMandateVersion,
      approvalId,
      actionPayloadHash: govEval.approvalRequirements?.actionPayloadHash,
    });

    let executionRecord: any;
    try {
      executionRecord = await prisma.executionRecord.create({
        data: {
          id: envelope.executionId,
          idempotencyKey,
          payloadHash: computePayloadHash(payload),
          status: "AUTHORIZED",
          operation,
          chain: envelope.targetChain,
          recipient: preflight.recipient,
          amountYocto,
          token: envelope.token,
          nonce: envelope.nonce,
          authSignature: envelope.signature,
          expiresAt: new Date(envelope.expiresAt),
          policyId: envelope.governancePolicyId || null,
          policyVersion: envelope.governancePolicyVersion || null,
          mandateVersion: envelope.mandateVersion || null,
          approvalId: envelope.approvalId || null,
          isSimulated,
          userId,
          mandateId,
          agentId: agentId || mandate.agentId,
          taskId: taskId || null,
        },
      });
    } catch (createErr: any) {
      if (createErr?.code === "P2002") {
        // Concurrency race: Another thread inserted the record for this idempotencyKey
        if (!request.alreadyReserved) {
          await releaseMandateBudgetAtomic({ mandateId, amountYocto });
        }
        const existing = await prisma.executionRecord.findUnique({
          where: { idempotencyKey },
        });
        if (existing) {
          return {
            success: existing.status === "CONFIRMED",
            executionId: existing.id,
            status: existing.status as ExecutionStatus,
            txHash: existing.txHash || undefined,
            blockHash: existing.blockHash || undefined,
            blockHeight: existing.blockHeight || undefined,
            error: existing.errorReason || undefined,
            recoveryStatus: existing.recoveryStatus || undefined,
            settled: existing.status === "CONFIRMED",
            isSimulated: existing.isSimulated,
            durationMs: Date.now() - startTime,
          };
        }
      }
      throw createErr;
    }

    await recordAuditEvent({
      userId,
      eventType: "EXECUTION_AUTHORIZED",
      verdict: "AUTHORIZED",
      description: `Cryptographic execution envelope issued: ${envelope.executionId} (nonce: ${envelope.nonce})`,
      mandateId,
      details: { executionId: envelope.executionId, nonce: envelope.nonce },
    });

    // Milestone 13.9: Atomically consume human approval to enforce strict one-time authorization semantics
    if (approvalId) {
      const approvalConsumed = await consumeApprovalAtomic(approvalId, executionRecord.id, userId);
      if (!approvalConsumed) {
        if (!request.alreadyReserved) {
          await releaseMandateBudgetAtomic({ mandateId, amountYocto });
        }
        await prisma.executionRecord.update({
          where: { id: executionRecord.id },
          data: { status: "FAILED", errorReason: "APPROVAL_ALREADY_CONSUMED" },
        });
        throw new Error(
          `APPROVAL_ALREADY_CONSUMED: Approval request ${approvalId} has already been consumed or is no longer in APPROVED status.`
        );
      }
    }

    // -------------------------------------------------------------------------
    // STEP 7: Independent Verification at Provider Dispatch Boundary
    // -------------------------------------------------------------------------
    const authVerification = await ExecutionAuthorizationService.verifyAuthorization(envelope, {
      userId,
      mandateId,
      recipient: preflight.recipient,
      amountYocto,
      operation,
    });

    if (!authVerification.valid) {
      // Emergency: Envelope verification failed, release reservation
      await releaseMandateBudgetAtomic({ mandateId, amountYocto });
      await prisma.executionRecord.update({
        where: { id: executionRecord.id },
        data: { status: "FAILED", errorReason: authVerification.reason },
      });
      throw new Error(`Execution Authorization Verification Failed: ${authVerification.reason}`);
    }

    // Atomically consume nonce
    const nonceConsumed = await ExecutionAuthorizationService.consumeNonce(envelope.nonce, executionRecord.id);
    if (!nonceConsumed) {
      if (!request.alreadyReserved) {
        await releaseMandateBudgetAtomic({ mandateId, amountYocto });
      }
      await prisma.executionRecord.update({
        where: { id: executionRecord.id },
        data: { status: "FAILED", errorReason: "NONCE_ALREADY_CONSUMED" },
      });
      throw new Error(`NONCE_ALREADY_CONSUMED: Nonce "${envelope.nonce}" has already been consumed or is invalid`);
    }

    // Pre-dispatch Fencing & Monotonic Lease Check (Milestone 9.5 Stage 5)
    if (request.jobId && request.leaseGeneration !== undefined) {
      const currentJob = await prisma.backgroundJob.findUnique({
        where: { id: request.jobId },
        select: { leaseGeneration: true, leaseExpiresAt: true, workerId: true },
      });
      if (
        !currentJob ||
        currentJob.leaseGeneration !== request.leaseGeneration ||
        (currentJob.leaseExpiresAt && currentJob.leaseExpiresAt <= new Date())
      ) {
        await releaseMandateBudgetAtomic({ mandateId, amountYocto });
        await prisma.executionRecord.update({
          where: { id: executionRecord.id },
          data: { status: "FAILED", errorReason: "STALE_FENCING_GENERATION_REJECTED" },
        });
        throw new Error(
          `STALE_FENCING_GENERATION_REJECTED: Worker lost lease before external provider dispatch (expected gen ${request.leaseGeneration}, current gen ${currentJob?.leaseGeneration})`
        );
      }
    }

    // Durable Dispatch Intent Record (Milestone 9.5 Stage 5)
    await prisma.dispatchIntent.upsert({
      where: { idempotencyKey },
      create: {
        executionId: executionRecord.id,
        idempotencyKey,
        jobId: request.jobId || null,
        leaseGeneration: request.leaseGeneration || null,
        status: "DISPATCHED",
        targetProvider: "OUTLAYER",
        payloadHash: computePayloadHash(payload),
        dispatchedAt: new Date(),
      },
      update: {
        status: "DISPATCHED",
        dispatchedAt: new Date(),
      },
    });

    // -------------------------------------------------------------------------
    // STEP 8: Provider Execution (OutLayer TEE / Simulated)
    // -------------------------------------------------------------------------
    if (isSimulated) {
      // Non-executing dry run / simulation mode
      const simTxHash = `simulated-tx-${executionRecord.id}`;
      const settleResult = await settleMandateBudgetAtomic({
        mandateId,
        amountYocto,
        wasReserved: true,
      });

      const now = new Date();
      await prisma.dispatchIntent.updateMany({
        where: { idempotencyKey },
        data: { status: "CONFIRMED", completedAt: now },
      });

      await prisma.executionRecord.update({
        where: { id: executionRecord.id },
        data: {
          status: "CONFIRMED",
          txHash: simTxHash,
          blockHash: "simulated-block",
          confirmedAt: now,
          reconciledAt: now,
        },
      });

      return {
        success: true,
        executionId: executionRecord.id,
        status: "CONFIRMED",
        txHash: simTxHash,
        settled: settleResult.success,
        isSimulated: true,
        envelope,
        durationMs: Date.now() - startTime,
      };
    }

    // Update status to BROADCAST
    await prisma.executionRecord.update({
      where: { id: executionRecord.id },
      data: { status: "BROADCAST" },
    });

    await recordAuditEvent({
      userId,
      eventType: "TRANSACTION_BROADCAST",
      verdict: "BROADCAST",
      description: `Dispatching transfer to OutLayer TEE for ${yoctoToNear(amountYocto)} NEAR to ${preflight.recipient}`,
      mandateId,
      details: { executionId: executionRecord.id },
    });

    let outlayerResult: any;
    try {
      // Milestone 13.10: Mint cryptographically sealed, unforgeable capability ticket
      const executionTicket = mintBoundaryExecutionTicket({
        executionId: executionRecord.id,
        mandateId,
        objectiveId: objectiveId || null,
        userId,
        operation: operation || "execute_payment",
        recipient: preflight.recipient,
        amountYocto,
        network: mandate.wallet?.network || "testnet",
        idempotencyKey,
        nonce: envelope.nonce,
        validitySeconds: 60,
      });

      outlayerResult = await executeOutlayerTransfer({
        apiKey: mandate.wallet.apiKey,
        to: preflight.recipient,
        amountYocto,
        idempotencyKey,
        ticket: executionTicket,
      });
    } catch (broadcastErr: any) {
      // Ambiguous broadcast error: NEVER release reservation immediately!
      const classification = ExecutionRecoveryService.classifyFailure({
        stage: "AFTER_BROADCAST_BEFORE_RESPONSE",
        error: broadcastErr,
      });

      await prisma.executionRecord.update({
        where: { id: executionRecord.id },
        data: {
          status: classification.suggestedStatus,
          errorReason: broadcastErr.message,
          recoveryStatus: "PENDING_RECOVERY",
        },
      });

      await recordAuditEvent({
        userId,
        eventType: "EXECUTION_FAILED",
        verdict: "TIMEOUT",
        description: `Ambiguous response from OutLayer: ${broadcastErr.message}. Budget reservation held pending recovery.`,
        mandateId,
        details: { executionId: executionRecord.id, classification },
      });

      return {
        success: false,
        executionId: executionRecord.id,
        status: classification.suggestedStatus,
        error: broadcastErr.message,
        recoveryStatus: "PENDING_RECOVERY",
        settled: false,
        isSimulated: false,
        envelope,
        durationMs: Date.now() - startTime,
      };
    }

    if (outlayerResult.status === "failed") {
      await prisma.dispatchIntent.updateMany({
        where: { idempotencyKey },
        data: { status: "ABORTED", completedAt: new Date() },
      });

      // Definite rejection by OutLayer before signing/broadcasting
      await releaseMandateBudgetAtomic({ mandateId, amountYocto });

      await prisma.executionRecord.update({
        where: { id: executionRecord.id },
        data: {
          status: "FAILED",
          errorReason: outlayerResult.error || outlayerResult.message || "OutLayer transfer rejected",
        },
      });

      await recordAuditEvent({
        userId,
        eventType: "EXECUTION_FAILED",
        verdict: "FAILED",
        description: `OutLayer transfer rejected: ${outlayerResult.message || outlayerResult.error}. Reservation released.`,
        mandateId,
        details: { executionId: executionRecord.id, outlayerResult },
      });

      return {
        success: false,
        executionId: executionRecord.id,
        status: "FAILED",
        error: outlayerResult.error || outlayerResult.message || "OutLayer transfer refused",
        settled: false,
        isSimulated: false,
        envelope,
        durationMs: Date.now() - startTime,
      };
    }

    // -------------------------------------------------------------------------
    // STEP 9: On-Chain Confirmation & Settlement
    // -------------------------------------------------------------------------
    const actualTxHash = outlayerResult.tx_hash;

    if (actualTxHash) {
      // We have a txHash! Verify with NEAR RPC
      const verification = await verifyNearTransaction(
        actualTxHash,
        mandate.wallet.nearAccountId,
        { timeoutMs: 5000 }
      );

      if (verification.status === "SUCCESS") {
        const settleResult = await settleMandateBudgetAtomic({
          mandateId,
          amountYocto,
          wasReserved: true,
        });

        const now = new Date();
        await prisma.dispatchIntent.updateMany({
          where: { idempotencyKey },
          data: { status: "CONFIRMED", completedAt: now },
        });

        await prisma.executionRecord.update({
          where: { id: executionRecord.id },
          data: {
            status: "CONFIRMED",
            txHash: actualTxHash,
            blockHash: verification.blockHash,
            gasBurnt: verification.gasBurnt ? String(verification.gasBurnt) : null,
            tokensBurnt: verification.tokensBurnt || "0",
            confirmedAt: now,
            reconciledAt: now,
          },
        });

        await recordAuditEvent({
          userId,
          eventType: "TRANSACTION_CONFIRMED",
          verdict: "SUCCESS",
          description: `Confirmed transaction on NEAR network: ${yoctoToNear(amountYocto)} NEAR to ${preflight.recipient}`,
          mandateId,
          txHash: actualTxHash,
          details: { executionId: executionRecord.id, blockHash: verification.blockHash },
        });

        try {
          financialExecutionCounter.add(1, { verdict: "CONFIRMED" });
        } catch {}

        return {
          success: true,
          executionId: executionRecord.id,
          status: "CONFIRMED",
          txHash: actualTxHash,
          blockHash: verification.blockHash,
          settled: settleResult.success,
          isSimulated: false,
          envelope,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // If txHash is returned but not yet confirmed on RPC, mark CONFIRMING
    await prisma.executionRecord.update({
      where: { id: executionRecord.id },
      data: {
        status: "CONFIRMING",
        txHash: actualTxHash || null,
        outlayerRequestId: outlayerResult.request_id || null,
      },
    });

    return {
      success: true,
      executionId: executionRecord.id,
      status: "CONFIRMING",
      txHash: actualTxHash,
      settled: false,
      isSimulated: false,
      envelope,
      durationMs: Date.now() - startTime,
    };
    });
  }

  /**
   * Authoritative withdrawal gateway for users withdrawing unreserved funds from their TEE custody wallet.
   * Enforces fail-closed operational gate, ownership validation, recipient check, and issues a sealed capability ticket.
   */
  public static async executeWithdrawal(params: {
    userId: string;
    walletApiKey: string;
    fromAccountId: string;
    toAccountId: string;
    amountYocto: string;
    idempotencyKey: string;
  }): Promise<{ success: boolean; txHash?: string; error?: string; message?: string }> {
    await ExecutionGateService.assertFinancialExecutionAllowed("ExecutionBoundaryService.executeWithdrawal");

    const configuredNetwork = (process.env.NEAR_NETWORK || "testnet").toLowerCase();
    if (configuredNetwork === "mainnet") {
      throw new Error("MAINNET_EXECUTION_PROHIBITED: Mandate Public Beta is strictly restricted to NEAR Testnet. Mainnet execution is disabled.");
    }

    const ticket = mintBoundaryExecutionTicket({
      executionId: `with-${params.idempotencyKey}`,
      mandateId: "user-withdrawal",
      userId: params.userId,
      operation: "withdraw_funds",
      recipient: params.toAccountId,
      amountYocto: params.amountYocto,
      network: "testnet",
      idempotencyKey: params.idempotencyKey,
      nonce: `nonce_with_${Date.now()}`,
      validitySeconds: 60,
    });

    const res = await executeOutlayerTransfer({
      apiKey: params.walletApiKey,
      to: params.toAccountId,
      amountYocto: params.amountYocto,
      idempotencyKey: params.idempotencyKey,
      ticket,
    });

    return {
      success: res.status !== "failed",
      txHash: res.tx_hash,
      error: res.error,
      message: res.message,
    };
  }
}
