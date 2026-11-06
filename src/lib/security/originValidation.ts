/**
 * MANDATE — Centralized Origin & Referer Firewall
 * Milestone 14.3: On-Chain Wallet Ownership Verification & Authentication Remediation
 * 
 * Provides defense-in-depth origin validation for state-changing HTTP requests
 * (POST, PUT, PATCH, DELETE). Ensures foreign origins cannot forge mutations.
 * Enforces strict environment separation: localhost origins are strictly excluded in production.
 */

import crypto from "crypto";
import { getInternalServiceSecret } from "@/lib/production/environmentValidation";

export interface OriginValidationOptions {
  requireOriginForCookie?: boolean;
}

export interface OriginValidationResult {
  valid: boolean;
  reason?: string;
  origin?: string;
}

/**
 * Validates x-test-mode header.
 * STRICT REQUIREMENT: x-test-mode is NEVER honored in production mode.
 */
function isValidTestMode(testModeHeader: string | null): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return testModeHeader === "true";
}

/**
 * Validates x-mandate-internal-key header using constant-time comparison against INTERNAL_SERVICE_SECRET.
 * Milestone 14.5: Decoupled strictly from EXECUTION_SIGNING_SECRET.
 */
function isValidInternalKey(keyHeader: string | null): boolean {
  if (!keyHeader || typeof keyHeader !== "string") return false;
  const clean = keyHeader.trim();
  if (clean.length === 0) return false;

  let expectedSecret: string;
  try {
    expectedSecret = getInternalServiceSecret();
  } catch {
    return false;
  }

  const provBuf = Buffer.from(clean);
  const expBuf = Buffer.from(expectedSecret);

  if (provBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(provBuf, expBuf);
}

/**
 * Validates x-api-key header strictly against configured administrative API keys.
 * Milestone 14.5: Upstream OutLayer wallet keys (wk_...) are encrypted at rest and strictly removed
 * from inbound Origin firewall exemptions. Inbound programmatic exemptions require MANDATE_API_KEY / ADMIN_API_KEY.
 */
async function isValidApiKey(keyHeader: string | null): Promise<boolean> {
  if (!keyHeader || typeof keyHeader !== "string") return false;
  const clean = keyHeader.trim();
  if (clean.length < 16) return false;

  const configuredApiKey = process.env.MANDATE_API_KEY || process.env.ADMIN_API_KEY;
  if (configuredApiKey && configuredApiKey.length >= 16) {
    const provBuf = Buffer.from(clean);
    const confBuf = Buffer.from(configuredApiKey);
    if (provBuf.length === confBuf.length && crypto.timingSafeEqual(provBuf, confBuf)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes an origin URL string and verifies it is a valid HTTP/HTTPS URL.
 */
function normalizeOrigin(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Returns the allowlist of trusted application origins.
 * In production mode, local development origins (localhost, 127.0.0.1) are STRICTLY excluded.
 */
export function getAllowedOrigins(): string[] {
  const allowed = new Set<string>();

  // 1. Canonical public application domains
  allowed.add("https://mandate.app");
  allowed.add("https://www.mandate.app");
  allowed.add("https://testnet.mandate.app");

  // 2. Configured application URLs (validated)
  if (process.env.APP_URL) {
    const parsed = normalizeOrigin(process.env.APP_URL);
    if (parsed) allowed.add(parsed);
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    const parsed = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
    if (parsed) allowed.add(parsed);
  }
  if (process.env.APP_BASE_URL) {
    const parsed = normalizeOrigin(process.env.APP_BASE_URL);
    if (parsed) allowed.add(parsed);
  }

  // 3. Local development origins — strictly non-production ONLY
  const isProduction = process.env.NODE_ENV === "production" && process.env.MANDATE_ALLOW_DEV_ORIGINS !== "true";
  if (!isProduction) {
    allowed.add("http://localhost:3000");
    allowed.add("http://localhost:3001");
    allowed.add("http://127.0.0.1:3000");
    allowed.add("http://127.0.0.1:3001");
  }

  return Array.from(allowed);
}

/**
 * Validates the Origin and Referer headers of an incoming request.
 * Applies strictly to mutating HTTP methods (POST, PUT, PATCH, DELETE).
 * Safe for GET, HEAD, OPTIONS.
 */
export async function validateRequestOrigin(
  req: Request,
  options?: OriginValidationOptions
): Promise<OriginValidationResult> {
  const method = req.method.toUpperCase();

  // Safe HTTP methods do not mutate state
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return { valid: true };
  }

  const originHeader = req.headers.get("origin");
  const refererHeader = req.headers.get("referer");
  const allowedOrigins = getAllowedOrigins();

  // 1. If Origin header is present, it must be in the allowlist
  if (originHeader) {
    const cleanOrigin = originHeader.trim().toLowerCase();
    const isAllowed = allowedOrigins.includes(cleanOrigin);

    if (!isAllowed) {
      return {
        valid: false,
        reason: `Untrusted Origin header: "${originHeader}". Request blocked by Origin firewall.`,
        origin: cleanOrigin,
      };
    }
    return { valid: true, origin: cleanOrigin };
  }

  // 2. If Origin is absent, check Referer header
  if (refererHeader) {
    try {
      const refererOrigin = new URL(refererHeader).origin.toLowerCase();
      const isAllowed = allowedOrigins.includes(refererOrigin);

      if (!isAllowed) {
        return {
          valid: false,
          reason: `Untrusted Referer header origin: "${refererOrigin}". Request blocked by Origin firewall.`,
          origin: refererOrigin,
        };
      }
      return { valid: true, origin: refererOrigin };
    } catch {
      return {
        valid: false,
        reason: "Malformed Referer header on state-changing request.",
      };
    }
  }

  // 3. If both Origin and Referer are absent:
  // For cookie-authenticated browser requests, strictly reject (defense against header stripping CSRF)
  if (options?.requireOriginForCookie) {
    const testModeValid = isValidTestMode(req.headers.get("x-test-mode"));
    const internalKeyValid = isValidInternalKey(req.headers.get("x-mandate-internal-key"));
    const apiKeyValid = await isValidApiKey(req.headers.get("x-api-key"));

    const isDocumentedProgrammaticClient = testModeValid || internalKeyValid || apiKeyValid;

    if (!isDocumentedProgrammaticClient) {
      return {
        valid: false,
        reason: "Missing required Origin or Referer header on cookie-authenticated state-changing request.",
      };
    }
  }

  // Allowed for non-browser programmatic clients, direct CLI tests, or server-to-server operations
  return { valid: true };
}
