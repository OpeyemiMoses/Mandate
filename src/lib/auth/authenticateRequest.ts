/**
 * MANDATE — Centralized Authentication & Identity Enforcement
 * Milestone 9.5: Final Production Certification
 * 
 * Extracts and verifies server-side identity from HTTP-only cookies, Bearer tokens,
 * or signed headers. Strictly forbids client-supplied userId spoofing.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SessionService, SessionPayload } from "./sessionService";

export class AuthenticationError extends Error {
  public readonly statusCode = 401;
  constructor(message = "Unauthorized: Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends Error {
  public readonly statusCode = 403;
  constructor(message = "Forbidden: Insufficient privileges") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface AuthContext {
  userId: string;
  nearAccountId: string;
  role: string;
  isAdmin: boolean;
  isOperator: boolean;
  sessionExpiresAt: Date;
  authMethod: "COOKIE" | "BEARER" | "HEADER" | "SYSTEM";
}

export interface AuthenticateOptions {
  requireAdmin?: boolean;
  allowSystemInternal?: boolean;
}

/**
 * Authenticates an incoming request, resolving a cryptographically verified AuthContext.
 */
export async function authenticateRequest(
  req: Request,
  options?: AuthenticateOptions
): Promise<AuthContext> {
  const isProd = process.env.NODE_ENV === "production";

  // 1. Check for system internal header if permitted
  if (options?.allowSystemInternal) {
    const internalSecret = req.headers.get("x-mandate-internal-key");
    const executionSecret = process.env.EXECUTION_SIGNING_SECRET || "mandate-execution-signing-secret-v1-production-boundary";
    if (internalSecret && internalSecret === executionSecret) {
      return {
        userId: "SYSTEM",
        nearAccountId: "system.mandate",
        role: "OWNER",
        isAdmin: true,
        isOperator: true,
        sessionExpiresAt: new Date(Date.now() + 3600000),
        authMethod: "SYSTEM",
      };
    }
  }

  // 2. Extract session token from Cookie, x-session-token, or Authorization Bearer
  const token = SessionService.extractSessionToken(req);

  if (token) {
    const payload = await SessionService.validateSession(token);
    if (payload) {
      const isAdmin = payload.role === "OWNER" || payload.role === "SECURITY_ADMIN" || payload.role === "ADMIN";
      const isOperator = isAdmin || payload.role === "OPERATOR";

      if (options?.requireAdmin && !isAdmin) {
        throw new ForbiddenError("Forbidden: Administrative role required to access this resource");
      }

      const authMethod = req.headers.get("cookie")?.includes(token) ? "COOKIE" : "BEARER";

      return {
        userId: payload.userId,
        nearAccountId: payload.nearAccountId,
        role: payload.role,
        isAdmin,
        isOperator,
        sessionExpiresAt: new Date(payload.expiresAt),
        authMethod,
      };
    }

    // Explicit session token provided was invalid or expired
    throw new AuthenticationError("Unauthorized: Invalid or expired session token");
  }

  // 3. Fallback for test suites and dev environments (never in production)
  if (!isProd) {
    const nearAccountHeader = req.headers.get("x-near-account") || req.headers.get("x-user-id");
    if (!nearAccountHeader || nearAccountHeader.trim().length === 0) {
      throw new AuthenticationError("Unauthorized: Authentication credentials required");
    }

    const cleanAccount = nearAccountHeader.trim().toLowerCase();

    let user = await prisma.user.findUnique({
      where: { nearAccountId: cleanAccount },
    });

    if (!user) {
      // Connecting a wallet never grants administrative privileges automatically
      const configuredAdmins = (process.env.ADMIN_NEAR_ACCOUNT_IDS || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const isConfiguredAdmin = configuredAdmins.includes(cleanAccount);
      user = await prisma.user.create({
        data: {
          nearAccountId: cleanAccount,
          role: isConfiguredAdmin ? "ADMIN" : "MEMBER",
        },
      });
    }

    const isAdmin = user.role === "OWNER" || user.role === "SECURITY_ADMIN" || user.role === "ADMIN";
    const isOperator = isAdmin || user.role === "OPERATOR";

    if (options?.requireAdmin && !isAdmin) {
      throw new ForbiddenError("Forbidden: Administrative role required");
    }

    return {
      userId: user.id,
      nearAccountId: user.nearAccountId,
      role: user.role,
      isAdmin,
      isOperator,
      sessionExpiresAt: new Date(Date.now() + 86400000),
      authMethod: "HEADER",
    };
  }

  // Production fails closed on missing or invalid session
  throw new AuthenticationError("Unauthorized: Missing or invalid authentication credentials");
}

/**
 * Asserts user is authenticated.
 */
export async function requireAuthenticatedUser(req: Request): Promise<AuthContext> {
  return authenticateRequest(req);
}

/**
 * Asserts user is authenticated and holds an administrative role (OWNER, SECURITY_ADMIN, ADMIN).
 */
export async function requireAdmin(req: Request): Promise<AuthContext> {
  return authenticateRequest(req, { requireAdmin: true });
}

/**
 * Formats a safe JSON response for security errors without leaking credentials.
 */
export function toAuthErrorResponse(err: unknown): NextResponse {
  const anyErr = err as any;
  if (
    err instanceof AuthenticationError ||
    anyErr?.statusCode === 401 ||
    anyErr?.name === "AuthenticationError" ||
    (typeof anyErr?.message === "string" && anyErr.message.includes("Unauthorized"))
  ) {
    return NextResponse.json(
      { success: false, error: anyErr?.message || "Unauthorized" },
      { status: 401 }
    );
  }
  if (
    err instanceof ForbiddenError ||
    anyErr?.statusCode === 403 ||
    anyErr?.name === "ForbiddenError" ||
    (typeof anyErr?.message === "string" && anyErr.message.includes("Forbidden"))
  ) {
    return NextResponse.json(
      { success: false, error: anyErr?.message || "Forbidden" },
      { status: 403 }
    );
  }
  if (
    err instanceof NotFoundError ||
    anyErr?.statusCode === 404 ||
    anyErr?.name === "NotFoundError" ||
    (typeof anyErr?.message === "string" && (anyErr.message.includes("not found") || anyErr.message.includes("Not found")))
  ) {
    return NextResponse.json(
      { success: false, error: anyErr?.message || "Resource not found" },
      { status: 404 }
    );
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}
