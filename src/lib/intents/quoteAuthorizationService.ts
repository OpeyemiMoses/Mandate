/**
 * MANDATE — Quote Authorization & Provider Trust Verification Service
 * Milestone 15.3b.1: Intents Settlement Evidence, Accounting & Persistence Closure
 *
 * Enforces cryptographic and server-side verification of Tidepool quotes:
 * 1. Only trusted server-side provider component can produce QuoteAuthorizationBinding.
 * 2. Client-submitted quote bindings and client-selected deposit addresses are REJECTED.
 * 3. Enforces authentic Ed25519 cryptographic signature verification against trusted provider keystore.
 * 4. Strictly validates refundRecipient === mandate.wallet.nearAccountId.
 * 5. Verifies canonical JSON serialization binding correlationId, depositAddress, recipient, assets, and amounts.
 * 6. Enforces chain-aware destination verification: only destinations with independent settlement verification are enabled.
 * 7. Strict quote refresh policy: material alterations require re-approval.
 */

import { utils, KeyPair } from "near-api-js";
import { QuoteAuthorizationBinding } from "@/lib/execution/contractCallTicket";
import { TidepoolQuoteResponse } from "./types";
import { APPROVED_SOURCE_ASSET } from "./nearIntentsProviderService";
import { QuoteVerificationKeystore } from "./quoteVerificationKeystore";

export interface CreateQuoteBindingParams {
  quoteResponse: TidepoolQuoteResponse;
  mandateWalletAccountId: string;
  expectedFinalBeneficiary: string;
  expectedSourceAmount: string;
  expectedDestinationAsset: string;
  maxApprovedSlippageBps?: number;
  expectedKeyId?: string; // Optional explicit key ID restriction
}

/**
 * Deterministically canonicalizes any JSON value according to RFC-8785 principles
 * (alphabetically sorted keys, no whitespace).
 */
export function canonicalizeJson(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalizeJson).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalizeJson(obj[k])).join(",") + "}";
}

/**
 * Computes the exact canonical quote payload expected to be signed by the provider.
 * Binds: correlationId, quote details, quoteRequest details, and timestamp.
 */
export function getCanonicalQuotePayload(quoteResponse: TidepoolQuoteResponse): string {
  if (!quoteResponse || typeof quoteResponse !== "object") {
    throw new Error("CANONICAL_PAYLOAD_ERROR: Invalid quote response.");
  }

  const { correlationId, quoteRequest, quote, timestamp } = quoteResponse;

  const normalized = {
    correlationId: correlationId || "",
    quote: {
      amountIn: quote?.amountIn || "",
      amountOut: quote?.amountOut || "",
      deadline: quote?.deadline || "",
      depositAddress: quote?.depositAddress || "",
      minAmountOut: quote?.minAmountOut || "",
    },
    quoteRequest: {
      amount: quoteRequest?.amount || "",
      deadline: quoteRequest?.deadline || "",
      depositType: quoteRequest?.depositType || "",
      destinationAsset: quoteRequest?.destinationAsset || "",
      originAsset: quoteRequest?.originAsset || "",
      recipient: quoteRequest?.recipient || "",
      refundTo: quoteRequest?.refundTo || "",
      slippageTolerance: quoteRequest?.slippageTolerance ?? 0,
      swapType: quoteRequest?.swapType || "EXACT_INPUT",
    },
    timestamp: timestamp || "",
  };

  return canonicalizeJson(normalized);
}

/**
 * Identifies the destination blockchain network from an asset identifier.
 */
export function identifyDestinationChain(destinationAsset: string): string {
  if (!destinationAsset || typeof destinationAsset !== "string") {
    return "unknown";
  }
  const asset = destinationAsset.trim().toLowerCase();
  if (asset.startsWith("nep141:") || asset.endsWith(".testnet") || asset.endsWith(".near")) {
    return "near";
  }
  if (asset.startsWith("eth:") || asset.startsWith("erc20:") || asset.startsWith("0x")) {
    return "ethereum";
  }
  if (asset.startsWith("sol:") || asset.startsWith("solana:")) {
    return "solana";
  }
  if (asset.startsWith("arb:")) {
    return "arbitrum";
  }
  if (asset.startsWith("base:")) {
    return "base";
  }
  return "unknown";
}

export class QuoteAuthorizationService {
  /**
   * Authoritative server-side factory: Verifies quote response integrity and constructs
   * an unforgeable QuoteAuthorizationBinding for ExecutionBoundaryService and ticket minting.
   */
  public static createVerifiedQuoteBinding(
    params: CreateQuoteBindingParams
  ): QuoteAuthorizationBinding {
    const {
      quoteResponse,
      mandateWalletAccountId,
      expectedFinalBeneficiary,
      expectedSourceAmount,
      expectedDestinationAsset,
      maxApprovedSlippageBps = 100,
      expectedKeyId,
    } = params;

    if (!quoteResponse || typeof quoteResponse !== "object") {
      throw new Error("UNAUTHORIZED_QUOTE_VERIFICATION: Missing quote response object.");
    }

    const { correlationId, signature, quoteRequest, quote } = quoteResponse;

    if (!correlationId || typeof correlationId !== "string") {
      throw new Error("INVALID_QUOTE_RESPONSE: Missing or invalid correlationId.");
    }

    // 1. Verify Provider Signature Format (Must start with ed25519:)
    if (!signature || typeof signature !== "string" || !signature.startsWith("ed25519:")) {
      throw new Error(
        `INVALID_PROVIDER_SIGNATURE: Tidepool quote missing valid ed25519 signature. Received "${signature}".`
      );
    }

    // 2. Decode Ed25519 Base58 Signature Bytes
    const rawSigBase58 = signature.replace(/^ed25519:/i, "").trim();
    let sigBytes: Uint8Array;
    try {
      sigBytes = utils.serialize.base_decode(rawSigBase58);
      if (sigBytes.length !== 64) {
        throw new Error(`Signature length is ${sigBytes.length} bytes; expected exactly 64 bytes.`);
      }
    } catch (decodeErr: any) {
      throw new Error(`MALFORMED_SIGNATURE: Failed to decode Ed25519 base58 signature: ${decodeErr.message}`);
    }

    // 3. Compute Canonical Signed Payload
    const canonicalPayload = getCanonicalQuotePayload(quoteResponse);
    const payloadBuffer = Buffer.from(canonicalPayload, "utf8");

    // 4. Authenticate Against Trusted Provider Public Keys
    const activeKeys = QuoteVerificationKeystore.getActiveKeys("tidepool");
    if (activeKeys.length === 0) {
      throw new Error("NO_ACTIVE_PROVIDER_KEYS: No active trusted Ed25519 signing keys configured for provider 'tidepool'.");
    }

    let verifiedKeyId: string | null = null;

    if (expectedKeyId) {
      const targetKey = QuoteVerificationKeystore.getKey(expectedKeyId);
      if (!targetKey) {
        throw new Error(`UNKNOWN_SIGNING_KEY: Specified provider key "${expectedKeyId}" is not in trusted keystore.`);
      }
      if (targetKey.status === "REVOKED") {
        throw new Error(`REVOKED_SIGNING_KEY: Provider key "${expectedKeyId}" has been revoked.`);
      }
      try {
        const pk = utils.PublicKey.fromString(targetKey.publicKey);
        if (pk.verify(payloadBuffer, sigBytes)) {
          verifiedKeyId = targetKey.keyId;
        }
      } catch {
        // failed verification
      }
    } else {
      for (const key of activeKeys) {
        try {
          const pk = utils.PublicKey.fromString(key.publicKey);
          if (pk.verify(payloadBuffer, sigBytes)) {
            verifiedKeyId = key.keyId;
            break;
          }
        } catch {
          // try next key
        }
      }
    }

    if (!verifiedKeyId) {
      throw new Error(
        "INVALID_PROVIDER_SIGNATURE: Cryptographic Ed25519 signature verification failed. Quote payload is untrusted or tampered."
      );
    }

    // 5. Chain-Aware Destination Verification Enforcement
    const destinationChain = identifyDestinationChain(quoteRequest.destinationAsset);
    if (destinationChain !== "near") {
      throw new Error(
        `UNSUPPORTED_DESTINATION_CHAIN_VERIFICATION: Independent on-chain settlement verification is not currently supported for destination chain "${destinationChain}". Execution path is disabled.`
      );
    }

    // 6. Validate Deposit Mode is strictly ORIGIN_CHAIN
    if (quoteRequest.depositType !== "ORIGIN_CHAIN") {
      throw new Error(
        `UNAUTHORIZED_DEPOSIT_TYPE: Quote depositType must be "ORIGIN_CHAIN". Received "${quoteRequest.depositType}".`
      );
    }

    // 7. Validate Source Asset matches approved wNEAR token contract
    if (quoteRequest.originAsset.toLowerCase() !== APPROVED_SOURCE_ASSET.toLowerCase()) {
      throw new Error(
        `UNAUTHORIZED_SOURCE_ASSET: Source asset "${quoteRequest.originAsset}" does not match approved "${APPROVED_SOURCE_ASSET}".`
      );
    }

    // 8. Validate Deposit Address is generated by provider (not client-selected)
    if (!quote.depositAddress || typeof quote.depositAddress !== "string") {
      throw new Error("MISSING_DEPOSIT_ADDRESS: Quote does not contain a provider-derived depositAddress.");
    }

    const depositAddress = quote.depositAddress.trim().toLowerCase();
    if (!depositAddress.endsWith(".testnet") && !/^[0-9a-fA-F]{64}$/.test(depositAddress)) {
      throw new Error(`INVALID_DEPOSIT_ADDRESS: Provider returned invalid deposit address "${quote.depositAddress}".`);
    }

    // 9. Validate Source Amount matches requested and approved amount
    if (quote.amountIn !== expectedSourceAmount || quoteRequest.amount !== expectedSourceAmount) {
      throw new Error(
        `QUOTE_AMOUNT_MISMATCH: Quote source amount "${quote.amountIn}" does not match approved amount "${expectedSourceAmount}".`
      );
    }

    // 10. Validate Destination Asset matches requested asset
    if (quoteRequest.destinationAsset.toLowerCase() !== expectedDestinationAsset.toLowerCase()) {
      throw new Error(
        `DESTINATION_ASSET_MISMATCH: Quote destination asset "${quoteRequest.destinationAsset}" does not match expected "${expectedDestinationAsset}".`
      );
    }

    // 11. Validate Final Beneficiary
    const normalizedBeneficiary = quoteRequest.recipient.trim().toLowerCase();
    const expectedBeneficiary = expectedFinalBeneficiary.trim().toLowerCase();
    if (normalizedBeneficiary !== expectedBeneficiary) {
      throw new Error(
        `BENEFICIARY_MISMATCH: Quote recipient "${quoteRequest.recipient}" does not match authorized final beneficiary "${expectedFinalBeneficiary}".`
      );
    }

    // 12. Validate Refund Recipient strictly matches Mandate Custody Wallet
    const normalizedRefund = quoteRequest.refundTo.trim().toLowerCase();
    const normalizedCustodyWallet = mandateWalletAccountId.trim().toLowerCase();
    if (normalizedRefund !== normalizedCustodyWallet) {
      throw new Error(
        `REFUND_RECIPIENT_MISMATCH: Quote refund recipient "${quoteRequest.refundTo}" must strictly equal mandate custody wallet "${mandateWalletAccountId}".`
      );
    }

    // 13. Validate Slippage Tolerance does not exceed approved cap
    if (quoteRequest.slippageTolerance > maxApprovedSlippageBps) {
      throw new Error(
        `EXCESSIVE_SLIPPAGE: Quote slippage tolerance (${quoteRequest.slippageTolerance} bps) exceeds approved maximum (${maxApprovedSlippageBps} bps).`
      );
    }

    // 14. Validate Deadline / Expiration
    const deadlineStr = quote.deadline || quoteRequest.deadline;
    if (!deadlineStr) {
      throw new Error("MISSING_QUOTE_DEADLINE: Quote does not contain an expiration deadline.");
    }

    const quoteExpiry = new Date(deadlineStr).getTime();
    if (isNaN(quoteExpiry) || Date.now() >= quoteExpiry) {
      throw new Error(
        `EXPIRED_QUOTE: Provider quote expired at ${new Date(quoteExpiry).toISOString()} (current: ${new Date().toISOString()}).`
      );
    }

    // Extract token contract from NEP-141 identifier
    const sourceTokenContract = quoteRequest.originAsset.replace(/^nep141:/i, "").trim().toLowerCase();

    return {
      provider: "tidepool",
      quoteId: correlationId,
      sourceTokenContract,
      sourceAmount: quote.amountIn,
      depositAddress,
      destinationAsset: quoteRequest.destinationAsset,
      destinationRecipient: quoteRequest.recipient,
      refundRecipient: quoteRequest.refundTo,
      quoteExpiry,
      providerPublicKeyId: verifiedKeyId,
      verifiedQuoteEvidence: canonicalPayload,
      destinationChain,
    };
  }

  /**
   * Helper utility for tests and mock responses to sign a quote canonically
   * with a given NEAR KeyPair.
   */
  public static signQuoteForTesting(
    quoteResponse: TidepoolQuoteResponse,
    keyPair: KeyPair
  ): TidepoolQuoteResponse {
    const canonicalPayload = getCanonicalQuotePayload(quoteResponse);
    const sig = keyPair.sign(Buffer.from(canonicalPayload, "utf8"));
    const sigBase58 = utils.serialize.base_encode(sig.signature);
    return {
      ...quoteResponse,
      signature: `ed25519:${sigBase58}`,
    };
  }

  /**
   * Evaluates a refreshed quote against a previously approved quote.
   * If any material term has degraded, throws deterministic REAPPROVAL_REQUIRED.
   */
  public static validateQuoteRefresh(
    originalBinding: QuoteAuthorizationBinding,
    refreshedBinding: QuoteAuthorizationBinding,
    originalMinAmountOut?: string,
    refreshedMinAmountOut?: string
  ): void {
    // 1. Source Asset must be identical
    if (originalBinding.sourceTokenContract !== refreshedBinding.sourceTokenContract) {
      throw new Error("QUOTE_REFRESH_REAPPROVAL_REQUIRED: Source asset contract changed in refreshed quote.");
    }

    // 2. Source Amount must be identical
    if (originalBinding.sourceAmount !== refreshedBinding.sourceAmount) {
      throw new Error("QUOTE_REFRESH_REAPPROVAL_REQUIRED: Source amount changed in refreshed quote.");
    }

    // 3. Destination Asset must be identical
    if (originalBinding.destinationAsset.toLowerCase() !== refreshedBinding.destinationAsset.toLowerCase()) {
      throw new Error("QUOTE_REFRESH_REAPPROVAL_REQUIRED: Destination asset changed in refreshed quote.");
    }

    // 4. Final Beneficiary must be identical
    if (originalBinding.destinationRecipient.toLowerCase() !== refreshedBinding.destinationRecipient.toLowerCase()) {
      throw new Error("QUOTE_REFRESH_REAPPROVAL_REQUIRED: Destination recipient changed in refreshed quote.");
    }

    // 5. Refund Recipient must be identical
    if (originalBinding.refundRecipient.toLowerCase() !== refreshedBinding.refundRecipient.toLowerCase()) {
      throw new Error("QUOTE_REFRESH_REAPPROVAL_REQUIRED: Refund recipient changed in refreshed quote.");
    }

    // 6. Minimum Output Amount must not degrade below approved threshold
    if (originalMinAmountOut && refreshedMinAmountOut) {
      const origOut = BigInt(originalMinAmountOut);
      const refrOut = BigInt(refreshedMinAmountOut);
      if (refrOut < origOut) {
        throw new Error(
          `QUOTE_REFRESH_REAPPROVAL_REQUIRED: Refreshed minimum output "${refreshedMinAmountOut}" degraded below approved minimum "${originalMinAmountOut}".`
        );
      }
    }
  }
}
