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
  ArrowDownLeft,
  Loader2,
} from "lucide-react";
import { useMandate } from "@/context/MandateContext";
import { useNearWalletSelector } from "@/context/NearWalletSelectorContext";
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
    refreshData,
  } = useMandate();

  const {
    accountId: selectorAccountId,
    walletName,
    signAndSendTransfer,
    openWalletModal,
  } = useNearWalletSelector();

  const [inputAccount, setInputAccount] = useState("");
  const [fundAmount, setFundAmount] = useState("1.0");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedTxHash, setConfirmedTxHash] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualTxHash, setManualTxHash] = useState("");

  const activeConnectedAccount = selectorAccountId || accountId;

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
    setStatusMessage(null);
    try {
      const res = await createAgentWallet();
      if (!res.ok) setErrorMessage(res.error || "Failed to create agent wallet");
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * 1-Click Native NEAR Wallet Funding for Wizard Step 3
   */
  const handleNativeWalletFund = async () => {
    if (!activeConnectedAccount) {
      openWalletModal();
      return;
    }

    if (!agentWallet) {
      setErrorMessage("No dedicated agent custody wallet available.");
      return;
    }

    const requestedAmount = parseFloat(fundAmount);
    if (isNaN(requestedAmount) || requestedAmount <= 0) {
      setErrorMessage("Please enter a valid funding amount greater than zero.");
      return;
    }

    const availableNear = parseFloat(userNearBalance || "0");
    if (availableNear < requestedAmount) {
      setErrorMessage(
        `Insufficient NEAR balance (${userNearBalance} NEAR) in your connected wallet. Please get free testnet tokens from the NEAR Testnet Faucet below.`
      );
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage("Please authorize the transfer in your connected NEAR wallet...");

    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "mandate_pending_funding",
          JSON.stringify({
            amountNear: fundAmount,
            agentId: agentWallet.id,
            targetAddress: agentWallet.nearAccountId,
          })
        );
      }

      const result = await signAndSendTransfer({
        receiverId: agentWallet.nearAccountId,
        amountNear: fundAmount,
      });

      if (result.isRedirect) {
        setStatusMessage("Redirecting to web wallet to confirm transaction...");
        return;
      }

      if (result.txHash) {
        setStatusMessage("Transfer submitted! Verifying on NEAR Testnet RPC...");

        const res = await fetch("/api/wallets/fund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            txHash: result.txHash,
            amountNear: fundAmount,
            agentId: agentWallet.id,
          }),
        });

        const data = await res.json();
        if (data.success) {
          setConfirmedTxHash(result.txHash);
          setStatusMessage(
            `Successfully transferred and confirmed ${fundAmount} NEAR on NEAR Testnet!`
          );
          await refreshData();
          setTimeout(() => refreshData(), 1200);
          setTimeout(() => refreshData(), 2500);
        } else {
          setErrorMessage(data.error || "Funding transaction verification failed.");
        }
      } else {
        setErrorMessage("Wallet transfer was cancelled or did not produce a transaction hash.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Native wallet transfer failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Manual Transaction Hash Confirmation (For external/CLI transfers)
   */
  const handleManualTxConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTxHash.trim() || !agentWallet) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage("Verifying transaction on NEAR RPC...");

    try {
      const res = await fetch("/api/wallets/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          txHash: manualTxHash.trim(),
          amountNear: fundAmount,
          agentId: agentWallet.id,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setConfirmedTxHash(manualTxHash.trim());
        setStatusMessage(`Funding confirmed! Agent wallet balance updated.`);
        await refreshData();
        setTimeout(() => refreshData(), 1200);
      } else {
        setErrorMessage(data.error || "Failed to verify transaction hash.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Verification failed");
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

      {/* STEP 3: Fund Agent (Native NEAR Wallet Signing Flow) */}
      {currentStep === 3 && agentWallet && (
        <div className="space-y-4 max-w-xl">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <span>Step 3: Fund Your Dedicated Agent</span>
              <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                Current Balance: {agentWallet.balanceNear || "0.000"} NEAR
              </span>
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
              Deposit Testnet NEAR from your connected wallet into your agent&apos;s
              dedicated OutLayer TEE custody address. The agent can only spend within the
              exact mandate budget you authorize.
            </p>
          </div>

          {/* Custody & Network Information */}
          <div className="p-4 rounded-xl bg-[#14141A] border border-white/5 space-y-2.5 text-xs">
            <div className="flex justify-between items-center text-[#A1A1AA]">
              <span>Destination TEE Address</span>
              <span className="font-mono text-white text-[11px] bg-white/5 px-2 py-0.5 rounded border border-white/10">
                {agentWallet.nearAccountId.length > 24
                  ? `${agentWallet.nearAccountId.slice(0, 10)}...${agentWallet.nearAccountId.slice(-8)}`
                  : agentWallet.nearAccountId}
              </span>
            </div>
            <div className="flex justify-between items-center text-[#A1A1AA]">
              <span>Funding Source</span>
              <span className="font-mono text-white">
                {truncateAddress(activeConnectedAccount, 8, 6)} ({userNearBalance} NEAR available)
              </span>
            </div>
            <div className="flex justify-between items-center text-[#A1A1AA]">
              <span>Target Network</span>
              <span className="font-mono text-emerald-400">
                NEAR Testnet (No Real-Money Value)
              </span>
            </div>
          </div>

          {/* Amount Input with Quick Selectors */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">
              Transfer Amount (NEAR)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  disabled={isProcessing}
                  className="w-full bg-[#15151B] border border-white/10 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-[#FF3B30] disabled:opacity-50"
                  required
                />
                <span className="absolute right-3.5 top-2.5 text-xs font-mono text-[#A1A1AA]">
                  NEAR
                </span>
              </div>
              {["0.5", "1.0", "2.0"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFundAmount(preset)}
                  disabled={isProcessing}
                  className={`px-3 py-2 text-xs font-mono rounded-xl border transition-all ${
                    fundAmount === preset
                      ? "bg-[#FF3B30]/20 border-[#FF3B30] text-white"
                      : "bg-[#15151B] border-white/10 text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  {preset}N
                </button>
              ))}
            </div>
          </div>

          {/* Status & Feedback Messages */}
          {statusMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-start gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span>{statusMessage}</span>
                {confirmedTxHash && (
                  <div>
                    <a
                      href={`https://testnet.nearblocks.io/txns/${confirmedTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[11px] underline text-emerald-300 hover:text-white"
                    >
                      View on NearBlocks Explorer
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleNativeWalletFund}
              disabled={isProcessing}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)] disabled:opacity-50 flex-1"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Authorizing on NEAR Testnet...</span>
                </>
              ) : (
                <>
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>1-Click Fund {fundAmount} NEAR via {walletName || "Connected Wallet"}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowManualInput((v) => !v)}
              className="px-3.5 py-2.5 rounded-xl text-xs font-medium text-[#A1A1AA] hover:text-white bg-white/5 border border-white/10 transition-colors"
            >
              {showManualInput ? "Hide Manual Input" : "Paste Tx Hash"}
            </button>
          </div>

          {/* Manual Tx Hash Input (For external transfers / CLI) */}
          {showManualInput && (
            <form onSubmit={handleManualTxConfirm} className="p-4 rounded-xl bg-[#14141A] border border-white/10 space-y-3">
              <div className="text-[11px] text-[#A1A1AA]">
                Transferred NEAR to your agent custody account via external wallet or CLI? Enter the verified on-chain transaction hash below:
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 9yPqX2... (base58 NEAR tx hash)"
                  value={manualTxHash}
                  onChange={(e) => setManualTxHash(e.target.value)}
                  className="flex-1 bg-[#15151B] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-[#FF3B30]"
                />
                <button
                  type="submit"
                  disabled={isProcessing || !manualTxHash.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/15 disabled:opacity-50"
                >
                  Verify Deposit
                </button>
              </div>
            </form>
          )}

          {/* Faucet Explainer Link */}
          <div className="pt-1 flex items-center justify-between text-[11px] text-[#A1A1AA]">
            <span>Need Testnet tokens?</span>
            <a
              href="https://faucet.testnet.near.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#FF3B30] hover:underline"
            >
              <span>NEAR Testnet Faucet</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
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
