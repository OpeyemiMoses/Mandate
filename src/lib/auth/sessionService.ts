/**
 * MANDATE — Centralized Server-Side Session Service
 * Milestone 9.5: Final Production Certification
 * 
 * Manages cryptographically signed, tamper-evident session tokens with explicit TTL,
 * secure HTTP-only cookies, session rotation, and instant revocation.
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getSessionSecret } from "@/lib/production/environmentValidation";

export const SESSION_COOKIE_NAME = "mandate_session";
export const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface SessionPayload {
  userId: string;
  nearAccountId: string;
  role: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export interface SessionResult {
  token: string;
  expiresAt: Date;
  cookieHeader: string;
}

/**
 * Signs a session payload using HMAC-SHA256 with the session secret.
 */
function computeSignature(payloadString: string): string {
  const secret = getSessionSecret();
  return crypto.createHmac("sha256", secret).update(payloadString).digest("hex");
}

export class SessionService {
  /**
   * Generates a cryptographically signed session token and sets it on the user.
   */
  public static async createSession(
    userId: string,
    nearAccountId: string,
    role = "OWNER",
    ttlMs: number = DEFAULT_SESSION_TTL_MS
  ): Promise<SessionResult> {
    const now = Date.now();
    const expiresAtMs = now + ttlMs;
    const expiresAt = new Date(expiresAtMs);
    const nonce = crypto.randomBytes(16).toString("hex");

    const payload: SessionPayload = {
      userId,
      nearAccountId,
      role,
      nonce,
      issuedAt: now,
      expiresAt: expiresAtMs,
    };

    const payloadString = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = computeSignature(payloadString);
    const token = `mandate_sess_${payloadString}.${signature}`;

    // Update user record with active session token for revocation tracking
    await prisma.user.update({
      where: { id: userId },
      data: {
        sessionToken: token,
      },
    });

    const isProd = process.env.NODE_ENV === "production";
    const cookieHeader = this.serializeCookie(token, expiresAt, isProd);

    return {
      token,
      expiresAt,
      cookieHeader,
    };
  }

  /**
   * Validates a session token:
   * 1. Format check
   * 2. Constant-time HMAC signature verification
   * 3. Expiration verification
   * 4. Database user existence & active session token match
   */
  public static async validateSession(token: string): Promise<SessionPayload | null> {
    if (!token || typeof token !== "string") return null;

    // Handle legacy session token format (sess_<hex>) during migration/dev
    if (token.startsWith("sess_") && !token.includes(".")) {
      const user = await prisma.user.findUnique({
        where: { sessionToken: token },
        select: { id: true, nearAccountId: true, role: true, updatedAt: true },
      });
      if (!user) return null;
      return {
        userId: user.id,
        nearAccountId: user.nearAccountId,
        role: user.role,
        nonce: "legacy",
        issuedAt: user.updatedAt.getTime(),
        expiresAt: Date.now() + DEFAULT_SESSION_TTL_MS,
      };
    }

    if (!token.startsWith("mandate_sess_") || !token.includes(".")) {
      return null;
    }

    const cleanToken = token.replace("mandate_sess_", "");
    const parts = cleanToken.split(".");
    if (parts.length !== 2) return null;

    const [payloadBase64, providedSig] = parts;

    // 1. Verify HMAC signature using timing-safe comparison
    const expectedSig = computeSignature(payloadBase64);
    const providedSigBuf = Buffer.from(providedSig, "hex");
    const expectedSigBuf = Buffer.from(expectedSig, "hex");

    if (
      providedSigBuf.length !== expectedSigBuf.length ||
      !crypto.timingSafeEqual(providedSigBuf, expectedSigBuf)
    ) {
      return null;
    }

    // 2. Decode payload
    let payload: SessionPayload;
    try {
      const jsonStr = Buffer.from(payloadBase64, "base64url").toString("utf8");
      payload = JSON.parse(jsonStr);
    } catch {
      return null;
    }

    // 3. Check expiration
    if (Date.now() > payload.expiresAt) {
      return null;
    }

    // 4. Verify user exists in database and session token is still active (not revoked)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, nearAccountId: true, role: true, sessionToken: true },
    });

    if (!user) return null;
    if (user.sessionToken !== token) {
      // Session has been rotated or revoked
      return null;
    }

    // Return payload with current database role
    return {
      ...payload,
      role: user.role,
    };
  }

  /**
   * Invalidates a user's session immediately (logout/revocation).
   */
  public static async invalidateSession(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        sessionToken: `revoked_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`,
      },
    });
  }

  /**
   * Renews and rotates an active session within its validity window.
   * Atomically invalidates the old token and returns a fresh signed token with rotated nonce.
   */
  public static async renewSession(oldToken: string, ttlMs = DEFAULT_SESSION_TTL_MS): Promise<SessionResult | null> {
    const validated = await this.validateSession(oldToken);
    if (!validated) {
      return null;
    }

    // Create fresh rotated session (replaces sessionToken in DB)
    return this.createSession(validated.userId, validated.nearAccountId, validated.role, ttlMs);
  }

  /**
   * Serializes a secure HTTP-only cookie header.
   */
  public static serializeCookie(token: string, expiresAt: Date, isSecure = true): string {
    const maxAgeSec = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    const parts = [
      `${SESSION_COOKIE_NAME}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${maxAgeSec}`,
      `Expires=${expiresAt.toUTCString()}`,
    ];
    if (isSecure) {
      parts.push("Secure");
    }
    return parts.join("; ");
  }

  /**
   * Serializes a cookie clearing header for logout with consistent security attributes.
   * Matches serializeCookie default behavior (Secure, HttpOnly, SameSite=Lax, Path=/).
   */
  public static serializeClearCookie(isSecure = true): string {
    const parts = [
      `${SESSION_COOKIE_NAME}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=0",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ];
    if (isSecure) {
      parts.push("Secure");
    }
    return parts.join("; ");
  }

  /**
   * Extracts session token from Cookie, x-session-token header, or Bearer Authorization.
   */
  public static extractSessionToken(req: Request): string | null {
    // 1. Check Cookie header
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match && match[1]) {
        return decodeURIComponent(match[1].trim());
      }
    }

    // 2. Check x-session-token header
    const headerToken = req.headers.get("x-session-token");
    if (headerToken && headerToken.trim().length > 0) {
      return headerToken.trim();
    }

    // 3. Check Authorization: Bearer <token>
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      return authHeader.slice(7).trim();
    }

    return null;
  }
}
