/**
 * Cryptographic Execution Authorization Service
 * Milestone 8 - Verifiable Authorization Envelopes & Nonce Enforcement
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { canonicalize } from "@/lib/auditLedger";
import { getExecutionSigningSecret } from "@/lib/production/environmentValidation";
import { AuthorizationEnvelope, ExecutionOperation } from "./types";

// Maximum authorization envelope TTL (300 seconds = 5 minutes)
export const ENVELOPE_TTL_MS = 5 * 60 * 1000;

export interface IssueEnvelopeParams {
  executionId?: string;
  userId: string;
  agentId?: string;
  mandateId: string;
  operation: ExecutionOperation | string;
  targetChain?: string;
  recipient: string;
  token?: string;
  amountYocto: string;
  toolOrIntegrationId?: string;
  parameters?: Record<string, any>;
  governancePolicyId?: string;
  governancePolicyVersion?: number;
  mandateVersion?: number;
  approvalId?: string;
  actionPayloadHash?: string;
  ttlMs?: number;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  envelope?: AuthorizationEnvelope;
  tamperedFields?: string[];
}

export class ExecutionAuthorizationService {
  /**
   * Deterministically computes the canonical HMAC signature of an authorization envelope.
   */
  public static computeEnvelopeSignature(envelopeData: Omit<AuthorizationEnvelope, "signature">): string {
    const canonicalPayload = canonicalize({
      executionId: envelopeData.executionId,
      userId: envelopeData.userId,
      agentId: envelopeData.agentId || null,
      mandateId: envelopeData.mandateId,
      operation: envelopeData.operation,
      targetChain: envelopeData.targetChain,
      recipient: envelopeData.recipient.trim().toLowerCase(),
      token: envelopeData.token,
      amountYocto: envelopeData.amountYocto,
      toolOrIntegrationId: envelopeData.toolOrIntegrationId || null,
      parameters: envelopeData.parameters || {},
      governancePolicyId: envelopeData.governancePolicyId || null,
      governancePolicyVersion: envelopeData.governancePolicyVersion ?? null,
      mandateVersion: envelopeData.mandateVersion ?? null,
      approvalId: envelopeData.approvalId || null,
      actionPayloadHash: envelopeData.actionPayloadHash,
      nonce: envelopeData.nonce,
      issuedAt: envelopeData.issuedAt,
      expiresAt: envelopeData.expiresAt,
    });

    const canonicalJson = JSON.stringify(canonicalPayload);
    const secret = getExecutionSigningSecret();
    return crypto
      .createHmac("sha256", secret)
      .update(canonicalJson, "utf8")
      .digest("hex");
  }

  /**
   * Generates a cryptographically random, collision-resistant single-use nonce.
   */
  public static generateNonce(): string {
    return `nonce-${crypto.randomBytes(16).toString("hex")}`;
  }

  /**
   * Generates a tamper-proof cryptographic authorization envelope for a validated action.
   */
  public static async issueAuthorization(params: IssueEnvelopeParams): Promise<AuthorizationEnvelope> {
    const executionId = params.executionId || `exec-${crypto.randomBytes(12).toString("hex")}`;
    const nonce = this.generateNonce();
    const now = Date.now();
    const ttl = params.ttlMs || ENVELOPE_TTL_MS;
    const issuedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + ttl).toISOString();

    const unsignedEnvelope: Omit<AuthorizationEnvelope, "signature"> = {
      executionId,
      userId: params.userId,
      agentId: params.agentId,
      mandateId: params.mandateId,
      operation: params.operation,
      targetChain: params.targetChain || "near",
      recipient: params.recipient.trim().toLowerCase(),
      token: params.token || "NEAR",
      amountYocto: params.amountYocto,
      toolOrIntegrationId: params.toolOrIntegrationId,
      parameters: params.parameters || {},
      governancePolicyId: params.governancePolicyId,
      governancePolicyVersion: params.governancePolicyVersion,
      mandateVersion: params.mandateVersion,
      approvalId: params.approvalId,
      actionPayloadHash:
        params.actionPayloadHash ||
        crypto
          .createHash("sha256")
          .update(
            JSON.stringify(
              canonicalize({
                operation: params.operation,
                recipient: params.recipient.trim().toLowerCase(),
                amountYocto: params.amountYocto,
                parameters: params.parameters,
              })
            )
          )
          .digest("hex"),
      nonce,
      issuedAt,
      expiresAt,
    };

    const signature = this.computeEnvelopeSignature(unsignedEnvelope);

    return {
      ...unsignedEnvelope,
      signature,
    };
  }

  /**
   * Independently verifies an authorization envelope before execution.
   * Enforces:
   * 1. Constant-time HMAC comparison (mitigating timing attacks).
   * 2. Expiration window check.
   * 3. Single-use nonce protection against replay attacks.
   * 4. Parameter binding check (verifying execution matches authorized parameters).
   */
  public static async verifyAuthorization(
    envelope: AuthorizationEnvelope,
    expectedParams?: {
      userId?: string;
      mandateId?: string;
      recipient?: string;
      amountYocto?: string;
      operation?: string;
    }
  ): Promise<VerificationResult> {
    // 1. Structural Checks
    if (!envelope || !envelope.signature || !envelope.nonce || !envelope.executionId) {
      return { valid: false, reason: "Malformed authorization envelope" };
    }

    // 2. Expiration Verification
    const now = new Date();
    const expiry = new Date(envelope.expiresAt);
    if (now >= expiry) {
      return {
        valid: false,
        reason: `Authorization envelope expired at ${envelope.expiresAt}`,
        envelope,
      };
    }

    // 3. Constant-Time HMAC Signature Check
    const { signature, ...unsignedData } = envelope;
    const expectedSignature = this.computeEnvelopeSignature(unsignedData);

    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expectedSignature, "hex");

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return {
        valid: false,
        reason: "Cryptographic signature mismatch: authorization envelope has been forged or modified",
        envelope,
      };
    }

    // 4. Parameter Binding Verification (Ensuring execution matches envelope intent)
    const tamperedFields: string[] = [];
    if (expectedParams) {
      if (expectedParams.userId && expectedParams.userId !== envelope.userId) {
        tamperedFields.push("userId");
      }
      if (expectedParams.mandateId && expectedParams.mandateId !== envelope.mandateId) {
        tamperedFields.push("mandateId");
      }
      if (
        expectedParams.recipient &&
        expectedParams.recipient.trim().toLowerCase() !== envelope.recipient.trim().toLowerCase()
      ) {
        tamperedFields.push("recipient");
      }
      if (expectedParams.amountYocto && expectedParams.amountYocto !== envelope.amountYocto) {
        tamperedFields.push("amountYocto");
      }
      if (expectedParams.operation && expectedParams.operation !== envelope.operation) {
        tamperedFields.push("operation");
      }

      if (tamperedFields.length > 0) {
        return {
          valid: false,
          reason: `Execution parameters do not match authorized envelope (altered: ${tamperedFields.join(", ")})`,
          envelope,
          tamperedFields,
        };
      }
    }

    // 4b. Mandate Version Drift Check
    if (envelope.mandateId && envelope.mandateVersion !== undefined && envelope.mandateVersion !== null) {
      const currentMandate = await prisma.mandate.findUnique({
        where: { id: envelope.mandateId },
        select: { policyVersion: true },
      });
      if (currentMandate && currentMandate.policyVersion !== envelope.mandateVersion) {
        return {
          valid: false,
          reason: `Mandate policy version mismatch: envelope issued for version ${envelope.mandateVersion}, current mandate is version ${currentMandate.policyVersion}`,
          envelope,
        };
      }
    }

    // 5. Single-Use Nonce & Replay Check
    const existingExecution = await prisma.executionRecord.findUnique({
      where: { nonce: envelope.nonce },
    });

    if (existingExecution && existingExecution.isNonceConsumed) {
      return {
        valid: false,
        reason: `Authorization envelope replay rejected: Nonce "${envelope.nonce}" has already been consumed at ${existingExecution.nonceConsumedAt?.toISOString()}`,
        envelope,
      };
    }

    return {
      valid: true,
      envelope,
    };
  }

  /**
   * Consumes a nonce atomically upon dispatch to external execution provider,
   * guaranteeing that an authorization envelope can NEVER be replayed.
   */
  public static async consumeNonce(nonce: string, executionId: string): Promise<boolean> {
    try {
      const now = new Date();
      const res = await prisma.executionRecord.updateMany({
        where: { nonce, isNonceConsumed: false },
        data: {
          isNonceConsumed: true,
          nonceConsumedAt: now,
          status: "SIGNED",
        },
      });
      return res.count > 0;
    } catch (err) {
      console.error("Failed to consume execution nonce:", err);
      return false;
    }
  }
}

