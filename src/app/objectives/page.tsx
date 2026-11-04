"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Target,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Play,
  Pause,
  ArrowRight,
  Shield,
  Layers,
  ChevronRight,
  Filter,
  Check,
  X,
  FileText,
  Sparkles,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlowingCard } from "@/components/GlowingCard";
import { useMandate } from "@/context/MandateContext";
import { yoctoToNear } from "@/lib/yocto";

interface ObjectiveItem {
  id: string;
  title: string;
  description?: string;
  originalPrompt: string;
  category: string;
  status: string;
  priority: string;
  mandate?: { id: string; name: string } | null;
  currentPlan?: {
    id: string;
    version: number;
    status: string;
    summary: string;
    riskClassification: string;
  } | null;
  progressPercent: number;
  stepsCount: number;
  criteriaCount: number;
  createdAt: string;
}

const CATEGORIES = [
  "ALL",
  "PROCUREMENT",
  "RESEARCH",
  "TREASURY",
  "FINANCE",
  "OPERATIONS",
  "MONITORING",
  "CUSTOM",
];

export default function ObjectivesPage() {
  const { accountId, sessionToken, mandates } = useMandate();
  const [objectives, setObjectives] = useState<ObjectiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedMandateId, setSelectedMandateId] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [maxBudget, setMaxBudget] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (accountId) headers["x-near-account"] = accountId;
    if (sessionToken) headers["x-session-token"] = sessionToken;
    return headers;
  }, [accountId, sessionToken]);

  const loadObjectives = useCallback(async () => {
    try {
      const res = await fetch("/api/objectives", { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setObjectives(data.objectives || []);
      }
    } catch (err) {
      console.error("Failed to load objectives:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    loadObjectives();
  }, [loadObjectives]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadObjectives();
  };

  const handleCreateObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setCreateError("Please enter an objective prompt.");
      return;
    }

    setIsSubmitting(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/objectives", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          prompt: prompt.trim(),
          mandateId: selectedMandateId || undefined,
          priority,
          constraints: maxBudget ? { maxBudgetNear: maxBudget } : {},
          autoPlan: true,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to create objective");
      }

      setIsCreateOpen(false);
      setPrompt("");
      setMaxBudget("");
      await loadObjectives();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filtered = objectives.filter((obj) => {
    const matchesCategory = activeTab === "ALL" || obj.category.toUpperCase() === activeTab;
    const matchesSearch =
      obj.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      obj.originalPrompt.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const activeCount = objectives.filter((o) => o.status === "ACTIVE").length;
  const awaitingCount = objectives.filter((o) => o.status === "AWAITING_USER_APPROVAL").length;
  const completedCount = objectives.filter((o) => o.status === "COMPLETED").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">DRAFT</span>;
      case "ACTIVE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">ACTIVE</span>;
      case "PLANNING":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">PLANNING</span>;
      case "READY":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">READY</span>;
      case "RUNNING":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 animate-pulse">RUNNING</span>;
      case "AWAITING_APPROVAL":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">AWAITING APPROVAL</span>;
      case "PAUSED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">PAUSED</span>;
      case "COMPLETED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">COMPLETED</span>;
      case "FAILED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">FAILED</span>;
      case "CANCELLED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-900 text-zinc-500 border border-zinc-800">CANCELLED</span>;
      case "REQUIRES_INTERVENTION":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/40">REQUIRES INTERVENTION</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">{status}</span>;
    }
  };

  const handleLifecycleAction = async (objectiveId: string, action: "activate" | "pause" | "resume" | "cancel") => {
    try {
      const res = await fetch(`/api/objectives/${objectiveId}/${action}`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!data.success) {
        alert(`Action failed: ${data.error}`);
      } else {
        await loadObjectives();
      }
    } catch (err: any) {
      alert(`Action error: ${err.message}`);
    }
  };

  return (
    <AppShell>
      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-rise">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/10 dark:border-[#FF3B30]/20">
                <Target className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Universal Objective Engine
              </h1>
            </div>
            <p className="text-sm text-slate-600 dark:text-[#A1A1AA]">
              Define high-level natural language outcomes. Mandate formulates structured, policy-guarded execution plans.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-slate-950 hover:bg-slate-50 dark:border-[#232329] dark:bg-[#141417] dark:text-[#A1A1AA] dark:hover:text-white dark:hover:bg-[#1A1A1E] shadow-sm transition-all disabled:opacity-50 btn-pop"
              title="Refresh Objectives"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-[#FF3B30]" : ""}`} />
            </button>

            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#FF3B30] to-[#E6352B] hover:opacity-95 shadow-lg shadow-[#FF3B30]/20 transition-all btn-pop"
            >
              <Plus className="w-4 h-4" />
              New Objective
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlowingCard className="stagger-1">
            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#A1A1AA]">
                <span>Active Objectives</span>
                <Play className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{activeCount}</div>
              <div className="text-[11px] text-slate-500 dark:text-[#A1A1AA]">Executing through Agent Runtime</div>
            </div>
          </GlowingCard>

          <GlowingCard className="stagger-2">
            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#A1A1AA]">
                <span>Awaiting Plan Approval</span>
                <Clock className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{awaitingCount}</div>
              <div className="text-[11px] text-amber-600 dark:text-amber-400">User review required</div>
            </div>
          </GlowingCard>

          <GlowingCard className="stagger-3">
            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#A1A1AA]">
                <span>Completed</span>
                <CheckCircle2 className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{completedCount}</div>
              <div className="text-[11px] text-slate-500 dark:text-[#A1A1AA]">Verified success criteria</div>
            </div>
          </GlowingCard>

          <GlowingCard className="stagger-4">
            <div className="p-4 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#A1A1AA]">
                <span>Authority Model</span>
                <Shield className="w-4 h-4 text-[#FF3B30]" />
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                Zero Auto-Mandates
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Policy firewall enforced</div>
            </div>
          </GlowingCard>
        </div>

        {/* Filter Pills & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-200 dark:border-[#1E1E24] pb-4 animate-rise stagger-2">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === cat
                    ? "bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30"
                    : "bg-[#141417] text-[#A1A1AA] border border-[#1E1E24] hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <input
              type="text"
              placeholder="Search objectives..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#141417] border border-[#232329] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#71717A] focus:outline-none focus:border-[#FF3B30]/50"
            />
          </div>
        </div>

        {/* Objectives List */}
        {loading ? (
          <div className="p-12 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#FF3B30]" />
            <span>Loading objectives...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[#121215] border border-[#1E1E24] space-y-3">
            <Target className="w-10 h-10 text-[#71717A] mx-auto" />
            <h3 className="text-base font-bold text-white">No Objectives Defined Yet</h3>
            <p className="text-xs text-[#A1A1AA] max-w-md mx-auto">
              Define your first high-level outcome in plain English. The Objective Engine will plan steps and orchestrate execution.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" />
              Define Your First Objective
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filtered.map((obj, idx) => (
              <GlowingCard key={obj.id} className={`animate-pop hover-pop stagger-${(idx % 8) + 1}`}>
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                        {obj.category}
                      </span>
                      {getStatusBadge(obj.status)}
                      <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-500">
                        Priority: {obj.priority}
                      </span>
                      {obj.mandate && (
                        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/20">
                          <Shield className="w-3 h-3" />
                          Mandate: {obj.mandate.name}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                      {obj.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-[#A1A1AA] line-clamp-2">
                      &quot;{obj.originalPrompt}&quot;
                    </p>

                    {/* Progress Bar */}
                    <div className="pt-2 max-w-md space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-zinc-400 font-mono">
                        <span>Progress: {obj.progressPercent}%</span>
                        <span>{obj.stepsCount} steps · {obj.criteriaCount} criteria</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 dark:bg-[#1A1A22] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#FF3B30] to-emerald-400 transition-all duration-500"
                          style={{ width: `${obj.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200 dark:border-[#1E1E24]">
                    {obj.status === "DRAFT" && (
                      <button
                        onClick={() => handleLifecycleAction(obj.id, "activate")}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:border-emerald-500/30 flex items-center gap-1 transition-all btn-pop"
                      >
                        <Play className="w-3 h-3" />
                        <span>Activate</span>
                      </button>
                    )}

                    {["ACTIVE", "RUNNING", "PLANNING", "READY", "AWAITING_APPROVAL"].includes(obj.status) && (
                      <button
                        onClick={() => handleLifecycleAction(obj.id, "pause")}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 dark:text-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:border-zinc-700 flex items-center gap-1 transition-all btn-pop"
                      >
                        <Pause className="w-3 h-3" />
                        <span>Pause</span>
                      </button>
                    )}

                    {obj.status === "PAUSED" && (
                      <button
                        onClick={() => handleLifecycleAction(obj.id, "resume")}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:border-emerald-500/30 flex items-center gap-1 transition-all btn-pop"
                      >
                        <Play className="w-3 h-3" />
                        <span>Resume</span>
                      </button>
                    )}

                    {!["COMPLETED", "FAILED", "CANCELLED"].includes(obj.status) && (
                      <button
                        onClick={() => {
                          if (confirm("Are you sure you want to cancel this objective?")) {
                            handleLifecycleAction(obj.id, "cancel");
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 dark:text-rose-400 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:border-rose-500/30 flex items-center gap-1 transition-all btn-pop"
                        title="Cancel Objective"
                      >
                        <X className="w-3 h-3" />
                        <span>Cancel</span>
                      </button>
                    )}

                    <Link
                      href={`/objectives/${obj.id}`}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-800 hover:text-slate-950 bg-white hover:bg-slate-50 border border-slate-200 dark:text-white dark:bg-[#1A1A22] dark:hover:bg-[#252530] dark:border-[#2E2E3A] shadow-sm flex items-center gap-1.5 transition-all btn-pop"
                    >
                      <span>Details</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#FF3B30]" />
                    </Link>
                  </div>
                </div>
              </GlowingCard>
            ))}
          </div>
        )}

        {/* CREATE OBJECTIVE MODAL */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-xl bg-[#141417] border border-[#232329] rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#232329]">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#FF3B30]" />
                  <span>Define Desired Outcome</span>
                </h3>
                <button
                  onClick={() => setIsCreateOpen(false)}
                  className="text-zinc-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {createError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {createError}
                </div>
              )}

              <form onSubmit={handleCreateObjective} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Describe what you want achieved in natural language
                  </label>
                  <textarea
                    rows={4}
                    placeholder="e.g. Find 3 reliable NEAR blockchain analytics providers, benchmark their features and pricing, and propose procurement for the best option within 2 NEAR budget."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    required
                    className="w-full bg-[#1A1A20] border border-[#2A2A35] rounded-xl p-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#FF3B30]"
                  />
                  <span className="text-[10px] text-zinc-500 block mt-1">
                    Mandate will interpret scope, capabilities, required tools, and formulate an executable plan.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1">
                      Bind Spending Mandate (Optional)
                    </label>
                    <select
                      value={selectedMandateId}
                      onChange={(e) => setSelectedMandateId(e.target.value)}
                      className="w-full bg-[#1A1A20] border border-[#2A2A35] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF3B30]"
                    >
                      <option value="">No financial mandate (Read-only)</option>
                      {mandates
                        .filter((m) => m.status === "active")
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({yoctoToNear(m.budgetAtomic, 2)} NEAR)
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1">
                      Max Budget Constraint (NEAR)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 1.5"
                      value={maxBudget}
                      onChange={(e) => setMaxBudget(e.target.value)}
                      className="w-full bg-[#1A1A20] border border-[#2A2A35] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF3B30]"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-[#232329] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Formulating Plan...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Interpret & Plan</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
