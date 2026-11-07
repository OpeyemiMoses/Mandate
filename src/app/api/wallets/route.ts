import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { getNearAccountState } from "@/lib/nearRpc";
import { yoctoToNear } from "@/lib/yocto";
import { encryptWalletApiKey } from "@/lib/security/walletCredentialService";

const PROVISIONING_LEASE_TTL_MS = 30_000;
const FOLLOWER_WAIT_TIMEOUT_MS = 10_000;
const FOLLOWER_POLL_INTERVAL_MS = 75;

interface AgentProvisioningMetadata {
  provisioningState?:
    | "IN_PROGRESS"
    | "COMPLETED"
    | "FAILED_PRE_PROVIDER"
    | "UNRESOLVED_PROVIDER_ORPHAN";
  attemptId?: string;
  startedAt?: string;
  startedAtEpochMs?: number;
  completedAt?: string;
  failedAt?: string;
  lastError?: string;
  outlayerWalletId?: string | null;
  nearAccountId?: string | null;
  reconciliation?: {
    reason: string;
    outlayerWalletId: string | null;
    nearAccountId: string | null;
    handoffUrl?: string;
    errorMessage?: string;
    failedAt: string;
    attemptId?: string;
  };
  reconciledOrphanHistory?: Array<Record<string, any>>;
}

function parseAgentMetadata(raw: string | null | undefined): AgentProvisioningMetadata {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isTimeoutOrAmbiguousError(err: any): boolean {
  const msg = String(err?.message || "").toLowerCase();
  const name = String(err?.name || "").toLowerCase();
  const code = String(err?.code || "").toLowerCase();
  return (
    name.includes("timeout") ||
    name.includes("abort") ||
    code === "etimedout" ||
    code === "econnaborted" ||
    code === "econnreset" ||
    code === "und_err_headers_timeout" ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("socket hang up") ||
    msg.includes("ambiguous")
  );
}

function formatWalletPayload(wallet: {
  id: string;
  walletId: string;
  nearAccountId: string;
  handoffUrl: string | null;
  balanceYocto: string;
  isFrozen: boolean;
}) {
  return {
    id: wallet.id,
    walletId: wallet.walletId,
    nearAccountId: wallet.nearAccountId,
    handoffUrl: wallet.handoffUrl,
    balanceYocto: wallet.balanceYocto,
    balanceNear: yoctoToNear(wallet.balanceYocto || "0"),
    isFrozen: wallet.isFrozen,
  };
}

/**
 * GET /api/wallets - List personal wallet, dedicated agent wallets, and funding history
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);

    // 1. Personal wallet onchain RPC query
    const personalRpc = await getNearAccountState(user.nearAccountId);

    // 2. Query all agents for this user
    const allAgents = await prisma.agent.findMany({
      where: { userId: user.id },
      include: {
        wallet: true,
        mandates: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Only expose agents with an actually persisted wallet in agentWallets so UI never shows
    // an unprovisioned placeholder as an active wallet
    const provisionedAgents = allAgents.filter((a) => a.wallet !== null);
    const unresolvedAgent = allAgents.find((a) => a.wallet === null);
    const unresolvedMeta = unresolvedAgent
      ? parseAgentMetadata(unresolvedAgent.metadata)
      : null;

    const agentWallets = await Promise.all(
      provisionedAgents.map(async (agent) => {
        let balanceYocto = agent.wallet?.balanceYocto || "0";
        let onchainActive = false;

        if (agent.wallet?.nearAccountId) {
          const rpcState = await getNearAccountState(agent.wallet.nearAccountId);
          if (rpcState) {
            const onchainYocto = BigInt(rpcState.amountYocto || "0");
            const dbYocto = BigInt(agent.wallet?.balanceYocto || "0");
            const effectiveYocto =
              onchainYocto > dbYocto ? onchainYocto.toString() : dbYocto.toString();
            balanceYocto = effectiveYocto;
            onchainActive = true;

            if (effectiveYocto !== agent.wallet?.balanceYocto) {
              prisma.wallet
                .update({
                  where: { id: agent.wallet.id },
                  data: {
                    balanceYocto: effectiveYocto,
                    onChainBalanceYocto: rpcState.amountYocto,
                    isInitialized: true,
                    initializationStatus: "READY",
                  },
                })
                .catch(() => {});
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
      provisioningState: unresolvedMeta?.provisioningState || null,
      reconciliation: unresolvedMeta?.reconciliation || null,
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
 * POST /api/wallets - Concurrency-safe, idempotent provisioning or retrieval of user's Primary Agent wallet
 *
 * Concurrency & Orphaned-Resource Protocol (M14.7-R1 Workstream B):
 * 1. Acquires a short per-user row lock (`SELECT id FROM "User" WHERE id = $1 FOR UPDATE`)
 *    to serialize concurrent first-time requests without holding a DB transaction open during OutLayer I/O.
 * 2. Records a durable `PROVISIONING` (`IN_PROGRESS`) state before calling OutLayer.
 * 3. Followers arriving while `IN_PROGRESS` converge on the single in-flight operation.
 * 4. If OutLayer registration succeeds (or times out ambiguously) and subsequent encryption or DB
 *    persistence fails, transitions the agent to `UNRESOLVED_PROVIDER_ORPHAN` with non-secret
 *    reconciliation metadata (never logging or storing `api_key`).
 * 5. Subsequent automatic retries while `UNRESOLVED_PROVIDER_ORPHAN` is active fail closed (409)
 *    instead of creating uncontrolled duplicate upstream OutLayer wallets, unless explicitly
 *    reconciled via `{ action: "reconcile", acknowledgeUnresolvedOrphan: true }`.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);

    let body: { action?: string; acknowledgeUnresolvedOrphan?: boolean } = {};
    try {
      const text = await req.text();
      if (text && text.trim()) {
        body = JSON.parse(text);
      }
    } catch {
      body = {};
    }

    const isExplicitReconcile =
      body?.action === "reconcile" && body?.acknowledgeUnresolvedOrphan === true;

    // -------------------------------------------------------------------------
    // PHASE 1: Short Database Lock Transaction (No Network I/O inside TX)
    // -------------------------------------------------------------------------
    type CoordinatorDecision =
      | {
          kind: "EXISTING_WALLET";
          wallet: {
            id: string;
            walletId: string;
            nearAccountId: string;
            handoffUrl: string | null;
            balanceYocto: string;
            isFrozen: boolean;
          };
        }
      | {
          kind: "WAIT_FOR_LEADER";
          agentId: string;
          attemptId: string;
        }
      | {
          kind: "UNRESOLVED_ORPHAN";
          agentId: string;
          meta: AgentProvisioningMetadata;
        }
      | {
          kind: "LEADER_PROVISION";
          agentId: string;
          attemptId: string;
          reconciledHistory: Array<Record<string, any>>;
        };

    const decision: CoordinatorDecision = await prisma.$transaction(async (tx) => {
      // Serialize concurrent requests for this user at the PostgreSQL row lock boundary
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;

      const existingAgents = await tx.agent.findMany({
        where: { userId: user.id },
        include: { wallet: true },
        orderBy: { createdAt: "asc" },
      });

      const agentWithWallet = existingAgents.find((a) => a.wallet !== null);
      if (agentWithWallet && agentWithWallet.wallet) {
        return {
          kind: "EXISTING_WALLET",
          wallet: agentWithWallet.wallet,
        };
      }

      const attemptId = `prov_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();

      if (existingAgents.length > 0) {
        const primaryAgent = existingAgents[0];
        const meta = parseAgentMetadata(primaryAgent.metadata);

        // Clean up any accidental duplicate wallet-less agent rows if present
        if (existingAgents.length > 1) {
          const duplicateIds = existingAgents.slice(1).map((a) => a.id);
          await tx.agent.deleteMany({
            where: { id: { in: duplicateIds }, wallet: null },
          });
        }

        if (meta.provisioningState === "IN_PROGRESS") {
          const elapsedMs = nowMs - (meta.startedAtEpochMs || 0);
          if (elapsedMs < PROVISIONING_LEASE_TTL_MS) {
            return {
              kind: "WAIT_FOR_LEADER",
              agentId: primaryAgent.id,
              attemptId: meta.attemptId || attemptId,
            };
          }

          // Lease expired mid-flight -> treat as unresolved provider orphan
          const expiredMeta: AgentProvisioningMetadata = {
            ...meta,
            provisioningState: "UNRESOLVED_PROVIDER_ORPHAN",
            failedAt: nowIso,
            reconciliation: meta.reconciliation || {
              reason: "PROVISIONING_LEASE_EXPIRED_AMBIGUOUS",
              outlayerWalletId: meta.outlayerWalletId || null,
              nearAccountId: meta.nearAccountId || null,
              errorMessage: "Previous provisioning attempt exceeded lease window without recording completion.",
              failedAt: nowIso,
              attemptId: meta.attemptId,
            },
          };
          await tx.agent.update({
            where: { id: primaryAgent.id },
            data: {
              status: "PROVISIONING_UNRESOLVED",
              metadata: JSON.stringify(expiredMeta),
            },
          });

          if (!isExplicitReconcile) {
            return {
              kind: "UNRESOLVED_ORPHAN",
              agentId: primaryAgent.id,
              meta: expiredMeta,
            };
          }
        }

        if (meta.provisioningState === "UNRESOLVED_PROVIDER_ORPHAN") {
          if (!isExplicitReconcile) {
            return {
              kind: "UNRESOLVED_ORPHAN",
              agentId: primaryAgent.id,
              meta,
            };
          }

          // Explicit owner-authorized reconciliation: archive unresolved metadata and start fresh attempt on same Agent
          const history = Array.isArray(meta.reconciledOrphanHistory)
            ? [...meta.reconciledOrphanHistory]
            : [];
          if (meta.reconciliation) {
            history.push({
              ...meta.reconciliation,
              reconciledAt: nowIso,
            });
          }

          const nextMeta: AgentProvisioningMetadata = {
            provisioningState: "IN_PROGRESS",
            attemptId,
            startedAt: nowIso,
            startedAtEpochMs: nowMs,
            reconciledOrphanHistory: history,
          };

          await tx.agent.update({
            where: { id: primaryAgent.id },
            data: {
              status: "PROVISIONING",
              metadata: JSON.stringify(nextMeta),
            },
          });

          return {
            kind: "LEADER_PROVISION",
            agentId: primaryAgent.id,
            attemptId,
            reconciledHistory: history,
          };
        }

        // Otherwise (e.g. FAILED_PRE_PROVIDER where OutLayer never created a wallet), reuse the single Primary Agent
        const retryMeta: AgentProvisioningMetadata = {
          provisioningState: "IN_PROGRESS",
          attemptId,
          startedAt: nowIso,
          startedAtEpochMs: nowMs,
          reconciledOrphanHistory: meta.reconciledOrphanHistory || [],
        };

        await tx.agent.update({
          where: { id: primaryAgent.id },
          data: {
            status: "PROVISIONING",
            metadata: JSON.stringify(retryMeta),
          },
        });

        return {
          kind: "LEADER_PROVISION",
          agentId: primaryAgent.id,
          attemptId,
          reconciledHistory: meta.reconciledOrphanHistory || [],
        };
      }

      // First-time onboarding: create single Primary Agent in PROVISIONING state before calling OutLayer
      const initialMeta: AgentProvisioningMetadata = {
        provisioningState: "IN_PROGRESS",
        attemptId,
        startedAt: nowIso,
        startedAtEpochMs: nowMs,
      };

      const createdAgent = await tx.agent.create({
        data: {
          name: "Primary Agent",
          purpose: "Autonomous Spending",
          status: "PROVISIONING",
          userId: user.id,
          metadata: JSON.stringify(initialMeta),
        },
      });

      return {
        kind: "LEADER_PROVISION",
        agentId: createdAgent.id,
        attemptId,
        reconciledHistory: [],
      };
    });

    // -------------------------------------------------------------------------
    // PHASE 2: Handle Existing Wallet, Unresolved Orphan, or Follower Convergence
    // -------------------------------------------------------------------------
    if (decision.kind === "EXISTING_WALLET") {
      return NextResponse.json({
        success: true,
        wallet: formatWalletPayload(decision.wallet),
      });
    }

    if (decision.kind === "UNRESOLVED_ORPHAN") {
      return NextResponse.json(
        {
          success: false,
          code: "ONBOARDING_RECONCILIATION_REQUIRED",
          recoverable: true,
          provisioningState: "UNRESOLVED_PROVIDER_ORPHAN",
          error:
            "A previous wallet provisioning attempt did not complete cleanly after contacting OutLayer. Automatic re-registration is blocked to prevent orphaned provider wallets. Submit an explicit reconciliation request to recover.",
          reconciliation: decision.meta.reconciliation || null,
        },
        { status: 409 }
      );
    }

    if (decision.kind === "WAIT_FOR_LEADER") {
      const deadline = Date.now() + FOLLOWER_WAIT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, FOLLOWER_POLL_INTERVAL_MS));

        const currentAgent = await prisma.agent.findUnique({
          where: { id: decision.agentId },
          include: { wallet: true },
        });

        if (!currentAgent) {
          break;
        }

        if (currentAgent.wallet) {
          return NextResponse.json({
            success: true,
            wallet: formatWalletPayload(currentAgent.wallet),
          });
        }

        const currentMeta = parseAgentMetadata(currentAgent.metadata);
        if (currentMeta.provisioningState === "FAILED_PRE_PROVIDER") {
          return NextResponse.json(
            {
              success: false,
              code: "OUTLAYER_PROVISIONING_FAILED",
              recoverable: true,
              provisioningState: "FAILED_PRE_PROVIDER",
              error:
                currentMeta.lastError ||
                "OutLayer wallet registration failed during concurrent provisioning.",
            },
            { status: 502 }
          );
        }

        if (currentMeta.provisioningState === "UNRESOLVED_PROVIDER_ORPHAN") {
          return NextResponse.json(
            {
              success: false,
              code: "ONBOARDING_RECONCILIATION_REQUIRED",
              recoverable: true,
              provisioningState: "UNRESOLVED_PROVIDER_ORPHAN",
              error:
                "Concurrent wallet provisioning encountered an unresolved post-provider state. Automatic re-registration is blocked until reconciled.",
              reconciliation: currentMeta.reconciliation || null,
            },
            { status: 409 }
          );
        }
      }

      return NextResponse.json(
        {
          success: false,
          code: "ONBOARDING_PROVISIONING_IN_PROGRESS",
          recoverable: true,
          provisioningState: "IN_PROGRESS",
          error: "Wallet provisioning is still in progress. Please retry shortly.",
        },
        { status: 409 }
      );
    }

    // -------------------------------------------------------------------------
    // PHASE 3: Leader External OutLayer Provisioning (Outside DB Transaction)
    // -------------------------------------------------------------------------
    const { agentId, attemptId, reconciledHistory } = decision;
    const { registerOutlayerWallet } = await import("@/lib/outlayer");

    let outlayerRes: Awaited<ReturnType<typeof registerOutlayerWallet>>;
    try {
      outlayerRes = await registerOutlayerWallet();
    } catch (providerErr: any) {
      const failedAt = new Date().toISOString();

      if (isTimeoutOrAmbiguousError(providerErr)) {
        const unresolvedMeta: AgentProvisioningMetadata = {
          provisioningState: "UNRESOLVED_PROVIDER_ORPHAN",
          attemptId,
          failedAt,
          reconciledOrphanHistory: reconciledHistory,
          reconciliation: {
            reason: "PROVIDER_TIMEOUT_OR_AMBIGUOUS_RESPONSE",
            outlayerWalletId: null,
            nearAccountId: null,
            errorMessage: providerErr.message || "OutLayer registration timed out or returned ambiguous state",
            failedAt,
            attemptId,
          },
        };

        await prisma.agent
          .update({
            where: { id: agentId },
            data: {
              status: "PROVISIONING_UNRESOLVED",
              metadata: JSON.stringify(unresolvedMeta),
            },
          })
          .catch(() => {});

        return NextResponse.json(
          {
            success: false,
            code: "OUTLAYER_PROVISIONING_AMBIGUOUS",
            recoverable: true,
            provisioningState: "UNRESOLVED_PROVIDER_ORPHAN",
            error: `OutLayer registration outcome was ambiguous (${providerErr.message}). Automatic re-registration is blocked until reconciled.`,
            reconciliation: unresolvedMeta.reconciliation,
          },
          { status: 504 }
        );
      }

      // Deterministic pre-provider failure (e.g. HTTP 500/502/503 from OutLayer)
      const failedPreMeta: AgentProvisioningMetadata = {
        provisioningState: "FAILED_PRE_PROVIDER",
        attemptId,
        failedAt,
        lastError: providerErr.message || "OutLayer wallet registration failed",
        reconciledOrphanHistory: reconciledHistory,
      };

      await prisma.agent
        .update({
          where: { id: agentId },
          data: {
            status: "PROVISIONING_FAILED",
            metadata: JSON.stringify(failedPreMeta),
          },
        })
        .catch(() => {});

      return NextResponse.json(
        {
          success: false,
          code: "OUTLAYER_PROVISIONING_FAILED",
          recoverable: true,
          provisioningState: "FAILED_PRE_PROVIDER",
          error: `OutLayer wallet provisioning failed: ${providerErr.message || "Upstream provider error"}`,
        },
        { status: 502 }
      );
    }

    // Validate provider payload completeness and reject any synthetic values
    if (
      !outlayerRes ||
      typeof outlayerRes.wallet_id !== "string" ||
      !outlayerRes.wallet_id.trim() ||
      typeof outlayerRes.api_key !== "string" ||
      !outlayerRes.api_key.trim() ||
      typeof outlayerRes.near_account_id !== "string" ||
      !outlayerRes.near_account_id.trim() ||
      outlayerRes.api_key.startsWith("wk_local_") ||
      outlayerRes.wallet_id.startsWith("outlayer-vault-")
    ) {
      const failedAt = new Date().toISOString();
      const ambiguousMeta: AgentProvisioningMetadata = {
        provisioningState: "UNRESOLVED_PROVIDER_ORPHAN",
        attemptId,
        failedAt,
        reconciledOrphanHistory: reconciledHistory,
        reconciliation: {
          reason: "AMBIGUOUS_OR_INCOMPLETE_PROVIDER_PAYLOAD",
          outlayerWalletId:
            typeof outlayerRes?.wallet_id === "string" ? outlayerRes.wallet_id : null,
          nearAccountId:
            typeof outlayerRes?.near_account_id === "string"
              ? outlayerRes.near_account_id
              : null,
          handoffUrl:
            typeof outlayerRes?.handoff_url === "string" ? outlayerRes.handoff_url : "",
          errorMessage:
            "OutLayer returned an incomplete or synthetic registration payload.",
          failedAt,
          attemptId,
        },
      };

      await prisma.agent
        .update({
          where: { id: agentId },
          data: {
            status: "PROVISIONING_UNRESOLVED",
            metadata: JSON.stringify(ambiguousMeta),
          },
        })
        .catch(() => {});

      return NextResponse.json(
        {
          success: false,
          code: "OUTLAYER_PROVISIONING_AMBIGUOUS",
          recoverable: true,
          provisioningState: "UNRESOLVED_PROVIDER_ORPHAN",
          error:
            "OutLayer returned an incomplete or invalid registration response. Automatic re-registration is blocked until reconciled.",
          reconciliation: ambiguousMeta.reconciliation,
        },
        { status: 502 }
      );
    }

    // -------------------------------------------------------------------------
    // PHASE 4: Credential Vault v2 Encryption & Atomic Wallet Persistence
    // -------------------------------------------------------------------------
    try {
      const encryptedApiKey = encryptWalletApiKey(outlayerRes.api_key, {
        walletId: outlayerRes.wallet_id,
        nearAccountId: outlayerRes.near_account_id,
      });

      const createdWallet = await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.create({
          data: {
            walletId: outlayerRes.wallet_id,
            apiKey: encryptedApiKey,
            nearAccountId: outlayerRes.near_account_id,
            handoffUrl: outlayerRes.handoff_url || "",
            network: "testnet",
            balanceYocto: "0",
            agentId,
          },
        });

        const completedMeta: AgentProvisioningMetadata = {
          provisioningState: "COMPLETED",
          attemptId,
          completedAt: new Date().toISOString(),
          outlayerWalletId: outlayerRes.wallet_id,
          nearAccountId: outlayerRes.near_account_id,
          reconciledOrphanHistory: reconciledHistory,
        };

        await tx.agent.update({
          where: { id: agentId },
          data: {
            status: "ACTIVE",
            metadata: JSON.stringify(completedMeta),
          },
        });

        return wallet;
      });

      return NextResponse.json({
        success: true,
        wallet: formatWalletPayload(createdWallet),
      });
    } catch (postProviderErr: any) {
      // Provider wallet was created, but local encryption or database persistence failed.
      // Record non-secret reconciliation metadata (NEVER log or store plaintext api_key).
      const failedAt = new Date().toISOString();
      const orphanMeta: AgentProvisioningMetadata = {
        provisioningState: "UNRESOLVED_PROVIDER_ORPHAN",
        attemptId,
        failedAt,
        outlayerWalletId: outlayerRes.wallet_id,
        nearAccountId: outlayerRes.near_account_id,
        reconciledOrphanHistory: reconciledHistory,
        reconciliation: {
          reason: "POST_PROVIDER_PERSISTENCE_OR_ENCRYPTION_FAILURE",
          outlayerWalletId: outlayerRes.wallet_id,
          nearAccountId: outlayerRes.near_account_id,
          handoffUrl: outlayerRes.handoff_url || "",
          errorMessage:
            postProviderErr.message || "Credential encryption or database persistence failed",
          failedAt,
          attemptId,
        },
      };

      await prisma.agent
        .update({
          where: { id: agentId },
          data: {
            status: "PROVISIONING_UNRESOLVED",
            metadata: JSON.stringify(orphanMeta),
          },
        })
        .catch(() => {});

      return NextResponse.json(
        {
          success: false,
          code: "ONBOARDING_POST_PROVIDER_FAILURE",
          recoverable: true,
          provisioningState: "UNRESOLVED_PROVIDER_ORPHAN",
          error:
            "OutLayer wallet was registered, but local credential encryption or database persistence failed. Automatic re-registration is blocked to prevent duplicate provider wallets.",
          reconciliation: {
            outlayerWalletId: outlayerRes.wallet_id,
            nearAccountId: outlayerRes.near_account_id,
            handoffUrl: outlayerRes.handoff_url || "",
            failedAt,
            attemptId,
          },
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
