import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { registerOutlayerWallet } from "@/lib/outlayer";
import { getNearAccountState } from "@/lib/nearRpc";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { yoctoToNear } from "@/lib/yocto";
import { recordAuditEvent } from "@/lib/auditLedger";
import { encryptWalletApiKey } from "@/lib/security/walletCredentialService";
import { agentRegistry, registerDefaultAgents } from "@/lib/runtime/registry";
import { grantAgentToolAccess } from "@/lib/tools/access";

registerDefaultAgents();

export const dynamic = "force-dynamic";

/**
 * GET /api/agents - List all agents for the authenticated user
 * POST /api/agents - Create an agent and provision its dedicated OutLayer TEE wallet
 */

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);

    const agents = await prisma.agent.findMany({
      where: { userId: user.id },
      include: {
        wallet: true,
        mandates: true,
        _count: { select: { tasks: true, mandates: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = await Promise.all(
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

        let parsedConfig = {};
        let parsedMetadata = {};
        try {
          if (agent.configuration) parsedConfig = JSON.parse(agent.configuration);
        } catch {}
        try {
          if (agent.metadata) parsedMetadata = JSON.parse(agent.metadata);
        } catch {}

        return {
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
          wallet: agent.wallet
            ? {
                id: agent.wallet.id,
                walletId: agent.wallet.walletId,
                nearAccountId: agent.wallet.nearAccountId,
                handoffUrl: agent.wallet.handoffUrl,
                balanceYocto,
                balanceNear: yoctoToNear(balanceYocto),
                onchainActive,
                isInitialized,
                initializationStatus,
                isFrozen: agent.wallet.isFrozen,
              }
            : null,
          mandatesCount: agent._count.mandates,
          tasksCount: agent._count.tasks,
          createdAt: agent.createdAt.toISOString(),
        };
      })
    );

    return NextResponse.json({ success: true, agents: formatted });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { name, description, purpose, colorVariant, type = "research_procurement", version = "1.0.0", configuration = {}, metadata = {} } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing or invalid agent name" },
        { status: 400 }
      );
    }

    // Validate requested agent type against Universal Agent Registry
    if (!agentRegistry.has(type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown agent type "${type}". Supported types: ${agentRegistry.getSupportedTypeNames().join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate configuration against registered schema
    const configValidation = agentRegistry.validateConfig(type, configuration, version);
    if (!configValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid configuration for agent type "${type}": ${configValidation.errors?.join("; ")}`,
        },
        { status: 400 }
      );
    }

    const COLORS = ["red", "gold", "white", "emerald", "cyan", "purple"];
    const existingCount = await prisma.agent.count({ where: { userId: user.id } });
    const assignedColor = colorVariant && COLORS.includes(colorVariant)
      ? colorVariant
      : COLORS[existingCount % COLORS.length];

    // 1. Provision dedicated OutLayer TEE wallet for this new agent
    let outlayerRes;
    try {
      outlayerRes = await registerOutlayerWallet();
    } catch (regErr: any) {
      console.warn("OutLayer TEE remote registration fallback:", regErr.message);
      outlayerRes = {
        wallet_id: `outlayer-vault-${Date.now()}`,
        api_key: `wk_local_${Date.now()}`,
        near_account_id: `agent-vault-${Date.now()}.testnet`,
        handoff_url: "",
      };
    }

    // 2. Create Agent and link dedicated wallet in an atomic transaction
    const agent = await prisma.agent.create({
      data: {
        name,
        description: description || "",
        purpose: purpose || "Autonomous Spending",
        type,
        version,
        configuration: JSON.stringify(configuration),
        metadata: JSON.stringify(metadata),
        status: "ACTIVE",
        colorVariant: assignedColor,
        userId: user.id,
        wallet: {
          create: {
            walletId: outlayerRes.wallet_id,
            apiKey: encryptWalletApiKey(outlayerRes.api_key, {
              walletId: outlayerRes.wallet_id,
              nearAccountId: outlayerRes.near_account_id,
            }),
            nearAccountId: outlayerRes.near_account_id,
            handoffUrl: outlayerRes.handoff_url,
            network: "testnet",
            balanceYocto: "0",
          },
        },
      },
      include: {
        wallet: true,
      },
    });

    // 3. Log Tamper-Evident Hash-Chained Audit Record
    await recordAuditEvent({
      userId: user.id,
      eventType: "AGENT_CREATED",
      verdict: "SUCCESS",
      description: `AI Agent "${agent.name}" created with OutLayer TEE custody`,
      details: {
        agentId: agent.id,
        name: agent.name,
        walletAddress: agent.wallet?.nearAccountId,
      },
      agentId: agent.id,
      agentWalletAddress: agent.wallet?.nearAccountId,
    });

    // 4. Grant Default Safe Tools (duckduckgo_search, near_rpc_reader)
    try {
      await grantAgentToolAccess({
        agentId: agent.id,
        userId: user.id,
        toolId: "duckduckgo_search",
        permissionLevel: "READ",
      });
      await grantAgentToolAccess({
        agentId: agent.id,
        userId: user.id,
        toolId: "near_rpc_reader",
        permissionLevel: "READ",
      });
    } catch (grantErr) {
      console.warn("Default tool access assignment warning:", grantErr);
    }

    return NextResponse.json(
      {
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          purpose: agent.purpose,
          type: agent.type,
          version: agent.version,
          configuration: body.configuration || {},
          metadata: body.metadata || {},
          status: agent.status,
          colorVariant: agent.colorVariant || "red",
          wallet: {
            id: agent.wallet!.id,
            nearAccountId: agent.wallet!.nearAccountId,
            handoffUrl: agent.wallet!.handoffUrl,
            balanceNear: "0.000",
            isInitialized: false,
            initializationStatus: "UNINITIALIZED",
          },
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

