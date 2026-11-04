import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import {
  checkWalletInitializationStatus,
  completeWalletInitialization,
  RECOMMENDED_INITIALIZATION_NEAR,
} from "@/lib/walletInitialization";

/**
 * GET /api/wallets/initialize?agentId=...
 * Check whether the agent's OutLayer implicit account exists on NEAR testnet
 * and is ready for autonomous execution.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");

    const agent = agentId
      ? await prisma.agent.findFirst({
          where: { id: agentId, userId: user.id },
          include: { wallet: true },
        })
      : await prisma.agent.findFirst({
          where: { userId: user.id },
          include: { wallet: true },
        });

    if (!agent || !agent.wallet) {
      return NextResponse.json(
        { success: false, error: "Agent or dedicated wallet not found" },
        { status: 404 }
      );
    }

    const check = await checkWalletInitializationStatus(agent.wallet.id);

    return NextResponse.json({
      success: true,
      agentId: agent.id,
      agentName: agent.name,
      ...check,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * POST /api/wallets/initialize
 * Verify a user's initial funding transaction, register the account on NEAR testnet,
 * and mark the wallet READY.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { agentId, txHash } = body;

    if (!txHash) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: txHash" },
        { status: 400 }
      );
    }

    const agent = agentId
      ? await prisma.agent.findFirst({
          where: { id: agentId, userId: user.id },
          include: { wallet: true },
        })
      : await prisma.agent.findFirst({
          where: { userId: user.id },
          include: { wallet: true },
        });

    if (!agent || !agent.wallet) {
      return NextResponse.json(
        { success: false, error: "Agent or dedicated wallet not found" },
        { status: 404 }
      );
    }

    const result = await completeWalletInitialization({
      walletId: agent.wallet.id,
      txHash,
      senderAccountId: user.nearAccountId,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      agentId: agent.id,
      agentName: agent.name,
      ...result,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

