import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { getNearAccountState } from "@/lib/nearRpc";
import { yoctoToNear } from "@/lib/yocto";

/**
 * GET /api/wallets - List personal wallet, dedicated agent wallets, and funding history
 */

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);

    // 1. Personal wallet onchain RPC query
    const personalRpc = await getNearAccountState(user.nearAccountId);

    // 2. Query all agents with their dedicated wallets
    const agents = await prisma.agent.findMany({
      where: { userId: user.id },
      include: {
        wallet: true,
        mandates: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const agentWallets = await Promise.all(
      agents.map(async (agent) => {
        let balanceYocto = agent.wallet?.balanceYocto || "0";
        let onchainActive = false;

        if (agent.wallet?.nearAccountId) {
          const rpcState = await getNearAccountState(agent.wallet.nearAccountId);
          if (rpcState) {
            const onchainYocto = BigInt(rpcState.amountYocto || "0");
            const dbYocto = BigInt(agent.wallet?.balanceYocto || "0");
            const effectiveYocto = onchainYocto > dbYocto ? onchainYocto.toString() : dbYocto.toString();
            balanceYocto = effectiveYocto;
            onchainActive = true;

            if (effectiveYocto !== agent.wallet?.balanceYocto) {
              prisma.wallet.update({
                where: { id: agent.wallet.id },
                data: {
                  balanceYocto: effectiveYocto,
                  onChainBalanceYocto: rpcState.amountYocto,
                  isInitialized: true,
                  initializationStatus: "READY",
                },
              }).catch(() => {});
            }
          }
        }

        const isReady = onchainActive && BigInt(balanceYocto) > BigInt(0);
        const initializationStatus = isReady
          ? "READY"
          : agent.wallet?.initializationStatus || "UNINITIALIZED";
        const isInitialized = isReady || Boolean(agent.wallet?.isInitialized);

        return {
          agentId: agent.id,
          agentName: agent.name,
          agentStatus: agent.status,
          walletId: agent.wallet?.id,
          nearAccountId: agent.wallet?.nearAccountId || "",
          balanceYocto,
          balanceNear: yoctoToNear(balanceYocto),
          onchainActive,
          isInitialized,
          initializationStatus,
          colorVariant: agent.colorVariant || "red",
          mandatesCount: agent.mandates.length,
        };
      })
    );

    // 3. Query Funding and Withdrawal History
    const fundingHistory = await prisma.fundingRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const withdrawalHistory = await prisma.withdrawalRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      personalWallet: {
        accountId: user.nearAccountId,
        balanceNear: personalRpc ? yoctoToNear(personalRpc.amountYocto) : "0.000",
        balanceYocto: personalRpc?.amountYocto || "0",
        storageUsage: personalRpc?.storageUsage || 0,
        network: "testnet",
        explorerUrl: `https://testnet.nearblocks.io/address/${user.nearAccountId}`,
      },
      agentWallets,
      fundingHistory: fundingHistory.map((f) => ({
        id: f.id,
        txHash: f.txHash,
        amountNear: yoctoToNear(f.amountYocto),
        receiver: f.receiverAccountId,
        status: f.status,
        createdAt: f.createdAt.toISOString(),
      })),
      withdrawalHistory: withdrawalHistory.map((w) => ({
        id: w.id,
        txHash: w.txHash,
        amountNear: yoctoToNear(w.amountYocto),
        recipient: w.toAccountId,
        status: w.status,
        createdAt: w.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * POST /api/wallets - Provision or retrieve user's primary agent wallet (convenience route)
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);

    // Check if user already has an agent with a wallet
    const existingAgent = await prisma.agent.findFirst({
      where: { userId: user.id },
      include: { wallet: true },
    });

    if (existingAgent?.wallet) {
      return NextResponse.json({
        success: true,
        wallet: {
          id: existingAgent.wallet.id,
          walletId: existingAgent.wallet.walletId,
          nearAccountId: existingAgent.wallet.nearAccountId,
          handoffUrl: existingAgent.wallet.handoffUrl,
          balanceYocto: existingAgent.wallet.balanceYocto,
          balanceNear: yoctoToNear(existingAgent.wallet.balanceYocto),
          isFrozen: existingAgent.wallet.isFrozen,
        },
      });
    }

    // Provision new OutLayer wallet
    const { registerOutlayerWallet } = await import("@/lib/outlayer");
    const outlayerRes = await registerOutlayerWallet();

    const agent = await prisma.agent.create({
      data: {
        name: "Primary Agent",
        purpose: "Autonomous Spending",
        userId: user.id,
        wallet: {
          create: {
            walletId: outlayerRes.wallet_id,
            apiKey: outlayerRes.api_key,
            nearAccountId: outlayerRes.near_account_id,
            handoffUrl: outlayerRes.handoff_url,
            network: "testnet",
            balanceYocto: "0",
          },
        },
      },
      include: { wallet: true },
    });

    return NextResponse.json({
      success: true,
      wallet: {
        id: agent.wallet!.id,
        walletId: agent.wallet!.walletId,
        nearAccountId: agent.wallet!.nearAccountId,
        handoffUrl: agent.wallet!.handoffUrl,
        balanceYocto: "0",
        balanceNear: "0.000",
        isFrozen: false,
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
