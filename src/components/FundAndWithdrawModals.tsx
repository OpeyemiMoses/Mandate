"use client";

import React, { useState, useEffect } from "react";
import { ModalPortal } from "./ModalPortal";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Copy,
  AlertCircle,
  X,
  Zap,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useMandate } from "@/context/MandateContext";
import { useNearWalletSelector } from "@/context/NearWalletSelectorContext";
import { truncateAddress } from "@/lib/formatters";

export function FundAndWithdrawModals({
  isOpen,
  mode,
  initialAgentId,
  onClose,
}: {
  isOpen: boolean;
  mode: "fund" | "withdraw";
  initialAgentId?: string;
  onClose: () => void;
}) {
  const { accountId, agentWallets, walletAddress, refreshData } = useMandate();
  const {
    accountId: selectorAccountId,
    walletName,
    openWalletModal,
    signAndSendTransfer,
  } = useNearWalletSelector();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when modal is active to prevent page displacement
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    initialAgentId || (agentWallets[0]?.agentId || "")
  );
  const [amount, setAmount] = useState(mode === "fund" ? "1.0" : "0.5");
  const [txHashInput, setTxHashInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signingWithWallet, setSigningWithWallet] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
    txHash?: string;
  } | null>(null);

  const activeConnectedAccount = selectorAccountId || accountId;

  // Sync initialAgentId when passed
  useEffect(() => {
    if (initialAgentId) {
      setSelectedAgentId(initialAgentId);
    } else if (agentWallets.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agentWallets[0].agentId);
    }
  }, [initialAgentId, agentWallets]);

  const activeWallet =
    agentWallets.find((w) => w.agentId === selectedAgentId) || agentWallets[0];
  const targetWalletAddress =
    activeWallet?.nearAccountId || walletAddress || "outlayer-vault.testnet";

  if (!isOpen || !mounted) return null;

  /**
   * 1-Click Native NEAR Wallet Funding
   * Directly triggers signing from the connected NEAR wallet (MyNearWallet, Meteor, Sender, HERE, Ledger)
   */
  const handleDirectWalletFund = async () => {
    if (!activeConnectedAccount) {
      openWalletModal();
      return;
    }

    setSigningWithWallet(true);
    setFeedback(null);

    try {
      // Store pending funding details in sessionStorage in case of web wallet redirect
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "mandate_pending_funding",
          JSON.stringify({
            amountNear: amount,
            agentId: selectedAgentId || activeWallet?.agentId,
            targetAddress: targetWalletAddress,
          })
        );
      }

      // Initiate native NEAR token transfer via Wallet Selector
      const result = await signAndSendTransfer({
        receiverId: targetWalletAddress,
        amountNear: amount,
      });

      if (result.isRedirect) {
        // Browser wallet (MyNearWallet) is redirecting to wallet confirmation page
        setFeedback({
          type: "success",
          message: "Redirecting to MyNearWallet to approve transaction...",
        });
        return;
      }

      if (result.txHash) {
        // Immediately record and verify funding on Mandate backend
        const res = await fetch("/api/wallets/fund", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-near-account": activeConnectedAccount,
          },
          body: JSON.stringify({
            txHash: result.txHash,
            amountNear: amount,
            agentId: selectedAgentId || activeWallet?.agentId,
          }),
        });

        const data = await res.json();
        if (data.success) {
          setFeedback({
            type: "success",
            message: `Successfully transferred and confirmed ${amount} NEAR directly from ${walletName || "wallet"}.`,
            txHash: result.txHash,
          });
          await refreshData();
          setTimeout(() => refreshData(), 1000);
          setTimeout(() => refreshData(), 2500);
          setTimeout(() => refreshData(), 4500);
        } else {
          setFeedback({
            type: "error",
            message:
              data.error ||
              "Transaction was broadcast but backend verification is pending. Balance will sync shortly.",
            txHash: result.txHash,
          });
        }
      } else {
        throw new Error("No transaction hash returned from wallet");
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Failed to sign transfer with wallet",
      });
    } finally {
      setSigningWithWallet(false);
    }
  };

  /**
   * Manual submission / Withdrawal submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      if (mode === "fund") {
        // User authorizes funding with provided txHash
        const effectiveTxHash = txHashInput.trim();
        const res = await fetch("/api/wallets/fund", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-near-account": activeConnectedAccount || "anonymous.testnet",
          },
          body: JSON.stringify({
            txHash: effectiveTxHash,
            amountNear: amount,
            agentId: selectedAgentId || activeWallet?.agentId,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setFeedback({
            type: "success",
            message: `Successfully confirmed funding for agent wallet. Account balance updated.`,
            txHash: data.funding?.txHash || effectiveTxHash,
          });
          await refreshData();
          setTimeout(() => refreshData(), 1000);
          setTimeout(() => refreshData(), 2500);
          setTimeout(() => refreshData(), 4500);
        } else {
          setFeedback({
            type: "error",
            message: data.error || "Funding transaction failed.",
          });
        }
      } else {
        // Withdrawal of unused funds back to authenticated user's account
        const res = await fetch("/api/wallets/withdraw", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-near-account": activeConnectedAccount,
          },
          body: JSON.stringify({
            amountNear: amount,
            agentId: selectedAgentId || activeWallet?.agentId,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setFeedback({
            type: "success",
            message: `Withdrawal of ${amount} NEAR confirmed back to ${activeConnectedAccount}.`,
            txHash: data.withdrawal?.txHash,
          });
          await refreshData();
        } else {
          setFeedback({
            type: "error",
            message: data.error || "Withdrawal failed.",
          });
        }
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Request failed",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md" customCard={true}>
      <div className="relative w-full max-w-md transform text-left rounded-3xl p-[1px] bg-gradient-to-br from-[#FF3B30]/60 via-[#FF3B30]/20 to-slate-200 dark:to-white/10 shadow-[0_25px_70px_rgba(0,0,0,0.35)] dark:shadow-[0_25px_70px_rgba(0,0,0,0.9)] animate-pop transition-all">
        <div className="relative rounded-[23px] bg-white dark:bg-[#101014] p-6 space-y-5 text-slate-900 dark:text-white border border-slate-200/80 dark:border-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  mode === "fund"
                    ? "bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30"
                    : "bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/15 dark:text-[#FF3B30] dark:border-[#FF3B30]/30"
                }`}
              >
                {mode === "fund" ? (
                  <ArrowDownLeft className="w-5 h-5" />
                ) : (
                  <ArrowUpRight className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  {mode === "fund" ? "Fund Dedicated Agent" : "Withdraw Unused Funds"}
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA]">
                  {mode === "fund"
                    ? "Deposit NEAR into your TEE custody wallet"
                    : "Transfer unreserved NEAR back to your account"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:text-[#A1A1AA] dark:hover:text-white dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Agent Selector Dropdown (if multiple agents exist) */}
            {agentWallets.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-[#A1A1AA] block mb-1">
                  Select Target Agent
                </label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#181820] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-[#FF3B30]"
                >
                  {agentWallets.map((w) => (
                    <option key={w.agentId} value={w.agentId}>
                      {w.agentName} ({w.balanceNear} NEAR)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-[#A1A1AA] block mb-1">
                {mode === "fund" ? "Funding Amount (NEAR)" : "Withdrawal Amount (NEAR)"}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#181820] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:border-[#FF3B30]"
                  required
                />
                <span className="absolute right-3.5 top-2.5 text-xs font-mono text-slate-500 dark:text-[#A1A1AA]">
                  NEAR
                </span>
              </div>
            </div>

            {/* Account and Target Information */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#15151A] border border-slate-200 dark:border-white/5 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]">
                <span>Connected Wallet</span>
                <span className="font-mono text-slate-900 dark:text-white flex items-center gap-1.5">
                  {walletName && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 font-sans font-semibold">
                      {walletName}
                    </span>
                  )}
                  {activeConnectedAccount
                    ? truncateAddress(activeConnectedAccount, 8, 6)
                    : "Not connected"}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600 dark:text-[#A1A1AA]">
                <span>Target Agent Custody</span>
                <div className="flex items-center gap-1.5 font-mono text-slate-900 dark:text-white text-xs">
                  <span className="truncate max-w-[140px]">
                    {targetWalletAddress.slice(0, 8)}...{targetWalletAddress.slice(-6)}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(targetWalletAddress)}
                    className="p-1 hover:text-[#FF3B30] text-slate-400 dark:text-zinc-400 transition-colors"
                    title="Copy full 64-character implicit address"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-[#A1A1AA]">
                <span>Network</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold">NEAR Testnet</span>
              </div>
            </div>

            {/* 1-Click Native Funding Button for Connected Wallets */}
            {mode === "fund" && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleDirectWalletFund}
                  disabled={signingWithWallet || submitting}
                  className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 transition-all shadow-[0_0_20px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2 disabled:opacity-50 btn-pop"
                >
                  {signingWithWallet ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Requesting Wallet Signature...</span>
                    </>
                  ) : activeConnectedAccount ? (
                    <>
                      <Zap className="w-4 h-4 fill-white" />
                      <span>
                        1-Click Fund {amount} NEAR via {walletName || "Connected Wallet"}
                      </span>
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4" />
                      <span>Connect NEAR Wallet for 1-Click Funding</span>
                    </>
                  )}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowManualInput((prev) => !prev)}
                    className="text-[11px] text-slate-500 dark:text-[#A1A1AA] hover:text-slate-900 dark:hover:text-white transition-colors underline"
                  >
                    {showManualInput
                      ? "Hide manual TX hash input"
                      : "Or paste an existing transaction hash manually"}
                  </button>
                </div>

                {showManualInput && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#15151A] border border-slate-200 dark:border-white/5 space-y-2 animate-fade-in">
                    <label className="text-[11px] font-medium text-slate-600 dark:text-[#A1A1AA] block">
                      Manual On-Chain Transaction Hash
                    </label>
                    <input
                      type="text"
                      placeholder="Paste 64-character base58 tx hash..."
                      value={txHashInput}
                      onChange={(e) => setTxHashInput(e.target.value)}
                      className="w-full bg-white dark:bg-[#181820] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-[#FF3B30]"
                    />
                    <button
                      type="submit"
                      disabled={submitting || !txHashInput.trim()}
                      className="w-full py-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-white bg-slate-200 hover:bg-slate-300 dark:bg-[#1F1F26] dark:hover:bg-[#252530] transition-colors disabled:opacity-50 btn-pop"
                    >
                      {submitting ? "Verifying..." : "Verify & Credit Manual Hash"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
                  feedback.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300"
                    : "bg-red-50 border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300"
                }`}
              >
                {feedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#FF3B30] dark:text-red-400" />
                )}
                <div className="flex-1 overflow-hidden">
                  <div>{feedback.message}</div>
                  {feedback.txHash && (
                    <a
                      href={`https://testnet.nearblocks.io/txns/${feedback.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[10px] mt-1.5 text-emerald-700 dark:text-emerald-400 hover:underline truncate max-w-full font-semibold"
                    >
                      <span>Tx: {feedback.txHash}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {mode === "withdraw" && (
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-[#1F1F26] dark:text-[#A1A1AA] dark:hover:text-white transition-colors btn-pop"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !activeConnectedAccount}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_20px_rgba(255,59,48,0.35)] disabled:opacity-50 btn-pop"
                >
                  {submitting ? "Processing..." : "Confirm Withdrawal"}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
