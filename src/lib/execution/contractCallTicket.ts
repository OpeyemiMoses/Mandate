/**
 * MANDATE — Unforgeable Contract Call Execution Capability Ticket
 * Milestone 15.3a.1: Contract-Call Authorization Hardening & Security Verification
 *
 * Guarantees that OutLayer TEE contract calls (POST /wallet/v1/call) can ONLY be
 * invoked by the authoritative ExecutionBoundaryService for explicitly authorized
 * contract methods, validated argument payloads, and verified provider quote contexts.
 *
 * Core Invariant: "AI proposes. Mandate enforces. The user controls. OutLayer executes."
 */

import crypto from "crypto";
import { canonicalize } from "@/lib/auditLedger";
import { getExecutionSigningSecret } from "@/lib/production/environmentValidation";

// Module-private brand symbol
const CONTRACT_CALL_TICKET_SEAL = Symbol("ContractCallExecutionTicket.seal");

function getBoundarySigningSecret(): string {
  return getExecutionSigningSecret();
}

/**
 * Server-verified provider quote authorization binding.
 * Required for all token transfer calls (ft_transfer).
 */
export interface QuoteAuthorizationBinding {
  provider: string; // e.g. "tidepool"
  quoteId: string;
  sourceTokenContract: string; // e.g. "wnear.tidepool-sandbox.testnet"
  sourceAmount: string; // exact token units expected at deposit address
  depositAddress: string; // quote-generated single-use deposit address
  destinationAsset: string;
  destinationRecipient: string; // user-authorized final beneficiary
  refundRecipient: string; // must equal mandate.wallet.nearAccountId
  quoteExpiry: number; // Unix timestamp in ms
  providerPublicKeyId?: string; // Trusted key ID that verified the quote
  verifiedQuoteEvidence?: string; // Canonical payload JSON string
  destinationChain?: string; // Destination chain/network
}

/**
 * Dedicated storage provisioning authorization binding.
 * Required for all storage_deposit calls.
 */
export interface StorageProvisioningBinding {
  targetAccountId: string; // must equal mandate.wallet.nearAccountId
  maxDepositYocto: string; // bounded storage deposit cap
  isDedicatedProvisioning: boolean;
}

export interface MintContractCallTicketParams {
  ticketId?: string;
  executionId: string;
  userId: string;
  mandateId: string;
  objectiveId?: string | null;
  operation?: string; // defaults to "CONTRACT_CALL"
  receiverId: string;
  methodName: string;
  argsHash: string; // SHA-256 hex string of canonicalized JSON args
  depositYocto: string;
  gasLimit: string;
  idempotencyKey: string;
  nonce: string;
  network?: string;
  validitySeconds?: number;
  quoteBinding?: QuoteAuthorizationBinding | null;
  storageProvisioning?: StorageProvisioningBinding | null;
}

export interface ContractCallValidationParams {
  receiverId: string;
  methodName: string;
  args: Record<string, any>;
  depositYocto: string;
  gasLimit?: string;
  idempotencyKey?: string;
  userId?: string;
  mandateId?: string;
  objectiveId?: string | null;
  chain?: string;
  quoteBinding?: QuoteAuthorizationBinding | null;
  storageProvisioning?: StorageProvisioningBinding | null;
  mandateWalletAccountId?: string;
}

/**
 * Computes canonical SHA-256 hash of contract call arguments.
 */
export function computeContractCallArgsHash(args: Record<string, any>): string {
  const canonical = canonicalize(args || {});
  return crypto.createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

/**
 * Sealed Contract Call Authorization Ticket
 * Cannot be constructed directly by outside callers.
 */
export class ContractCallExecutionTicket {
  // Sealed property only accessible within this module
  private readonly [CONTRACT_CALL_TICKET_SEAL]: boolean = true;

  public readonly ticketId: string;
  public readonly executionId: string;
  public readonly userId: string;
  public readonly mandateId: string;
  public readonly objectiveId: string | null;
  public readonly operation: string;
  public readonly receiverId: string;
  public readonly methodName: string;
  public readonly argsHash: string;
  public readonly depositYocto: string;
  public readonly gasLimit: string;
  public readonly network: string;
  public readonly idempotencyKey: string;
  public readonly nonce: string;
  public readonly issuedAt: number;
  public readonly expiresAt: number;
  public readonly quoteBinding: QuoteAuthorizationBinding | null;
  public readonly storageProvisioning: StorageProvisioningBinding | null;
  public readonly hmacSignature: string;

  constructor(
    params: MintContractCallTicketParams,
    internalSecret: string,
    privateToken: symbol
  ) {
    if (privateToken !== CONTRACT_CALL_TICKET_SEAL) {
      throw new Error(
        "UNAUTHORIZED_EXECUTION_BOUNDARY_BYPASS: Direct instantiation of ContractCallExecutionTicket is prohibited."
      );
    }

    this.ticketId = params.ticketId || `cct_${crypto.randomBytes(12).toString("hex")}`;
    this.executionId = params.executionId;
    this.userId = params.userId;
    this.mandateId = params.mandateId;
    this.objectiveId = params.objectiveId || null;
    this.operation = params.operation || "CONTRACT_CALL";
    this.receiverId = params.receiverId.trim().toLowerCase();
    this.methodName = params.methodName.trim();
    this.argsHash = params.argsHash.trim().toLowerCase();
    this.depositYocto = params.depositYocto;
    this.gasLimit = params.gasLimit;
    this.network = (params.network || "testnet").toLowerCase();
    this.idempotencyKey = params.idempotencyKey;
    this.nonce = params.nonce;
    this.issuedAt = Date.now();
    this.expiresAt = this.issuedAt + (params.validitySeconds || 60) * 1000;
    this.quoteBinding = params.quoteBinding ? { ...params.quoteBinding } : null;
    this.storageProvisioning = params.storageProvisioning ? { ...params.storageProvisioning } : null;

    // Compute HMAC-SHA256 signature bound to exact parameters including quote and storage bindings
    const canonicalPayload = canonicalize({
      ticketId: this.ticketId,
      executionId: this.executionId,
      userId: this.userId,
      mandateId: this.mandateId,
      objectiveId: this.objectiveId || null,
      operation: this.operation,
      receiverId: this.receiverId,
      methodName: this.methodName,
      argsHash: this.argsHash,
      depositYocto: this.depositYocto,
      gasLimit: this.gasLimit,
      network: this.network,
      idempotencyKey: this.idempotencyKey,
      nonce: this.nonce,
      issuedAt: this.issuedAt,
      expiresAt: this.expiresAt,
      quoteBinding: this.quoteBinding
        ? {
            provider: this.quoteBinding.provider,
            quoteId: this.quoteBinding.quoteId,
            sourceTokenContract: this.quoteBinding.sourceTokenContract.trim().toLowerCase(),
            sourceAmount: this.quoteBinding.sourceAmount,
            depositAddress: this.quoteBinding.depositAddress.trim().toLowerCase(),
            destinationAsset: this.quoteBinding.destinationAsset,
            destinationRecipient: this.quoteBinding.destinationRecipient.trim().toLowerCase(),
            refundRecipient: this.quoteBinding.refundRecipient.trim().toLowerCase(),
            quoteExpiry: this.quoteBinding.quoteExpiry,
          }
        : null,
      storageProvisioning: this.storageProvisioning
        ? {
            targetAccountId: this.storageProvisioning.targetAccountId.trim().toLowerCase(),
            maxDepositYocto: this.storageProvisioning.maxDepositYocto,
            isDedicatedProvisioning: this.storageProvisioning.isDedicatedProvisioning,
          }
        : null,
    });

    this.hmacSignature = crypto
      .createHmac("sha256", internalSecret)
      .update(JSON.stringify(canonicalPayload), "utf8")
      .digest("hex");
  }

  public isSealed(): boolean {
    return this[CONTRACT_CALL_TICKET_SEAL] === true;
  }
}

/**
 * Authoritative Factory: Mints an unforgeable ContractCallExecutionTicket.
 * Can ONLY be invoked by ExecutionBoundaryService after policy evaluation passes.
 */
export function mintContractCallExecutionTicket(
  params: MintContractCallTicketParams
): ContractCallExecutionTicket {
  if (
    !params.executionId ||
    !params.userId ||
    !params.mandateId ||
    !params.receiverId ||
    !params.methodName ||
    !params.argsHash ||
    params.depositYocto === undefined ||
    params.depositYocto === null ||
    !params.gasLimit ||
    !params.idempotencyKey ||
    !params.nonce
  ) {
    throw new Error(
      "UNAUTHORIZED_EXECUTION_BOUNDARY_BYPASS: Cannot mint contract call ticket with missing required parameters."
    );
  }

  // Testnet-Only Enactment: Block mainnet ticket minting at the factory source
  const network = (params.network || "testnet").toLowerCase();
  if (network !== "testnet") {
    throw new Error(
      `MAINNET_EXECUTION_PROHIBITED: Cannot mint contract call ticket for network "${network}". Only NEAR Testnet is authorized in Testnet Beta.`
    );
  }

  // ft_transfer requires non-null quote binding
  if (params.methodName === "ft_transfer" && !params.quoteBinding) {
    throw new Error(
      "UNAUTHORIZED_RECIPIENT_BYPASS: Cannot mint ft_transfer ticket without verified quote authorization binding."
    );
  }

  return new ContractCallExecutionTicket(params, getBoundarySigningSecret(), CONTRACT_CALL_TICKET_SEAL);
}

/**
 * Authoritative Validator: Verifies that the provided contract call ticket is authentic,
 * unexpired, structurally sealed, and cryptographically bound to the EXACT contract call parameters.
 */
export function validateContractCallExecutionTicket(
  ticket: unknown,
  callParams: ContractCallValidationParams
): { valid: boolean; ticket?: ContractCallExecutionTicket; reason?: string } {
  // 1. Structural check
  if (!ticket || typeof ticket !== "object") {
    return {
      valid: false,
      reason: "Missing execution ticket. All OutLayer contract calls must supply a valid ContractCallExecutionTicket.",
    };
  }

  // 2. Reject plain objects or forged instances
  if (!(ticket instanceof ContractCallExecutionTicket) || !(ticket as any).isSealed?.()) {
    return {
      valid: false,
      reason: "Invalid ticket object. Forged contexts or plain objects are strictly rejected.",
    };
  }

  const castTicket = ticket as ContractCallExecutionTicket;

  // 3. Expiration verification (Strict 60-second execution window)
  const now = Date.now();
  if (now > castTicket.expiresAt) {
    return {
      valid: false,
      reason: `Execution ticket expired at ${new Date(castTicket.expiresAt).toISOString()} (current: ${new Date(now).toISOString()}).`,
    };
  }

  // 4. Cryptographic HMAC verification using constant-time comparison
  const canonicalPayload = canonicalize({
    ticketId: castTicket.ticketId,
    executionId: castTicket.executionId,
    userId: castTicket.userId,
    mandateId: castTicket.mandateId,
    objectiveId: castTicket.objectiveId || null,
    operation: castTicket.operation,
    receiverId: castTicket.receiverId,
    methodName: castTicket.methodName,
    argsHash: castTicket.argsHash,
    depositYocto: castTicket.depositYocto,
    gasLimit: castTicket.gasLimit,
    network: castTicket.network,
    idempotencyKey: castTicket.idempotencyKey,
    nonce: castTicket.nonce,
    issuedAt: castTicket.issuedAt,
    expiresAt: castTicket.expiresAt,
    quoteBinding: castTicket.quoteBinding
      ? {
          provider: castTicket.quoteBinding.provider,
          quoteId: castTicket.quoteBinding.quoteId,
          sourceTokenContract: castTicket.quoteBinding.sourceTokenContract.trim().toLowerCase(),
          sourceAmount: castTicket.quoteBinding.sourceAmount,
          depositAddress: castTicket.quoteBinding.depositAddress.trim().toLowerCase(),
          destinationAsset: castTicket.quoteBinding.destinationAsset,
          destinationRecipient: castTicket.quoteBinding.destinationRecipient.trim().toLowerCase(),
          refundRecipient: castTicket.quoteBinding.refundRecipient.trim().toLowerCase(),
          quoteExpiry: castTicket.quoteBinding.quoteExpiry,
        }
      : null,
    storageProvisioning: castTicket.storageProvisioning
      ? {
          targetAccountId: castTicket.storageProvisioning.targetAccountId.trim().toLowerCase(),
          maxDepositYocto: castTicket.storageProvisioning.maxDepositYocto,
          isDedicatedProvisioning: castTicket.storageProvisioning.isDedicatedProvisioning,
        }
      : null,
  });

  const expectedHmac = crypto
    .createHmac("sha256", getBoundarySigningSecret())
    .update(JSON.stringify(canonicalPayload), "utf8")
    .digest("hex");

  const providedHmac = Buffer.from(castTicket.hmacSignature, "hex");
  const computedHmac = Buffer.from(expectedHmac, "hex");

  if (
    providedHmac.length !== computedHmac.length ||
    !crypto.timingSafeEqual(providedHmac, computedHmac)
  ) {
    return {
      valid: false,
      reason: "Cryptographic ticket signature is invalid or forged.",
    };
  }

  // 5. Strict Parameter Binding Verification (Anti-Tampering)
  const normalizedReceiverId = callParams.receiverId.trim().toLowerCase();
  if (castTicket.receiverId !== normalizedReceiverId) {
    return {
      valid: false,
      reason: `Contract receiver mismatch: Ticket authorized for "${castTicket.receiverId}", but call requested to "${normalizedReceiverId}".`,
    };
  }

  const normalizedMethodName = callParams.methodName.trim();
  if (castTicket.methodName !== normalizedMethodName) {
    return {
      valid: false,
      reason: `Method mismatch: Ticket authorized for "${castTicket.methodName}", but call requested "${normalizedMethodName}".`,
    };
  }

  const computedArgsHash = computeContractCallArgsHash(callParams.args);
  if (castTicket.argsHash !== computedArgsHash) {
    return {
      valid: false,
      reason: `Arguments hash mismatch: Ticket bound to "${castTicket.argsHash}", but arguments compute to "${computedArgsHash}".`,
    };
  }

  if (castTicket.depositYocto !== callParams.depositYocto) {
    return {
      valid: false,
      reason: `Deposit mismatch: Ticket authorized for "${castTicket.depositYocto}" yoctoNEAR, but call attached "${callParams.depositYocto}".`,
    };
  }

  if (callParams.gasLimit && castTicket.gasLimit !== callParams.gasLimit) {
    return {
      valid: false,
      reason: `Gas limit mismatch: Ticket authorized for "${castTicket.gasLimit}", but call requested "${callParams.gasLimit}".`,
    };
  }

  if (callParams.idempotencyKey && castTicket.idempotencyKey !== callParams.idempotencyKey) {
    return {
      valid: false,
      reason: `Idempotency key mismatch: Ticket bound to "${castTicket.idempotencyKey}", but call supplied "${callParams.idempotencyKey}".`,
    };
  }

  if (callParams.userId && castTicket.userId !== callParams.userId) {
    return {
      valid: false,
      reason: `User mismatch: Ticket bound to "${castTicket.userId}", but call requested for "${callParams.userId}".`,
    };
  }

  if (callParams.mandateId && castTicket.mandateId !== callParams.mandateId) {
    return {
      valid: false,
      reason: `Mandate mismatch: Ticket bound to "${castTicket.mandateId}", but call requested for "${callParams.mandateId}".`,
    };
  }

  if (callParams.objectiveId !== undefined && callParams.objectiveId !== null) {
    if (castTicket.objectiveId !== callParams.objectiveId) {
      return {
        valid: false,
        reason: `Objective ID mismatch: Ticket authorized for "${castTicket.objectiveId}", but call requested for "${callParams.objectiveId}".`,
      };
    }
  }

  // 6. Hardened Quote Binding Verification for ft_transfer (Milestone 15.3a.1)
  if (normalizedMethodName === "ft_transfer") {
    if (!castTicket.quoteBinding) {
      return {
        valid: false,
        reason: "MISSING_QUOTE_BINDING: ft_transfer ticket requires verified quote binding. Client-selected recipients are prohibited.",
      };
    }

    const recipientInArgs = (callParams.args.receiver_id || "").trim().toLowerCase();
    const depositAddressInQuote = castTicket.quoteBinding.depositAddress.trim().toLowerCase();
    if (recipientInArgs !== depositAddressInQuote) {
      return {
        valid: false,
        reason: `QUOTE_DEPOSIT_ADDRESS_MISMATCH: Ticket authorized deposit to "${depositAddressInQuote}", but call requested transfer to "${recipientInArgs}".`,
      };
    }

    const amountInArgs = callParams.args.amount;
    if (amountInArgs !== castTicket.quoteBinding.sourceAmount) {
      return {
        valid: false,
        reason: `QUOTE_AMOUNT_MISMATCH: Ticket authorized transfer of "${castTicket.quoteBinding.sourceAmount}", but call requested "${amountInArgs}".`,
      };
    }

    if (now > castTicket.quoteBinding.quoteExpiry) {
      return {
        valid: false,
        reason: `EXPIRED_QUOTE: Provider quote expired at ${new Date(castTicket.quoteBinding.quoteExpiry).toISOString()} (current: ${new Date(now).toISOString()}).`,
      };
    }

    if (callParams.mandateWalletAccountId) {
      const normalizedWalletAccount = callParams.mandateWalletAccountId.trim().toLowerCase();
      const normalizedRefundRecipient = castTicket.quoteBinding.refundRecipient.trim().toLowerCase();
      if (normalizedRefundRecipient !== normalizedWalletAccount) {
        return {
          valid: false,
          reason: `REFUND_RECIPIENT_MISMATCH: Quote refund recipient must equal mandate custody wallet "${normalizedWalletAccount}". Found "${normalizedRefundRecipient}".`,
        };
      }
    }
  }

  // 7. Hardened Storage Provisioning Verification for storage_deposit (Milestone 15.3a.1)
  if (normalizedMethodName === "storage_deposit") {
    if (!castTicket.storageProvisioning || !castTicket.storageProvisioning.isDedicatedProvisioning) {
      return {
        valid: false,
        reason: "UNAUTHORIZED_STORAGE_PROVISIONING: storage_deposit requires dedicated, explicitly authorized provisioning binding.",
      };
    }

    const targetInArgs = (callParams.args.account_id || "").trim().toLowerCase();
    const authorizedTarget = castTicket.storageProvisioning.targetAccountId.trim().toLowerCase();
    if (targetInArgs !== authorizedTarget) {
      return {
        valid: false,
        reason: `STORAGE_TARGET_MISMATCH: Storage provisioning authorized for "${authorizedTarget}", but call requested for "${targetInArgs}".`,
      };
    }
  }

  // 8. Testnet-Only Enactment (Fail-closed against Mainnet)
  if (castTicket.network !== "testnet") {
    return {
      valid: false,
      reason: `MAINNET_EXECUTION_PROHIBITED: Public beta supports NEAR Testnet only. Ticket network "${castTicket.network}" rejected.`,
    };
  }

  const chain = (callParams.chain || "near").toLowerCase();
  if (chain !== "near" && chain !== "testnet") {
    return {
      valid: false,
      reason: `MAINNET_EXECUTION_PROHIBITED: Public beta supports NEAR Testnet only. Target chain "${chain}" rejected.`,
    };
  }

  return {
    valid: true,
    ticket: castTicket,
  };
}
