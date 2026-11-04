"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Link2,
  X,
  Sparkles,
  AlertCircle,
  Bot,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlowingCard } from "@/components/GlowingCard";
import { MandateMark } from "@/components/MandateLogo";
import { useMandate, type TaskStatus } from "@/context/MandateContext";
import { yoctoToNear, subYocto } from "@/lib/yocto";
import { truncateAddress } from "@/lib/formatters";

function getStatusBadge(status: TaskStatus) {
  switch (status) {
    case "succeeded":
      return {
        label: "Completed",
        className:
          "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
        dot: "bg-emerald-400",
      };
    case "awaiting_approval":
      return {
        label: "Awaiting Approval",
        className: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
        dot: "bg-amber-400",
      };
    case "executing":
      return {
        label: "In Progress",
        className: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
        dot: "bg-blue-400",
      };
    case "failed":
      return {
        label: "Blocked / Failed",
        className: "bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30",
        dot: "bg-[#FF3B30]",
      };
    default:
      return {
        label: "Pending",
        className: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30",
        dot: "bg-zinc-400",
      };
  }
}

function TasksContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tasks, mandates, createTask, accountId } = useMandate();

  const [showNewModal, setShowNewModal] = useState(false);
  const [taskMode, setTaskMode] = useState<"nl" | "structured">("nl");
  const [nlPrompt, setNlPrompt] = useState("");
  const [mandateId, setMandateId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amountNear, setAmountNear] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync mandateId from searchParams or default to first mandate
  useEffect(() => {
    const qMandateId = searchParams.get("mandateId");
    if (qMandateId && mandates.some((m) => m.id === qMandateId)) {
      setMandateId(qMandateId);
      setShowNewModal(true);
    } else if (mandates.length > 0 && !mandateId) {
      setMandateId(mandates[0].id);
    }
  }, [searchParams, mandates, mandateId]);

  const selectedMandate =
    mandates.find((m) => m.id === mandateId) || mandates[0];

  // Helper when changing selected mandate: adjust recipient default if needed
  const handleSelectMandate = (newId: string) => {
    setMandateId(newId);
    const m = mandates.find((item) => item.id === newId);
    if (m && m.allowedRecipients.length > 0) {
      setRecipient(m.allowedRecipients[0]);
    }
  };

  const applyNlPreset = (type: "analytics" | "oracle" | "free") => {
    if (type === "analytics") {
      setNlPrompt(
        "Find three reliable analytics providers offering blockchain wallet analytics. Compare their features, pricing, and delivery time. Recommend the best option under 0.2 NEAR."
      );
    } else if (type === "oracle") {
      setNlPrompt(
        "Research decentralized oracle providers on NEAR. Compare turn-around latency and reliability. Recommend best data feed provider under 0.15 NEAR."
      );
    } else {
      setNlPrompt(
        "Research top blockchain compliance and KYT analytics providers. Compare their feature sets (research only, no payment)."
      );
    }
    setError(null);
  };

  const applyPreset = (preset: "allowed" | "approval" | "blocked") => {
    const targetRecipient =
      selectedMandate?.allowedRecipients?.[0] || "researcher.near";

    if (preset === "allowed") {
      setTitle("Onchain Liquidity Snapshot");
      setGoal(
        `Query verified DEX liquidity depth from ${targetRecipient} and generate volatility summary.`
      );
      setRecipient(targetRecipient);
      setAmountNear("0.04");
      setPurpose("Autonomous API access within 0.050 NEAR threshold");
    } else if (preset === "approval") {
      setTitle("Institutional Orderbook Archive");
      setGoal(
        `Purchase full 30-day tick-by-tick orderbook archive from ${targetRecipient}.`
      );
      setRecipient(targetRecipient);
      setAmountNear("0.08");
      setPurpose("High-value dataset exceeding 0.050 NEAR approval threshold");
    } else {
      setTitle("Untrusted Scraper Payment Attempt");
      setGoal(
        "Transfer 0.25 NEAR to rogue_scraper.near for unverified scraping feed."
      );
      setRecipient("rogue_scraper.near");
      setAmountNear("0.25");
      setPurpose("Unauthorized recipient violating policy allowlist & per-tx cap");
    }
    setError(null);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (taskMode === "nl") {
        // Natural language research & procurement agent dispatch
        const targetMandateId = mandateId || selectedMandate?.id;
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-near-account": accountId || selectedMandate?.walletAddress || "alice.testnet",
          },
          body: JSON.stringify({
            mandateId: targetMandateId,
            prompt: nlPrompt,
          }),
        });
        const data = await res.json();
        if (data.task?.id) {
          setShowNewModal(false);
          router.push(`/tasks/${data.task.id}`);
          return;
        }
        if (!res.ok) {
          setError(data.message || data.error || "Could not dispatch agent research task.");
        }
      } else {
        const res = await createTask({
          title,
          goal,
          mandateId: mandateId || selectedMandate?.id,
          recipient,
          amountNear,
          purpose,
        });

        if (res.taskId) {
          setShowNewModal(false);
          router.push(`/tasks/${res.taskId}`);
          return;
        }

        if (!res.ok) {
          setError(res.error || "Could not propose task. Please check mandate policies.");
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to dispatch agent task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingBudget = selectedMandate
    ? yoctoToNear(
        subYocto(selectedMandate.budgetAtomic, selectedMandate.spentAtomic),
        3
      )
    : "0.000";

  return (
    <div className="space-y-8 relative">
      <div
        className="pointer-events-none absolute -top-10 right-0 w-[360px] h-[240px] rounded-full opacity-15 blur-[110px]"
        style={{ background: "#FF3B30" }}
      />

      {/* Header matching Screen 05 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10 animate-rise">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Tasks
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mt-1">
            Dispatch, evaluate, and track your autonomous agents&apos; tasks.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewModal((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_24px_rgba(255,59,48,0.35)] self-start sm:self-auto btn-pop"
        >
          <Plus className="w-4 h-4" />
          Dispatch New Task
        </button>
      </div>

      {/* Inline New Task Creator Drawer */}
      {showNewModal && (
        <GlowingCard
          intensity="strong"
          innerClassName="p-6"
          glowPosition="top-right"
        >
          <form onSubmit={handleCreateTask} className="space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#FF3B30]" />
                <h2 className="text-base font-semibold text-white">
                  Dispatch New Agent Task
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-[#A1A1AA] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-2 p-1 rounded-xl bg-[#09090B] border border-white/[0.07] max-w-md">
              <button
                type="button"
                onClick={() => setTaskMode("nl")}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                  taskMode === "nl"
                    ? "bg-[#FF3B30] text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Autonomous Research &amp; Procurement
              </button>
              <button
                type="button"
                onClick={() => setTaskMode("structured")}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                  taskMode === "structured"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Direct Spending Proposal
              </button>
            </div>

            {/* Quick Test Presets */}
            {taskMode === "nl" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[#A1A1AA] mr-1">
                  Agent research presets:
                </span>
                <button
                  type="button"
                  onClick={() => applyNlPreset("analytics")}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/25 hover:bg-[#FF3B30]/20"
                >
                  Analytics (Compare 3 &lt; 0.2 NEAR)
                </button>
                <button
                  type="button"
                  onClick={() => applyNlPreset("oracle")}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-500/25 hover:bg-blue-500/20"
                >
                  Oracle Feeds (&lt; 0.15 NEAR)
                </button>
                <button
                  type="button"
                  onClick={() => applyNlPreset("free")}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20"
                >
                  Compliance (Research Only)
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[#A1A1AA] mr-1">
                  Policy test presets:
                </span>
                <button
                  type="button"
                  onClick={() => applyPreset("allowed")}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20"
                >
                  1. Autonomous (0.040 NEAR)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("approval")}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500/20"
                >
                  2. Approval Gate (0.080 NEAR)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("blocked")}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/25 hover:bg-[#FF3B30]/20"
                >
                  3. Blocked Policy Violation (rogue_scraper.near)
                </button>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-[#FF3B30]/15 border border-[#FF3B30]/35 text-xs text-[#FF3B30] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {taskMode === "nl" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1.5">
                    Governing Mandate Authority
                  </label>
                  <select
                    value={mandateId}
                    onChange={(e) => handleSelectMandate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-[#26262F] text-sm text-white focus:outline-none focus:border-[#FF3B30]"
                  >
                    {mandates.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · Agent: {m.agentName || "Agent"} ({m.status.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selected Mandate Info Pill */}
                {selectedMandate && (
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-[#FF3B30]" />
                      <span className="text-[#A1A1AA]">Governing Agent:</span>
                      <span className="font-medium text-white">
                        {selectedMandate.agentName || "Dedicated Agent"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[#A1A1AA]">
                      <span>
                        Remaining Budget:{" "}
                        <strong className="text-white font-mono">
                          {remainingBudget} NEAR
                        </strong>
                      </span>
                      <span>
                        Per-Tx Cap:{" "}
                        <strong className="text-white font-mono">
                          {yoctoToNear(selectedMandate.perTxLimitAtomic, 2)} NEAR
                        </strong>
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs text-[#A1A1AA]">
                      Autonomous Agent Natural-Language Prompt
                    </label>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      AI proposes · Mandate policy firewall enforces
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    required
                    value={nlPrompt}
                    onChange={(e) => setNlPrompt(e.target.value)}
                    placeholder="e.g. Find three reliable analytics providers offering blockchain wallet analytics. Compare their features, pricing, and delivery time. Recommend the best option under 0.2 NEAR."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-[#26262F] text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#FF3B30] leading-relaxed resize-none"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    The agent conducts genuine web research, ranks verified options with citations, and submits any needed purchase to Mandate&apos;s deterministic 9-point policy gate.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#A1A1AA] mb-1.5">
                      Task Title
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      placeholder="e.g. Research Data Access"
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-[#26262F] text-sm text-white focus:outline-none focus:border-[#FF3B30]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#A1A1AA] mb-1.5">
                      Governing Mandate Authority
                    </label>
                    <select
                      value={mandateId}
                      onChange={(e) => handleSelectMandate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-[#26262F] text-sm text-white focus:outline-none focus:border-[#FF3B30]"
                    >
                      {mandates.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} · Agent: {m.agentName || "Agent"} ({m.status.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Selected Mandate Info Pill */}
                {selectedMandate && (
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-[#FF3B30]" />
                      <span className="text-[#A1A1AA]">Governing Agent:</span>
                      <span className="font-medium text-white">
                        {selectedMandate.agentName || "Dedicated Agent"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[#A1A1AA]">
                      <span>
                        Remaining Budget:{" "}
                        <strong className="text-white font-mono">
                          {remainingBudget} NEAR
                        </strong>
                      </span>
                      <span>
                        Per-Tx Cap:{" "}
                        <strong className="text-white font-mono">
                          {yoctoToNear(selectedMandate.perTxLimitAtomic, 2)} NEAR
                        </strong>
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-[#A1A1AA] mb-1.5">
                    Plain-Language Goal for AI Planner
                  </label>
                  <input
                    type="text"
                    required
                    value={goal}
                    placeholder="e.g. Purchase verified onchain analytics dataset"
                    onChange={(e) => setGoal(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-[#26262F] text-sm text-white focus:outline-none focus:border-[#FF3B30]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-[#A1A1AA] mb-1.5">
                      Proposed Recipient
                    </label>
                    <input
                      type="text"
                      required
                      value={recipient}
                      placeholder="e.g. vendor.testnet"
                      onChange={(e) => setRecipient(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-[#26262F] text-sm font-mono text-white focus:outline-none focus:border-[#FF3B30]"
                    />
                    {selectedMandate && selectedMandate.allowedRecipients.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-zinc-500">Allowed:</span>
                        {selectedMandate.allowedRecipients.map((rec) => (
                          <button
                            key={rec}
                            type="button"
                            onClick={() => setRecipient(rec)}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08]"
                          >
                            {rec}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-[#A1A1AA] mb-1.5">
                      Proposed Amount (NEAR)
                    </label>
                    <input
                      type="text"
                      required
                      value={amountNear}
                      placeholder="0.05"
                      onChange={(e) => setAmountNear(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-[#26262F] text-sm font-mono text-white focus:outline-none focus:border-[#FF3B30]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#A1A1AA] mb-1.5">
                      Payment Purpose
                    </label>
                    <input
                      type="text"
                      required
                      value={purpose}
                      placeholder="e.g. Dataset query fee"
                      onChange={(e) => setPurpose(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-[#26262F] text-sm text-white focus:outline-none focus:border-[#FF3B30]"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#A1A1AA] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {taskMode === "nl" ? "Conducting Research & Policy..." : "Evaluating Policy..."}
                  </>
                ) : (
                  taskMode === "nl" ? "Launch Research & Procurement" : "Plan & Evaluate Policy"
                )}
              </button>
            </div>
          </form>
        </GlowingCard>
      )}

      {/* Task List Cards matching Screen 05 */}
      {tasks.length === 0 ? (
        <GlowingCard intensity="medium" innerClassName="p-10 text-center space-y-3">
          <Bot className="w-8 h-8 text-[#FF3B30] mx-auto" />
          <div className="text-base font-semibold text-white">
            No Tasks Dispatched Yet
          </div>
          <p className="text-xs text-[#A1A1AA] max-w-md mx-auto">
            Give your AI agent a goal and spending intent. Mandate will evaluate the
            proposal against your deterministic spending rules before execution.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#FF3B30] text-white hover:bg-[#E63228]"
            >
              Dispatch First Task
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </GlowingCard>
      ) : (
        <div className="space-y-3.5 relative z-10">
          {tasks.map((task, idx) => {
            const badge = getStatusBadge(task.status);
            return (
              <Link key={task.id} href={`/tasks/${task.id}`} className="block">
                <GlowingCard
                  intensity="medium"
                  innerClassName="p-5 sm:p-6"
                  glowPosition="top-right"
                  className={`animate-pop hover-pop stagger-${(idx % 8) + 1}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-[#181316] border border-red-200 dark:border-[#FF3B30]/35 flex items-center justify-center shrink-0">
                        <MandateMark className="w-6 h-5" />
                      </div>

                      <div className="min-w-0">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                          {task.title}
                        </h2>
                        <div className="text-xs text-slate-600 dark:text-[#A1A1AA] mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>Mandate: {task.mandateName}</span>
                          <span>·</span>
                          <span className="font-mono text-slate-900 dark:text-[#E5E7EB] font-medium">
                            {yoctoToNear(task.amountAtomic, 3)} NEAR →{" "}
                            {truncateAddress(task.recipient, 8, 4)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${badge.className}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}
                        />
                        {badge.label}
                      </span>

                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#A1A1AA]">
                        <span>{task.createdAtLabel}</span>
                        <Link2 className="w-3.5 h-3.5 text-slate-400 dark:text-[#A1A1AA]" />
                      </div>
                    </div>
                  </div>
                </GlowingCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="py-20 text-center text-xs text-zinc-500">Loading tasks...</div>}>
        <TasksContent />
      </Suspense>
    </AppShell>
  );
}
