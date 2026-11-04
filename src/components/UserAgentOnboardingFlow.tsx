"use client";

import React, { useState } from "react";
import {
  Wallet,
  Sparkles,
  ArrowRight,
  Shield,
  Coins,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  RotateCw,
} from "lucide-react";
import { useMandate } from "@/context/MandateContext";
import { GlowingCard } from "./GlowingCard";
import { MandateMark } from "./MandateLogo";
import Link from "next/link";
import { truncateAddress, formatAccountOrName } from "@/lib/formatters";

interface OnboardingFlowProps {
  onComplete?: () => void;
}

export function UserAgentOnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const {
    accountId,
    userProfile,
    userNearBalance,
    agentWallet,
    mandates,
    connectWallet,
    createAgentWallet,
    fundAgentWallet,
    refreshData,
  } = useMandate();

  const [inputAccount, setInputAccount] = useState("");
  const [fundAmount, setFundAmount] = useState("1.0");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Determine current active step:
  // Step 1: Connect Wallet (if no accountId or not connected)
  // Step 2: Create Agent (if no agentWallet)
  // Step 3: Fund Agent (if agent balance is "0")
  // Step 4: Create Mandate (if mandates.length === 0)
  const isWalletConnected = Boolean(accountId && accountId !== "");
  const hasAgent = Boolean(agentWallet);
  const isAgentFunded = Boolean(
    agentWallet && parseFloat(agentWallet.balanceNear) > 0
  );
  const hasMandate = mandates.length > 0;

  const currentStep = !isWalletConnected
    ? 1
    : !hasAgent
    ? 2
    : !isAgentFunded
    ? 3
    : !hasMandate
    ? 4
    : 5;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputAccount.trim()) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await connectWallet(inputAccount.trim());
      if (!res.ok) setErrorMessage(res.error || "Failed to connect wallet");
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateAgent = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await createAgentWallet();
      if (!res.ok) setErrorMessage(res.error || "Failed to create agent wallet");
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFundAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundAmount || parseFloat(fundAmount) <= 0) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await fundAgentWallet(fundAmount);
      if (!res.ok) setErrorMessage(res.error || "Failed to fund agent");
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // If already fully onboarded, show quick status banner
  if (currentStep === 5) {
    return (
      <GlowingCard intensity="subtle" innerClassName="p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white flex items-center gap-2">
              <span>Agent System Active</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-[11px] text-[#A1A1AA] mt-0.5 font-mono">
              User: <span className="text-white">{formatAccountOrName(accountId, userProfile?.displayName)}</span> · Agent:{" "}
              <span className="text-white">
                {agentWallet?.nearAccountId.slice(0, 8)}...{agentWallet?.nearAccountId.slice(-6)}
              </span>{" "}
              ({agentWallet?.balanceNear} NEAR)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/mandates/new"
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-white bg-[#1A1A22] hover:bg-[#252530] border border-white/10 transition-colors"
          >
            + New Mandate
          </Link>
          <button
            onClick={() => refreshData()}
            className="p-2 rounded-xl text-[#A1A1AA] hover:text-white bg-[#141417] border border-white/5 transition-colors"
            title="Refresh Onchain State"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </GlowingCard>
    );
  }

  return (
    <GlowingCard
      intensity="strong"
      glowPosition="top-left"
      innerClassName="p-6 sm:p-8 space-y-6"
    >
      {/* Step Header Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#FF3B30] font-semibold">
            Setup Flow · 4-Step Orchestration
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5">
            Connect &bull; Create Agent &bull; Fund &bull; Set Mandate
          </h2>
        </div>

        {/* 4 Steps Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { num: 1, label: "Connect" },
            { num: 2, label: "Agent" },
            { num: 3, label: "Fund" },
            { num: 4, label: "Mandate" },
          ].map((s) => {
            const isDone = currentStep > s.num;
            const isCurrent = currentStep === s.num;

            return (
              <div
                key={s.num}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono transition-all ${
                  isDone
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : isCurrent
                    ? "bg-[#FF3B30]/20 text-white border border-[#FF3B30] shadow-[0_0_15px_rgba(255,59,48,0.3)]"
                    : "bg-[#141418] text-[#71717A] border border-white/5"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <span>{s.num}.</span>
                )}
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: Connect Wallet */}
      {currentStep === 1 && (
        <div className="space-y-4 max-w-xl">
          <div>
            <h3 className="text-base font-semibold text-white">
              Step 1: Connect your NEAR Account
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
              Connect your personal or team NEAR account (e.g.{" "}
              <code className="text-white bg-white/5 px-1 py-0.5 rounded font-mono">
                alice.testnet
              </code>
              ). Mandate queries real onchain RPC state without ever asking for
              your seed phrase or private keys.
            </p>
          </div>

          <form onSubmit={handleConnect} className="flex gap-2.5">
            <input
              type="text"
              placeholder="e.g. alice.testnet or your-name.near"
              value={inputAccount}
              onChange={(e) => setInputAccount(e.target.value)}
              className="flex-1 bg-[#15151B] border border-white/10 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-[#FF3B30]"
              required
            />
            <button
              type="submit"
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_20px_rgba(255,59,48,0.35)] disabled:opacity-50"
            >
              <Wallet className="w-3.5 h-3.5" />
              {isProcessing ? "Connecting..." : "Connect"}
            </button>
          </form>
        </div>
      )}

      {/* STEP 2: Create Dedicated Agent Wallet */}
      {currentStep === 2 && (
        <div className="space-y-4 max-w-xl">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <span>Step 2: Create Your Dedicated Agent</span>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Connected: {formatAccountOrName(accountId, userProfile?.displayName)}
              </span>
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
              Provision a dedicated Intel TDX enclave wallet via OutLayer TEE.
              Your agent gets its own keyless custody address, completely
              isolated from your personal wallet and other users.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#14141A] border border-white/5 text-xs text-[#A1A1AA] space-y-2">
            <div className="flex items-center justify-between">
              <span>Owner Account</span>
              <span className="font-mono text-white">{truncateAddress(accountId, 8, 6)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Enclave Security</span>
              <span className="text-emerald-400 font-mono">
                Intel TDX &bull; OutLayer TEE
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreateAgent}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_24px_rgba(255,59,48,0.4)] disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {isProcessing ? "Provisioning Agent in TEE..." : "Create Dedicated Agent"}
          </button>
        </div>
      )}

      {/* STEP 3: Fund Agent */}
      {currentStep === 3 && agentWallet && (
        <div className="space-y-4 max-w-xl">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <span>Step 3: Fund Your Agent Wallet</span>
              <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                Balance: 0.000 NEAR
              </span>
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
              Deposit NEAR from your connected account into your agent&apos;s
              dedicated custody address. The agent can only spend up to what you
              fund and authorize.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#14141A] border border-white/5 space-y-2 text-xs">
            <div className="flex justify-between text-[#A1A1AA]">
              <span>Agent Custody Address</span>
              <span className="font-mono text-white">
                {agentWallet.nearAccountId.slice(0, 10)}...{agentWallet.nearAccountId.slice(-8)}
              </span>
            </div>
            <div className="flex justify-between text-[#A1A1AA]">
              <span>Your Account</span>
              <span className="font-mono text-white">{truncateAddress(accountId, 8, 6)}</span>
            </div>
          </div>

          <form onSubmit={handleFundAgent} className="flex gap-2.5">
            <div className="relative flex-1">
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                className="w-full bg-[#15151B] border border-white/10 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-[#FF3B30]"
                required
              />
              <span className="absolute right-3.5 top-2.5 text-xs font-mono text-[#A1A1AA]">
                NEAR
              </span>
            </div>
            <button
              type="submit"
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)] disabled:opacity-50"
            >
              <Coins className="w-3.5 h-3.5" />
              {isProcessing ? "Authorizing..." : "Fund Agent"}
            </button>
          </form>
        </div>
      )}

      {/* STEP 4: Create Mandate */}
      {currentStep === 4 && (
        <div className="space-y-4 max-w-xl">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <span>Step 4: Create a Spending Mandate</span>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Agent Funded: {agentWallet?.balanceNear} NEAR
              </span>
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
              Now define the deterministic rules for your agent: spending cap,
              per-transaction limit, allowlisted recipients, and approval
              thresholds.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Link
              href="/mandates/new"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_24px_rgba(255,59,48,0.4)]"
            >
              <Shield className="w-4 h-4" />
              Create Mandate For Agent
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </GlowingCard>
  );
}
