/**
 * MANDATE — Milestone 14.3: On-Chain NEAR Access-Key Ownership Verification Service
 * 
 * Verifies that a submitted public key is an active, authorized access key belonging
 * to the exact claimed NEAR account on NEAR Testnet with FullAccess permission.
 * Fails closed on any RPC error, rate limit, timeout, or missing key.
 */

export const NEAR_TESTNET_RPC_ENDPOINTS = [
  process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com",
  "https://test.rpc.fastnear.com",
  "https://rpc.testnet.near.org",
].filter((v, i, a) => a.indexOf(v) === i);

export type KeyVerificationErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "PUBLIC_KEY_NOT_AUTHORIZED"
  | "AUTH_KEY_PERMISSION_INSUFFICIENT"
  | "RPC_UNAVAILABLE"
  | "RPC_RESPONSE_INVALID";

export interface KeyVerificationResult {
  verified: boolean;
  error?: string;
  code?: KeyVerificationErrorCode;
  permission?: "FullAccess";
  publicKey?: string;
  keysCount?: number;
}

export const NEAR_ACCOUNT_REGEX = /^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+$/;

/**
 * Validates NEAR account ID format according to NEAR Protocol specifications.
 * Supports both named accounts (2-64 chars, dot-delimited subaccounts) and 64-char hex implicit accounts.
 */
export function isValidNearAccountId(accountId: string): boolean {
  if (!accountId || typeof accountId !== "string") return false;
  const clean = accountId.trim().toLowerCase();
  if (clean.length < 2 || clean.length > 64) return false;
  if (/^[0-9a-f]{64}$/.test(clean)) return true;
  return NEAR_ACCOUNT_REGEX.test(clean);
}

export class NearAccountKeyVerification {
  /**
   * Validates NEAR account ID format.
   */
  public static isValidAccountId(accountId: string): boolean {
    return isValidNearAccountId(accountId);
  }

  /**
   * Normalizes a NEAR account ID and verifies format.
   */
  public static normalizeAccountId(accountId: string): string {
    return accountId.trim().toLowerCase();
  }

  /**
   * Normalizes an Ed25519 or Secp256k1 public key string.
   */
  public static normalizePublicKey(publicKey: string): string {
    const trimmed = publicKey.trim();
    if (!trimmed.includes(":")) {
      return `ed25519:${trimmed}`;
    }
    const [curve, key] = trimmed.split(":");
    return `${curve.toLowerCase()}:${key}`;
  }

  /**
   * Authoritatively queries NEAR Testnet RPC to verify that publicKey is an active FullAccess key on accountId.
   */
  public static async verifyAccountAccessKey(
    accountId: string,
    publicKey: string,
    options?: { timeoutMs?: number; rpcEndpoints?: string[] }
  ): Promise<KeyVerificationResult> {
    const cleanAccountId = this.normalizeAccountId(accountId);
    const cleanPublicKey = this.normalizePublicKey(publicKey);

    // Format assertion using strict NEAR Protocol rules
    if (!this.isValidAccountId(cleanAccountId)) {
      return {
        verified: false,
        error: `Invalid NEAR account ID format: "${accountId}"`,
        code: "ACCOUNT_NOT_FOUND",
      };
    }

    const endpoints = options?.rpcEndpoints || NEAR_TESTNET_RPC_ENDPOINTS;
    const timeoutMs = options?.timeoutMs || 5000;

    let rpcResponseData: any = null;
    let rpcError: any = null;

    // 1. Query NEAR Testnet RPC endpoints in sequence until authoritative response
    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: `key-query-${Date.now()}`,
            method: "query",
            params: {
              request_type: "view_access_key_list",
              finality: "final",
              account_id: cleanAccountId,
            },
          }),
        });
        clearTimeout(timeout);

        if (!res.ok) {
          continue;
        }

        const data = await res.json();
        if (data) {
          rpcResponseData = data;
          break;
        }
      } catch (err: any) {
        rpcError = err;
      }
    }

    if (!rpcResponseData) {
      return {
        verified: false,
        error: "NEAR Testnet RPC unavailable. Key ownership could not be verified.",
        code: "RPC_UNAVAILABLE",
      };
    }

    // 2. Check for explicit RPC error responses
    if (rpcResponseData.error) {
      const errName = rpcResponseData.error.cause?.name || rpcResponseData.error.name || "";
      const errMsg = String(rpcResponseData.error.data || rpcResponseData.error.message || "");

      if (
        errName === "UNKNOWN_ACCOUNT" ||
        errMsg.toLowerCase().includes("does not exist") ||
        errMsg.toLowerCase().includes("unknown account")
      ) {
        return {
          verified: false,
          error: `Account "${cleanAccountId}" does not exist on NEAR Testnet.`,
          code: "ACCOUNT_NOT_FOUND",
        };
      }

      return {
        verified: false,
        error: `NEAR RPC query returned an error: ${errMsg || errName}`,
        code: "RPC_RESPONSE_INVALID",
      };
    }

    // 3. Parse and validate result.keys array
    const result = rpcResponseData.result;
    if (!result || !Array.isArray(result.keys)) {
      return {
        verified: false,
        error: "Malformed RPC response: missing keys list.",
        code: "RPC_RESPONSE_INVALID",
      };
    }

    const keys: Array<{ public_key: string; access_key: { permission: any; nonce: number } }> = result.keys;

    // Account exists on RPC with 0 keys
    if (keys.length === 0) {
      return {
        verified: false,
        error: `Account "${cleanAccountId}" has no active access keys on NEAR Testnet.`,
        code: "PUBLIC_KEY_NOT_AUTHORIZED",
        keysCount: 0,
      };
    }

    // 4. Exact public key match
    const matchingKey = keys.find((k) => this.normalizePublicKey(k.public_key) === cleanPublicKey);

    if (!matchingKey) {
      return {
        verified: false,
        error: `Public key "${cleanPublicKey}" is not an authorized access key for account "${cleanAccountId}" on NEAR Testnet.`,
        code: "PUBLIC_KEY_NOT_AUTHORIZED",
        keysCount: keys.length,
      };
    }

    // 5. Access key permission policy (Milestone 14.3: FullAccess only)
    const permission = matchingKey.access_key.permission;

    if (permission === "FullAccess") {
      return {
        verified: true,
        permission: "FullAccess",
        publicKey: matchingKey.public_key,
        keysCount: keys.length,
      };
    }

    if (typeof permission === "object" && permission?.FunctionCall) {
      return {
        verified: false,
        error: "Authentication requires a FullAccess key. Scoped FunctionCall keys are not permitted for platform member sessions.",
        code: "AUTH_KEY_PERMISSION_INSUFFICIENT",
        keysCount: keys.length,
      };
    }

    return {
      verified: false,
      error: "Unsupported access key permission structure.",
      code: "AUTH_KEY_PERMISSION_INSUFFICIENT",
      keysCount: keys.length,
    };
  }
}

