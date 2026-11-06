/**
 * MANDATE — OutLayer TEE Wallet Credential Protection Service
 * Milestone 14.5: Credential Boundary Hardening & Secure Storage
 * 
 * Provides AES-256-GCM authenticated encryption at rest for upstream OutLayer TEE
 * wallet credentials (wk_...). Ensures wallet API keys are never stored in plaintext
 * in PostgreSQL, while preserving transparent backward-compatible decryption.
 */

import { CredentialVault } from "@/lib/integrations/credentialVault";
import { prisma } from "@/lib/db";

export class WalletCredentialService {
  /**
   * Encrypts a raw OutLayer API key using AES-256-GCM authenticated encryption.
   * Format: v{version}:{ivHex}:{authTagHex}:{ciphertextHex}
   */
  public static encryptApiKey(plaintextApiKey: string): string {
    if (!plaintextApiKey || typeof plaintextApiKey !== "string") {
      return "";
    }
    const trimmed = plaintextApiKey.trim();
    // Idempotent: do not double-encrypt
    if (this.isEncrypted(trimmed)) {
      return trimmed;
    }
    return CredentialVault.encrypt({ apiKey: trimmed });
  }

  /**
   * Decrypts an encrypted OutLayer API key payload.
   * If the key is already legacy plaintext, returns it directly for backwards compatibility.
   */
  public static decryptApiKey(storedKey: string): string {
    if (!storedKey || typeof storedKey !== "string") {
      return "";
    }
    const trimmed = storedKey.trim();
    if (!this.isEncrypted(trimmed)) {
      return trimmed; // Legacy plaintext backwards compatibility
    }

    try {
      const { credentials } = CredentialVault.decrypt(trimmed);
      return credentials?.apiKey || "";
    } catch (err: any) {
      console.error("[WalletCredentialService] Failed to decrypt wallet API key:", err?.message);
      return "";
    }
  }

  /**
   * Checks whether a stored string is an encrypted credential payload.
   */
  public static isEncrypted(value: string): boolean {
    if (!value || typeof value !== "string") return false;
    const parts = value.split(":");
    // Versioned format: v1:iv:tag:cipher (4 parts) or legacy format: iv:tag:cipher (3 parts)
    return (parts.length === 4 && parts[0].startsWith("v")) || (parts.length === 3 && parts[0].length === 24);
  }

  /**
   * Resolves the decrypted OutLayer API key from a Wallet object.
   */
  public static getDecryptedApiKey(wallet: { apiKey: string } | null | undefined): string {
    if (!wallet || !wallet.apiKey) return "";
    return this.decryptApiKey(wallet.apiKey);
  }

  /**
   * Migrates legacy plaintext wallet keys in PostgreSQL to AES-256-GCM authenticated ciphertext.
   * Zero data loss, completely safe and idempotent.
   */
  public static async migratePlaintextWalletKeys(): Promise<{
    scanned: number;
    migrated: number;
    alreadyEncrypted: number;
    errors: number;
  }> {
    const isPostgres =
      process.env.DATABASE_URL?.startsWith("postgres") ||
      process.env.DATABASE_URL?.startsWith("postgresql") ||
      process.env.MANDATE_DATABASE_TYPE === "postgres";

    if (!isPostgres) {
      return { scanned: 0, migrated: 0, alreadyEncrypted: 0, errors: 0 };
    }

    let scanned = 0;
    let migrated = 0;
    let alreadyEncrypted = 0;
    let errors = 0;

    const wallets = await prisma.wallet.findMany({
      select: { id: true, apiKey: true },
    });
    scanned = wallets.length;

    for (const w of wallets) {
      if (this.isEncrypted(w.apiKey)) {
        alreadyEncrypted++;
        continue;
      }

      try {
        const encrypted = this.encryptApiKey(w.apiKey);
        await prisma.wallet.update({
          where: { id: w.id },
          data: { apiKey: encrypted },
        });
        migrated++;
      } catch (err) {
        errors++;
      }
    }

    return { scanned, migrated, alreadyEncrypted, errors };
  }
}

export const encryptWalletApiKey = WalletCredentialService.encryptApiKey.bind(WalletCredentialService);
export const decryptWalletApiKey = WalletCredentialService.decryptApiKey.bind(WalletCredentialService);
export const getDecryptedWalletApiKey = WalletCredentialService.getDecryptedApiKey.bind(WalletCredentialService);

