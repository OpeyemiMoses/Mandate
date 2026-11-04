"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Layers,
  Cpu,
  AlertOctagon,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { OperatorGuard } from "@/components/OperatorGuard";

export default function JobsPage() {
  const [activeTab, setActiveTab] = useState<"jobs" | "workers" | "dead-letters">("jobs");
  const [jobs, setJobs] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [deadLetters, setDeadLetters] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [jobsRes, workersRes, dlRes] = await Promise.all([
        fetch(`/api/jobs?status=${statusFilter !== "ALL" ? statusFilter : ""}&search=${searchQuery}`),
        fetch("/api/workers"),
        fetch("/api/dead-letters"),
      ]);

      const jobsData = await jobsRes.json();
      const workersData = await workersRes.json();
      const dlData = await dlRes.json();

      if (jobsData.success) {
        setJobs(jobsData.jobs || []);
        setMetrics(jobsData.metrics || {});
      }
      if (workersData.success) setWorkers(workersData.workers || []);
      if (dlData.success) setDeadLetters(dlData.records || []);
    } catch (e) {
      console.error("Failed to load jobs data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const handleResolveDeadLetter = async (dlId: string, resolution: "RESOLVED" | "CANCELLED") => {
    setActionLoading(dlId);
    try {
      const res = await fetch(`/api/dead-letters/${dlId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, notes: "Resolved via dashboard" }),
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequeueDeadLetter = async (dlId: string) => {
    setActionLoading(dlId);
    try {
      const res = await fetch(`/api/dead-letters/${dlId}/requeue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetAttempts: true }),
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">COMPLETED</span>;
      case "RUNNING":
      case "CLAIMED":
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse">RUNNING</span>;
      case "RETRY_WAIT":
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">RETRY_WAIT</span>;
      case "DEAD_LETTER":
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/40 font-bold">DEAD_LETTER</span>;
      case "SCHEDULED":
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30">SCHEDULED</span>;
      case "REQUIRES_RECOVERY":
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-red-600/30 text-red-300 border border-red-500 font-bold animate-pulse">REQUIRES_RECOVERY</span>;
      case "CANCELLED":
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">CANCELLED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-700/50 text-zinc-300 border border-zinc-600">QUEUED</span>;
    }
  };

  const getWorkerBadge = (status: string) => {
    switch (status) {
      case "IDLE":
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">IDLE</span>;
      case "BUSY":
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse">BUSY</span>;
      case "UNHEALTHY":
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/40">UNHEALTHY</span>;
      case "DRAINING":
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">DRAINING</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">{status}</span>;
    }
  };

  return (
    <AppShell>
      <OperatorGuard>
        <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-[#FF3B30]/10 border border-[#FF3B30]/20 text-[#FF3B30]">
                <Layers className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Durable Background Execution
              </h1>
            </div>
            <p className="text-sm text-zinc-400 mt-1">
              Production-grade persistent job processing, worker heartbeats, crash recovery & dead-letter quarantine
            </p>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#141417] border border-[#232329] hover:bg-[#1A1A1E] text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#FF3B30]" : ""}`} />
            Refresh Queue
          </button>
        </div>

        {/* Operational Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-xl bg-[#141417] border border-[#232329]">
            <span className="text-[11px] text-zinc-400 uppercase font-semibold">Active Workers</span>
            <div className="text-2xl font-bold text-white mt-1">
              {workers.filter((w) => w.status === "IDLE" || w.status === "BUSY").length}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[#141417] border border-[#232329]">
            <span className="text-[11px] text-zinc-400 uppercase font-semibold">Queued</span>
            <div className="text-2xl font-bold text-blue-400 mt-1">
              {(metrics.QUEUED || 0) + (metrics.SCHEDULED || 0)}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[#141417] border border-[#232329]">
            <span className="text-[11px] text-zinc-400 uppercase font-semibold">Running</span>
            <div className="text-2xl font-bold text-cyan-400 mt-1">
              {(metrics.RUNNING || 0) + (metrics.CLAIMED || 0)}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[#141417] border border-[#232329]">
            <span className="text-[11px] text-zinc-400 uppercase font-semibold">Retry Wait</span>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {metrics.RETRY_WAIT || 0}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[#141417] border border-[#232329]">
            <span className="text-[11px] text-zinc-400 uppercase font-semibold">Completed</span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {metrics.COMPLETED || 0}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-[#141417] border border-[#232329]">
            <span className="text-[11px] text-zinc-400 uppercase font-semibold">Dead Letter</span>
            <div className="text-2xl font-bold text-[#FF3B30] mt-1">
              {metrics.DEAD_LETTER || deadLetters.length || 0}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-[#232329] flex gap-6">
          <button
            onClick={() => setActiveTab("jobs")}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors relative ${
              activeTab === "jobs"
                ? "text-white border-b-2 border-[#FF3B30]"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            Background Jobs
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
              {jobs.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("workers")}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors relative ${
              activeTab === "workers"
                ? "text-white border-b-2 border-[#FF3B30]"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Cpu className="w-4 h-4" />
            Active Workers
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
              {workers.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("dead-letters")}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 transition-colors relative ${
              activeTab === "dead-letters"
                ? "text-white border-b-2 border-[#FF3B30]"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <AlertOctagon className="w-4 h-4 text-[#FF3B30]" />
            Dead-Letter Queue
            {deadLetters.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#FF3B30]/20 text-[#FF3B30] font-bold">
                {deadLetters.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: BACKGROUND JOBS */}
        {activeTab === "jobs" && (
          <div className="space-y-4">
            {/* Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search by Job ID, Type, or Correlation ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchData()}
                  className="w-full pl-9 pr-4 py-2 bg-[#141417] border border-[#232329] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF3B30]/50"
                />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto">
                {["ALL", "QUEUED", "RUNNING", "COMPLETED", "RETRY_WAIT", "DEAD_LETTER"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      statusFilter === st
                        ? "bg-[#FF3B30]/20 border border-[#FF3B30]/40 text-[#FF3B30]"
                        : "bg-[#141417] border border-[#232329] text-zinc-400 hover:text-white"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Jobs Table */}
            <div className="bg-[#141417] border border-[#232329] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1A1A1E] text-zinc-400 font-semibold border-b border-[#232329]">
                    <tr>
                      <th className="py-3 px-4">Job ID & Type</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Attempts</th>
                      <th className="py-3 px-4">Scheduled / Started</th>
                      <th className="py-3 px-4">Assigned Worker</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232329]">
                    {jobs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-zinc-500">
                          No background jobs found matching the selected filter.
                        </td>
                      </tr>
                    ) : (
                      jobs.map((job) => (
                        <tr key={job.id} className="hover:bg-[#1A1A1E]/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-mono text-zinc-200 font-semibold">{job.id}</div>
                            <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
                              <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-medium">
                                {job.jobType}
                              </span>
                              {job.jobCategory === "FINANCIAL" && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[10px] border border-amber-500/20">
                                  FINANCIAL
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">{getStatusBadge(job.status)}</td>
                          <td className="py-3 px-4 font-semibold text-zinc-300">
                            {job.priority > 0 ? (
                              <span className="text-amber-400">+{job.priority}</span>
                            ) : (
                              job.priority
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-zinc-300">
                            {job.attempts} / {job.maxAttempts}
                          </td>
                          <td className="py-3 px-4 text-zinc-400">
                            <div>{new Date(job.scheduledAt).toLocaleTimeString()}</div>
                            <div className="text-[10px] text-zinc-500">
                              {new Date(job.createdAt).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {job.worker ? (
                              <span className="text-zinc-300 font-mono text-[11px]">
                                {job.worker.workerName}
                              </span>
                            ) : (
                              <span className="text-zinc-600 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Link
                              href={`/jobs/${job.id}`}
                              className="inline-flex items-center gap-1 text-xs text-[#FF3B30] hover:text-[#ff5247] font-medium"
                            >
                              Inspect
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE WORKERS */}
        {activeTab === "workers" && (
          <div className="bg-[#141417] border border-[#232329] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1A1A1E] text-zinc-400 font-semibold border-b border-[#232329]">
                  <tr>
                    <th className="py-3 px-4">Worker Identity</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Capabilities</th>
                    <th className="py-3 px-4">Jobs Processed</th>
                    <th className="py-3 px-4">Recent Failures</th>
                    <th className="py-3 px-4">Last Heartbeat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232329]">
                  {workers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-500">
                        No registered background workers currently active.
                      </td>
                    </tr>
                  ) : (
                    workers.map((w) => (
                      <tr key={w.id} className="hover:bg-[#1A1A1E]/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{w.workerName}</div>
                          <div className="font-mono text-[11px] text-zinc-500">{w.instanceId}</div>
                        </td>
                        <td className="py-3 px-4">{getWorkerBadge(w.status)}</td>
                        <td className="py-3 px-4">
                          <div className="font-mono text-[11px] text-zinc-300">
                            {w.capabilities}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-bold text-emerald-400">{w.jobsProcessed}</td>
                        <td className="py-3 px-4 font-bold text-[#FF3B30]">{w.recentFailures}</td>
                        <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                          {new Date(w.lastHeartbeatAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: DEAD-LETTER QUEUE */}
        {activeTab === "dead-letters" && (
          <div className="bg-[#141417] border border-[#232329] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1A1A1E] text-zinc-400 font-semibold border-b border-[#232329]">
                  <tr>
                    <th className="py-3 px-4">Job Reference</th>
                    <th className="py-3 px-4">Quarantine Reason</th>
                    <th className="py-3 px-4">Final Error</th>
                    <th className="py-3 px-4">Attempts</th>
                    <th className="py-3 px-4">Resolution</th>
                    <th className="py-3 px-4 text-right">Administrative Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232329]">
                  {deadLetters.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-500">
                        Zero quarantined jobs in Dead-Letter Queue. All background tasks healthy.
                      </td>
                    </tr>
                  ) : (
                    deadLetters.map((dl) => (
                      <tr key={dl.id} className="hover:bg-[#1A1A1E]/50 transition-colors">
                        <td className="py-3 px-4 font-mono text-zinc-300">
                          <Link href={`/jobs/${dl.jobId}`} className="hover:text-[#FF3B30] font-semibold">
                            {dl.jobId}
                          </Link>
                          <div className="text-[11px] text-zinc-500">
                            {dl.job?.jobType || "BACKGROUND_JOB"}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#FF3B30]">{dl.reason}</td>
                        <td className="py-3 px-4 text-zinc-400 max-w-xs truncate" title={dl.finalError}>
                          {dl.finalError}
                        </td>
                        <td className="py-3 px-4 font-mono">{dl.attemptCount}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-300 font-medium">
                            {dl.resolution}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              disabled={actionLoading === dl.id || dl.resolution !== "PENDING_REVIEW"}
                              onClick={() => handleRequeueDeadLetter(dl.id)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                            >
                              Requeue
                            </button>
                            <button
                              disabled={actionLoading === dl.id || dl.resolution !== "PENDING_REVIEW"}
                              onClick={() => handleResolveDeadLetter(dl.id, "RESOLVED")}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-40"
                            >
                              Resolve
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      </OperatorGuard>
    </AppShell>
  );
}

