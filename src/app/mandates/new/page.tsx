"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Plus,
  X,
  Calendar,
  AlertCircle,
  ShieldCheck,
  Bot,
  Wallet,
  ArrowRight,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlowingCard } from "@/components/GlowingCard";
import { VirtualSpendingCard } from "@/components/VirtualSpendingCard";
import { useMandate } from "@/context/MandateContext";
import { nearToYocto, yoctoToNear } from "@/lib/yocto";
import { formatAccountOrName, truncateAddress } from "@/lib/formatters";

function CreateMandateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { createMandate, accountId, agentWallets, userProfile } = useMandate();

  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [name, setName] = useState("");
  const [budgetNear, setBudgetNear] = useState("");
  const [perTxLimitNear, setPerTxLimitNear] = useState("");
  const [approvalThresholdNear, setApprovalThresholdNear] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [expiresDate, setExpiresDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qAgentId = searchParams.get("agentId");
    if (qAgentId) {
      setSelectedAgentId(qAgentId);
    } else if (agentWallets.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agentWallets[0].agentId);
    }
  }, [searchParams, agentWallets]);

  const selectedAgent =
    agentWallets.find((w) => w.agentId === selectedAgentId) || agentWallets[0];

  const handleAddRecipient = () => {
    const cleaned = recipientInput.trim().toLowerCase();
    if (!cleaned) return;
    if (
      !/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(cleaned)
    ) {
      setError(
        "Recipient must be a valid lowercase NEAR account (e.g., researcher.near or oracle.testnet)"
      );
      return;
    }
    if (!recipients.includes(cleaned)) {
      setRecipients([...recipients, cleaned]);
    }
    setRecipientInput("");
    setError(null);
  };

  const handleRemoveRecipient = (target: string) => {
    setRecipients(recipients.filter((r) => r !== target));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedAgent && agentWallets.length > 0) {
      setError("Please select an AI agent for this mandate.");
      return;
    }

    const res = await createMandate({
      name,
      agentId: selectedAgent?.agentId,
      budgetNear,
      perTxLimitNear,
      approvalThresholdNear,
      allowedRecipients: recipients,
      expiresAtIso: `${expiresDate}T23:59:00.000Z`,
    });

    if (!res.ok) {
      setError(res.error || "Could not create mandate.");
      return;
    }

    router.push("/mandates");
  };

  let formattedBudget = "0.000";
  let formattedPerTx = "0.000";
  let formattedThreshold = "0.000";
  let atomicBudgetPreview = "0";
  try {
    atomicBudgetPreview = nearToYocto(budgetNear || "0");
    formattedBudget = yoctoToNear(atomicBudgetPreview, 3);
  } catch {
    formattedBudget = "Invalid";
  }
  try {
    formattedPerTx = yoctoToNear(nearToYocto(perTxLimitNear || "0"), 3);
  } catch {
    formattedPerTx = "Invalid";
  }
  try {
    formattedThreshold = yoctoToNear(
      nearToYocto(approvalThresholdNear || "0"),
      3
    );
  } catch {
    formattedThreshold = "Invalid";
  }

  return (
    <div className="space-y-8 relative">
      <div className="animate-rise">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
          Create New Mandate
        </h1>
        <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mt-1">
          Define spending boundaries and permissions for your AI agent.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-[#FF3B30]/15 border border-red-200 dark:border-[#FF3B30]/35 text-xs text-red-600 dark:text-[#FF3B30] flex items-center gap-2.5 animate-pop">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* No Agents Warning */}
      {agentWallets.length === 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between animate-pop">
          <div className="flex items-center gap-2.5">
            <Bot className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              You do not have any AI agents created yet. Create an agent first to establish its dedicated OutLayer TEE wallet.
            </span>
          </div>
          <Link
            href="/agents"
            className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-900 dark:text-white font-medium text-xs transition-colors btn-pop"
          >
            Create Agent
          </Link>
        </div>
      )}

      {/* Split Layout */}
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
      >
        {/* Left Form Fields */}
        <div className="lg:col-span-7">
          <GlowingCard
            intensity="medium"
            innerClassName="p-6 space-y-5"
            glowPosition="top-left"
            className="animate-pop hover-pop stagger-1"
          >
            {/* 1. Assign to AI Agent */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-[#A1A1AA] mb-2">
                Governing AI Agent
              </label>
              {agentWallets.length > 0 ? (
                <div className="relative">
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-[#26262F] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#FF3B30] shadow-sm"
                  >
                    {agentWallets.map((w) => (
                      <option key={w.agentId} value={w.agentId}>
                        {w.agentName} (Balance: {w.balanceNear} NEAR)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141419] border border-slate-200 dark:border-white/5 text-xs text-slate-600 dark:text-zinc-400">
                  No agents available.{" "}
                  <Link href="/agents" className="text-[#FF3B30] hover:underline font-semibold">
                    Create an agent now
                  </Link>
                </div>
              )}
            </div>

            {/* 2. Mandate Name */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-[#A1A1AA] mb-2">
                Mandate Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="DeFi Research Mandate"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-[#26262F] text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#FF3B30] shadow-sm"
              />
            </div>

            {/* 3. Total Budget */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-[#A1A1AA] mb-2">
                Total Budget (NEAR)
              </label>
              <input
                type="text"
                required
                value={budgetNear}
                onChange={(e) => setBudgetNear(e.target.value)}
                placeholder="0.5"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-[#26262F] text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 font-mono focus:outline-none focus:border-[#FF3B30] shadow-sm"
              />
            </div>

            {/* 4. Limits Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-[#A1A1AA] mb-2">
                  Per-Transaction Limit (NEAR)
                </label>
                <input
                  type="text"
                  required
                  value={perTxLimitNear}
                  onChange={(e) => setPerTxLimitNear(e.target.value)}
                  placeholder="0.1"
                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-[#26262F] text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 font-mono focus:outline-none focus:border-[#FF3B30] shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-[#A1A1AA] mb-2">
                  Approval Required Above (NEAR)
                </label>
                <input
                  type="text"
                  required
                  value={approvalThresholdNear}
                  onChange={(e) => setApprovalThresholdNear(e.target.value)}
                  placeholder="0.05"
                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-[#26262F] text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 font-mono focus:outline-none focus:border-[#FF3B30] shadow-sm"
                />
              </div>
            </div>

            {/* 5. Allowed Recipients */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-[#A1A1AA] mb-2">
                Allowed Recipients
              </label>
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-[#26262F] shadow-sm">
                {recipients.map((rec) => (
                  <span
                    key={rec}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#181316] dark:border-[#FF3B30]/35 text-xs font-mono font-semibold"
                  >
                    {rec}
                    <button
                      type="button"
                      onClick={() => handleRemoveRecipient(rec)}
                      className="text-[#FF3B30] hover:opacity-80"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}

                <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                  <input
                    type="text"
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddRecipient();
                      }
                    }}
                    placeholder="Add account (e.g. oracle.testnet)"
                    className="w-full bg-transparent border-none text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-[#71717A] focus:outline-none font-mono py-1"
                  />
                  <button
                    type="button"
                    onClick={handleAddRecipient}
                    className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 hover:text-slate-950 dark:bg-[#181316] dark:text-[#E5E7EB] dark:hover:text-white dark:hover:bg-[#22191D] border border-slate-200 dark:border-white/10 btn-pop"
                  >
                    Add
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-[#71717A] mt-1.5">
                Proposals to unapproved addresses are blocked by the deterministic policy firewall.
              </p>
            </div>

            {/* 6. Expiration Date */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-[#A1A1AA] mb-2">
                Expiration Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={expiresDate}
                  onChange={(e) => setExpiresDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-[#26262F] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#FF3B30] shadow-sm"
                />
                <Calendar className="w-4 h-4 text-slate-400 dark:text-[#A1A1AA] absolute right-4 top-3.5 pointer-events-none" />
              </div>
            </div>
          </GlowingCard>
        </div>

        {/* Right Live Virtual Card + Policy Summary */}
        <div className="lg:col-span-5 space-y-5">
          <VirtualSpendingCard
            compact
            mandateName={name || "New Mandate"}
            agentHolder={selectedAgent?.agentName || formatAccountOrName(accountId, userProfile?.displayName)}
            vaultAddress={selectedAgent?.nearAccountId || "outlayer-vault.testnet"}
            totalBudgetNear={
              formattedBudget !== "Invalid" ? formattedBudget : "0.000"
            }
            spentNear="0.000"
            remainingNear={
              formattedBudget !== "Invalid" ? formattedBudget : "0.000"
            }
            perTxLimitNear={
              formattedPerTx !== "Invalid" ? formattedPerTx : "0.000"
            }
            approvalThresholdNear={
              formattedThreshold !== "Invalid" ? formattedThreshold : "0.000"
            }
            allowedRecipients={recipients.length > 0 ? recipients : ["none"]}
            expiresLabel="11/26"
            status="active"
          />

          <GlowingCard
            intensity="strong"
            innerClassName="p-6 space-y-5"
            glowPosition="bottom-right"
            className="animate-pop hover-pop stagger-2"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.07] pb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Policy Summary
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                Fail-Closed Engine
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
                <div>
                  <div className="text-slate-500 dark:text-[#A1A1AA]">Governing Agent</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    {selectedAgent?.agentName || "Primary Agent"}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
                <div>
                  <div className="text-slate-500 dark:text-[#A1A1AA]">Total Authorized Budget</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white font-mono mt-0.5">
                    {formattedBudget} NEAR
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
                <div>
                  <div className="text-slate-500 dark:text-[#A1A1AA]">Per-Transaction Limit</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white font-mono mt-0.5">
                    {formattedPerTx} NEAR
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
                <div>
                  <div className="text-slate-500 dark:text-[#A1A1AA]">Human Approval Threshold</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white font-mono mt-0.5">
                    &gt; {formattedThreshold} NEAR
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
                <div>
                  <div className="text-slate-500 dark:text-[#A1A1AA]">Allowlisted Recipients</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    {recipients.length} approved account{recipients.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] text-[11px] font-mono text-slate-600 dark:text-[#A1A1AA] truncate">
              Atomic Budget: {atomicBudgetPreview} yoctoNEAR
            </div>
          </GlowingCard>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/mandates"
              className="px-5 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 dark:text-[#E5E7EB] dark:bg-[#161215] dark:hover:bg-[#1E181C] dark:border-white/10 transition-colors btn-pop"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_24px_rgba(255,59,48,0.4)] btn-pop"
            >
              Issue Mandate
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function CreateMandatePage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-20 text-center text-xs text-zinc-500">Loading mandate creation form...</div>}>
        <CreateMandateForm />
      </Suspense>
    </AppShell>
  );
}
