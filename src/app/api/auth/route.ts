import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getNearAccountState } from "@/lib/nearRpc";
import { yoctoToNear } from "@/lib/yocto";
import { getAuthenticatedUser } from "@/lib/auth";
import { SessionService } from "@/lib/auth/sessionService";
import { WalletAuthService, RateLimitError, InvalidAccountIdError } from "@/lib/auth/walletAuthService";
import { extractClientIp } from "@/lib/auth/rateLimitService";
import { isValidNearAccountId } from "@/lib/auth/nearAccountKeyVerification";
import { validateRequestOrigin } from "@/lib/security/originValidation";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth
 * If ?action=challenge&accountId=... is supplied, generates a cryptographically bound challenge.
 * Otherwise returns the currently authenticated user's session profile.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const accountId = url.searchParams.get("accountId");

    // 1. Challenge generation endpoint
    if (action === "challenge") {
      if (!accountId || typeof accountId !== "string" || !accountId.trim()) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing required accountId parameter for authentication challenge.",
            code: "INVALID_ACCOUNT_ID",
          },
          { status: 400 }
        );
      }

      const clientIp = extractClientIp(req);
      try {
        const challenge = await WalletAuthService.createChallenge(accountId, { clientIp });
        return NextResponse.json({
          success: true,
          challenge,
        });
      } catch (challengeError: any) {
        if (challengeError instanceof InvalidAccountIdError || challengeError.code === "INVALID_ACCOUNT_ID") {
          return NextResponse.json(
            { success: false, error: challengeError.message, code: "INVALID_ACCOUNT_ID" },
            { status: 400 }
          );
        }
        if (challengeError instanceof RateLimitError || challengeError.code === "RATE_LIMIT_EXCEEDED") {
          return NextResponse.json(
            { success: false, error: challengeError.message, code: challengeError.code },
            {
              status: 429,
              headers: {
                "Retry-After": String(challengeError.retryAfterSec || 60),
              },
            }
          );
        }
        if (challengeError.code === "RATE_LIMIT_SERVICE_UNAVAILABLE") {
          return NextResponse.json(
            { success: false, error: challengeError.message, code: challengeError.code },
            { status: 503 }
          );
        }
        return NextResponse.json(
          { success: false, error: challengeError.message || "Failed to generate authentication challenge" },
          { status: 500 }
        );
      }
    }

    // 2. Profile query endpoint
    const user = await getAuthenticatedUser(req);
    const rpcState = await getNearAccountState(user.nearAccountId);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        nearAccountId: user.nearAccountId,
        displayName: user.displayName || "",
        email: user.email || "",
        bio: user.bio || "",
        role: user.role,
        sessionExpiresAt: user.updatedAt
          ? new Date(user.updatedAt.getTime() + 86400000).toISOString()
          : new Date().toISOString(),
      },
      onchain: {
        exists: Boolean(rpcState),
        balanceNear: rpcState ? yoctoToNear(rpcState.amountYocto) : "0.000",
        balanceYocto: rpcState?.amountYocto || "0",
      },
      agents: user.agents?.map((a: any) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        wallet: a.wallet
          ? {
              id: a.wallet.id,
              nearAccountId: a.wallet.nearAccountId,
              balanceYocto: a.wallet.balanceYocto,
              balanceNear: yoctoToNear(a.wallet.balanceYocto),
              isFrozen: a.wallet.isFrozen,
            }
          : null,
      })) || [],
    });
  } catch (error: any) {
    const statusCode = error.message?.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json(
      { success: false, error: error.message },
      { status: statusCode }
    );
  }
}

/**
 * POST /api/auth
 * Connects/authenticates wallet via mandatory NEP-413 cryptographic proof.
 * An account ID alone CANNOT obtain an authenticated session.
 */
export async function POST(req: Request) {
  try {
    // 1. Defense-in-depth Origin / Referer firewall check
    const originCheck = await validateRequestOrigin(req, { requireOriginForCookie: true });
    if (!originCheck.valid) {
      return NextResponse.json(
        { success: false, error: originCheck.reason, code: "UNTRUSTED_ORIGIN" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { accountId, publicKey, signature, message, nonce } = body;

    // 2. Strict mandatory presence of accountId
    if (!accountId || typeof accountId !== "string" || !accountId.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid accountId", code: "AUTHENTICATION_PROOF_REQUIRED" },
        { status: 401 }
      );
    }

    // 3. Strict mandatory cryptographic proof parameters
    if (
      !publicKey || typeof publicKey !== "string" || !publicKey.trim() ||
      !signature || typeof signature !== "string" || !signature.trim() ||
      !message || typeof message !== "string" || !message.trim() ||
      !nonce || typeof nonce !== "string" || !nonce.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Mandatory cryptographic wallet proof required. An account ID alone cannot authenticate. Missing publicKey, signature, message, or nonce.",
          code: "AUTHENTICATION_PROOF_REQUIRED",
        },
        { status: 401 }
      );
    }

    const cleanAccountId = accountId.trim().toLowerCase();

    // 4. Strict format validation on account ID
    if (!isValidNearAccountId(cleanAccountId)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid NEAR account ID format: "${accountId}"`,
          code: "INVALID_ACCOUNT_ID",
        },
        { status: 400 }
      );
    }

    // 5. Mandatory cryptographic verification against active server challenge
    const outcome = await WalletAuthService.verifySignature({
      accountId: cleanAccountId,
      publicKey: publicKey.trim(),
      signature: signature.trim(),
      message,
      nonce: nonce.trim(),
    });

    if (!outcome.valid) {
      return NextResponse.json(
        {
          success: false,
          error: outcome.error || "Invalid cryptographic wallet signature",
          code: outcome.code || "INVALID_WALLET_PROOF",
        },
        { status: 401 }
      );
    }

    // 5. User resolution ONLY AFTER verified cryptographic ownership
    let user = await prisma.user.findUnique({
      where: { nearAccountId: cleanAccountId },
      include: {
        agents: {
          include: { wallet: true },
        },
      },
    });

    if (!user) {
      // Connecting a wallet never grants administrative privileges automatically
      const configuredAdmins = (process.env.ADMIN_NEAR_ACCOUNT_IDS || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const isConfiguredAdmin = configuredAdmins.includes(cleanAccountId);
      user = await prisma.user.create({
        data: {
          nearAccountId: cleanAccountId,
          role: isConfiguredAdmin ? "ADMIN" : "MEMBER",
        },
        include: {
          agents: {
            include: { wallet: true },
          },
        },
      });
    }

    // 6. Issue cryptographically signed session token & HTTP-only cookie
    const session = await SessionService.createSession(user.id, user.nearAccountId, user.role);

    // 7. Query live NEAR account state
    const rpcState = await getNearAccountState(cleanAccountId);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        nearAccountId: user.nearAccountId,
        displayName: user.displayName || "",
        email: user.email || "",
        bio: user.bio || "",
        role: user.role,
        sessionExpiresAt: session.expiresAt.toISOString(),
      },
      onchain: {
        exists: Boolean(rpcState),
        balanceNear: rpcState ? yoctoToNear(rpcState.amountYocto) : "0.000",
        balanceYocto: rpcState?.amountYocto || "0",
        storageUsage: rpcState?.storageUsage || 0,
      },
      agents: user.agents.map((a: any) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        wallet: a.wallet
          ? {
              id: a.wallet.id,
              nearAccountId: a.wallet.nearAccountId,
              balanceYocto: a.wallet.balanceYocto,
              balanceNear: yoctoToNear(a.wallet.balanceYocto),
              isFrozen: a.wallet.isFrozen,
            }
          : null,
      })),
    });

    // Set secure HTTP-only cookie header
    response.headers.set("Set-Cookie", session.cookieHeader);
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth - Logout and invalidate session
 */
export async function DELETE(req: Request) {
  try {
    const originCheck = await validateRequestOrigin(req, { requireOriginForCookie: true });
    if (!originCheck.valid) {
      return NextResponse.json(
        { success: false, error: originCheck.reason, code: "UNTRUSTED_ORIGIN" },
        { status: 403 }
      );
    }

    const user = await getAuthenticatedUser(req);
    await SessionService.invalidateSession(user.id);

    const response = NextResponse.json({
      success: true,
      message: "Session invalidated and logged out successfully",
    });

    response.headers.set("Set-Cookie", SessionService.serializeClearCookie());
    return response;
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message },
      { status: 401 }
    );
    response.headers.set("Set-Cookie", SessionService.serializeClearCookie());
    return response;
  }
}
