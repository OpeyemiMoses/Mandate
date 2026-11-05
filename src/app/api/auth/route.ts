import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getNearAccountState } from "@/lib/nearRpc";
import { yoctoToNear } from "@/lib/yocto";
import { getAuthenticatedUser } from "@/lib/auth";
import { SessionService } from "@/lib/auth/sessionService";
import { WalletAuthService } from "@/lib/auth/walletAuthService";

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
    if (action === "challenge" && accountId) {
      const challenge = await WalletAuthService.createChallenge(accountId);
      return NextResponse.json({
        success: true,
        challenge,
      });
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
        sessionToken: user.sessionToken,
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
 * Connects/authenticates wallet.
 * Supports:
 * A) Cryptographic signature verification (NEP-413 / Ed25519)
 * B) Development direct connection with signed session generation
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { accountId, publicKey, signature, message, nonce } = body;

    if (!accountId || typeof accountId !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid accountId" },
        { status: 400 }
      );
    }

    const cleanAccountId = accountId.trim().toLowerCase();
    const isProd = process.env.NODE_ENV === "production";

    // 1. If signature parameters are provided, perform cryptographic verification
    if (signature && publicKey && message && nonce) {
      const outcome = await WalletAuthService.verifySignature({
        accountId: cleanAccountId,
        publicKey,
        signature,
        message,
        nonce,
      });

      if (!outcome.valid) {
        return NextResponse.json(
          { success: false, error: outcome.error || "Invalid cryptographic wallet signature" },
          { status: 401 }
        );
      }
    }

    // 2. Fetch or create user record
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

    // 3. Issue cryptographically signed session token & HTTP-only cookie
    const session = await SessionService.createSession(user.id, user.nearAccountId, user.role);

    // 4. Query live NEAR account state
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
        sessionToken: session.token,
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
    const user = await getAuthenticatedUser(req);
    await SessionService.invalidateSession(user.id);

    const response = NextResponse.json({
      success: true,
      message: "Session invalidated and logged out successfully",
    });

    response.headers.set("Set-Cookie", SessionService.serializeClearCookie());
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 401 }
    );
  }
}
