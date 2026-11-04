"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Plus,
  MoreHorizontal,
  ShieldCheck,
  Ban,
  ArrowUpRight,
  Bot,
  Play,
  Pause,
  ExternalLink,
  Scale,
  Clock,
  AlertCircle,
  CheckCircle2,
  Settings,
  X,
  History,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ModalPortal } from "@/components/ModalPortal";
import { GlowingCard } from "@/components/GlowingCard";
import { MandateMark } from "@/components/MandateLogo";
import { useMandate } from "@/context/MandateContext";
import { yoctoToNear, subYocto, addYocto } from "@/lib/yocto";
import { truncateAddress } from "@/lib/formatters";

export default function MandatesPage() {
  const { mandates, revokeMandate, togglePauseMandate, accountId, sessionToken } = useMandate();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Edit Mandate Modal state
  const [editingMandate, setEditingMandate] = useState<any | null>(null);
  const [editBudgetNear, setEditBudgetNear] = useState<string>("");
  const [editPerTxLimitNear, setEditPerTxLimitNear] = useState<string>("");
  const [editApprovalThresholdNear, setEditApprovalThresholdNear] = useState<string>("");
  const [editExpiresAt, setEditExpiresAt] = useState<string>("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  const openEditModal = (m: any) => {
    setEditingMandate(m);
    setEditBudgetNear(yoctoToNear(m.budgetAtomic, 3));
    setEditPerTxLimitNear(yoctoToNear(m.perTxLimitAtomic, 3));
    setEditApprovalThresholdNear(yoctoToNear(m.approvalThresholdAtomic, 3));
    setEditExpiresAt(new Date(m.expiresAtIso).toISOString().slice(0, 10));
    setEditError(null);
    setOpenMenuId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingMandate) return;
    setIsSubmittingEdit(true);
    setEditError(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accountId) headers["x-near-account"] = accountId;
      if (sessionToken) headers["x-session-token"] = sessionToken;

      const res = await fetch(`/api/mandates/${editingMandate.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          totalBudgetNear: editBudgetNear,
          perTxLimitNear: editPerTxLimitNear,
          approvalThresholdNear: editApprovalThresholdNear,
          expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : undefined,
          reason: "User updated mandate parameters via UI controls",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update mandate configuration");
      }

      setEditingMandate(null);
      window.location.reload();
    } catch (err: any) {
      setEditError(err.message || "Failed to save mandate updates");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Filter mandates by status tab
  const filteredMandates = mandates.filter((m) => {
    const s = m.status.toLowerCase();
    if (statusFilter === "active") return s === "active";
    if (statusFilter === "paused") return s === "paused";
    if (statusFilter === "terminal") {
      return (
        s === "revoked" ||
        s === "expired" ||
        s === "budget_exhausted" ||
        s === "completed"
      );
    }
    return true;
  });

  return (
    <AppShell>
      <div className="space-y-8 relative">
        <div
          className="pointer-events-none absolute -top-10 right-0 w-[360px] h-[240px] rounded-full opacity-15 blur-[110px]"
          style={{ background: "#FF3B30" }}
        />

        {/* Header matching Screen 03 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10 animate-rise">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Spending Mandates
            </h1>
            <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mt-1">
              Autonomous lifecycle, multi-transaction limits, and policy bounds for your AI agents.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <Link
              href="/governance"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 dark:text-[#A1A1AA] dark:hover:text-white dark:bg-[#141417] dark:border-[#232329] dark:hover:border-[#383842] shadow-sm transition-all btn-pop"
            >
              <Scale className="w-3.5 h-3.5 text-[#FF3B30]" />
              Policy Governance
            </Link>
            <Link
              href="/mandates/new"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_24px_rgba(255,59,48,0.35)] btn-pop"
            >
              <Plus className="w-4 h-4" />
              Create Mandate
            </Link>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/[0.06] pb-3 text-xs animate-rise stagger-1">
          {[
            { id: "all", label: `All Mandates (${mandates.length})` },
            { id: "active", label: `Active (${mandates.filter((m) => m.status === "active").length})` },
            { id: "paused", label: `Paused (${mandates.filter((m) => m.status === "paused").length})` },
            {
              id: "terminal",
              label: `Closed / Terminal (${
                mandates.filter(
                  (m) =>
                    m.status === "revoked" ||
                    m.status === "expired" ||
                    m.status === "budget_exhausted" ||
                    m.status === "completed"
                ).length
              })`,
            },
          ].map((tab, idx) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all btn-pop stagger-${idx + 1} ${
                statusFilter === tab.id
                  ? "bg-red-50 text-[#FF3B30] border border-red-200 font-bold dark:bg-[#22171A] dark:text-white dark:border-[#FF3B30]/40 shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-[#A1A1AA] dark:hover:text-white dark:hover:bg-white/[0.04]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Mandate Cards List in GlowingCard */}
        <div className="space-y-4 relative z-10">
          {filteredMandates.length === 0 ? (
            <GlowingCard intensity="subtle" innerClassName="p-12 text-center space-y-4" glowPosition="none">
              <div className="w-12 h-12 rounded-2xl bg-[#181316] border border-[#FF3B30]/30 text-[#FF3B30] flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">No Spending Mandates in View</h3>
                <p className="text-xs text-[#A1A1AA] max-w-md mx-auto">
                  Mandates establish strict spending authorities, budgets, per-transaction limits, and whitelist recipients for your autonomous agents.
                </p>
              </div>
              <Link
                href="/mandates/new"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_24px_rgba(255,59,48,0.35)]"
              >
                <Plus className="w-4 h-4" />
                Create New Mandate
              </Link>
            </GlowingCard>
          ) : (
            filteredMandates.map((m) => {
              const totalNear = yoctoToNear(m.budgetAtomic, 3);
              const perTxNear = yoctoToNear(m.perTxLimitAtomic, 3);
              const spentNear = yoctoToNear(m.spentAtomic, 3);
              const reservedNear = yoctoToNear(m.reservedAtomic || "0", 3);
              const committedYocto = addYocto(m.spentAtomic, m.reservedAtomic || "0");
              const remainingNear = yoctoToNear(
                subYocto(m.budgetAtomic, committedYocto),
                3
              );
              const thresholdNear = yoctoToNear(m.approvalThresholdAtomic, 3);
              const expiryFormatted = new Date(m.expiresAtIso).toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }
              );

              // Percentage for progress bar
              const totalBig = BigInt(m.budgetAtomic || "1");
              const spentBig = BigInt(m.spentAtomic || "0");
              const reservedBig = BigInt(m.reservedAtomic || "0");
              const spentPct = totalBig > BigInt(0) ? Number((spentBig * BigInt(100)) / totalBig) : 0;
              const reservedPct = totalBig > BigInt(0) ? Number((reservedBig * BigInt(100)) / totalBig) : 0;

              const statusLower = m.status.toLowerCase();
              const isPaused = statusLower === "paused";
              const isRevoked = statusLower === "revoked";
              const isExpired = statusLower === "expired";
              const isExhausted = statusLower === "budget_exhausted";
              const isCompleted = statusLower === "completed";
              const isDraft = statusLower === "draft";
              const isTerminal = isRevoked || isCompleted;

              return (
                <GlowingCard
                  key={m.id}
                  intensity={statusLower === "active" ? "medium" : "subtle"}
                  glowPosition="top-right"
                  className={`animate-pop hover-pop stagger-${((m.id.charCodeAt(0) || 1) % 6) + 1}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-[#181316] border border-red-200 dark:border-[#FF3B30]/35 flex items-center justify-center shrink-0 mt-0.5">
                        <MandateMark className="w-6 h-5" />
                      </div>

                      <div className="space-y-3 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                            {m.name}
                          </h2>
                          {m.agentName && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-100 text-slate-700 border border-slate-200 dark:bg-[#141419] dark:text-zinc-300 dark:border-white/10">
                              <Bot className="w-3 h-3 text-[#FF3B30]" />
                              {m.agentName}
                            </span>
                          )}
                          {m.providerPolicyConfirmed && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#181316] dark:text-[#E5E7EB] dark:border-[#FF3B30]/30 font-semibold">
                              <ShieldCheck className="w-3 h-3 text-emerald-500" />
                              TEE Enclave Protected
                            </span>
                          )}
                        </div>

                        {/* Financial Ledger Breakdown Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/[0.05] text-xs">
                          <div>
                            <span className="text-slate-500 dark:text-zinc-500 block text-[10px] uppercase tracking-wider font-semibold">Authorized</span>
                            <span className="text-slate-900 dark:text-white font-mono font-bold">{totalNear} NEAR</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-zinc-500 block text-[10px] uppercase tracking-wider font-semibold">Confirmed Spent</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{spentNear} NEAR</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-zinc-500 block text-[10px] uppercase tracking-wider font-semibold">Active Reserved</span>
                            <span className="text-amber-600 dark:text-amber-400 font-mono font-bold">{reservedNear} NEAR</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-zinc-500 block text-[10px] uppercase tracking-wider font-semibold">Available Uncommitted</span>
                            <span className="text-slate-900 dark:text-white font-mono font-bold">{remainingNear} NEAR</span>
                          </div>
                        </div>

                        {/* Multi-segment Budget Consumption Bar */}
                        <div className="space-y-1">
                          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden flex">
                            <div
                              style={{ width: `${Math.min(spentPct, 100)}%` }}
                              className="bg-emerald-500 transition-all duration-300"
                              title={`Spent: ${spentPct}%`}
                            />
                            <div
                              style={{ width: `${Math.min(reservedPct, 100 - spentPct)}%` }}
                              className="bg-amber-400 transition-all duration-300"
                              title={`Reserved: ${reservedPct}%`}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                            <span>Per Tx: {perTxNear} NEAR · Threshold: {thresholdNear} NEAR</span>
                            <span>{spentPct}% consumed</span>
                          </div>
                        </div>

                        <div className="pt-1 space-y-1 text-xs text-[#A1A1AA]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>Governing Custody:</span>
                            <span className="text-[#E5E7EB] font-mono text-[11px]">
                              {truncateAddress(m.walletAddress, 10, 6)}
                            </span>
                            <a
                              href={`https://testnet.nearblocks.io/address/${m.walletAddress}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-zinc-500 hover:text-white"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <div>
                            Allowed recipients:{" "}
                            <span className="text-[#E5E7EB] font-mono">
                              {m.allowedRecipients.length > 0
                                ? m.allowedRecipients.includes("*")
                                  ? "All verified NEAR accounts (*)"
                                  : m.allowedRecipients.map((r) => truncateAddress(r, 8, 4)).join(", ")
                                : "None specified"}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span>Expires: {expiryFormatted}</span>
                            <span>·</span>
                            <Link
                              href={`/activity?mandateId=${m.id}`}
                              className="inline-flex items-center gap-1 text-[#FF3B30] hover:underline"
                            >
                              <History className="w-3 h-3" />
                              View Spending Activity
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Status Badge + Action Menu */}
                    <div className="flex items-center gap-3 self-end sm:self-start">
                      {statusLower === "active" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Active
                        </span>
                      ) : statusLower === "paused" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Paused
                        </span>
                      ) : statusLower === "budget_exhausted" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Budget Exhausted
                        </span>
                      ) : statusLower === "expired" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
                          <Clock className="w-3.5 h-3.5" />
                          Expired
                        </span>
                      ) : statusLower === "draft" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-sky-500/15 text-sky-400 border border-sky-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                          Draft
                        </span>
                      ) : statusLower === "completed" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-teal-500/15 text-teal-400 border border-teal-500/30">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30">
                          <Ban className="w-3.5 h-3.5" />
                          Revoked
                        </span>
                      )}

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuId(openMenuId === m.id ? null : m.id)
                          }
                          className="p-2 rounded-xl bg-[#181316] hover:bg-[#22191D] border border-[#FF3B30]/30 text-[#A1A1AA] hover:text-white transition-colors"
                          aria-label="Mandate options"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {openMenuId === m.id && (
                          <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#161215] border border-[#FF3B30]/40 shadow-2xl py-1.5 z-20">
                            <Link
                              href={`/tasks?mandateId=${m.id}`}
                              className="flex items-center justify-between px-3.5 py-2 text-xs text-[#E5E7EB] hover:bg-white/[0.05]"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <span>Run Task on Mandate</span>
                              <ArrowUpRight className="w-3.5 h-3.5 text-[#A1A1AA]" />
                            </Link>

                            <button
                              type="button"
                              onClick={() => openEditModal(m)}
                              className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-[#E5E7EB] hover:bg-white/[0.05] text-left"
                            >
                              <Settings className="w-3.5 h-3.5 text-zinc-400" />
                              Edit Parameters
                            </button>

                            {!isTerminal && (
                              <button
                                type="button"
                                onClick={() => {
                                  togglePauseMandate(m.id, m.status);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-zinc-300 hover:bg-white/[0.05] text-left"
                              >
                                {isPaused ? (
                                  <>
                                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                                    Resume Mandate
                                  </>
                                ) : (
                                  <>
                                    <Pause className="w-3.5 h-3.5 text-amber-400" />
                                    Pause Mandate
                                  </>
                                )}
                              </button>
                            )}

                            {!isTerminal && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Revoke mandate "${m.name}"? All future spending will be prohibited.`)) {
                                    revokeMandate(m.id);
                                  }
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-[#FF3B30] hover:bg-[#FF3B30]/10 text-left"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                Revoke Mandate
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </GlowingCard>
              );
            })
          )}
        </div>
      </div>

      {/* Edit Mandate Parameters Modal */}
      <ModalPortal
        isOpen={Boolean(editingMandate)}
        onClose={() => setEditingMandate(null)}
        maxWidth="max-w-md"
      >
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#232329]">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Edit Mandate Configuration</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{editingMandate?.name}</p>
          </div>
          <button
            type="button"
            onClick={() => setEditingMandate(null)}
            className="text-slate-400 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {editError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-500 dark:text-red-400">
            {editError}
          </div>
        )}

        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 dark:text-zinc-400 mb-1">Total Authorized Budget (NEAR)</label>
            <input
              type="text"
              value={editBudgetNear}
              onChange={(e) => setEditBudgetNear(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-[#FF3B30]"
            />
          </div>

          <div>
            <label className="block text-slate-700 dark:text-zinc-400 mb-1">Per-Transaction Limit (NEAR)</label>
            <input
              type="text"
              value={editPerTxLimitNear}
              onChange={(e) => setEditPerTxLimitNear(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-[#FF3B30]"
            />
          </div>

          <div>
            <label className="block text-slate-700 dark:text-zinc-400 mb-1">Approval Threshold (NEAR)</label>
            <input
              type="text"
              value={editApprovalThresholdNear}
              onChange={(e) => setEditApprovalThresholdNear(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-[#FF3B30]"
            />
          </div>

          <div>
            <label className="block text-slate-700 dark:text-zinc-400 mb-1">Expiration Date</label>
            <input
              type="date"
              value={editExpiresAt}
              onChange={(e) => setEditExpiresAt(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-[#FF3B30]"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => setEditingMandate(null)}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveEdit}
            disabled={isSubmittingEdit}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all disabled:opacity-50"
          >
            {isSubmittingEdit ? "Saving Changes..." : "Save Parameters"}
          </button>
        </div>
      </ModalPortal>
    </AppShell>
  );
}
