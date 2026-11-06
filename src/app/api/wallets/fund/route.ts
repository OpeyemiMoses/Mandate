import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { verifyNearTransaction, getNearAccountState } from "@/lib/nearRpc";
import { nearToYocto, yoctoToNear, isPositiveYoctoString } from "@/lib/yocto";
import { recordAuditEvent } from "@/lib/auditLedger";

/**
 * POST /api/wallets/fund - User funds their dedicated agent wallet
 * Records intent, validates onchain TX, and credits agent balance
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { txHash, amountNear, agentId } = body;

    if (!txHash || !amountNear) {
      return NextResponse.json(
        { success: false, error: "Missing txHash or amountNear" },
        { status: 400 }
      );
    }

    // Resolve target agent and its dedicated wallet
    const agent = agentId
      ? await prisma.agent.findFirst({
          where: { id: agentId, userId: user.id },
          include: { wallet: true },
        })
      : await prisma.agent.findFirst({
          where: { userId: user.id },
          include: { wallet: true },
        });

    const wallet = agent?.wallet;

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: "Agent or dedicated wallet not found for user" },
        { status: 404 }
      );
    }

    const amountYocto = nearToYocto(String(amountNear));

    if (!isPositiveYoctoString(amountYocto)) {
      return NextResponse.json(
        { success: false, error: "Funding amount must be greater than zero" },
        { status: 400 }
      );
    }

    const cleanTxHash = txHash ? String(txHash).trim() : "";
    const isBase58TxHash = /^[1-9A-HJ-NP-Za-km-z]{40,64}$/.test(cleanTxHash);
    const isTestHash =
      cleanTxHash.startsWith("tx-") ||
      cleanTxHash.startsWith("mock-") ||
      cleanTxHash.startsWith("test-") ||
      cleanTxHash.startsWith("simulated-");

    // Production Isolation Invariant:
    // Simulated or test-tagged hashes are strictly rejected in production mode.
    // Client headers, query parameters, or payload flags CANNOT override production mode.
    const isProd = process.env.NODE_ENV === "production";
    if (isTestHash) {
      if (isProd || process.env.MANDATE_ALLOW_TEST_TX !== "true") {
        return NextResponse.json(
          {
            success: false,
            error: "Simulated test transaction hashes are strictly prohibited in production mode. Valid on-chain NEAR transaction hash required.",
            status: "REJECTED_TEST_TX",
          },
          { status: 400 }
        );
      }
    }

    const isTestTx = isTestHash && !isProd && process.env.MANDATE_ALLOW_TEST_TX === "true";

    // If an on-chain transaction hash is provided, verify it on NEAR RPC
    if (isBase58TxHash) {
      const verification = await verifyNearTransaction(cleanTxHash, user.nearAccountId);

      if (verification.status === "FAILED") {
        await prisma.fundingRecord.upsert({
          where: { txHash: cleanTxHash },
          update: {
            status: "FAILED",
          },
          create: {
            txHash: cleanTxHash,
            senderAccountId: user.nearAccountId,
            receiverAccountId: wallet.nearAccountId,
            amountYocto,
            status: "FAILED",
            userId: user.id,
            walletId: wallet.id,
          },
        });

        await recordAuditEvent({
          userId: user.id,
          eventType: "AGENT_FUNDED",
          verdict: "FAILED",
          reasonCode: "ONCHAIN_VERIFICATION_FAILED",
          description: `Agent wallet funding rejected: Transaction ${cleanTxHash} verification failed on NEAR RPC`,
          details: {
            txHash: cleanTxHash,
            error: verification.error,
            amountNear,
            walletId: wallet.id,
          },
          agentId: agent.id,
          agentWalletAddress: wallet.nearAccountId,
          txHash: cleanTxHash,
        });

        return NextResponse.json(
          {
            success: false,
            error: `Transaction verification failed: ${verification.error || "Transaction failed onchain"}`,
            status: "FAILED",
          },
          { status: 400 }
        );
      }
    } else if (isTestTx) {
      // Test/simulated transactions bypass onchain RPC deposit requirement
    } else {
      // If no valid base58 hash is provided, check if the agent custody account already holds on-chain funds
      const onChainState = await getNearAccountState(wallet.nearAccountId);
      if (!onChainState || BigInt(onChainState.amountYocto || "0") === BigInt(0)) {
        return NextResponse.json(
          {
            success: false,
            error: `No on-chain deposit detected yet for agent custody account (${wallet.nearAccountId}). Please transfer testnet NEAR to this account or enter a valid on-chain transaction hash.`,
            status: "PENDING_DEPOSIT",
          },
          { status: 400 }
        );
      }
    }

    const recordedTxHash = (isBase58TxHash || isTestTx) ? cleanTxHash : `verified-deposit-${Date.now()}`;

    // Check duplicate
    const existingRecord = await prisma.fundingRecord.findUnique({
      where: { txHash: recordedTxHash },
    });
    if (existingRecord && existingRecord.status === "CONFIRMED") {
      return NextResponse.json(
        { success: false, error: "Funding transaction already confirmed" },
        { status: 400 }
      );
    }

    const funding = await prisma.fundingRecord.upsert({
      where: { txHash: recordedTxHash },
      update: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
      create: {
        txHash: recordedTxHash,
        senderAccountId: user.nearAccountId,
        receiverAccountId: wallet.nearAccountId,
        amountYocto,
        status: "CONFIRMED",
        confirmedAt: new Date(),
        userId: user.id,
        walletId: wallet.id,
      },
    });

    // Fetch verified live on-chain balance if available
    const liveState = await getNearAccountState(wallet.nearAccountId);
    const currentDbBalYocto = BigInt(wallet.balanceYocto || "0");
    const fundedYocto = BigInt(amountYocto);
    const minExpectedYocto = currentDbBalYocto + fundedYocto;
    const onchainLiveYocto = liveState?.amountYocto ? BigInt(liveState.amountYocto) : BigInt(0);
    const confirmedBalYocto = (onchainLiveYocto > minExpectedYocto ? onchainLiveYocto : minExpectedYocto).toString();

    // Update agent wallet balance in database & reconcile with onchain RPC
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balanceYocto: confirmedBalYocto,
        onChainBalanceYocto: liveState?.amountYocto || confirmedBalYocto,
        isInitialized: true,
        initializationStatus: "READY",
      },
    });

    await recordAuditEvent({
      userId: user.id,
      eventType: "AGENT_FUNDED",
      verdict: "SUCCESS",
      description: `Funded agent wallet with ${amountNear} NEAR`,
      details: {
        txHash,
        amountNear,
        sender: user.nearAccountId,
        receiver: wallet.nearAccountId,
      },
      agentId: agent.id,
      agentWalletAddress: wallet.nearAccountId,
      txHash,
    });

    return NextResponse.json({
      success: true,
      funding: {
        id: funding.id,
        txHash: funding.txHash,
        amountNear: yoctoToNear(amountYocto),
        status: funding.status,
      },
      agentWalletBalanceNear: yoctoToNear(confirmedBalYocto),
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * GET /api/wallets/fund - List funding history for authenticated user
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const records = await prisma.fundingRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      records: records.map((r) => ({
        id: r.id,
        txHash: r.txHash,
        amountNear: yoctoToNear(r.amountYocto),
        sender: r.senderAccountId,
        receiver: r.receiverAccountId,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
