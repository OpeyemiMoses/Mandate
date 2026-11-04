import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import {
  reconcileTransactions,
  reconcileSingleTransaction,
  verifyAndReconcileWalletBalance,
} from "@/lib/reconciliation";
import { getMandateFinancialBreakdown } from "@/lib/financialAccounting";
import { prisma } from "@/lib/db";

/**
 * GET /api/transactions/reconcile - Financial accounting summary & discrepancy overview
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);

    // 1. Fetch mandate financial breakdowns
    const mandates = await prisma.mandate.findMany({
      where: { userId: user.id },
      select: { id: true },
    });

    const mandateBreakdowns = await Promise.all(
      mandates.map((m) => getMandateFinancialBreakdown(m.id, user.id))
    );

    // 2. Fetch agent wallets and discrepancy status
    const wallets = await prisma.wallet.findMany({
      where: { agent: { userId: user.id } },
      select: {
        id: true,
        nearAccountId: true,
        balanceYocto: true,
        onChainBalanceYocto: true,
        discrepancyYocto: true,
        discrepancyStatus: true,
        lastReconciledAt: true,
      },
    });

    // 3. Count transactions by status
    const pendingTxs = await prisma.transactionRecord.findMany({
      where: { mandate: { userId: user.id } },
      select: { status: true },
    });

    const statusCounts = pendingTxs.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      success: true,
      financialAccounting: {
        mandates: mandateBreakdowns.filter(Boolean),
        wallets,
        transactionStatusCounts: statusCounts,
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * POST /api/transactions/reconcile - Reconcile transactions or wallet balances
 * Body: { txId?: string, walletId?: string }
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is allowed for full user reconciliation
    }

    const { txId, walletId } = body;

    // A) Reconcile specific transaction
    if (txId) {
      const singleResult = await reconcileSingleTransaction(txId, user.id);
      return NextResponse.json({
        success: true,
        transaction: singleResult,
      });
    }

    // B) Reconcile specific wallet on-chain balance
    if (walletId) {
      const walletReport = await verifyAndReconcileWalletBalance(walletId, user.id);
      return NextResponse.json({
        success: true,
        walletFinancials: walletReport,
      });
    }

    // C) Reconcile all pending user transactions
    const report = await reconcileTransactions(user.id);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
