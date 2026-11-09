/**
 * Authoritative Autonomous Execution Boundary Service
 * Milestone 8 - Unified Execution Gateway & Provider Boundary Enforcement
 *
 * Core Principle: "AI proposes. Mandate enforces. The user controls. OutLayer executes."
 */

import crypto from "crypto";
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
import { executeOutlayerTransfer, executeOutlayerContractCall } from "@/lib/outlayer";
import { verifyNearTransaction } from "@/lib/nearRpc";
import { getDecryptedWalletApiKey } from "@/lib/security/walletCredentialService";
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
import {
  mintContractCallExecutionTicket,
  computeContractCallArgsHash,
  QuoteAuthorizationBinding,
  StorageProvisioningBinding,
} from "./contractCallTicket";
import { ContractCallValidationService } from "./contractCallValidationService";
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
        apiKey: getDecryptedWalletApiKey(mandate.wallet),
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

  /**
   * Authoritative Smart Contract Call Gateway
   * Milestone 15.3a: Narrowly scoped execution for explicitly allowlisted smart contract methods.
   * Enforces preflight allowlisting, tenant isolation, CAS budget reservation, cryptographic
   * ContractCallExecutionTicket minting, OutLayer TEE dispatch, and independent NEAR RPC verification.
   */
  public static async executeContractCall(
    request: ContractCallExecutionRequest
  ): Promise<ContractCallExecutionResult> {
    return DistributedIdempotencyManager.executeWithDistributedLock(request.idempotencyKey, async () => {
      const startTime = Date.now();

      // 0. OPERATIONAL CONTROL PLANE & TESTNET-ONLY CHECK
      await ExecutionGateService.assertFinancialExecutionAllowed("ExecutionBoundaryService.executeContractCall");

      const configuredNetwork = (process.env.NEAR_NETWORK || "testnet").toLowerCase();
      if (configuredNetwork === "mainnet") {
        throw new Error(
          "MAINNET_EXECUTION_PROHIBITED: Mandate Public Beta is strictly restricted to NEAR Testnet. Mainnet execution is disabled."
        );
      }

      const {
        userId,
        mandateId,
        agentId,
        taskId,
        objectiveId,
        receiverId,
        methodName,
        args,
        depositYocto,
        gasLimit,
        idempotencyKey,
        approvalId,
        isSimulated = false,
        quoteBinding,
        storageProvisioning,
      } = request;

      // 1. CONTRACT ALLOWLIST & SCHEMA VALIDATION (Fail-Closed)
      const validation = ContractCallValidationService.validateContractCall({
        receiverId,
        methodName,
        args,
        depositYocto,
        gasLimit,
        network: "testnet",
        quoteBinding,
        storageProvisioning,
      });

      if (!validation.valid) {
        throw new Error(`CONTRACT_CALL_VALIDATION_FAILED: ${validation.error}`);
      }

      const normalizedReceiverId = validation.normalizedReceiverId!;
      const normalizedMethodName = validation.normalizedMethodName!;
      const normalizedDeposit = validation.normalizedDeposit!;
      const normalizedGas = validation.normalizedGas!;

      // 2. TENANT ISOLATION & MANDATE RESOLUTION
      const mandate = await prisma.mandate.findUnique({
        where: { id: mandateId },
        include: { wallet: true },
      });

      if (!mandate) {
        throw new Error(`Mandate "${mandateId}" not found`);
      }

      if (mandate.userId !== userId) {
        await recordAuditEvent({
          userId,
          eventType: "CROSS_TENANT_ACCESS_DENIED",
          verdict: "DENIED",
          description: `User "${userId}" attempted unauthorized contract call against Mandate "${mandateId}" owned by "${mandate.userId}"`,
          mandateId,
          details: { userId, mandateOwnerId: mandate.userId, operation: "CONTRACT_CALL" },
        });
        throw new Error(`UNAUTHORIZED_TENANT_ACCESS: You do not have authority to execute against mandate "${mandateId}".`);
      }

      if (mandate.status !== "ACTIVE") {
        throw new Error(`MANDATE_NOT_ACTIVE: Mandate "${mandateId}" is in status "${mandate.status}". Execution requires ACTIVE status.`);
      }

      if (mandate.expiresAt && mandate.expiresAt <= new Date()) {
        throw new Error(`MANDATE_EXPIRED: Mandate "${mandateId}" expired at ${mandate.expiresAt.toISOString()}.`);
      }

      if (!mandate.wallet) {
        throw new Error(`Mandate "${mandateId}" has no linked execution wallet.`);
      }

      if (mandate.wallet.isFrozen) {
        throw new Error("CUSTODY_WALLET_FROZEN: Execution wallet is frozen.");
      }

      if (mandate.wallet.initializationStatus && mandate.wallet.initializationStatus !== "READY") {
        throw new Error(
          `CUSTODY_WALLET_NOT_READY: Wallet status is "${mandate.wallet.initializationStatus}". Expected READY.`
        );
      }

      // Revalidate quote binding and storage provisioning against resolved mandate custody wallet
      if (normalizedMethodName === "ft_transfer") {
        if (!quoteBinding) {
          throw new Error("UNAUTHORIZED_RECIPIENT_BYPASS: ft_transfer requires verified quote authorization binding.");
        }
        if (quoteBinding.refundRecipient.trim().toLowerCase() !== mandate.wallet.nearAccountId.trim().toLowerCase()) {
          throw new Error(
            `QUOTE_REFUND_RECIPIENT_MISMATCH: Quote refund recipient "${quoteBinding.refundRecipient}" does not match mandate custody wallet "${mandate.wallet.nearAccountId}".`
          );
        }
      }

      if (normalizedMethodName === "storage_deposit") {
        if (!storageProvisioning || !storageProvisioning.isDedicatedProvisioning) {
          throw new Error(
            "UNAUTHORIZED_STORAGE_PROVISIONING: storage_deposit requires dedicated, explicitly authorized provisioning binding."
          );
        }
        if (storageProvisioning.targetAccountId.trim().toLowerCase() !== mandate.wallet.nearAccountId.trim().toLowerCase()) {
          throw new Error(
            `UNAUTHORIZED_STORAGE_TARGET: storage_deposit may only target mandate custody wallet "${mandate.wallet.nearAccountId}".`
          );
        }
      }

      // 3. SPENDING POLICY & BUDGET RESERVATION
      // For near_deposit: attached deposit represents native NEAR being wrapped into wNEAR
      // For storage_deposit: attached deposit is native NEAR paid for token account storage
      // For ft_transfer: attached deposit is 1 yoctoNEAR protocol fee, and sourceAmount is token transfer
      const attachedDepositBig = BigInt(normalizedDeposit);
      if (normalizedMethodName === "near_deposit" || normalizedMethodName === "storage_deposit") {
        if (normalizedMethodName === "near_deposit") {
          if (mandate.perTxLimitYocto && attachedDepositBig > BigInt(mandate.perTxLimitYocto)) {
            throw new Error(
              `PER_TX_LIMIT_EXCEEDED: Requested deposit of ${yoctoToNear(normalizedDeposit)} NEAR exceeds per-transaction limit of ${yoctoToNear(mandate.perTxLimitYocto)} NEAR`
            );
          }
        }

        const currentSpent = BigInt(mandate.spentYocto || "0");
        const currentReserved = BigInt(mandate.reservedYocto || "0");
        const totalBudget = BigInt(mandate.totalBudgetYocto || "0");
        const availableBudget = totalBudget - (currentSpent + currentReserved);

        if (attachedDepositBig > availableBudget) {
          throw new Error(
            `MANDATE_BUDGET_EXCEEDED: Requested deposit of ${yoctoToNear(normalizedDeposit)} NEAR exceeds available budget of ${yoctoToNear(availableBudget.toString())} NEAR`
          );
        }
      }

      if (normalizedMethodName === "ft_transfer" && quoteBinding) {
        const transferAmountBig = BigInt(quoteBinding.sourceAmount);
        if (mandate.perTxLimitYocto && transferAmountBig > BigInt(mandate.perTxLimitYocto)) {
          throw new Error(
            `PER_TX_LIMIT_EXCEEDED: Requested token transfer of ${yoctoToNear(quoteBinding.sourceAmount)} exceeds per-transaction limit of ${yoctoToNear(mandate.perTxLimitYocto)}`
          );
        }
      }

      // Reserve attached native deposit in mandate budget
      const reservation = await reserveMandateBudgetAtomic({
        mandateId,
        amountYocto: normalizedDeposit,
      });

      if (!reservation.success) {
        throw new Error(`MANDATE_RESERVATION_FAILED: ${reservation.reason || "Failed to reserve budget"}`);
      }

      // 4. IDEMPOTENCY EVALUATION
      const payload = {
        operation: "CONTRACT_CALL",
        receiverId: normalizedReceiverId,
        methodName: normalizedMethodName,
        args,
        depositYocto: normalizedDeposit,
        gasLimit: normalizedGas,
        mandateId,
        agentId: agentId || null,
      };

      const idemCheck = await ExecutionIdempotencyService.evaluateIdempotency({
        idempotencyKey,
        userId,
        payload,
      });

      if (idemCheck.isDuplicate) {
        // Release the reservation made in step 3 since this is a duplicate replay
        await releaseMandateBudgetAtomic({ mandateId, amountYocto: normalizedDeposit });
        if (idemCheck.isMismatchedPayload) {
          throw new Error(idemCheck.error || "Idempotency key payload mismatch for contract call");
        }
        const existing = idemCheck.existingRecord!;
        return {
          success: existing.status === "CONFIRMED",
          executionId: existing.id,
          status: existing.status as ExecutionStatus,
          txHash: existing.txHash || undefined,
          blockHash: existing.blockHash || undefined,
          blockHeight: existing.blockHeight || undefined,
          outlayerRequestId: existing.outlayerRequestId || undefined,
          error: existing.errorReason || undefined,
          recoveryStatus: existing.recoveryStatus || undefined,
          settled: existing.status === "CONFIRMED",
          isSimulated: existing.isSimulated,
          durationMs: Date.now() - startTime,
        };
      }

      // 5. DURABLE EXECUTION RECORD CREATION
      const executionRecord = await prisma.executionRecord.create({
        data: {
          idempotencyKey,
          payloadHash: computePayloadHash(payload),
          status: "PROPOSED",
          operation: "CONTRACT_CALL",
          recipient: normalizedReceiverId,
          amountYocto: normalizedDeposit,
          token: "NEAR",
          nonce: `nonce_cc_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`,
          authSignature: "pending_envelope",
          expiresAt: new Date(Date.now() + 300 * 1000),
          isSimulated,
          mandate: { connect: { id: mandateId } },
          user: { connect: { id: userId } },
          ...(agentId ? { agent: { connect: { id: agentId } } } : {}),
          ...(taskId ? { task: { connect: { id: taskId } } } : {}),
          ...(objectiveId ? { objective: { connect: { id: objectiveId } } } : {}),
        },
      });

      // 6. CRYPTOGRAPHIC AUTHORIZATION ENVELOPE
      const envelope = await ExecutionAuthorizationService.issueAuthorization({
        executionId: executionRecord.id,
        userId,
        agentId,
        mandateId,
        operation: "CONTRACT_CALL",
        targetChain: "near",
        recipient: normalizedReceiverId,
        token: "NEAR",
        amountYocto: normalizedDeposit,
        parameters: {
          methodName: normalizedMethodName,
          argsHash: computeContractCallArgsHash(args),
          gasLimit: normalizedGas,
          quoteBinding: quoteBinding || null,
          storageProvisioning: storageProvisioning || null,
        },
      });

      await prisma.executionRecord.update({
        where: { id: executionRecord.id },
        data: {
          nonce: envelope.nonce,
          authSignature: envelope.signature,
          expiresAt: new Date(envelope.expiresAt),
          status: "AUTHORIZED",
        },
      });

      // Verify envelope & consume nonce atomically
      const authVerification = await ExecutionAuthorizationService.verifyAuthorization(envelope, {
        userId,
        mandateId,
        recipient: normalizedReceiverId,
        amountYocto: normalizedDeposit,
        operation: "CONTRACT_CALL",
      });

      if (!authVerification.valid) {
        await releaseMandateBudgetAtomic({ mandateId, amountYocto: normalizedDeposit });
        await prisma.executionRecord.update({
          where: { id: executionRecord.id },
          data: { status: "FAILED", errorReason: authVerification.reason },
        });
        throw new Error(`Contract Call Authorization Verification Failed: ${authVerification.reason}`);
      }

      await ExecutionAuthorizationService.consumeNonce(envelope.nonce, executionRecord.id);

      // Durable Dispatch Intent
      await prisma.dispatchIntent.upsert({
        where: { idempotencyKey },
        create: {
          executionId: executionRecord.id,
          idempotencyKey,
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

      // Simulation shortcut
      if (isSimulated) {
        const simTxHash = `simulated-cc-tx-${executionRecord.id}`;
        await settleMandateBudgetAtomic({ mandateId, amountYocto: normalizedDeposit, wasReserved: true });
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
            confirmedAt: now,
            reconciledAt: now,
          },
        });
        return {
          success: true,
          executionId: executionRecord.id,
          status: "CONFIRMED",
          txHash: simTxHash,
          settled: true,
          isSimulated: true,
          durationMs: Date.now() - startTime,
        };
      }

      // 7. MINT CONTRACT CALL CAPABILITY TICKET
      const ticket = mintContractCallExecutionTicket({
        executionId: executionRecord.id,
        userId,
        mandateId,
        objectiveId,
        operation: "CONTRACT_CALL",
        receiverId: normalizedReceiverId,
        methodName: normalizedMethodName,
        argsHash: computeContractCallArgsHash(args),
        depositYocto: normalizedDeposit,
        gasLimit: normalizedGas,
        network: "testnet",
        idempotencyKey,
        nonce: envelope.nonce,
        validitySeconds: 60,
        quoteBinding: quoteBinding || null,
        storageProvisioning: storageProvisioning || null,
      });

      // 8. DISPATCH TO OUTLAYER TEE ENCLAVE
      await prisma.executionRecord.update({
        where: { id: executionRecord.id },
        data: { status: "BROADCAST" },
      });

      await recordAuditEvent({
        userId,
        eventType: "TRANSACTION_BROADCAST",
        verdict: "BROADCAST",
        description: `Dispatching contract call to OutLayer TEE: ${normalizedMethodName} on ${normalizedReceiverId}`,
        mandateId,
        details: {
          executionId: executionRecord.id,
          receiverId: normalizedReceiverId,
          methodName: normalizedMethodName,
          depositYocto: normalizedDeposit,
        },
      });

      let outlayerResult: any;
      try {
        outlayerResult = await executeOutlayerContractCall({
          apiKey: getDecryptedWalletApiKey(mandate.wallet),
          receiver_id: normalizedReceiverId,
          method_name: normalizedMethodName,
          args,
          deposit: normalizedDeposit,
          gas: normalizedGas,
          idempotencyKey,
          ticket,
          mandateWalletAccountId: mandate.wallet.nearAccountId,
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
          description: `Ambiguous contract call response from OutLayer: ${broadcastErr.message}. Budget reservation held pending recovery.`,
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
          durationMs: Date.now() - startTime,
        };
      }

      // Handle failed provider response
      if (outlayerResult.status === "failed") {
        const actualTxHash = outlayerResult.tx_hash;

        // If an on-chain transaction hash exists (e.g. HTTP 422 revert), verify on NEAR RPC
        if (actualTxHash) {
          const rpcStatus = await verifyNearTransaction(actualTxHash, mandate.wallet.nearAccountId);
          if (rpcStatus.status === "FAILED") {
            await releaseMandateBudgetAtomic({ mandateId, amountYocto: normalizedDeposit });
            await prisma.executionRecord.update({
              where: { id: executionRecord.id },
              data: {
                status: "FAILED",
                txHash: actualTxHash,
                errorReason: outlayerResult.error || "On-chain contract call failed",
                recoveryStatus: "RESOLVED",
              },
            });
            return {
              success: false,
              executionId: executionRecord.id,
              status: "FAILED",
              txHash: actualTxHash,
              error: outlayerResult.error || "On-chain contract call failed",
              settled: false,
              isSimulated: false,
              durationMs: Date.now() - startTime,
            };
          }
        }

        // If no on-chain tx occurred (pre-broadcast rejection), safely release budget
        if (!actualTxHash) {
          await releaseMandateBudgetAtomic({ mandateId, amountYocto: normalizedDeposit });
          await prisma.executionRecord.update({
            where: { id: executionRecord.id },
            data: {
              status: "FAILED",
              errorReason: outlayerResult.error || "Contract call refused by provider",
            },
          });
          return {
            success: false,
            executionId: executionRecord.id,
            status: "FAILED",
            error: outlayerResult.error || "Contract call refused",
            settled: false,
            isSimulated: false,
            durationMs: Date.now() - startTime,
          };
        }
      }

      // 9. INDEPENDENT ON-CHAIN NEAR RPC VERIFICATION
      const actualTxHash = outlayerResult.tx_hash;
      await prisma.executionRecord.update({
        where: { id: executionRecord.id },
        data: {
          status: "CONFIRMING",
          txHash: actualTxHash || null,
          outlayerRequestId: outlayerResult.request_id || null,
        },
      });

      let rpcCheck: any = { status: "PENDING" };
      if (actualTxHash) {
        rpcCheck = await verifyNearTransaction(actualTxHash, mandate.wallet.nearAccountId);
      }

      if (rpcCheck.status === "SUCCESS") {
        await settleMandateBudgetAtomic({
          mandateId,
          amountYocto: normalizedDeposit,
          wasReserved: true,
        });

        const confirmedAt = new Date();
        await prisma.executionRecord.update({
          where: { id: executionRecord.id },
          data: {
            status: "CONFIRMED",
            blockHash: rpcCheck.blockHash || null,
            confirmedAt,
            reconciledAt: confirmedAt,
          },
        });

        await recordAuditEvent({
          userId,
          eventType: "TRANSACTION_CONFIRMED",
          verdict: "CONFIRMED",
          description: `Contract call ${normalizedMethodName} on ${normalizedReceiverId} verified on NEAR RPC: ${actualTxHash}`,
          mandateId,
          details: { executionId: executionRecord.id, txHash: actualTxHash },
        });

        return {
          success: true,
          executionId: executionRecord.id,
          status: "CONFIRMED",
          txHash: actualTxHash,
          blockHash: rpcCheck.blockHash,
          outlayerRequestId: outlayerResult.request_id,
          settled: true,
          isSimulated: false,
          durationMs: Date.now() - startTime,
          result: outlayerResult.result,
        };
      }

      if (rpcCheck.status === "FAILED") {
        await releaseMandateBudgetAtomic({ mandateId, amountYocto: normalizedDeposit });
        await prisma.executionRecord.update({
          where: { id: executionRecord.id },
          data: {
            status: "FAILED",
            errorReason: rpcCheck.error || "Contract call receipt execution failed on NEAR network",
          },
        });

        return {
          success: false,
          executionId: executionRecord.id,
          status: "FAILED",
          txHash: actualTxHash,
          error: rpcCheck.error || "Receipt execution failed",
          settled: false,
          isSimulated: false,
          durationMs: Date.now() - startTime,
        };
      }

      // Ambiguous: RPC query returned PENDING or TIMEOUT (keep reservation strictly held!)
      return {
        success: true,
        executionId: executionRecord.id,
        status: "CONFIRMING",
        txHash: actualTxHash,
        outlayerRequestId: outlayerResult.request_id,
        settled: false,
        isSimulated: false,
        durationMs: Date.now() - startTime,
      };
    });
  }
}

export interface ContractCallExecutionRequest {
  userId: string;
  mandateId: string;
  agentId?: string;
  taskId?: string;
  objectiveId?: string;
  receiverId: string;
  methodName: string;
  args: Record<string, any>;
  depositYocto: string;
  gasLimit?: string;
  idempotencyKey: string;
  approvalId?: string;
  isSimulated?: boolean;
  jobId?: string;
  leaseGeneration?: number;
  quoteBinding?: QuoteAuthorizationBinding | null;
  storageProvisioning?: StorageProvisioningBinding | null;
}

export interface ContractCallExecutionResult {
  success: boolean;
  executionId?: string;
  status: ExecutionStatus | "FAILED" | "CONFIRMING" | "CONFIRMED";
  txHash?: string;
  blockHash?: string;
  blockHeight?: number;
  outlayerRequestId?: string;
  error?: string;
  recoveryStatus?: string;
  settled: boolean;
  isSimulated: boolean;
  durationMs: number;
  result?: any;
}
