import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/auditLedger";
import { yoctoToNear } from "@/lib/yocto";
import { getNearAccountState } from "@/lib/nearRpc";
import { agentRegistry, registerDefaultAgents } from "@/lib/runtime/registry";

registerDefaultAgents();

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/[id] - Get detailed agent definition, configuration & recent executions
 * PATCH /api/agents/[id] - Pause, Resume, or Edit an agent configuration
 * DELETE /api/agents/[id] - Revoke agent and its mandates
 */

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId: user.id },
      include: {
        wallet: true,
        mandates: true,
        executions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    let balanceYocto = agent.wallet?.balanceYocto || "0";
    let onchainActive = false;

    if (agent.wallet?.nearAccountId) {
      const rpcState = await getNearAccountState(agent.wallet.nearAccountId);
      if (rpcState) {
        balanceYocto = rpcState.amountYocto;
        onchainActive = true;
      }
    }

    let parsedConfig = {};
    let parsedMetadata = {};
    try {
      if (agent.configuration) parsedConfig = JSON.parse(agent.configuration);
    } catch {}
    try {
      if (agent.metadata) parsedMetadata = JSON.parse(agent.metadata);
    } catch {}

    const capabilities = agentRegistry.has(agent.type)
      ? agentRegistry.getCapabilities(agent.type)
      : [];

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        purpose: agent.purpose,
        type: agent.type,
        version: agent.version,
        configuration: parsedConfig,
        metadata: parsedMetadata,
        status: agent.status,
        colorVariant: agent.colorVariant || "red",
        executionCount: agent.executionCount,
        lastExecutedAt: agent.lastExecutedAt?.toISOString() || null,
        capabilities,
        wallet: agent.wallet
          ? {
              id: agent.wallet.id,
              nearAccountId: agent.wallet.nearAccountId,
              balanceNear: yoctoToNear(balanceYocto),
              balanceYocto,
              onchainActive,
              isFrozen: agent.wallet.isFrozen,
            }
          : null,
        mandates: agent.mandates.map((m) => ({
          id: m.id,
          name: m.name,
          status: m.status,
          totalBudgetNear: yoctoToNear(m.totalBudgetYocto),
          spentNear: yoctoToNear(m.spentYocto),
        })),
        recentExecutions: agent.executions.map((e) => ({
          id: e.id,
          status: e.status,
          currentStep: e.currentStep,
          startedAt: e.startedAt?.toISOString() || e.createdAt.toISOString(),
          completedAt: e.completedAt?.toISOString() || null,
        })),
        createdAt: agent.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { status, name, description, purpose, configuration, metadata, colorVariant } = body;

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId: user.id },
      include: { wallet: true },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    // If configuration is being updated, validate against registered schema
    if (configuration) {
      const validation = agentRegistry.validateConfig(agent.type, configuration, agent.version);
      if (!validation.valid) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid configuration for agent type "${agent.type}": ${validation.errors?.join("; ")}`,
          },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        ...(status ? { status } : {}),
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(purpose !== undefined ? { purpose } : {}),
        ...(configuration ? { configuration: JSON.stringify(configuration) } : {}),
        ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
        ...(colorVariant ? { colorVariant } : {}),
      },
    });

    if (status && status !== agent.status) {
      await recordAuditEvent({
        userId: user.id,
        eventType: status === "PAUSED" ? "AGENT_PAUSED" : "AGENT_RESUMED",
        verdict: "SUCCESS",
        description: `Agent "${agent.name}" status updated to ${updated.status}`,
        details: {
          agentId: agent.id,
          name: agent.name,
          newStatus: updated.status,
        },
        agentId: agent.id,
        agentWalletAddress: agent.wallet?.nearAccountId,
      });
    }

    return NextResponse.json({ success: true, agent: updated });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId: user.id },
      include: { wallet: true },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    // Revoke agent and pause active mandates
    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: { status: "REVOKED" },
    });

    await prisma.mandate.updateMany({
      where: { agentId: agent.id, status: "ACTIVE" },
      data: { status: "REVOKED" },
    });

    await recordAuditEvent({
      userId: user.id,
      eventType: "AGENT_REVOKED",
      verdict: "SUCCESS",
      description: `Agent "${agent.name}" revoked by owner`,
      details: {
        agentId: agent.id,
        name: agent.name,
        walletAddress: agent.wallet?.nearAccountId,
      },
      agentId: agent.id,
      agentWalletAddress: agent.wallet?.nearAccountId,
    });

    return NextResponse.json({ success: true, agent: updated });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
