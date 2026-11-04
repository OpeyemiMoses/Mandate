"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Bot,
  Plus,
  Shield,
  ShieldAlert,
  Wallet,
  Play,
  Pause,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Lock,
  Ban,
  Layers,
  CheckCircle2,
  Wrench,
  Network,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlowingCard } from "@/components/GlowingCard";
import { MandateMark } from "@/components/MandateLogo";
import { VirtualSpendingCard, CardColorVariant } from "@/components/VirtualSpendingCard";
import { useMandate } from "@/context/MandateContext";
import { FundAndWithdrawModals } from "@/components/FundAndWithdrawModals";
import { AgentExecutionModal } from "@/components/AgentExecutionModal";
import { AgentToolModal } from "@/components/AgentToolModal";
import { truncateAddress } from "@/lib/formatters";

interface AgentItem {
  id: string;
  name: string;
  description: string;
  purpose: string;
  status: "ACTIVE" | "PAUSED" | "REVOKED";
  type?: string;
  version?: string;
  executionCount?: number;
  lastExecutedAt?: string | null;
  colorVariant?: CardColorVariant;
  wallet: {
    id: string;
    walletId: string;
    nearAccountId: string;
    handoffUrl?: string;
    balanceYocto: string;
    balanceNear: string;
    onchainActive: boolean;
    isInitialized?: boolean;
    initializationStatus?: string;
    isFrozen: boolean;
  } | null;
  mandatesCount: number;
  tasksCount: number;
  createdAt: string;
}

const COLOR_OPTIONS: { id: CardColorVariant; label: string; dotClass: string }[] = [
  { id: "red", label: "Crimson Red", dotClass: "bg-[#FF3B30]" },
  { id: "gold", label: "Champagne Gold", dotClass: "bg-amber-400" },
  { id: "white", label: "Platinum Silver", dotClass: "bg-white" },
  { id: "emerald", label: "Cyber Emerald", dotClass: "bg-emerald-400" },
  { id: "cyan", label: "Deep Sapphire", dotClass: "bg-cyan-400" },
  { id: "purple", label: "Amethyst Obsidian", dotClass: "bg-purple-500" },
];

export default function AgentsPage() {
  const { accountId, sessionToken, refreshData, setIsWalletModalOpen } = useMandate();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPurpose, setNewPurpose] = useState("");
  const [newColor, setNewColor] = useState<CardColorVariant>("red");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Copy address state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fund Modal state
  const [fundModalState, setFundModalState] = useState<{
    isOpen: boolean;
    agentId?: string;
  }>({ isOpen: false });

  // Execution Modal state
  const [executionModalState, setExecutionModalState] = useState<{
    isOpen: boolean;
    agent: AgentItem | null;
  }>({ isOpen: false, agent: null });

  // Tool Permissions Modal state
  const [toolModalState, setToolModalState] = useState<{
    isOpen: boolean;
    agent: AgentItem | null;
  }>({ isOpen: false, agent: null });

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

  const fetchAgents = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/agents", { headers: getHeaders() });
      const data = await res.json();
      if (res.ok && data.success) {
        setAgents(data.agents);
      } else {
        setError(data.error || "Failed to load agents");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load agents");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, [accountId, sessionToken]);

  const handleToggleStatus = async (agent: AgentItem) => {
    const nextStatus = agent.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setAgents((prev) =>
          prev.map((a) => (a.id === agent.id ? { ...a, status: nextStatus } : a))
        );
        refreshData();
      }
    } catch (err: any) {
      console.error("Failed to toggle agent status:", err);
    }
  };

  const handleChangeCardColor = async (agent: AgentItem, colorVariant: CardColorVariant) => {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ colorVariant }),
      });
      if (res.ok) {
        setAgents((prev) =>
          prev.map((a) => (a.id === agent.id ? { ...a, colorVariant } : a))
        );
        refreshData();
      }
    } catch (err: any) {
      console.error("Failed to update agent card color:", err);
    }
  };

  const handleRevokeAgent = async (agent: AgentItem) => {
    if (
      !confirm(
        `Are you sure you want to revoke "${agent.name}"? This permanently closes its custody wallet and pauses all active mandates.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (res.ok) {
        setAgents((prev) =>
          prev.map((a) => (a.id === agent.id ? { ...a, status: "REVOKED" } : a))
        );
        refreshData();
      }
    } catch (err: any) {
      console.error("Failed to revoke agent:", err);
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setCreateError("Please enter an agent name");
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim(),
          purpose: newPurpose.trim(),
          colorVariant: newColor,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setShowCreateModal(false);
        setNewName("");
        setNewDescription("");
        fetchAgents();
        refreshData();
      } else {
        setCreateError(data.error || "Failed to provision agent");
      }
    } catch (err: any) {
      setCreateError(err.message || "Failed to provision agent");
    } finally {
      setIsCreating(false);
    }
  };

  const copyAddress = (address: string, id: string) => {
    navigator.clipboard.writeText(address);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <AppShell>
      <div className="space-y-8 relative">
        {/* Ambient Top Glow */}
        <div
          className="pointer-events-none absolute -top-10 right-0 w-[360px] h-[240px] rounded-full opacity-15 blur-[110px]"
          style={{ background: "#FF3B30" }}
        />

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10 animate-rise">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <Bot className="w-7 h-7 text-[#FF3B30]" />
              AI Agents &amp; Virtual Cards
            </h1>
            <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mt-1">
              Each autonomous agent operates with its own metallic spending card and OutLayer TEE custody wallet.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            {agents.length > 1 && (
              <Link
                href="/coordination"
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:text-slate-950 bg-white hover:bg-slate-50 border border-slate-200 dark:text-[#A1A1AA] dark:hover:text-white dark:bg-[#141417] dark:border-[#232329] dark:hover:border-[#383842] shadow-sm transition-all btn-pop"
              >
                <Network className="w-3.5 h-3.5 text-[#FF3B30]" />
                Multi-Agent Swarm
              </Link>
            )}
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_24px_rgba(255,59,48,0.35)] btn-pop"
            >
              <Plus className="w-4 h-4" />
              Issue New Agent Card
            </button>
          </div>
        </div>

        {/* Security Invariant Callout */}
        <GlowingCard intensity="subtle" innerClassName="p-4" glowPosition="top-left" className="animate-rise stagger-1">
          <div className="flex items-start sm:items-center gap-3 text-xs text-slate-600 dark:text-[#A1A1AA]">
            <Shield className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong className="text-slate-900 dark:text-white font-medium">Instant Kill-Switch Protection:</strong>{" "}
              Freezing an agent&apos;s virtual card immediately blocks all spending proposals and pauses
              governing mandates without leaking custody keys.
            </span>
          </div>
        </GlowingCard>

        {/* Error message */}
        {error && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-[#FF3B30]/10 border border-red-200 dark:border-[#FF3B30]/25 text-xs text-red-600 dark:text-[#FF3B30] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Agents Grid */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-[#FF3B30] animate-spin" />
            <span className="text-xs text-[#A1A1AA]">Loading dedicated agent cards...</span>
          </div>
        ) : agents.length === 0 ? (
          <GlowingCard intensity="medium" innerClassName="p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-[#1C1417] border border-red-200 dark:border-[#FF3B30]/30 flex items-center justify-center mx-auto text-[#FF3B30]">
              <Bot className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">No AI Agents Provisioned Yet</h3>
              <p className="text-xs text-slate-600 dark:text-[#A1A1AA] max-w-sm mx-auto">
                Create an agent to issue its metallic virtual card, configure spending limits, and delegate autonomous tasks.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_18px_rgba(255,59,48,0.35)] btn-pop"
            >
              <Plus className="w-4 h-4" />
              Create First Agent
            </button>
          </GlowingCard>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 relative z-10">
            {agents.map((agent, index) => {
              const isPaused = agent.status === "PAUSED";
              const isRevoked = agent.status === "REVOKED";
              const variant =
                agent.colorVariant ||
                COLOR_OPTIONS[index % COLOR_OPTIONS.length].id;
              const address = agent.wallet?.nearAccountId || "outlayer-vault.testnet";
              const last4 = address.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase() || "8F2A";

              return (
                <GlowingCard
                  key={agent.id}
                  intensity="medium"
                  innerClassName="p-6 space-y-6 flex flex-col justify-between"
                  glowPosition="top-left"
                  className={`animate-pop hover-pop stagger-${(index % 6) + 1}`}
                >
                  {/* Top: Realistic Metallic Virtual Card */}
                  <div className="flex flex-col items-center">
                    <VirtualSpendingCard
                      variant={variant}
                      mandateName={agent.name}
                      agentHolder={agent.purpose || "Autonomous Operations"}
                      vaultAddress={address}
                      cardNumberLast4={last4}
                      totalBudgetNear={agent.wallet?.balanceNear || "0.000"}
                      remainingNear={agent.wallet?.balanceNear || "0.000"}
                      perTxLimitNear="0.100"
                      allowedRecipients={["researcher.near", "oracle.testnet"]}
                      expiresLabel="11/26"
                      status={isRevoked ? "revoked" : "active"}
                      isFrozen={isPaused}
                    />

                    {/* Instant Kill-Switch & Color Palette Controls */}
                    <div className="mt-4 w-full max-w-[430px] flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#141419] border border-white/5">
                      {/* Freeze Button */}
                      {!isRevoked && (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(agent)}
                          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
                            isPaused
                              ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/40"
                              : "bg-[#201013] text-[#FF3B30] hover:bg-[#2C1418] border border-[#FF3B30]/40"
                          }`}
                        >
                          {isPaused ? (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              Unfreeze Virtual Card
                            </>
                          ) : (
                            <>
                              <Ban className="w-3.5 h-3.5 text-[#FF3B30]" />
                              Freeze Virtual Card
                            </>
                          )}
                        </button>
                      )}

                      {/* Color Selector */}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-[10px] font-mono text-[#A1A1AA] hidden sm:inline mr-1">
                          Theme:
                        </span>
                        {COLOR_OPTIONS.map((col) => {
                          const isSelected = variant === col.id;
                          return (
                            <button
                              key={col.id}
                              type="button"
                              onClick={() => handleChangeCardColor(agent, col.id)}
                              title={`Change card theme to ${col.label}`}
                              className={`w-5 h-5 rounded-full ${col.dotClass} transition-transform ${
                                isSelected
                                  ? "ring-2 ring-white ring-offset-2 ring-offset-[#0B0B0B] scale-110"
                                  : "opacity-60 hover:opacity-100"
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Agent Details & Custody Wallet Info */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white tracking-tight">
                            {agent.name}
                          </h4>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 border border-white/10">
                            {agent.type || "research_procurement"}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#A1A1AA] mt-0.5">
                          {agent.description || agent.purpose}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {agent.wallet?.isInitialized || agent.wallet?.onchainActive ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Ready On-Chain
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25">
                            Needs Initial Funding
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dedicated TEE Wallet Address Bar */}
                    <div className="p-3 rounded-xl bg-[#0F0F14] border border-white/5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 block">
                          OutLayer TEE Implicit Address
                        </span>
                        <span className="font-mono text-xs text-white block">
                          {truncateAddress(address, 12, 8)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => copyAddress(address, agent.id)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                          title="Copy address"
                        >
                          {copiedId === agent.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <a
                          href={`https://testnet.nearblocks.io/address/${address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                          title="View on NEARBlocks"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    {/* Counters: Active Mandates & Tasks & Universal Executions */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-xl bg-[#141419] border border-white/5">
                        <span className="text-[10px] text-zinc-400 block">
                          Mandates
                        </span>
                        <span className="text-xs font-bold text-white font-mono">
                          {agent.mandatesCount}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-[#141419] border border-white/5">
                        <span className="text-[10px] text-zinc-400 block">
                          Tasks
                        </span>
                        <span className="text-xs font-bold text-white font-mono">
                          {agent.tasksCount}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-[#141419] border border-white/5">
                        <span className="text-[10px] text-zinc-400 block">
                          Executions
                        </span>
                        <span className="text-xs font-bold text-[#FF3B30] font-mono">
                          {agent.executionCount ?? 0}
                        </span>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
                      {!isRevoked && (
                        <button
                          type="button"
                          onClick={() => handleRevokeAgent(agent)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Revoke
                        </button>
                      )}

                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          type="button"
                          onClick={() => setToolModalState({ isOpen: true, agent })}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 bg-[#16161D] hover:bg-[#202029] border border-white/10 transition-all"
                          title="Manage External Tools & Permissions"
                        >
                          <Wrench className="w-3 h-3 text-[#FF3B30]" />
                          Tools
                        </button>

                        <button
                          type="button"
                          onClick={() => setFundModalState({ isOpen: true, agentId: agent.id })}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 transition-all"
                        >
                          Fund
                        </button>

                        <button
                          type="button"
                          onClick={() => setExecutionModalState({ isOpen: true, agent })}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_16px_rgba(255,59,48,0.35)]"
                        >
                          <Play className="w-3 h-3" />
                          Execute
                        </button>

                        <Link
                          href={`/mandates/new?agentId=${agent.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                        >
                          Mandate
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </GlowingCard>
              );
            })}
          </div>
        )}

        {/* Create Agent Modal with Color Selector */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div
              className="relative w-full max-w-lg rounded-2xl bg-[#0F0F12] border border-[#23232A] p-6 shadow-2xl text-[#E5E7EB] space-y-5"
              style={{
                boxShadow: "0 20px 60px -15px rgba(255, 59, 48, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05)",
              }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-[#1A1416] border border-[#FF3B30]/30 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-[#FF3B30]" />
                    </span>
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      Issue Agent Spending Card
                    </h2>
                  </div>
                  <p className="text-xs text-[#A1A1AA]">
                    Mandate provisions a dedicated OutLayer TEE wallet and custom metallic card.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-white hover:bg-white/5 transition-colors"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateAgent} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Research & Procurement Agent, Treasury Bot"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#141419] border border-[#2A2A34] focus:border-[#FF3B30] text-sm text-white placeholder-zinc-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Primary Domain / Purpose
                  </label>
                  <input
                    type="text"
                    required
                    value={newPurpose}
                    onChange={(e) => setNewPurpose(e.target.value)}
                    placeholder="e.g. Market Intelligence, Dev Infrastructure, Supplier Quotes"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#141419] border border-[#2A2A34] focus:border-[#FF3B30] text-sm text-white placeholder-zinc-500 outline-none transition-all"
                  />
                </div>

                {/* Card Color Theme Picker */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-300 block">
                    Virtual Card Metallic Theme
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {COLOR_OPTIONS.map((col) => {
                      const isSelected = newColor === col.id;
                      return (
                        <button
                          key={col.id}
                          type="button"
                          onClick={() => setNewColor(col.id)}
                          className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                            isSelected
                              ? "bg-white/10 border-white text-white"
                              : "bg-[#141419] border-[#252530] text-zinc-400 hover:text-white"
                          }`}
                        >
                          <span className={`w-4 h-4 rounded-full ${col.dotClass}`} />
                          <span className="text-[10px] font-mono truncate">{col.label.split(" ")[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Description & Assigned Responsibilities
                  </label>
                  <textarea
                    rows={2}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Researches verified services, compares quotes, and proposes payments within policy limits."
                    className="w-full px-3.5 py-2 rounded-xl bg-[#141419] border border-[#2A2A34] focus:border-[#FF3B30] text-sm text-white placeholder-zinc-500 outline-none transition-all resize-none"
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-[#14141A] border border-white/5 flex items-start gap-2.5 text-[11px] text-[#A1A1AA]">
                  <Lock className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
                  <span>
                    When created, OutLayer TEE enclave derives a dedicated hardware-isolated Ed25519 account for this agent.
                  </span>
                </div>

                {createError && (
                  <div className="p-2.5 rounded-lg bg-[#FF3B30]/10 border border-[#FF3B30]/25 text-xs text-[#FF3B30] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{createError}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isCreating || !newName.trim()}
                    className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(255,59,48,0.35)] flex items-center gap-2"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Provisioning Card...
                      </>
                    ) : (
                      <>
                        Issue Agent Card
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Fund Agent Modal */}
        <FundAndWithdrawModals
          isOpen={fundModalState.isOpen}
          mode="fund"
          onClose={() => setFundModalState({ isOpen: false })}
        />

        {/* Universal Agent Execution Modal */}
        <AgentExecutionModal
          isOpen={executionModalState.isOpen}
          agent={executionModalState.agent}
          onClose={() => setExecutionModalState({ isOpen: false, agent: null })}
          onSuccess={() => {
            fetchAgents();
            refreshData();
          }}
        />

        {/* Agent Tool Permissions Modal */}
        <AgentToolModal
          isOpen={toolModalState.isOpen}
          agent={toolModalState.agent}
          onClose={() => setToolModalState({ isOpen: false, agent: null })}
          getHeaders={getHeaders}
        />
      </div>
    </AppShell>
  );
}
