import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { ExecutionBoundaryService } from "@/lib/execution/boundaryService";
import { nearToYocto, yoctoToNear, isPositiveYoctoString } from "@/lib/yocto";
import { recordAuditEvent } from "@/lib/auditLedger";
import { ExecutionGateService } from "@/lib/operations/executionGateService";

/**
 * POST /api/wallets/withdraw - Withdraw unused funds back to authenticated user's NEAR account
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    await ExecutionGateService.assertFinancialExecutionAllowed("POST /api/wallets/withdraw");
    const body = await req.json();
    const { amountNear, agentId } = body;

    if (amountNear === undefined || amountNear === null || amountNear === "") {
      return NextResponse.json(
        { success: false, error: "Missing amountNear" },
        { status: 400 }
      );
    }

    // Resolve target agent and its dedicated wallet
    const agent = agentId
      ? await prisma.agent.findFirst({
          where: { id: agentId, userId: user.id },
          include: {
            wallet: {
              include: {
                mandates: {
                  where: { status: "ACTIVE" },
                },
              },
            },
          },
        })
      : await prisma.agent.findFirst({
          where: { userId: user.id },
          include: {
            wallet: {
              include: {
                mandates: {
                  where: { status: "ACTIVE" },
                },
              },
            },
          },
        });

    const wallet = agent?.wallet;

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: "No agent wallet found" },
        { status: 404 }
      );
    }

    let amountYocto: string;
    try {
      amountYocto = nearToYocto(String(amountNear));
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: e.message || "Invalid amount format" },
        { status: 400 }
      );
    }

    if (!isPositiveYoctoString(amountYocto)) {
      return NextResponse.json(
        { success: false, error: "Withdrawal amount must be greater than zero" },
        { status: 400 }
      );
    }

    // Calculate total reserved budget across active mandates to prevent withdrawing escrowed funds
    const totalReservedYocto = wallet.mandates.reduce(
      (acc, m) => acc + BigInt(m.reservedYocto),
      BigInt(0)
    );

    const currentBalanceYocto = BigInt(wallet.balanceYocto || "0");
    const unreservedBalanceYocto =
      currentBalanceYocto >= totalReservedYocto
        ? currentBalanceYocto - totalReservedYocto
        : BigInt(0);

    if (BigInt(amountYocto) > unreservedBalanceYocto) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient unreserved funds. Available: ${yoctoToNear(
            unreservedBalanceYocto.toString()
          )} NEAR (${yoctoToNear(totalReservedYocto.toString())} NEAR is reserved for pending tasks).`,
        },
        { status: 400 }
      );
    }

    // 1. Create Withdrawal Record
    const withdrawal = await prisma.withdrawalRecord.create({
      data: {
        fromAccountId: wallet.nearAccountId,
        toAccountId: user.nearAccountId,
        amountYocto,
        status: "SUBMITTED",
        userId: user.id,
        walletId: wallet.id,
      },
    });

    // 2. Submit transfer via OutLayer TEE back to the user's account using the sealed boundary service
    const outlayerRes = await ExecutionBoundaryService.executeWithdrawal({
      userId: user.id,
      walletApiKey: wallet.apiKey,
      fromAccountId: wallet.nearAccountId,
      toAccountId: user.nearAccountId,
      amountYocto,
      idempotencyKey: `with-${withdrawal.id}`,
    });

    if (!outlayerRes.success) {
      await prisma.withdrawalRecord.update({
        where: { id: withdrawal.id },
        data: { status: "FAILED" },
      });

      await recordAuditEvent({
        userId: user.id,
        eventType: "WITHDRAWAL_FAILED",
        verdict: "FAILED",
        reasonCode: outlayerRes.error,
        description: `OutLayer withdrawal of ${amountNear} NEAR failed: ${outlayerRes.message || outlayerRes.error}`,
        details: outlayerRes,
        agentId: agent.id,
        agentWalletAddress: wallet.nearAccountId,
      });

      return NextResponse.json(
        {
          success: false,
          error: outlayerRes.error || "OutLayer withdrawal refused",
          message: outlayerRes.message,
        },
        { status: 502 }
      );
    }

    // 3. Confirm withdrawal & decrement balance
    const nextBalanceYocto = (currentBalanceYocto - BigInt(amountYocto)).toString();
    await prisma.$transaction([
      prisma.withdrawalRecord.update({
        where: { id: withdrawal.id },
        data: {
          status: "CONFIRMED",
          txHash: outlayerRes.txHash || null,
          confirmedAt: new Date(),
        },
      }),
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balanceYocto: nextBalanceYocto },
      }),
    ]);

    await recordAuditEvent({
      userId: user.id,
      eventType: "WITHDRAWAL_SETTLED",
      verdict: "SUCCESS",
      description: `Withdrew ${amountNear} NEAR from agent custody to personal wallet`,
      details: {
        amountNear,
        recipient: user.nearAccountId,
        txHash: outlayerRes.txHash,
      },
      agentId: agent.id,
      agentWalletAddress: wallet.nearAccountId,
      txHash: outlayerRes.txHash,
    });

    return NextResponse.json({
      success: true,
      withdrawal: {
        id: withdrawal.id,
        amountNear,
        txHash: outlayerRes.txHash,
        status: "CONFIRMED",
      },
      remainingAgentBalanceNear: yoctoToNear(nextBalanceYocto),
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * GET /api/wallets/withdraw - List withdrawals for authenticated user
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const withdrawals = await prisma.withdrawalRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      withdrawals: withdrawals.map((w) => ({
        id: w.id,
        txHash: w.txHash,
        amountNear: yoctoToNear(w.amountYocto),
        from: w.fromAccountId,
        to: w.toAccountId,
        status: w.status,
        createdAt: w.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
