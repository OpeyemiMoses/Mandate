/**
 * Mandate Credential Vault
 * Secure AES-256-GCM authenticated encryption at rest with key rotation,
 * versioning, revocation, and strict secret redaction.
 */

import crypto from "crypto";
import { prisma } from "../db";
import { getCredentialVaultMasterKey } from "../production/environmentValidation";

const SENSITIVE_KEY_PATTERNS = [
  /api[-_]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /authorization/i,
  /bearer/i,
  /private[-_]?key/i,
  /seed/i,
  /mnemonic/i,
  /credential/i,
  /client[-_]?secret/i,
  /wk_[a-zA-Z0-9]+/i,
];

export const CURRENT_VAULT_VERSION = 1;

// In-memory cache for decrypted credentials with bounded TTL
const credentialMemoryCache = new Map<string, { credentials: Record<string, any>; version: number; expiresAt: number }>();

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

export interface EncryptedPayload {
  version: number;
  ivHex: string;
  authTagHex: string;
  ciphertextHex: string;
}

export class CredentialVault {
  /**
   * Encrypts a credentials dictionary using AES-256-GCM.
   * Stored format: v{version}:{ivHex}:{authTagHex}:{ciphertextHex}
   */
  public static encrypt(credentials: Record<string, any>, keyVersion: number = CURRENT_VAULT_VERSION): string {
    const secret = getCredentialVaultMasterKey(keyVersion);
    const key = deriveKey(secret);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    const plaintext = JSON.stringify(credentials);
    let ciphertext = cipher.update(plaintext, "utf8", "hex");
    ciphertext += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    return `v${keyVersion}:${iv.toString("hex")}:${authTag}:${ciphertext}`;
  }

  /**
   * Decrypts an encrypted credential payload.
   * Supports backwards-compatible format (iv:authTag:ciphertext) and versioned format (v1:iv:authTag:ciphertext).
   */
  public static decrypt(encryptedString: string): { credentials: Record<string, any>; version: number } {
    if (!encryptedString) {
      throw new Error("Cannot decrypt empty credentials string");
    }

    const parts = encryptedString.split(":");
    let version = 1;
    let ivHex = "";
    let authTagHex = "";
    let ciphertextHex = "";

    if (parts.length === 4 && parts[0].startsWith("v")) {
      version = parseInt(parts[0].slice(1), 10) || 1;
      ivHex = parts[1];
      authTagHex = parts[2];
      ciphertextHex = parts[3];
    } else if (parts.length === 3) {
      // Legacy format from earlier milestone
      version = 1;
      ivHex = parts[0];
      authTagHex = parts[1];
      ciphertextHex = parts[2];
    } else {
      throw new Error("Invalid encrypted credentials format");
    }

    const secret = getCredentialVaultMasterKey(version);
    const key = deriveKey(secret);
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return {
      credentials: JSON.parse(decrypted),
      version,
    };
  }

  /**
   * Rotates credentials to a new vault encryption key version.
   */
  public static async rotateConnectionCredentials(
    connectionId: string,
    targetKeyVersion: number = CURRENT_VAULT_VERSION + 1
  ): Promise<{ success: boolean; newVersion: number }> {
    const connection = await prisma.integrationConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    if (!connection.encryptedCredentials) {
      throw new Error(`Connection ${connectionId} has no encrypted credentials to rotate`);
    }

    // Decrypt using existing version
    const { credentials } = this.decrypt(connection.encryptedCredentials);

    // Re-encrypt using target version
    const reEncrypted = this.encrypt(credentials, targetKeyVersion);

    await prisma.integrationConnection.update({
      where: { id: connectionId },
      data: {
        encryptedCredentials: reEncrypted,
        credentialVersion: targetKeyVersion,
      },
    });

    return { success: true, newVersion: targetKeyVersion };
  }

  /**
   * Retrieves decrypted credentials from cache or database with memory isolation.
   */
  public static async getDecryptedCredentialsForConnection(
    connectionId: string
  ): Promise<Record<string, any>> {
    // 1. Check in-memory cache
    const cached = credentialMemoryCache.get(connectionId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.credentials;
    }

    // 2. Fetch from DB
    const connection = await prisma.integrationConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    if (connection.status === "REVOKED") {
      credentialMemoryCache.delete(connectionId);
      throw new Error(`Connection ${connectionId} is REVOKED. Credentials cannot be accessed.`);
    }

    if (!connection.encryptedCredentials) {
      throw new Error(`Connection ${connectionId} has no credentials`);
    }

    const { credentials, version } = this.decrypt(connection.encryptedCredentials);
    credentialMemoryCache.set(connectionId, {
      credentials,
      version,
      expiresAt: Date.now() + 60000,
    });

    return credentials;
  }

  /**
   * Checks whether credentials are currently cached in memory.
   */
  public static isCached(connectionId: string): boolean {
    const cached = credentialMemoryCache.get(connectionId);
    return Boolean(cached && cached.expiresAt > Date.now());
  }

  /**
   * Instantly revokes connection credentials:
   * 1. Nullifies in-memory cache immediately.
   * 2. Invalidates any active/pending OAuthSessions for this user and provider.
   * 3. Nullifies stored encrypted credentials in database and sets status to REVOKED.
   */
  public static async revokeConnection(
    connectionId: string,
    reason: string = "User requested revocation"
  ): Promise<void> {
    // 1. Invalidate in-memory cache
    credentialMemoryCache.delete(connectionId);

    // 2. Fetch connection to identify userId and providerId
    const connection = await prisma.integrationConnection.findUnique({
      where: { id: connectionId },
    });

    if (connection) {
      // Invalidate active OAuthSessions for this provider and user
      await prisma.oAuthSession.updateMany({
        where: {
          userId: connection.userId,
          providerId: connection.providerId,
          isUsed: false,
        },
        data: {
          isUsed: true,
          expiresAt: new Date(0), // Expire immediately
        },
      });
    }

    // 3. Nullify credentials in database and update status to REVOKED
    await prisma.integrationConnection.update({
      where: { id: connectionId },
      data: {
        encryptedCredentials: null,
        status: "REVOKED",
        revokedAt: new Date(),
        healthMetadataJson: JSON.stringify({
          revokedReason: reason,
          revokedAt: new Date().toISOString(),
          cachedPurged: true,
          sessionsInvalidated: true,
        }),
      },
    });
  }

  /**
   * Updates credentials after refresh token rotation
   */
  public static async updateRefreshedTokens(
    connectionId: string,
    newTokens: {
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      tokenType?: string;
      scopes?: string[];
    }
  ): Promise<void> {
    const connection = await prisma.integrationConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    let existingCredentials: Record<string, any> = {};
    if (connection.encryptedCredentials) {
      try {
        existingCredentials = this.decrypt(connection.encryptedCredentials).credentials;
      } catch (err) {
        existingCredentials = {};
      }
    }

    const updatedCredentials = {
      ...existingCredentials,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken || existingCredentials.refreshToken,
      tokenType: newTokens.tokenType || existingCredentials.tokenType || "Bearer",
      refreshedAt: new Date().toISOString(),
    };

    const expiresAt = newTokens.expiresIn
      ? new Date(Date.now() + newTokens.expiresIn * 1000)
      : connection.expiresAt;

    const encrypted = this.encrypt(updatedCredentials, connection.credentialVersion || CURRENT_VAULT_VERSION);

    await prisma.integrationConnection.update({
      where: { id: connectionId },
      data: {
        encryptedCredentials: encrypted,
        expiresAt,
        status: "ACTIVE",
        grantedScopesJson: newTokens.scopes ? JSON.stringify(newTokens.scopes) : connection.grantedScopesJson,
      },
    });
  }

  /**
   * Strips all credentials and generates safe masked previews for display.
   * NEVER returns plaintext secrets.
   */
  public static maskSecret(secret: string): string {
    if (!secret || typeof secret !== "string") return "";
    const clean = secret.trim();
    if (clean.length <= 8) {
      return "••••••••";
    }
    const prefix = clean.slice(0, 4);
    const suffix = clean.slice(-4);
    return `${prefix}••••••••${suffix}`;
  }

  /**
   * Redacts sensitive data from any object before returning via API or passing to agents.
   */
  public static redactSecrets(data: any): any {
    if (data === null || data === undefined) return data;

    if (typeof data === "string") {
      if (/wk_[a-zA-Z0-9]{30,}/.test(data)) {
        return data.replace(/wk_[a-zA-Z0-9]{30,}/g, "wk_[REDACTED]");
      }
      if (/bearer\s+[a-zA-Z0-9._-]+/i.test(data)) {
        return data.replace(/bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]");
      }
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.redactSecrets(item));
    }

    if (typeof data === "object") {
      const sanitized: Record<string, any> = {};
      for (const [key, val] of Object.entries(data)) {
        const isSensitive = SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
        if (isSensitive) {
          sanitized[key] = "[REDACTED]";
        } else {
          sanitized[key] = this.redactSecrets(val);
        }
      }
      return sanitized;
    }

    return data;
  }
}

