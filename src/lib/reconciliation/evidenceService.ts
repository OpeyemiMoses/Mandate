/**
 * Evidence Management Service (Milestone 9.3)
 * Collects, sanitizes, hashes (SHA-256), and persists immutable reconciliation evidence.
 * 
 * Non-Negotiable Safety:
 * Never persists raw private keys, HMAC secrets, bearer tokens, or sensitive authorization envelopes.
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { EvidencePayload, ReconciliationEntityType } from "./types";

// Patterns to sanitize from evidence payloads
const SENSITIVE_KEYS = [
  "privatekey",
  "secret",
  "token",
  "authsignature",
  "authorizationenvelope",
  "seedphrase",
  "password",
  "credential",
  "keypair",
  "signingkey",
  "hmac",
];

export class EvidenceService {
  /**
   * Recursively sanitizes any sensitive credentials from an evidence payload.
   */
  static sanitizePayload(data: any): any {
    if (data === null || data === undefined) return data;
    if (typeof data === "string") {
      // Check for common key/secret patterns
      if (data.startsWith("ed25519:") && data.length > 32) {
        return "[REDACTED_KEY_MATERIAL]";
      }
      return data;
    }
    if (typeof data !== "object") return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizePayload(item));
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive));

      if (isSensitive) {
        sanitized[key] = "[REDACTED_SECURITY_SECRET]";
      } else {
        sanitized[key] = this.sanitizePayload(value);
      }
    }
    return sanitized;
  }

  /**
   * Generates a deterministic canonical JSON string and its SHA-256 hash.
   */
  static hashPayload(payload: any): { canonicalJson: string; hash: string } {
    const sanitized = this.sanitizePayload(payload);
    
    // Sort keys deterministically
    const canonicalJson = JSON.stringify(sanitized, Object.keys(sanitized).sort());
    const hash = crypto.createHash("sha256").update(canonicalJson, "utf8").digest("hex");
    return { canonicalJson, hash };
  }

  /**
   * Persists an evidence record linked to a reconciliation finding or run.
   */
  static async recordEvidence(params: {
    runId?: string;
    findingId?: string;
    entityType: ReconciliationEntityType;
    entityId: string;
    sourceProvider: string;
    observedState: string;
    confidence?: number;
    rawPayload: Record<string, any>;
  }) {
    const { canonicalJson, hash } = this.hashPayload(params.rawPayload);

    return await prisma.reconciliationEvidence.create({
      data: {
        runId: params.runId,
        findingId: params.findingId,
        entityType: params.entityType,
        entityId: params.entityId,
        sourceProvider: params.sourceProvider,
        observedState: params.observedState,
        payloadHash: hash,
        rawEvidenceJson: canonicalJson,
        confidence: params.confidence ?? 1.0,
      },
    });
  }

  /**
   * Verifies the cryptographic integrity of an evidence record against its stored hash.
   */
  static verifyEvidenceIntegrity(rawEvidenceJson: string, expectedHash: string): boolean {
    const currentHash = crypto.createHash("sha256").update(rawEvidenceJson, "utf8").digest("hex");
    return currentHash === expectedHash;
  }
}

