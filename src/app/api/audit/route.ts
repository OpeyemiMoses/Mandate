import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";

/**
 * GET /api/audit - Query immutable-style security audit logs for authenticated user
 */

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);

    const mandateId = searchParams.get("mandateId");
    const taskId = searchParams.get("taskId");
    const eventType = searchParams.get("eventType");
    const category = searchParams.get("category"); // policy | payment | approval | funding | mandate | agent

    const andConditions: any[] = [
      {
        OR: [
          { userId: user.id },
          { mandate: { userId: user.id } },
        ],
      },
      {
        eventType: { not: "WALLET_CONNECTED" },
      },
    ];

    if (mandateId) {
      const mandate = await prisma.mandate.findFirst({
        where: { id: mandateId, userId: user.id },
      });
      if (!mandate) {
        return NextResponse.json(
          { success: false, error: "Mandate not found" },
          { status: 404 }
        );
      }
      andConditions.push({ mandateId });
    }

    if (taskId) {
      const task = await prisma.task.findFirst({
        where: { id: taskId, mandate: { userId: user.id } },
      });
      if (!task) {
        return NextResponse.json(
          { success: false, error: "Task not found" },
          { status: 404 }
        );
      }
      andConditions.push({ taskId });
    }

    if (eventType) andConditions.push({ eventType });

    if (category && category !== "all") {
      if (category === "policy") {
        andConditions.push({ eventType: { in: ["POLICY_EVALUATED"] } });
      } else if (category === "payment") {
        andConditions.push({
          eventType: { in: ["OUTLAYER_CONFIRMED", "OUTLAYER_FAILED", "PAYMENT_SETTLED"] },
        });
      } else if (category === "approval") {
        andConditions.push({
          eventType: {
            in: ["APPROVAL_GRANTED_AND_SETTLED", "APPROVAL_REJECTED", "APPROVAL_REQUESTED"],
          },
        });
      } else if (category === "funding") {
        andConditions.push({
          eventType: {
            in: [
              "AGENT_FUNDED",
              "WITHDRAWAL_SETTLED",
              "WITHDRAWAL_REQUESTED",
              "WALLET_PROVISIONED",
            ],
          },
        });
      } else if (category === "mandate") {
        andConditions.push({
          eventType: {
            in: ["MANDATE_CREATED", "MANDATE_PAUSED", "MANDATE_RESUMED", "MANDATE_REVOKED"],
          },
        });
      } else if (category === "agent") {
        andConditions.push({
          eventType: {
            in: ["AGENT_CREATED", "AGENT_PAUSED", "AGENT_RESUMED", "AGENT_REVOKED"],
          },
        });
      }
    }

    const logs = await prisma.auditLog.findMany({
      where: { AND: andConditions },
      include: {
        mandate: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const formatted = logs.map((l) => {
      let details: any = {};
      try {
        details = JSON.parse(l.detailsJson || "{}");
      } catch {}

      return {
        id: l.id,
        sequenceNumber: l.sequenceNumber,
        eventType: l.eventType,
        verdict: l.verdict,
        reasonCode: l.reasonCode,
        description: l.description,
        prevHash: l.prevHash,
        currentHash: l.currentHash,
        details,
        mandateId: l.mandateId,
        mandateName: l.mandate?.name,
        taskId: l.taskId,
        taskTitle: l.task?.title,
        agentId: l.agentId,
        agentWalletAddress: l.agentWalletAddress,
        txHash: l.txHash,
        createdAt: l.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      logs: formatted,
      auditLogs: formatted,
      count: formatted.length,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
