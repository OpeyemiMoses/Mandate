"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Shield,
  XCircle,
  AlertTriangle,
  Plus,
  Wallet,
  Bot,
  ExternalLink,
  Ban,
  Play,
  Sparkles,
  Check,
  Circle,
  Activity,
  Lock,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlowingCard } from "@/components/GlowingCard";
import { VirtualSpendingCard } from "@/components/VirtualSpendingCard";
import { useMandate } from "@/context/MandateContext";
import { yoctoToNear, subYocto } from "@/lib/yocto";
import { formatAccountOrName, truncateAddress } from "@/lib/formatters";
import { FundAndWithdrawModals } from "@/components/FundAndWithdrawModals";

export default function DashboardPage() {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: "fund" | "withdraw";
  }>({ isOpen: false, mode: "fund" });

  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  const {
    accountId,
    userNearBalance,
    userProfile,
    agentWallet,
    agentWallets,
    totalAgentBalanceNear,
    totalBudgetNear,
    totalSpentNear,
    totalReservedNear,
    totalRemainingNear,
    mandates,
    approvals,
    activities,
    tasks,
    setIsWalletModalOpen,
    toggleAgentFreeze,
  } = useMandate();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const greeting = getGreeting();
  const displayName = formatAccountOrName(accountId, userProfile?.displayName);
  const greetingTitle =
    displayName && displayName !== "Anonymous"
      ? `${greeting}, ${displayName}`
      : `${greeting}!`;

  const activeMandates = mandates.filter((m) => m.status === "active");
  const activeMandatesCount = activeMandates.length;
  const pendingApprovalsCount = approvals.filter(
    (a) => a.status === "pending"
  ).length;
  const primaryMandate = activeMandates[0] || mandates[0];
  const primaryAgent = agentWallets[0];

  const badgeStyles: Record<
    "success" | "info" | "warning" | "error",
    string
  > = {
    success:
      "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    info: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    warning: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    error: "bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30",
  };

  // Onboarding steps progress
  const isWalletConnected = Boolean(accountId);
  const hasAgent = agentWallets.length > 0;
  const hasMandate = mandates.length > 0;
  const hasAgentWallet = agentWallets.some((a) => a.onchainActive || a.isInitialized);
  const hasRunTask = activities.length > 0 || tasks.length > 0;
  const allOnboardingCompleted =
    isWalletConnected && hasAgent && hasMandate && hasAgentWallet && hasRunTask;

  const showOnboarding = !onboardingDismissed && (!allOnboardingCompleted || !isWalletConnected);

  return (
    <AppShell>
      <div className="space-y-8 relative">
        {/* Ambient Glow */}
        <div
          className="pointer-events-none absolute -top-12 right-0 w-[420px] h-[280px] rounded-full opacity-20 blur-[120px]"
          style={{ background: "#FF3B30" }}
        />

        {/* Top Greeting & Quick Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10 animate-rise">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              {greetingTitle}
            </h1>
            <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mt-1">
              Autonomous Treasury Operating System — AI proposes, deterministic policy enforces.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 flex-nowrap shrink-0 overflow-x-auto max-w-full pb-1 sm:pb-0">
            {/* Agent Custody Pill */}
            <div className="h-9 flex items-center gap-2 px-3 sm:px-3.5 rounded-xl bg-white dark:bg-[#141113] border border-[#FF3B30]/30 text-xs text-slate-500 dark:text-[#A1A1AA] shadow-sm whitespace-nowrap shrink-0 animate-pop hover-pop stagger-1">
              <Bot className="w-3.5 h-3.5 text-[#FF3B30] shrink-0" />
              <span className="text-slate-500 dark:text-[#A1A1AA]">Agents:</span>
              <span className="font-mono text-slate-900 dark:text-white font-semibold">
                {totalAgentBalanceNear} NEAR
              </span>
            </div>

            <button
              type="button"
              onClick={() => setModalState({ isOpen: true, mode: "fund" })}
              className="h-9 inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 dark:text-emerald-400 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 dark:border-emerald-500/35 transition-all whitespace-nowrap shrink-0 animate-pop btn-pop stagger-2"
            >
              Fund Agent
            </button>

            <button
              type="button"
              onClick={() => setModalState({ isOpen: true, mode: "withdraw" })}
              className="h-9 inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 dark:text-white dark:bg-[#1A1A22] dark:hover:bg-[#252530] dark:border-white/10 shadow-sm transition-all whitespace-nowrap shrink-0 animate-pop btn-pop stagger-3"
            >
              Withdraw
            </button>

            <Link
              href="/mandates/new"
              className="h-9 inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-4 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_24px_rgba(255,59,48,0.4)] whitespace-nowrap shrink-0 animate-pop btn-pop stagger-4"
            >
              <Plus className="w-4 h-4 shrink-0" />
              Create Mandate
            </Link>
          </div>
        </div>

        {/* Onboarding Journey & 5 Core Questions Card */}
        {showOnboarding && (
          <GlowingCard intensity="strong" glowPosition="top-left" innerClassName="p-6 space-y-5" className="animate-rise stagger-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/[0.08] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-[#FF3B30]/15 text-[#FF3B30]">
                  <Sparkles className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Getting Started with Mandate
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mt-0.5">
                    Your autonomous treasury operating system for AI agents on NEAR.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOnboardingDismissed(true)}
                className="text-xs text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white transition-colors self-start sm:self-auto"
              >
                Dismiss Checklist
              </button>
            </div>

            {/* The 5 Core Questions Answered Directly */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141419] border border-slate-200/80 dark:border-white/5 space-y-1 animate-pop hover-pop stagger-1">
                <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-[#71717A] block">1. What is Mandate?</span>
                <span className="text-xs font-semibold text-slate-900 dark:text-white block">Autonomous Treasury OS</span>
                <span className="text-[11px] text-slate-600 dark:text-[#A1A1AA] block">AI holds zero private keys</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141419] border border-slate-200/80 dark:border-white/5 space-y-1 animate-pop hover-pop stagger-2">
                <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-[#71717A] block">2. Personal Balance</span>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 block">{userNearBalance} NEAR</span>
                <span className="text-[11px] text-slate-600 dark:text-[#A1A1AA] block">Live onchain via RPC</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141419] border border-slate-200/80 dark:border-white/5 space-y-1 animate-pop hover-pop stagger-3">
                <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-[#71717A] block">3. Autonomous Agents</span>
                <span className="text-xs font-semibold text-slate-900 dark:text-white block">{agentWallets.length} Configured</span>
                <span className="text-[11px] text-slate-600 dark:text-[#A1A1AA] block">{hasAgent ? "Dedicated TEE vault ready" : "Prompt to create first agent"}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141419] border border-slate-200/80 dark:border-white/5 space-y-1 animate-pop hover-pop stagger-4">
                <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-[#71717A] block">4. Active Mandates</span>
                <span className="text-xs font-semibold text-slate-900 dark:text-white block">{activeMandatesCount} Enforcing</span>
                <span className="text-[11px] text-slate-600 dark:text-[#A1A1AA] block">{hasMandate ? "Deterministic spending limits" : "Define spending boundaries"}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141419] border border-slate-200/80 dark:border-white/5 space-y-1 animate-pop hover-pop stagger-5">
                <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-[#71717A] block">5. Pending Approvals</span>
                <span className="text-xs font-semibold text-slate-900 dark:text-white block">{pendingApprovalsCount} Awaiting</span>
                <span className="text-[11px] text-slate-600 dark:text-[#A1A1AA] block">{pendingApprovalsCount > 0 ? "Human review required" : "All policies safe"}</span>
              </div>
            </div>

            {/* 5-Step Action Progression */}
            <div className="space-y-2 pt-1">
              <span className="text-xs font-semibold text-slate-900 dark:text-white block">Onboarding Checklist:</span>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {/* Step 1 */}
                <div className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all animate-pop hover-pop stagger-1 ${
                  isWalletConnected
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                    : "bg-red-50/70 dark:bg-[#181316] border-red-200 dark:border-[#FF3B30]/30 text-slate-900 dark:text-white"
                }`}>
                  <span className="flex items-center gap-2">
                    {isWalletConnected ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Circle className="w-3.5 h-3.5 text-[#FF3B30]" />}
                    1. Connect Wallet
                  </span>
                  {!isWalletConnected && (
                    <button
                      type="button"
                      onClick={() => setIsWalletModalOpen(true)}
                      className="text-[11px] font-semibold text-[#FF3B30] hover:underline"
                    >
                      Connect
                    </button>
                  )}
                </div>

                {/* Step 2 */}
                <div className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all animate-pop hover-pop stagger-2 ${
                  hasAgent
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                    : "bg-slate-50 dark:bg-[#141419] border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                }`}>
                  <span className="flex items-center gap-2">
                    {hasAgent ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Circle className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />}
                    2. Create Agent
                  </span>
                  {!hasAgent && (
                    <Link href="/agents" className="text-[11px] font-semibold text-[#FF3B30] hover:underline">
                      Create
                    </Link>
                  )}
                </div>

                {/* Step 3 */}
                <div className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all animate-pop hover-pop stagger-3 ${
                  hasMandate
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                    : "bg-slate-50 dark:bg-[#141419] border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                }`}>
                  <span className="flex items-center gap-2">
                    {hasMandate ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Circle className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />}
                    3. Set Mandate
                  </span>
                  {!hasMandate && (
                    <Link href="/mandates/new" className="text-[11px] font-semibold text-[#FF3B30] hover:underline">
                      Define
                    </Link>
                  )}
                </div>

                {/* Step 4 */}
                <div className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all animate-pop hover-pop stagger-4 ${
                  hasAgentWallet
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                    : "bg-slate-50 dark:bg-[#141419] border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                }`}>
                  <span className="flex items-center gap-2">
                    {hasAgentWallet ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Circle className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />}
                    4. Provision Wallet
                  </span>
                  {!hasAgentWallet && (
                    <Link href="/wallets" className="text-[11px] font-semibold text-[#FF3B30] hover:underline">
                      Provision
                    </Link>
                  )}
                </div>

                {/* Step 5 */}
                <div className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all animate-pop hover-pop stagger-5 ${
                  hasRunTask
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                    : "bg-slate-50 dark:bg-[#141419] border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                }`}>
                  <span className="flex items-center gap-2">
                    {hasRunTask ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Circle className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />}
                    5. Run First Task
                  </span>
                  {!hasRunTask && (
                    <Link href="/tasks" className="text-[11px] font-semibold text-[#FF3B30] hover:underline">
                      Dispatch
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </GlowingCard>
        )}

        {/* 5 Distinct Financial Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 relative z-10">
          {/* 1. Personal NEAR Wallet Balance */}
          <GlowingCard intensity="subtle" glowPosition="top-left" className="stagger-1">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-[#A1A1AA] font-medium flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
                  Personal Wallet
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                {userNearBalance} NEAR
              </div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                Onchain via NEAR RPC
              </div>
            </div>
          </GlowingCard>

          {/* 2. Total Agent Wallet Balances */}
          <GlowingCard intensity="subtle" glowPosition="top-right" className="stagger-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-[#A1A1AA] font-medium flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-[#FF3B30]" />
                  Agent Custody
                </span>
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/15 dark:border-transparent">
                  TEE
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                {totalAgentBalanceNear} NEAR
              </div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                Across {agentWallets.length} agent wallets
              </div>
            </div>
          </GlowingCard>

          {/* 3. Total Authorized Budget */}
          <GlowingCard intensity="medium" glowPosition="top-left" className="stagger-3">
            <div className="space-y-1.5">
              <span className="text-xs text-slate-500 dark:text-[#A1A1AA] font-medium block">
                Authorized Budget
              </span>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                {totalBudgetNear} NEAR
              </div>
              <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                {activeMandatesCount} active mandates
              </div>
            </div>
          </GlowingCard>

          {/* 4. Confirmed Spent */}
          <GlowingCard intensity="medium" glowPosition="top-right" className="stagger-4">
            <div className="space-y-1.5">
              <span className="text-xs text-slate-500 dark:text-[#A1A1AA] font-medium block">
                Confirmed Spent
              </span>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                {totalSpentNear} NEAR
              </div>
              <div className="text-[10px] text-amber-600 dark:text-amber-400/90 font-medium">
                Queue: {totalReservedNear} NEAR
              </div>
            </div>
          </GlowingCard>

          {/* 5. Remaining Authorized Budget */}
          <GlowingCard intensity="strong" glowPosition="bottom-right" className="stagger-5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-[#A1A1AA] font-medium">
                  Remaining Budget
                </span>
                <span className="w-6 h-1 rounded-full bg-[#FF3B30]" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-mono">
                {totalRemainingNear} NEAR
              </div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                Atomic Policy Gate
              </div>
            </div>
          </GlowingCard>
        </div>

        {/* Lower Split: Recent Activity + Right Virtual Card & Summary Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start relative z-10">
          {/* Recent Activity Column */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Recent Activity
              </h2>
              <Link
                href="/activity"
                className="text-xs text-slate-500 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white transition-colors inline-flex items-center gap-1"
              >
                Full audit log
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {activities.length === 0 ? (
              <GlowingCard intensity="subtle" innerClassName="p-10 text-center space-y-3" glowPosition="none">
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-[#181316] border border-red-200 dark:border-[#FF3B30]/30 text-[#FF3B30] flex items-center justify-center mx-auto">
                  <Activity className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">No activity yet.</div>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] max-w-sm mx-auto">
                  Actions, policy evaluations, and settled transactions will appear here as your agents execute tasks.
                </p>
                <div className="pt-2">
                  <Link
                    href="/tasks"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Dispatch First Task
                  </Link>
                </div>
              </GlowingCard>
            ) : (
              <GlowingCard
                intensity="medium"
                innerClassName="p-0 divide-y divide-slate-100 dark:divide-white/[0.06]"
                glowPosition="top-right"
              >
                {activities.slice(0, 5).map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors animate-pop hover-pop stagger-${idx + 1}`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          item.badgeVariant === "success"
                            ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                            : item.badgeVariant === "error"
                            ? "bg-[#FF3B30]/10 border-[#FF3B30]/25 text-[#FF3B30]"
                            : item.badgeVariant === "warning"
                            ? "bg-amber-500/10 border-amber-500/25 text-amber-400"
                            : "bg-blue-500/10 border-blue-500/25 text-blue-400"
                        }`}
                      >
                        {item.badgeVariant === "success" ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : item.badgeVariant === "error" ? (
                          <XCircle className="w-4 h-4" />
                        ) : item.badgeVariant === "warning" ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <Shield className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {item.title}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-[#A1A1AA] truncate mt-0.5">
                          {item.subtitle} · {item.timestampLabel}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {item.amountLabel && (
                        <div className="hidden sm:block text-right">
                          <div className="text-xs font-mono font-semibold text-slate-900 dark:text-white">
                            {item.amountLabel}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-[#A1A1AA]">
                            {item.timestampLabel}
                          </div>
                        </div>
                      )}

                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${
                          badgeStyles[item.badgeVariant]
                        }`}
                      >
                        {item.badgeText}
                      </span>
                    </div>
                  </div>
                ))}
              </GlowingCard>
            )}
          </div>

          {/* Right Column: Active Virtual Spending Card + Mandates & Approvals */}
          <div className="lg:col-span-5 space-y-5">
            {primaryMandate ? (
              <div className="space-y-3 animate-pop hover-pop stagger-1">
                <VirtualSpendingCard
                  variant={(primaryAgent?.colorVariant as any) || "red"}
                  mandateName={primaryMandate.name}
                  agentHolder={primaryAgent?.agentName || formatAccountOrName(accountId, userProfile?.displayName)}
                  vaultAddress={primaryMandate.walletAddress}
                  totalBudgetNear={yoctoToNear(primaryMandate.budgetAtomic, 3)}
                  spentNear={yoctoToNear(primaryMandate.spentAtomic, 3)}
                  remainingNear={yoctoToNear(
                    subYocto(
                      primaryMandate.budgetAtomic,
                      primaryMandate.spentAtomic
                    ),
                    3
                  )}
                  perTxLimitNear={yoctoToNear(
                    primaryMandate.perTxLimitAtomic,
                    3
                  )}
                  approvalThresholdNear={yoctoToNear(
                    primaryMandate.approvalThresholdAtomic,
                    3
                  )}
                  allowedRecipients={primaryMandate.allowedRecipients}
                  expiresLabel="11/26"
                  status={
                    primaryMandate.status === "active" ? "active" : "revoked"
                  }
                  isFrozen={primaryAgent?.agentStatus === "PAUSED"}
                />

                {primaryAgent && (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white dark:bg-[#141419] border border-slate-200 dark:border-white/5 text-xs animate-rise stagger-2">
                    <button
                      type="button"
                      onClick={() => toggleAgentFreeze(primaryAgent.agentId)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors btn-pop ${
                        primaryAgent.agentStatus === "PAUSED"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/35 hover:bg-emerald-500/30"
                          : "bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#1E1113] dark:text-[#FF3B30] dark:border-[#FF3B30]/35 hover:bg-red-100 dark:hover:bg-[#2A1518]"
                      }`}
                    >
                      {primaryAgent.agentStatus === "PAUSED" ? (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          Unfreeze Card
                        </>
                      ) : (
                        <>
                          <Ban className="w-3.5 h-3.5" />
                          Freeze Card
                        </>
                      )}
                    </button>

                    <Link
                      href="/agents"
                      className="text-xs text-slate-600 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white inline-flex items-center gap-1 font-medium"
                    >
                      All Agent Cards ({agentWallets.length})
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <GlowingCard intensity="subtle" innerClassName="p-6 text-center space-y-3" glowPosition="none" className="animate-pop hover-pop stagger-1">
                <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-[#181316] border border-red-200 dark:border-[#FF3B30]/30 text-[#FF3B30] flex items-center justify-center mx-auto">
                  <Shield className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">No Spending Mandates Active</div>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] max-w-sm mx-auto">
                  Mandates define the deterministic spending boundaries, budgets, and per-tx limits for your agents.
                </p>
                <Link
                  href="/mandates/new"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_16px_rgba(255,59,48,0.35)] btn-pop"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Establish First Mandate
                </Link>
              </GlowingCard>
            )}

            <div className="grid grid-cols-2 gap-4">
              <GlowingCard intensity="medium" glowPosition="top-right" className="stagger-3">
                <div className="space-y-3">
                  <div className="text-xs font-medium text-slate-500 dark:text-[#A1A1AA]">
                    Active Mandates
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                      {activeMandatesCount}
                    </span>
                    <Link
                      href="/mandates"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF3B30] hover:underline"
                    >
                      View all
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </GlowingCard>

              <GlowingCard intensity="medium" glowPosition="top-right" className="stagger-4">
                <div className="space-y-3">
                  <div className="text-xs font-medium text-slate-500 dark:text-[#A1A1AA]">
                    Pending Approvals
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                      {pendingApprovalsCount}
                    </span>
                    <Link
                      href="/approvals"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF3B30] hover:underline"
                    >
                      View all
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </GlowingCard>
            </div>

            {/* Autonomous Security Assurance Card */}
            <GlowingCard intensity="subtle" glowPosition="bottom-right" className="stagger-5">
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/15 dark:border-transparent">
                    <Lock className="w-4 h-4" />
                  </span>
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">Fail-Closed Guard</div>
                    <div className="text-[11px] text-slate-600 dark:text-[#A1A1AA]">AI holds zero keys · Atomic yoctoNEAR policy gate</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ENFORCING
                </span>
              </div>
            </GlowingCard>
          </div>
        </div>

        <FundAndWithdrawModals
          isOpen={modalState.isOpen}
          mode={modalState.mode}
          onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
        />
      </div>
    </AppShell>
  );
}
