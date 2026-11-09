/**
 * MANDATE — Two-Phase NEAR Intents Execution Pipeline Service
 * Milestone 15.3b: Provider Integration & Two-Phase Execution Pipeline
 *
 * Coordinates the full institutional Intents lifecycle:
 * Phase 1: Propose, Quote Discovery, Quote Verification, Policy Check & Approval Binding
 * Phase 2: Budget Reservation (CAS lock), Wrap (near_deposit), Verify Wrap (NEAR RPC),
 *          Deposit (ft_transfer to quote depositAddress), Verify Deposit (NEAR RPC),
 *          Notify Provider (/v0/deposit/submit).
 *
 * Core Principle: "AI proposes. Mandate enforces. The user controls. OutLayer executes."
 * Reuses M15.3a / M15.3a.1 ExecutionBoundaryService.executeContractCall without bypass.
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import { reserveMandateBudgetAtomic } from "@/lib/objectives/authority";
import { ExecutionBoundaryService } from "@/lib/execution/boundaryService";
import { verifyNearTransaction } from "@/lib/nearRpc";
import { assertNearIntentsEnabled } from "./featureGate";
import {
  NearIntentsProviderService,
  APPROVED_SOURCE_ASSET,
} from "./nearIntentsProviderService";
import { QuoteAuthorizationService } from "./quoteAuthorizationService";
import { StorageRegistrationService } from "./storageRegistrationCheck";
import { IntentsAccountingService } from "./intentsAccounting";
import { IntentStateMachine } from "./intentStateMachine";
import { IntentProposalParams } from "./types";

export class IntentsExecutionService {
  /**
   * Phase 1: Proposes an Intents swap, queries dynamic provider quote,
   * verifies provider quote integrity, checks mandate policy, and records IntentOperation.
   */
  public static async proposeIntentSwap(params: IntentProposalParams): Promise<{
    intentId: string;
    correlationId: string;
    depositAddress: string;
    sourceAmountYocto: string;
    expectedDestinationAmount: string;
    minDestinationAmount: string;
    status: string;
    requiresApproval: boolean;
  }> {
    // 0. Feature Gate & Testnet Check
    assertNearIntentsEnabled("IntentsExecutionService.proposeIntentSwap");

    const configuredNetwork = (process.env.NEAR_NETWORK || "testnet").toLowerCase();
    if (configuredNetwork === "mainnet") {
      throw new Error("MAINNET_EXECUTION_PROHIBITED: Mandate Public Beta is strictly restricted to NEAR Testnet.");
    }

    const {
      userId,
      mandateId,
      objectiveId,
      sourceAsset,
      destinationAsset,
      amountYocto,
      destinationRecipient,
      slippageToleranceBps = 100,
      deadlineMinutes = 30,
      idempotencyKey,
    } = params;

    // 1. Mandate & Tenant Validation
    const mandate = await prisma.mandate.findUnique({
      where: { id: mandateId },
      include: { wallet: true },
    });

    if (!mandate) {
      throw new Error(`Mandate "${mandateId}" not found.`);
    }

    if (mandate.userId !== userId) {
      throw new Error(`UNAUTHORIZED_TENANT_ACCESS: User "${userId}" does not own mandate "${mandateId}".`);
    }

    if (mandate.status !== "ACTIVE") {
      throw new Error(`MANDATE_NOT_ACTIVE: Mandate is in status "${mandate.status}". Execution requires ACTIVE.`);
    }

    if (!mandate.wallet || !mandate.wallet.nearAccountId) {
      throw new Error(`Mandate "${mandateId}" has no linked execution custody wallet.`);
    }

    const custodyWalletAccount = mandate.wallet.nearAccountId;

    // 2. Financial Precision & Mandate Limit Evaluation
    const budgetCalc = IntentsAccountingService.calculateRequiredReservation(amountYocto);
    IntentsAccountingService.validateMandateLimits({
      totalRequiredReservationYocto: budgetCalc.totalRequiredReservationYocto,
      perTxLimitYocto: mandate.perTxLimitYocto,
      totalBudgetYocto: mandate.totalBudgetYocto,
      spentYocto: mandate.spentYocto,
      reservedYocto: mandate.reservedYocto,
    });

    // 3. Storage Registration Check for Custody Wallet
    await StorageRegistrationService.assertCustodyWalletRegistered(custodyWalletAccount);

    // 4. Request Authoritative Quote from Tidepool
    const deadlineIso = new Date(Date.now() + deadlineMinutes * 60 * 1000).toISOString();
    const quoteResponse = await NearIntentsProviderService.requestQuote({
      dry: false,
      swapType: "EXACT_INPUT",
      slippageTolerance: slippageToleranceBps,
      originAsset: sourceAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset,
      amount: amountYocto,
      refundTo: custodyWalletAccount,
      refundType: "ORIGIN_CHAIN",
      recipient: destinationRecipient,
      recipientType: "DESTINATION_CHAIN",
      deadline: deadlineIso,
    });

    // 5. Server-Side Quote Verification & Binding
    const quoteBinding = QuoteAuthorizationService.createVerifiedQuoteBinding({
      quoteResponse,
      mandateWalletAccountId: custodyWalletAccount,
      expectedFinalBeneficiary: destinationRecipient,
      expectedSourceAmount: amountYocto,
      expectedDestinationAsset: destinationAsset,
      maxApprovedSlippageBps: slippageToleranceBps,
    });

    // 6. Policy Arbitration (Determine if human approval required)
    // If perTxLimit is set and amount exceeds policy threshold, require approval
    let requiresApproval = false;
    if (mandate.perTxLimitYocto && BigInt(amountYocto) > BigInt(mandate.perTxLimitYocto)) {
      requiresApproval = true;
    }

    const initialStatus = requiresApproval ? "AWAITING_APPROVAL" : "QUOTE_VERIFIED";

    // 7. Persist IntentOperation Record
    const intentOp = await prisma.intentOperation.create({
      data: {
        idempotencyKey,
        userId,
        mandateId,
        objectiveId: objectiveId || null,
        provider: "tidepool",
        network: "testnet",
        depositMode: "ORIGIN_CHAIN",
        destinationChain: quoteBinding.destinationChain || "near",
        sourceAsset,
        sourceAmount: amountYocto,
        destinationAsset,
        expectedDestinationAmount: quoteResponse.quote.amountOut,
        minDestinationAmount: quoteResponse.quote.minAmountOut,
        slippageTolerance: slippageToleranceBps,
        finalBeneficiary: destinationRecipient,
        refundRecipient: custodyWalletAccount,
        providerQuoteId: quoteResponse.correlationId,
        providerPublicKeyId: quoteBinding.providerPublicKeyId || null,
        providerSignature: quoteResponse.signature,
        verifiedQuoteEvidence: quoteBinding.verifiedQuoteEvidence || null,
        depositAddress: quoteBinding.depositAddress,
        depositMemo: quoteResponse.quote.depositMemo || null,
        quoteExpiresAt: new Date(quoteBinding.quoteExpiry),
        status: initialStatus,
        reservedAmountYocto: budgetCalc.totalRequiredReservationYocto,
      },
    });

    await recordAuditEvent({
      userId,
      mandateId,
      eventType: "INTENT_PROPOSED",
      verdict: "ALLOWED",
      description: `Proposed NEAR Intents swap ${intentOp.id} for ${amountYocto} wNEAR to ${destinationAsset}`,
      details: {
        intentId: intentOp.id,
        correlationId: quoteResponse.correlationId,
        depositAddress: quoteBinding.depositAddress,
        requiresApproval,
      },
    });

    return {
      intentId: intentOp.id,
      correlationId: quoteResponse.correlationId,
      depositAddress: quoteBinding.depositAddress,
      sourceAmountYocto: amountYocto,
      expectedDestinationAmount: quoteResponse.quote.amountOut,
      minDestinationAmount: quoteResponse.quote.minAmountOut,
      status: initialStatus,
      requiresApproval,
    };
  }

  /**
   * Phase 2: Authorizes an active IntentOperation and locks the atomic budget reservation.
   */
  public static async authorizeAndReserve(intentId: string): Promise<void> {
    const op = await prisma.intentOperation.findUnique({
      where: { id: intentId },
      include: { mandate: true },
    });

    if (!op) {
      throw new Error(`IntentOperation "${intentId}" not found.`);
    }

    if (op.status !== "QUOTE_VERIFIED" && op.status !== "AWAITING_APPROVAL") {
      throw new Error(`Cannot authorize IntentOperation in status "${op.status}".`);
    }

    // Verify quote has not expired
    if (op.quoteExpiresAt && Date.now() >= op.quoteExpiresAt.getTime()) {
      await IntentStateMachine.transition({ intentId, targetState: "EXPIRED" });
      throw new Error("EXPIRED_QUOTE: Provider quote has expired. Please re-propose with a fresh quote.");
    }

    // Atomic CAS budget reservation
    const reservation = await reserveMandateBudgetAtomic({
      mandateId: op.mandateId,
      amountYocto: op.reservedAmountYocto,
    });

    if (!reservation.success) {
      throw new Error(`MANDATE_RESERVATION_FAILED: ${reservation.reason || "Failed to reserve budget"}`);
    }

    const reservationId = `resv_${crypto.randomUUID()}`;
    await prisma.intentOperation.update({
      where: { id: intentId },
      data: { reservationId },
    });

    await IntentStateMachine.transition({ intentId, targetState: "AUTHORIZED" });
    await IntentStateMachine.transition({ intentId, targetState: "BUDGET_RESERVED" });
  }

  /**
   * Phase 3: Executes wrap (near_deposit) via OutLayer TEE adapter and verifies on NEAR RPC.
   */
  public static async executeWrapPhase(intentId: string): Promise<string> {
    assertNearIntentsEnabled("IntentsExecutionService.executeWrapPhase");

    const op = await prisma.intentOperation.findUnique({
      where: { id: intentId },
      include: { mandate: { include: { wallet: true } } },
    });

    if (!op || !op.mandate.wallet) {
      throw new Error(`IntentOperation "${intentId}" or linked wallet not found.`);
    }

    if (op.status !== "BUDGET_RESERVED") {
      throw new Error(`Cannot execute wrap in status "${op.status}". Expected BUDGET_RESERVED.`);
    }

    await IntentStateMachine.transition({ intentId, targetState: "WRAP_PENDING" });

    const contractId = op.sourceAsset.replace(/^nep141:/i, "").trim().toLowerCase();
    const wrapIdempotencyKey = `wrap_${op.idempotencyKey}`;

    // Transition to WRAP_BROADCAST
    await IntentStateMachine.transition({ intentId, targetState: "WRAP_BROADCAST" });

    let wrapResult: any;
    try {
      wrapResult = await ExecutionBoundaryService.executeContractCall({
        userId: op.userId,
        mandateId: op.mandateId,
        objectiveId: op.objectiveId || undefined,
        receiverId: contractId,
        methodName: "near_deposit",
        args: {},
        depositYocto: op.sourceAmount,
        gasLimit: "30000000000000",
        idempotencyKey: wrapIdempotencyKey,
      });
    } catch (err: any) {
      await IntentStateMachine.transition({
        intentId,
        targetState: "REQUIRES_RECOVERY",
        errorMessage: `Ambiguous wrap dispatch error: ${err.message}`,
      });
      throw err;
    }

    if (!wrapResult.success || !wrapResult.txHash) {
      await IntentStateMachine.transition({
        intentId,
        targetState: "REQUIRES_RECOVERY",
        errorMessage: wrapResult.error || "Wrap dispatch failed without confirmation",
      });
      throw new Error(`WRAP_EXECUTION_FAILED: ${wrapResult.error || "Failed to execute near_deposit"}`);
    }

    // Verify wrap on-chain via NEAR Testnet RPC
    const rpcStatus = await verifyNearTransaction(wrapResult.txHash, op.mandate.wallet.nearAccountId);
    if (rpcStatus.status !== "SUCCESS") {
      await IntentStateMachine.transition({
        intentId,
        targetState: "REQUIRES_RECOVERY",
        txHash: wrapResult.txHash,
        errorMessage: `Wrap on-chain verification status: ${rpcStatus.status}`,
      });
      throw new Error(`WRAP_RPC_VERIFICATION_FAILED: Status ${rpcStatus.status}`);
    }

    await IntentStateMachine.transition({
      intentId,
      targetState: "WRAP_CONFIRMED",
      txHash: wrapResult.txHash,
      verifiedOnChain: true,
    });

    return wrapResult.txHash;
  }

  /**
   * Phase 4: Executes quote-bound transfer (ft_transfer) to single-use deposit address
   * and notifies Tidepool /v0/deposit/submit.
   */
  public static async executeDepositPhase(intentId: string): Promise<string> {
    assertNearIntentsEnabled("IntentsExecutionService.executeDepositPhase");

    const op = await prisma.intentOperation.findUnique({
      where: { id: intentId },
      include: { mandate: { include: { wallet: true } } },
    });

    if (!op || !op.mandate.wallet) {
      throw new Error(`IntentOperation "${intentId}" or linked wallet not found.`);
    }

    if (op.status !== "WRAP_CONFIRMED") {
      throw new Error(`Cannot execute deposit in status "${op.status}". Expected WRAP_CONFIRMED.`);
    }

    if (!op.depositAddress) {
      throw new Error("MISSING_DEPOSIT_ADDRESS: IntentOperation does not contain a verified depositAddress.");
    }

    await IntentStateMachine.transition({ intentId, targetState: "DEPOSIT_PENDING" });

    const contractId = op.sourceAsset.replace(/^nep141:/i, "").trim().toLowerCase();
    const depositIdempotencyKey = `dep_${op.idempotencyKey}`;

    // Construct verified quote binding
    const quoteBinding = {
      provider: op.provider,
      quoteId: op.providerQuoteId || op.id,
      sourceTokenContract: contractId,
      sourceAmount: op.sourceAmount,
      depositAddress: op.depositAddress,
      destinationAsset: op.destinationAsset,
      destinationRecipient: op.finalBeneficiary,
      refundRecipient: op.refundRecipient,
      quoteExpiry: op.quoteExpiresAt ? op.quoteExpiresAt.getTime() : Date.now() + 600000,
    };

    // Transition to DEPOSIT_BROADCAST
    await IntentStateMachine.transition({ intentId, targetState: "DEPOSIT_BROADCAST" });

    let depositResult: any;
    try {
      depositResult = await ExecutionBoundaryService.executeContractCall({
        userId: op.userId,
        mandateId: op.mandateId,
        objectiveId: op.objectiveId || undefined,
        receiverId: contractId,
        methodName: "ft_transfer",
        args: {
          receiver_id: op.depositAddress,
          amount: op.sourceAmount,
        },
        depositYocto: "1", // Strictly 1 yoctoNEAR attached deposit per NEP-141
        gasLimit: "30000000000000",
        idempotencyKey: depositIdempotencyKey,
        quoteBinding,
      });
    } catch (err: any) {
      await IntentStateMachine.transition({
        intentId,
        targetState: "REQUIRES_RECOVERY",
        errorMessage: `Ambiguous deposit dispatch error: ${err.message}`,
      });
      throw err;
    }

    if (!depositResult.success || !depositResult.txHash) {
      await IntentStateMachine.transition({
        intentId,
        targetState: "REQUIRES_RECOVERY",
        errorMessage: depositResult.error || "Deposit dispatch failed without confirmation",
      });
      throw new Error(`DEPOSIT_EXECUTION_FAILED: ${depositResult.error || "Failed to execute ft_transfer"}`);
    }

    // Verify deposit on-chain via NEAR Testnet RPC
    const rpcStatus = await verifyNearTransaction(depositResult.txHash, op.mandate.wallet.nearAccountId);
    if (rpcStatus.status !== "SUCCESS") {
      await IntentStateMachine.transition({
        intentId,
        targetState: "REQUIRES_RECOVERY",
        txHash: depositResult.txHash,
        errorMessage: `Deposit on-chain verification status: ${rpcStatus.status}`,
      });
      throw new Error(`DEPOSIT_RPC_VERIFICATION_FAILED: Status ${rpcStatus.status}`);
    }

    await IntentStateMachine.transition({
      intentId,
      targetState: "DEPOSIT_CONFIRMED",
      txHash: depositResult.txHash,
      verifiedOnChain: true,
    });

    // Notify Tidepool of the confirmed deposit transaction
    await NearIntentsProviderService.submitDeposit({
      txHash: depositResult.txHash,
      depositAddress: op.depositAddress,
      depositMemo: op.depositMemo || undefined,
    }).catch((err) => {
      console.warn(`Optional deposit submit to Tidepool returned: ${err.message}`);
    });

    await IntentStateMachine.transition({ intentId, targetState: "PROCESSING" });

    return depositResult.txHash;
  }
}

