"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { ModalPortal } from "@/components/ModalPortal";
import Link from "next/link";
import {
  Network,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  Shield,
  Bot,
  RefreshCw,
  Plus,
  X,
  Zap,
} from "lucide-react";

interface CoordinationRunSummary {
  id: string;
  objectiveId: string;
  planVersion: number;
  status: string;
  concurrencyLimit: number;
  totalTasksCount: number;
  activeTasksCount: number;
  completedTasksCount: number;
  failedTasksCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  objective: {
    id: string;
    title: string;
    priority: string;
  };
  mandate?: {
    id: string;
    name: string;
    totalBudgetYocto: string;
    spentYocto: string;
  } | null;
  _count: {
    tasks: number;
    assignments: number;
    handoffs: number;
    artifacts: number;
    events: number;
  };
}

export default function CoordinationCenterPage() {
  const [runs, setRuns] = useState<CoordinationRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ALL");
  const [showModal, setShowModal] = useState(false);
  const [approvedObjectives, setApprovedObjectives] = useState<any[]>([]);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string>("");
  const [concurrency, setConcurrency] = useState<number>(5);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchRuns = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/coordination");
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch (e) {
      console.error("Failed to load runs", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchApprovedObjectives = async () => {
    try {
      const res = await fetch("/api/objectives");
      if (res.ok) {
        const data = await res.json();
        const approved = (data.objectives || []).filter(
          (o: any) => o.plans && o.plans.some((p: any) => p.status === "APPROVED")
        );
        setApprovedObjectives(approved);
        if (approved.length > 0 && !selectedObjectiveId) {
          setSelectedObjectiveId(approved[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load objectives", e);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleOpenModal = () => {
    setShowModal(true);
    setModalError(null);
    fetchApprovedObjectives();
  };

  const handleLaunchRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedObjectiveId) {
      setModalError("Please select an approved objective.");
      return;
    }

    try {
      setSubmitting(true);
      setModalError(null);
      const res = await fetch("/api/coordination", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectiveId: selectedObjectiveId,
          concurrencyLimit: concurrency,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to launch coordination run");
      }

      setShowModal(false);
      fetchRuns();
    } catch (err: any) {
      setModalError(err.message || "Failed to create run");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter runs
  const filteredRuns = runs.filter((r) => {
    if (filter === "ALL") return true;
    return r.status === filter;
  });

  // Calculate statistics
  const activeRunsCount = runs.filter((r) => r.status === "ACTIVE").length;
  const completedRunsCount = runs.filter((r) => r.status === "COMPLETED").length;
  const totalTasksCount = runs.reduce((acc, r) => acc + (r.totalTasksCount || r._count.tasks || 0), 0);
  const totalHandoffsCount = runs.reduce((acc, r) => acc + (r._count.handoffs || 0), 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Active
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case "PAUSED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            Paused
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/20">
            <AlertCircle className="w-3 h-3" />
            Failed
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-300 border border-zinc-500/20">
            {status}
          </span>
        );
    }
  };

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 flex items-center justify-center text-[#FF3B30]">
                <Network className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Multi-Agent Coordination Center
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#1A1A1E] text-[#A1A1AA] border border-[#2A2A30] font-normal">
                    Milestone 6
                  </span>
                </h1>
                <p className="text-sm text-[#A1A1AA]">
                  Coordinate specialist autonomous agents under unified objectives with deterministic financial control.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchRuns}
              className="p-2.5 rounded-xl bg-[#141417] hover:bg-[#1E1E24] border border-[#232329] text-[#A1A1AA] hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleOpenModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-white text-sm font-medium transition-all shadow-lg shadow-[#FF3B30]/20"
            >
              <Plus className="w-4 h-4" />
              New Coordination Run
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-[#121215] border border-[#1E1E24]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#A1A1AA]">Active Runs</span>
              <Network className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-white mt-2">{activeRunsCount}</p>
            <p className="text-[11px] text-[#71717A] mt-1">Executing in parallel</p>
          </div>

          <div className="p-4 rounded-xl bg-[#121215] border border-[#1E1E24]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#A1A1AA]">Completed Workflows</span>
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-white mt-2">{completedRunsCount}</p>
            <p className="text-[11px] text-[#71717A] mt-1">Verified outcome runs</p>
          </div>

          <div className="p-4 rounded-xl bg-[#121215] border border-[#1E1E24]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#A1A1AA]">Total Coordinated Tasks</span>
              <Layers className="w-4 h-4 text-[#FF3B30]" />
            </div>
            <p className="text-2xl font-bold text-white mt-2">{totalTasksCount}</p>
            <p className="text-[11px] text-[#71717A] mt-1">Across DAG workflows</p>
          </div>

          <div className="p-4 rounded-xl bg-[#121215] border border-[#1E1E24]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#A1A1AA]">Agent-to-Agent Handoffs</span>
              <Bot className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-white mt-2">{totalHandoffsCount}</p>
            <p className="text-[11px] text-[#71717A] mt-1">Validated schema transitions</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-[#1E1E24] pb-3">
          {["ALL", "ACTIVE", "COMPLETED", "PAUSED", "FAILED"].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === tab
                  ? "bg-[#1E1E24] text-white border border-[#2E2E38]"
                  : "text-[#A1A1AA] hover:text-white hover:bg-[#141417]"
              }`}
            >
              {tab === "ALL" ? "All Runs" : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Runs List */}
        {loading ? (
          <div className="p-12 text-center text-[#A1A1AA]">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-[#FF3B30]" />
            Loading coordination runs...
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="p-12 rounded-xl bg-[#121215] border border-[#1E1E24] text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#1E1E24] flex items-center justify-center mx-auto text-[#A1A1AA]">
              <Network className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">No coordination runs found</h3>
              <p className="text-xs text-[#A1A1AA] max-w-md mx-auto">
                Launch a multi-agent workflow from an approved objective plan to coordinate specialist agents.
              </p>
            </div>
            <button
              onClick={handleOpenModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-white text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Launch First Coordination Run
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredRuns.map((run) => (
              <div
                key={run.id}
                className="p-5 rounded-xl bg-[#121215] border border-[#1E1E24] hover:border-[#2E2E38] transition-all space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      {getStatusBadge(run.status)}
                      <span className="text-xs font-mono text-[#71717A]">
                        {run.id.slice(0, 12)}...
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-[#1A1A1E] text-[#A1A1AA] font-mono">
                        v{run.planVersion}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-white hover:text-[#FF3B30] transition-colors">
                      <Link href={`/coordination/${run.id}`}>{run.objective.title}</Link>
                    </h3>
                  </div>

                  <Link
                    href={`/coordination/${run.id}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#18181C] hover:bg-[#222228] border border-[#26262E] text-white text-xs font-medium transition-colors shrink-0"
                  >
                    Coordination Console
                    <ArrowRight className="w-3.5 h-3.5 text-[#FF3B30]" />
                  </Link>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-[#1A1A1E]">
                  <div>
                    <span className="text-[#71717A] block">Tasks</span>
                    <span className="text-[#E5E7EB] font-medium font-mono">
                      {run.completedTasksCount || 0} / {run.totalTasksCount || run._count.tasks} Completed
                    </span>
                  </div>
                  <div>
                    <span className="text-[#71717A] block">Specialist Agents</span>
                    <span className="text-[#E5E7EB] font-medium font-mono">
                      {run._count.assignments} Assigned
                    </span>
                  </div>
                  <div>
                    <span className="text-[#71717A] block">Handoffs & Artifacts</span>
                    <span className="text-[#E5E7EB] font-medium font-mono">
                      {run._count.handoffs} handoffs · {run._count.artifacts} artifacts
                    </span>
                  </div>
                  <div>
                    <span className="text-[#71717A] block">Authority Mandate</span>
                    <span className="text-[#E5E7EB] font-medium truncate block">
                      {run.mandate ? run.mandate.name : "None bound"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: Launch New Coordination Run */}
        <ModalPortal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          maxWidth="max-w-lg"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#1E1E24]">
            <div className="flex items-center gap-2">
              <Network className="w-5 h-5 text-[#FF3B30]" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Launch Coordination Run</h2>
            </div>
            <button
              onClick={() => setShowModal(false)}
              className="text-slate-400 hover:text-slate-900 dark:text-[#71717A] dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {modalError && (
            <div className="p-3 rounded-lg bg-[#FF3B30]/10 border border-[#FF3B30]/30 text-xs text-[#FF3B30] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {modalError}
            </div>
          )}

          <form onSubmit={handleLaunchRun} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-[#A1A1AA] mb-1.5">
                Select Approved Objective
              </label>
              {approvedObjectives.length === 0 ? (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#18181C] border border-slate-200 dark:border-[#26262E] text-xs text-slate-600 dark:text-[#A1A1AA]">
                  No approved objectives found. Please create and approve an objective plan first in the Objectives section.
                </div>
              ) : (
                <select
                  value={selectedObjectiveId}
                  onChange={(e) => setSelectedObjectiveId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#18181C] border border-slate-200 dark:border-[#26262E] text-slate-900 dark:text-white text-xs focus:outline-none focus:border-[#FF3B30]"
                >
                  {approvedObjectives.map((obj) => (
                    <option key={obj.id} value={obj.id}>
                      {obj.title} (Priority: {obj.priority})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-[#A1A1AA] mb-1.5">
                Max Parallel Concurrency
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#18181C] border border-slate-200 dark:border-[#26262E] text-slate-900 dark:text-white text-xs font-mono focus:outline-none focus:border-[#FF3B30]"
              />
              <p className="text-[11px] text-slate-500 dark:text-[#71717A] mt-1">
                Maximum number of independent non-blocked tasks executed concurrently.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#16161A] border border-slate-200 dark:border-[#222228] space-y-1">
              <div className="text-xs font-medium text-slate-900 dark:text-[#E5E7EB] flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                Central Financial Authority Invariant
              </div>
              <p className="text-[11px] text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                Workflow planner will match tasks to registered agents, validate DAG cycles, and enforce CAS budget reservations.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-[#1E1E24]">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#18181C] dark:hover:bg-[#222228] text-xs text-slate-700 dark:text-[#A1A1AA] font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || approvedObjectives.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-white text-xs font-medium disabled:opacity-50 shadow-lg shadow-[#FF3B30]/20"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Planning DAG...
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    Plan & Launch
                  </>
                )}
              </button>
            </div>
          </form>
        </ModalPortal>
      </div>
    </AppShell>
  );
}

