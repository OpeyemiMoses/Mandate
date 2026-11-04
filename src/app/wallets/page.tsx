"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Wallet,
  Bot,
  ArrowDownLeft,
  ArrowUpRight,
  Shield,
  ShieldCheck,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  ArrowRight,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlowingCard } from "@/components/GlowingCard";
import { useMandate } from "@/context/MandateContext";
import { useNearWalletSelector } from "@/context/NearWalletSelectorContext";
import { FundAndWithdrawModals } from "@/components/FundAndWithdrawModals";
import { truncateAddress } from "@/lib/formatters";

interface FundingHistoryItem {
  id: string;
  txHash: string;
  amountNear: string;
  receiver: string;
  status: string;
  createdAt: string;
}

interface WithdrawalHistoryItem {
  id: string;
  txHash: string;
  amountNear: string;
  recipient: string;
  status: string;
  createdAt: string;
}

export default function WalletsPage() {
  const {
    accountId,
    userNearBalance,
    agentWallets,
    totalAgentBalanceNear,
    sessionToken,
    refreshData,
    setIsWalletModalOpen,
    disconnectWallet,
  } = useMandate();

  const { walletName, openWalletModal, signOut } = useNearWalletSelector();

  const handleDisconnectAll = async () => {
    await signOut();
    disconnectWallet();
  };

  const [activeTab, setActiveTab] = useState<"funding" | "withdrawals">("funding");
  const [fundingHistory, setFundingHistory] = useState<FundingHistoryItem[]>([]);
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: "fund" | "withdraw";
    agentId?: string;
  }>({ isOpen: false, mode: "fund" });

  const getHeaders = () => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (accountId) {
      h["x-near-account"] = accountId;
    }
    if (sessionToken) {
      h["x-session-token"] = sessionToken;
    }
    return h;
  };

  const loadWalletData = async () => {
    try {
      setIsLoadingHistory(true);
      const res = await fetch("/api/wallets", { headers: getHeaders() });
      const data = await res.json();
      if (res.ok && data.success) {
        setFundingHistory(data.fundingHistory || []);
        setWithdrawalHistory(data.withdrawalHistory || []);
      }
    } catch (err) {
      console.error("Failed to load wallet histories:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadWalletData();
  }, [accountId, sessionToken]);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <AppShell>
      <div className="space-y-8 relative">
        {/* Ambient Top Glow */}
        <div
          className="pointer-events-none absolute -top-10 right-0 w-[420px] h-[260px] rounded-full opacity-15 blur-[120px]"
          style={{ background: "#FF3B30" }}
        />

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10 animate-rise">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <Wallet className="w-7 h-7 text-[#FF3B30]" />
              Wallets &amp; Custody
            </h1>
            <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mt-1">
              Personal NEAR balance, dedicated OutLayer TEE custody wallets, and funding history.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setModalState({ isOpen: true, mode: "fund" })}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.25)] btn-pop"
            >
              <ArrowDownLeft className="w-4 h-4" />
              Fund Agent
            </button>

            <button
              type="button"
              onClick={() => setModalState({ isOpen: true, mode: "withdraw" })}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-950 bg-white hover:bg-slate-50 border border-slate-200 dark:text-white dark:bg-[#1A1A22] dark:hover:bg-[#252530] dark:border-white/10 shadow-sm transition-all btn-pop"
            >
              <ArrowUpRight className="w-4 h-4" />
              Withdraw
            </button>
          </div>
        </div>

        {/* Security Invariant Callout */}
        <GlowingCard
          intensity="subtle"
          innerClassName="p-4"
          glowPosition="top-left"
          className="animate-rise stagger-1"
        >
          <div className="flex items-start sm:items-center gap-3 text-xs text-slate-600 dark:text-[#A1A1AA]">
            <ShieldCheck className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong className="text-slate-900 dark:text-white font-medium">Personal vs. Agent Custody:</strong>{" "}
              Connecting your personal wallet allows you to authorize funding transfers to your agents.
              Your personal private keys are never requested or stored. Each agent possesses its own
              separate TEE custody wallet.
            </span>
          </div>
        </GlowingCard>

        {/* Top Dual Cards: Personal Wallet vs. Total Agent Custody */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
          {/* Card 1: Connected Personal NEAR Wallet */}
          <GlowingCard
            intensity="medium"
            innerClassName="p-6 space-y-5"
            glowPosition="top-left"
            className="animate-pop hover-pop stagger-1"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                  Connected Personal Wallet
                </span>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 dark:text-white tracking-tight">
                  {userNearBalance} NEAR
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live RPC Verified
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141419] border border-white/5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Account ID:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-white font-semibold">{truncateAddress(accountId, 8, 6) || "None"}</span>
                  {accountId && (
                    <button
                      type="button"
                      onClick={() => copyText(accountId, "personal")}
                      className="text-zinc-400 hover:text-white transition-colors"
                      title="Copy account ID"
                    >
                      {copiedId === "personal" ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Wallet Connector:</span>
                <span className="font-mono text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {walletName || "Native NEAR Selector"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Network:</span>
                <span className="font-mono text-emerald-400">NEAR Testnet</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Block Explorer:</span>
                {accountId ? (
                  <a
                    href={`https://testnet.nearblocks.io/address/${accountId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-400 hover:text-white inline-flex items-center gap-1 transition-colors"
                  >
                    View on NEARBlocks
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </div>
            </div>

            <div className="pt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={() => openWalletModal()}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#1C1C24] hover:bg-[#252530] border border-white/10 transition-colors"
              >
                {accountId ? "Switch Personal Wallet" : "Connect Personal Wallet"}
              </button>

              {accountId && (
                <button
                  type="button"
                  onClick={handleDisconnectAll}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-colors"
                >
                  Disconnect
                </button>
              )}
            </div>
          </GlowingCard>

          {/* Card 2: Total Agent Custody Funds */}
          <GlowingCard
            intensity="medium"
            innerClassName="p-6 space-y-5"
            glowPosition="top-right"
            className="animate-pop hover-pop stagger-2"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#FF3B30] flex items-center gap-1.5 font-semibold">
                  <Bot className="w-3.5 h-3.5 text-[#FF3B30]" />
                  Agent Custody Total
                </span>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 dark:text-white tracking-tight">
                  {totalAgentBalanceNear} NEAR
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase font-semibold bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/10 dark:border-[#FF3B30]/25">
                OutLayer TEE Isolation
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#141419] border border-slate-200 dark:border-white/5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Total Provisioned Agents:</span>
                <span className="font-mono text-slate-900 dark:text-white font-semibold">
                  {agentWallets.length} Dedicated Wallets
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Custody Provider:</span>
                <span className="font-mono text-slate-900 dark:text-white">OutLayer TEE Key Manager</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-zinc-400">Key Security:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-mono font-medium">0 Private Keys Exposed</span>
              </div>
            </div>

            <div className="pt-1 flex items-center justify-between">
              <Link
                href="/agents"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-800 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 border border-slate-200 dark:text-white dark:bg-[#1C1C24] dark:hover:bg-[#252530] dark:border-white/10 transition-colors btn-pop"
              >
                Manage Agents
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>

              <button
                type="button"
                onClick={() => setModalState({ isOpen: true, mode: "fund" })}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 dark:text-emerald-400 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 dark:border-emerald-500/35 transition-all btn-pop"
              >
                Deposit Funds
              </button>
            </div>
          </GlowingCard>
        </div>

        {/* Dedicated Agent Wallets List */}
        <div className="space-y-4 relative z-10 animate-rise stagger-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Dedicated Agent Wallets
              </h2>
              <p className="text-xs text-slate-600 dark:text-[#A1A1AA]">
                Each agent possesses an isolated 64-character NEAR account in OutLayer TEE custody.
              </p>
            </div>

            <Link
              href="/agents"
              className="text-xs text-[#FF3B30] hover:underline inline-flex items-center gap-1 font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              New Agent
            </Link>
          </div>

          {agentWallets.length === 0 ? (
            <GlowingCard intensity="subtle" innerClassName="p-8 text-center space-y-3">
              <Bot className="w-8 h-8 text-slate-400 dark:text-zinc-500 mx-auto" />
              <div className="text-sm text-slate-700 dark:text-zinc-300 font-medium">No Dedicated Agent Wallets Provisioned</div>
              <p className="text-xs text-slate-500 dark:text-zinc-500 max-w-md mx-auto">
                Mandate strictly separates your personal NEAR wallet from dedicated agent custody. Each agent operates with an isolated OutLayer TEE wallet so your personal funds remain secure.
              </p>
              <Link
                href="/agents"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all btn-pop"
              >
                <Plus className="w-4 h-4" />
                Provision Agent Wallet
              </Link>
            </GlowingCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {agentWallets.map((wallet, idx) => (
                <div
                  key={wallet.agentId}
                  className={`p-4 rounded-2xl bg-white dark:bg-[#121217] border border-slate-200 dark:border-[#23232C] hover:border-[#FF3B30]/35 transition-all space-y-3 shadow-sm hover:shadow-md animate-pop hover-pop stagger-${(idx % 6) + 1}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-[#1C1518] border border-red-200 dark:border-[#FF3B30]/30 flex items-center justify-center text-[#FF3B30]">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-sm text-white block">
                          {wallet.agentName}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {wallet.agentStatus} · {wallet.mandatesCount} Mandates
                        </span>
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <span className="text-xs font-mono font-bold text-emerald-400 block">
                        {wallet.balanceNear} NEAR
                      </span>
                      {wallet.onchainActive || wallet.isInitialized ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          <span className="w-1 h-1 rounded-full bg-emerald-400" />
                          Ready On-Chain
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          <span className="w-1 h-1 rounded-full bg-amber-400" />
                          Needs Initial Funding
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Account Address Box */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[#0B0B0E] border border-white/5 text-xs font-mono">
                    <span className="text-zinc-300">
                      {truncateAddress(wallet.nearAccountId, 10, 6)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyText(wallet.nearAccountId, wallet.agentId)}
                        className="p-1 rounded text-zinc-400 hover:text-white transition-colors"
                        title="Copy Address"
                      >
                        {copiedId === wallet.agentId ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <a
                        href={`https://testnet.nearblocks.io/address/${wallet.nearAccountId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded text-zinc-400 hover:text-white transition-colors"
                        title="View on NEARBlocks"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setModalState({
                          isOpen: true,
                          mode: "fund",
                          agentId: wallet.agentId,
                        })
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-all"
                    >
                      Fund
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setModalState({
                          isOpen: true,
                          mode: "withdraw",
                          agentId: wallet.agentId,
                        })
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 bg-[#1C1C24] hover:bg-[#252530] border border-white/10 transition-all"
                    >
                      Withdraw
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabbed Activity History (Funding Deposits vs. Withdrawals) */}
        <div className="space-y-4 relative z-10">
          <div className="flex items-center justify-between border-b border-[#23232C] pb-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab("funding")}
                className={`text-xs sm:text-sm font-semibold transition-colors pb-1 relative ${
                  activeTab === "funding"
                    ? "text-white border-b-2 border-[#FF3B30]"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Funding Deposits ({fundingHistory.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("withdrawals")}
                className={`text-xs sm:text-sm font-semibold transition-colors pb-1 relative ${
                  activeTab === "withdrawals"
                    ? "text-white border-b-2 border-[#FF3B30]"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Withdrawals ({withdrawalHistory.length})
              </button>
            </div>

            <button
              type="button"
              onClick={loadWalletData}
              className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {isLoadingHistory ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              Loading transaction history...
            </div>
          ) : activeTab === "funding" ? (
            fundingHistory.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">
                No funding transactions recorded yet. Use &ldquo;Fund Agent&rdquo; to deposit NEAR.
              </div>
            ) : (
              <div className="space-y-2">
                {fundingHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-[#121217] border border-white/5 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                        <ArrowDownLeft className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-mono font-semibold text-white">
                          +{item.amountNear} NEAR
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono truncate max-w-[200px] sm:max-w-[320px]">
                          To: {item.receiver}
                        </div>
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {item.status}
                      </span>
                      <div className="flex items-center justify-end gap-1 font-mono text-[10px] text-zinc-500">
                        <a
                          href={`https://testnet.nearblocks.io/txns/${item.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-zinc-300 inline-flex items-center gap-1"
                        >
                          Tx: {item.txHash.slice(0, 10)}...
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : withdrawalHistory.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              No withdrawals recorded yet.
            </div>
          ) : (
            <div className="space-y-2">
              {withdrawalHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-[#121217] border border-white/5 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/20 flex items-center justify-center">
                      <ArrowUpRight className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-mono font-semibold text-white">
                        -{item.amountNear} NEAR
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono truncate max-w-[200px] sm:max-w-[320px]">
                        To: {item.recipient}
                      </div>
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {item.status}
                    </span>
                    <div className="flex items-center justify-end gap-1 font-mono text-[10px] text-zinc-500">
                      {item.txHash ? (
                        <a
                          href={`https://testnet.nearblocks.io/txns/${item.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-zinc-300 inline-flex items-center gap-1"
                        >
                          Tx: {item.txHash.slice(0, 10)}...
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : (
                        <span>Processing</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fund / Withdraw Modals */}
        <FundAndWithdrawModals
          isOpen={modalState.isOpen}
          mode={modalState.mode}
          initialAgentId={modalState.agentId}
          onClose={() => setModalState({ isOpen: false, mode: "fund" })}
        />
      </div>
    </AppShell>
  );
}

