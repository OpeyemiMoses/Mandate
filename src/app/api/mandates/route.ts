import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { nearToYocto, yoctoToNear } from "@/lib/yocto";
import { recordAuditEvent } from "@/lib/auditLedger";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";

/**
 * GET /api/mandates - List mandates strictly for the authenticated user and their agents
 * POST /api/mandates - Create mandate linked to a specific agent and its dedicated wallet
 */

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);

    const mandates = await prisma.mandate.findMany({
      where: { userId: user.id },
      include: {
        agent: true,
        wallet: true,
        tasks: { take: 5, orderBy: { createdAt: "desc" } },
        _count: { select: { tasks: true, approvals: true, transactions: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = mandates.map((m) => {
      const total = BigInt(m.totalBudgetYocto);
      const spent = BigInt(m.spentYocto || "0");
      const reserved = BigInt(m.reservedYocto || "0");
      const committed = spent + reserved;
      const available = total >= committed ? total - committed : BigInt(0);

      return {
        id: m.id,
        name: m.name,
        description: m.description,
        status: m.status,
        policyVersion: m.policyVersion,
        agentId: m.agentId,
        agentName: m.agent.name,
        totalBudgetNear: yoctoToNear(m.totalBudgetYocto),
        spentNear: yoctoToNear(m.spentYocto),
        reservedNear: yoctoToNear(m.reservedYocto),
        availableBudgetNear: yoctoToNear(available.toString()),
        perTxLimitNear: yoctoToNear(m.perTxLimitYocto),
        approvalThresholdNear: yoctoToNear(m.approvalThresholdYocto),
        allowedRecipients: JSON.parse(m.allowedRecipientsJson || "[]"),
        expiresAt: m.expiresAt.toISOString(),
        wallet: {
          id: m.wallet.id,
          nearAccountId: m.wallet.nearAccountId,
          handoffUrl: m.wallet.handoffUrl,
        },
        tasksCount: m._count.tasks,
      };
    });

    return NextResponse.json({ success: true, mandates: formatted });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const {
      name,
      description,
      agentId,
      totalBudgetNear,
      perTxLimitNear,
      approvalThresholdNear,
      allowedRecipients,
      expiresAt,
    } = body;

    if (!name || !totalBudgetNear || !perTxLimitNear || !approvalThresholdNear) {
      return NextResponse.json(
        { success: false, error: "Missing required mandate fields" },
        { status: 400 }
      );
    }

    // Find agent for this user
    let targetAgent;
    if (agentId) {
      targetAgent = await prisma.agent.findFirst({
        where: { id: agentId, userId: user.id },
        include: { wallet: true },
      });
    } else {
      targetAgent = await prisma.agent.findFirst({
        where: { userId: user.id },
        include: { wallet: true },
      });
    }

    if (!targetAgent || !targetAgent.wallet) {
      return NextResponse.json(
        { success: false, error: "Agent not found or has no dedicated wallet. Please create an agent first." },
        { status: 404 }
      );
    }

    const totalBudgetYocto = nearToYocto(String(totalBudgetNear));
    const perTxLimitYocto = nearToYocto(String(perTxLimitNear));
    const approvalThresholdYocto = nearToYocto(String(approvalThresholdNear));

    const expirationDate = expiresAt
      ? new Date(expiresAt)
      : new Date(Date.now() + 14 * 86400000);

    const mandate = await prisma.mandate.create({
      data: {
        name,
        description: description || "",
        totalBudgetYocto,
        perTxLimitYocto,
        approvalThresholdYocto,
        allowedRecipientsJson: JSON.stringify(allowedRecipients || []),
        expiresAt: expirationDate,
        userId: user.id,
        agentId: targetAgent.id,
        walletId: targetAgent.wallet.id,
      },
      include: { wallet: true, agent: true },
    });

    await recordAuditEvent({
      userId: user.id,
      eventType: "MANDATE_CREATED",
      verdict: "SUCCESS",
      description: `Created spending mandate "${mandate.name}" for agent "${targetAgent.name}"`,
      details: {
        mandateId: mandate.id,
        name: mandate.name,
        agentId: targetAgent.id,
        agentName: targetAgent.name,
        totalBudgetYocto,
        perTxLimitYocto,
        approvalThresholdYocto,
        allowedRecipients,
      },
      mandateId: mandate.id,
      agentId: targetAgent.id,
      agentWalletAddress: targetAgent.wallet.nearAccountId,
    });

    return NextResponse.json(
      {
        success: true,
        mandate: {
          id: mandate.id,
          name: mandate.name,
          agentId: mandate.agentId,
          agentName: mandate.agent.name,
          totalBudgetNear: yoctoToNear(mandate.totalBudgetYocto),
          perTxLimitNear: yoctoToNear(mandate.perTxLimitYocto),
          approvalThresholdNear: yoctoToNear(mandate.approvalThresholdYocto),
          allowedRecipients: JSON.parse(mandate.allowedRecipientsJson),
          expiresAt: mandate.expiresAt.toISOString(),
          walletAddress: mandate.wallet.nearAccountId,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
