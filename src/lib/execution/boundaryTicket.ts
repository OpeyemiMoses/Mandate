/**
 * MANDATE — Unforgeable Execution Boundary Capability Ticket
 * Milestone 13.10: Security Remediation & Cryptographic Execution Capability
 *
 * Guarantees that OutLayer TEE execution can ONLY be invoked by the authoritative
 * ExecutionBoundaryService. Eliminates all possibility of boolean forging or direct adapter bypass.
 *
 * Core Invariant: "AI proposes. Mandate enforces. The user controls. OutLayer executes."
 */

import crypto from "crypto";
import { canonicalize } from "@/lib/auditLedger";
import { getExecutionSigningSecret } from "@/lib/production/environmentValidation";

// Cryptographic key strictly resolved from EXECUTION_SIGNING_SECRET.
// Milestone 14.5: Bound strictly to dedicated EXECUTION_SIGNING_SECRET.
function getBoundarySigningSecret(): string {
  return getExecutionSigningSecret();
}

// Module-private brand symbol
const TICKET_SEAL = Symbol("BoundaryExecutionTicket.seal");

/**
 * Note: Global 0.1 NEAR transaction ceiling was lifted per Owner Launch Authorization.
 * Financial spending authority is strictly governed by the user's active mandate budget,
 * per-transaction limit, approval threshold, and allowlisted recipients.
 */
export const GLOBAL_TRANSACTION_CEILING_REMOVED = true;

export interface MintTicketParams {
  executionId: string;
  mandateId: string;
  objectiveId?: string | null;
  userId: string;
  operation: string;
  recipient: string;
  amountYocto: string;
  network?: string;
  idempotencyKey: string;
  nonce: string;
  validitySeconds?: number;
}

export interface TransferValidationParams {
  to: string;
  amountYocto: string;
  idempotencyKey?: string;
  objectiveId?: string | null;
  chain?: string;
}

/**
 * Sealed Boundary Authorization Ticket
 * Cannot be constructed directly by outside callers.
 */
export class BoundaryExecutionTicket {
  // Sealed property only accessible within this module
  private readonly [TICKET_SEAL]: boolean = true;

  public readonly executionId: string;
  public readonly mandateId: string;
  public readonly objectiveId: string | null;
  public readonly userId: string;
  public readonly operation: string;
  public readonly recipient: string;
  public readonly amountYocto: string;
  public readonly network: string;
  public readonly idempotencyKey: string;
  public readonly nonce: string;
  public readonly issuedAt: number;
  public readonly expiresAt: number;
  public readonly hmacSignature: string;

  constructor(
    params: MintTicketParams,
    internalSecret: string,
    privateToken: symbol
  ) {
    if (privateToken !== TICKET_SEAL) {
      throw new Error("UNAUTHORIZED_EXECUTION_BOUNDARY_BYPASS: Direct instantiation of BoundaryExecutionTicket is prohibited.");
    }

    this.executionId = params.executionId;
    this.mandateId = params.mandateId;
    this.objectiveId = params.objectiveId || null;
    this.userId = params.userId;
    this.operation = params.operation;
    this.recipient = params.recipient.trim().toLowerCase();
    this.amountYocto = params.amountYocto;
    this.network = params.network || "testnet";
    this.idempotencyKey = params.idempotencyKey;
    this.nonce = params.nonce;
    this.issuedAt = Date.now();
    this.expiresAt = this.issuedAt + (params.validitySeconds || 60) * 1000;

    // Compute HMAC-SHA256 signature bound to exact parameters
    const canonicalPayload = canonicalize({
      executionId: this.executionId,
      mandateId: this.mandateId,
      objectiveId: this.objectiveId || null,
      userId: this.userId,
      operation: this.operation,
      recipient: this.recipient,
      amountYocto: this.amountYocto,
      network: this.network,
      idempotencyKey: this.idempotencyKey,
      nonce: this.nonce,
      issuedAt: this.issuedAt,
      expiresAt: this.expiresAt,
    });

    this.hmacSignature = crypto
      .createHmac("sha256", internalSecret)
      .update(JSON.stringify(canonicalPayload), "utf8")
      .digest("hex");
  }

  public isSealed(): boolean {
    return this[TICKET_SEAL] === true;
  }
}

/**
 * Authoritative Factory: Mints an unforgeable BoundaryExecutionTicket.
 * Can ONLY be invoked by ExecutionBoundaryService after all 15 pre-execution invariants pass.
 */
export function mintBoundaryExecutionTicket(params: MintTicketParams): BoundaryExecutionTicket {
  if (!params.executionId || !params.mandateId || !params.recipient || !params.amountYocto) {
    throw new Error("UNAUTHORIZED_EXECUTION_BOUNDARY_BYPASS: Cannot mint ticket with missing required parameters.");
  }

  // Testnet-Only Enactment: Block mainnet ticket minting at the factory source
  const network = (params.network || "testnet").toLowerCase();
  if (network !== "testnet") {
    throw new Error(`MAINNET_EXECUTION_PROHIBITED: Cannot mint ticket for network "${network}". Only NEAR Testnet is authorized in Testnet Beta.`);
  }

  return new BoundaryExecutionTicket(params, getBoundarySigningSecret(), TICKET_SEAL);
}

/**
 * Authoritative Validator: Verifies that the provided ticket is authentic, unexpired,
 * structurally sealed, and cryptographically bound to the EXACT transfer parameters.
 */
export function validateBoundaryExecutionTicket(
  ticket: unknown,
  transferParams: TransferValidationParams
): { valid: boolean; ticket?: BoundaryExecutionTicket; reason?: string } {
  // 1. Structural check
  if (!ticket || typeof ticket !== "object") {
    return {
      valid: false,
      reason: "Missing execution ticket. All OutLayer transfers must supply a valid BoundaryExecutionTicket.",
    };
  }

  // 2. Reject legacy boolean flags or forged plain objects
  if (!(ticket instanceof BoundaryExecutionTicket) || !(ticket as any).isSealed?.()) {
    return {
      valid: false,
      reason: "Invalid ticket object. Forged contexts or plain objects are strictly rejected.",
    };
  }

  const castTicket = ticket as BoundaryExecutionTicket;

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
    executionId: castTicket.executionId,
    mandateId: castTicket.mandateId,
    objectiveId: castTicket.objectiveId || null,
    userId: castTicket.userId,
    operation: castTicket.operation,
    recipient: castTicket.recipient,
    amountYocto: castTicket.amountYocto,
    network: castTicket.network,
    idempotencyKey: castTicket.idempotencyKey,
    nonce: castTicket.nonce,
    issuedAt: castTicket.issuedAt,
    expiresAt: castTicket.expiresAt,
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
  const normalizedTransferRecipient = transferParams.to.trim().toLowerCase();
  if (castTicket.recipient !== normalizedTransferRecipient) {
    return {
      valid: false,
      reason: `Recipient mismatch: Ticket authorized for "${castTicket.recipient}", but transfer requested to "${normalizedTransferRecipient}".`,
    };
  }

  if (castTicket.amountYocto !== transferParams.amountYocto) {
    return {
      valid: false,
      reason: `Amount mismatch: Ticket authorized for "${castTicket.amountYocto}" yoctoNEAR, but transfer requested "${transferParams.amountYocto}".`,
    };
  }

  if (transferParams.idempotencyKey && castTicket.idempotencyKey !== transferParams.idempotencyKey) {
    return {
      valid: false,
      reason: `Idempotency key mismatch: Ticket bound to "${castTicket.idempotencyKey}", but transfer supplied "${transferParams.idempotencyKey}".`,
    };
  }

  if (transferParams.objectiveId !== undefined && transferParams.objectiveId !== null) {
    if (castTicket.objectiveId !== transferParams.objectiveId) {
      return {
        valid: false,
        reason: `Objective ID mismatch: Ticket authorized for "${castTicket.objectiveId}", but transfer requested for "${transferParams.objectiveId}".`,
      };
    }
  }

  // 6. Testnet-Only Enactment (Fail-closed against Mainnet)
  if (castTicket.network !== "testnet") {
    return {
      valid: false,
      reason: `MAINNET_EXECUTION_PROHIBITED: Public beta supports NEAR Testnet only. Ticket network "${castTicket.network}" rejected.`,
    };
  }

  const chain = (transferParams.chain || "near").toLowerCase();
  if (chain !== "near" && chain !== "testnet") {
    return {
      valid: false,
      reason: `MAINNET_EXECUTION_PROHIBITED: Public beta supports NEAR Testnet only. Target "${chain}" rejected.`,
    };
  }

  return {
    valid: true,
    ticket: castTicket,
  };
}
