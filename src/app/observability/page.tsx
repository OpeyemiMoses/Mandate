"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Activity,
  Layers,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  BarChart3,
  TrendingUp,
  ShieldAlert,
  Server,
  Zap,
  ArrowUpRight,
  Info,
  Check,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { OperatorGuard } from "@/components/OperatorGuard";

export default function ObservabilityPage() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "queue" | "workers" | "traces" | "alerts" | "capacity"
  >("overview");
  const [timeWindow, setTimeWindow] = useState<number>(24);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [traceSearchId, setTraceSearchId] = useState("");
  const [activeTrace, setActiveTrace] = useState<any>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const [overviewRes, alertsRes] = await Promise.all([
        fetch(`/api/observability/overview`),
        fetch(`/api/observability/alerts`),
      ]);

      const overviewData = await overviewRes.json();
      const alertsData = await alertsRes.json();

      if (overviewData.success) {
        setOverview(overviewData.data);
      }
      if (alertsData.success) {
        setAlerts(alertsData.alerts || []);
      }
    } catch (err) {
      console.error("Failed to load observability data", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSearchTrace = async (traceIdToFetch?: string) => {
    const id = traceIdToFetch || traceSearchId;
    if (!id.trim()) return;

    setTraceLoading(true);
    setTraceError(null);
    setActiveTrace(null);

    try {
      const res = await fetch(`/api/observability/traces/${id.trim()}`);
      const data = await res.json();
      if (data.success) {
        setActiveTrace(data.trace);
      } else {
        setTraceError(data.error || "Trace not found");
      }
    } catch (e: any) {
      setTraceError(e.message || "Failed to fetch trace");
    } finally {
      setTraceLoading(false);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    setActionLoading(`ack_${alertId}`);
    try {
      const res = await fetch(`/api/observability/alerts/${alertId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Acknowledged via Observability Dashboard" }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    setActionLoading(`res_${alertId}`);
    try {
      const res = await fetch(`/api/observability/alerts/${alertId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Resolved via Observability Dashboard" }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEvaluateCapacity = async () => {
    setActionLoading("capacity_eval");
    try {
      const res = await fetch(`/api/observability/capacity/evaluate`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const queue = overview?.queue || {};
  const workers = overview?.workers || { workers: [] };
  const capacity = overview?.capacity;
  const exporter = overview?.exporter;

  return (
    <AppShell>
      <OperatorGuard>
        <div className="space-y-6 max-w-7xl mx-auto pb-16">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1E1E24] pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-red-500" />
                Observability & Worker Telemetry
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  overview?.systemStatus === "HEALTHY"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : overview?.systemStatus === "DEGRADED"
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}
              >
                ● System {overview?.systemStatus || "HEALTHY"}
              </span>
            </div>
            <p className="text-sm text-[#A1A1AA] mt-1">
              Distributed OpenTelemetry tracing, real operational queue metrics, worker capacity management & alerting
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#141417] border border-[#27272A] text-[#A1A1AA] hover:text-white hover:bg-[#1E1E24] transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/jobs"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600/10 border border-red-500/30 text-red-400 hover:bg-red-600/20 transition-all"
            >
              <Layers className="w-3.5 h-3.5" />
              Background Jobs
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#1E1E24] gap-2 overflow-x-auto">
          {[
            { id: "overview", label: "Overview", icon: Activity },
            { id: "queue", label: "Queue Analytics", icon: Layers },
            { id: "workers", label: "Worker Fleet", icon: Cpu },
            { id: "traces", label: "Distributed Traces", icon: Zap },
            {
              id: "alerts",
              label: `Alerts (${alerts.filter((a) => a.status === "OPEN").length})`,
              icon: AlertTriangle,
            },
            { id: "capacity", label: "Capacity Advisory", icon: TrendingUp },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                  active
                    ? "border-red-500 text-white"
                    : "border-transparent text-[#71717A] hover:text-[#A1A1AA]"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-red-500" : ""}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW */}
        {/* ========================================================================= */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Top Operational Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="p-4 rounded-xl bg-[#141417] border border-[#232329]">
                <div className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">
                  Queue Depth
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {queue.currentlyQueued ?? 0}
                </div>
                <div className="text-[11px] text-[#A1A1AA] mt-1 flex items-center gap-1">
                  <span className="text-amber-400 font-medium">{queue.currentlyRunning ?? 0}</span> running
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#141417] border border-[#232329]">
                <div className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">
                  Active Workers
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {workers.activeWorkers ?? 0}
                  <span className="text-xs font-normal text-[#71717A] ml-1">/ {workers.totalRegistered ?? 0}</span>
                </div>
                <div className="text-[11px] text-[#A1A1AA] mt-1">
                  {workers.idleWorkers ?? 0} idle · {workers.busyWorkers ?? 0} busy
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#141417] border border-[#232329]">
                <div className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">
                  Fleet Utilization
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {workers.utilizationRate ?? 0}%
                </div>
                <div className="text-[11px] text-[#A1A1AA] mt-1">
                  {workers.availableSlots ?? 0} of {workers.totalSlots ?? 0} slots free
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#141417] border border-[#232329]">
                <div className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">
                  Avg Processing
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {queue.averageProcessingDurationMs ?? 0}
                  <span className="text-xs font-normal text-[#71717A] ml-1">ms</span>
                </div>
                <div className="text-[11px] text-[#A1A1AA] mt-1">
                  wait: {queue.averageWaitTimeMs ?? 0}ms
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#141417] border border-[#232329]">
                <div className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">
                  Job Success Rate
                </div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">
                  {queue.successRate ?? 0}%
                </div>
                <div className="text-[11px] text-[#A1A1AA] mt-1">
                  {queue.completed ?? 0} completed
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#141417] border border-[#232329]">
                <div className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">
                  Open Alerts
                </div>
                <div className="text-2xl font-bold text-white mt-1">
                  {alerts.filter((a) => a.status === "OPEN").length}
                </div>
                <div className="text-[11px] text-red-400 mt-1">
                  {queue.deadLettered ?? 0} dead-lettered
                </div>
              </div>
            </div>

            {/* Milestone 9.3: Incident Management & Operational Reliability Quick Console */}
            <div className="p-5 rounded-xl bg-[#141417] border border-rose-900/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <span className="text-xs font-semibold text-white uppercase tracking-wider">
                    Operational Reliability & Incident Command
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    M9.3 Active
                  </span>
                </div>
                <p className="text-sm text-[#E5E7EB]">
                  Real-time automated reconciliation, deterministic incident triage, and authority-governed recovery.
                </p>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                <Link
                  href="/incidents"
                  className="px-3 py-1.5 text-xs font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition-all flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Incidents Console
                </Link>
                <Link
                  href="/reconciliation"
                  className="px-3 py-1.5 text-xs font-semibold text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg transition-all flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reconciliation
                </Link>
                <Link
                  href="/recovery"
                  className="px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-all flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Recovery
                </Link>
              </div>
            </div>

            {/* Capacity Advisory Banner */}
            {capacity && (
              <div className="p-5 rounded-xl bg-[#141417] border border-[#232329] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-semibold text-white uppercase tracking-wider">
                      Worker Capacity Recommendation
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        capacity.recommendation === "NO_CHANGE"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : capacity.recommendation === "INCREASE_CAPACITY"
                          ? "bg-red-500/10 text-red-400 border border-red-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {capacity.recommendation}
                    </span>
                  </div>
                  <p className="text-sm text-[#E5E7EB]">{capacity.reason}</p>
                  <p className="text-xs text-[#71717A]">
                    Queue Pressure: <span className="text-[#A1A1AA] font-medium">{capacity.queuePressure}x</span> · Current Capacity: {capacity.currentWorkers} workers ({capacity.currentSlots} slots) · Recommended: {capacity.recommendedWorkers} workers ({capacity.recommendedSlots} slots)
                  </p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                  <button
                    onClick={() => setActiveTab("capacity")}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[#1E1E24] hover:bg-[#27272A] border border-[#323238] rounded-lg transition-all"
                  >
                    View Details
                  </button>
                  <button
                    onClick={handleEvaluateCapacity}
                    disabled={actionLoading === "capacity_eval"}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all"
                  >
                    Evaluate & Snapshot
                  </button>
                </div>
              </div>
            )}

            {/* Telemetry Exporter Status Card */}
            <div className="p-4 rounded-xl bg-[#141417] border border-[#232329] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Server className="w-4 h-4 text-[#71717A]" />
                <div>
                  <span className="text-[#71717A]">OpenTelemetry Exporter:</span>{" "}
                  <span className="font-medium text-white">
                    {exporter?.serviceName || "mandate-runtime"}
                  </span>
                  <span className="text-[#71717A] ml-2">
                    ({exporter?.configured ? exporter.endpoint : "Local In-Memory Buffer Active"})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    exporter?.status === "ACTIVE"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-[#232329] text-[#A1A1AA]"
                  }`}
                >
                  {exporter?.status || "NOT_CONFIGURED"}
                </span>
                <span className="text-[#71717A] text-[11px]">
                  {exporter?.configured
                    ? "Exporting to OTLP collector"
                    : "Local ring buffer (500 spans)"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: QUEUE ANALYTICS */}
        {/* ========================================================================= */}
        {activeTab === "queue" && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <div className="flex items-center justify-between bg-[#141417] p-3 rounded-xl border border-[#232329]">
              <span className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider">
                Time Window Filter
              </span>
              <div className="flex items-center gap-1.5">
                {[
                  { hours: 1, label: "1 Hour" },
                  { hours: 24, label: "24 Hours" },
                  { hours: 168, label: "7 Days" },
                  { hours: 720, label: "30 Days" },
                ].map((w) => (
                  <button
                    key={w.hours}
                    onClick={() => setTimeWindow(w.hours)}
                    className={`px-3 py-1 text-xs rounded-lg transition-all ${
                      timeWindow === w.hours
                        ? "bg-red-600 text-white font-medium"
                        : "bg-[#1E1E24] text-[#A1A1AA] hover:text-white"
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Queue Detailed Status Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#141417] border border-[#232329]">
                <div className="text-xs font-medium text-[#71717A]">Total Submitted</div>
                <div className="text-2xl font-bold text-white mt-1">{queue.totalSubmitted ?? 0}</div>
                <div className="text-xs text-[#71717A] mt-1">in selected window</div>
              </div>
              <div className="p-4 rounded-xl bg-[#141417] border border-[#232329]">
                <div className="text-xs font-medium text-[#71717A]">Completed</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">{queue.completed ?? 0}</div>
                <div className="text-xs text-[#71717A] mt-1">success rate {queue.successRate ?? 0}%</div>
              </div>
              <div className="p-4 rounded-xl bg-[#141417] border border-[#232329]">
                <div className="text-xs font-medium text-[#71717A]">Failed / Retries</div>
                <div className="text-2xl font-bold text-red-400 mt-1">{queue.failed ?? 0}</div>
                <div className="text-xs text-[#71717A] mt-1">{queue.awaitingRetry ?? 0} in retry backoff</div>
              </div>
              <div className="p-4 rounded-xl bg-[#141417] border border-[#232329]">
                <div className="text-xs font-medium text-[#71717A]">Dead Letter Queue</div>
                <div className="text-2xl font-bold text-amber-400 mt-1">{queue.deadLettered ?? 0}</div>
                <div className="text-xs text-[#71717A] mt-1">{queue.requiresRecovery ?? 0} ambiguous</div>
              </div>
            </div>

            {/* Latency & Processing Timing */}
            <div className="p-5 rounded-xl bg-[#141417] border border-[#232329] space-y-4">
              <h3 className="text-sm font-semibold text-white">Execution Latency & Wait Times</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-[#0F0F12] border border-[#1E1E24]">
                  <div className="text-xs text-[#71717A]">Average Queue Wait Time</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {queue.averageWaitTimeMs ?? 0} ms
                  </div>
                  <p className="text-[11px] text-[#71717A] mt-1">
                    Duration from scheduled timestamp to worker claim and start
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-[#0F0F12] border border-[#1E1E24]">
                  <div className="text-xs text-[#71717A]">Average Job Processing Duration</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {queue.averageProcessingDurationMs ?? 0} ms
                  </div>
                  <p className="text-[11px] text-[#71717A] mt-1">
                    Active execution duration within handler boundaries
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: WORKER FLEET */}
        {/* ========================================================================= */}
        {activeTab === "workers" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                Registered Worker Fleet ({workers.workers?.length || 0})
              </h3>
              <span className="text-xs text-[#71717A]">
                Heartbeat threshold: 30 seconds
              </span>
            </div>

            <div className="rounded-xl border border-[#232329] overflow-hidden bg-[#141417]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#18181B] text-[#71717A] uppercase text-[10px] tracking-wider border-b border-[#232329]">
                  <tr>
                    <th className="px-4 py-3">Worker Name</th>
                    <th className="px-4 py-3">Instance ID</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Concurrency</th>
                    <th className="px-4 py-3">Current Job</th>
                    <th className="px-4 py-3">Processed / Failures</th>
                    <th className="px-4 py-3">Heartbeat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232329] text-[#A1A1AA]">
                  {workers.workers && workers.workers.length > 0 ? (
                    workers.workers.map((w: any) => (
                      <tr key={w.id} className="hover:bg-[#1A1A1E] transition-colors">
                        <td className="px-4 py-3 font-medium text-white">{w.workerName}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#71717A]">
                          {w.instanceId}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              w.status === "IDLE"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : w.status === "BUSY"
                                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                : w.status === "DRAINING"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-red-500/10 text-red-400 border border-red-500/20"
                            }`}
                          >
                            {w.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {w.activeSlots} / {w.maxConcurrency} slots
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          {w.currentJobId ? (
                            <Link
                              href={`/jobs/${w.currentJobId}`}
                              className="text-red-400 hover:underline"
                            >
                              {w.currentJobId.slice(0, 10)}...
                            </Link>
                          ) : (
                            <span className="text-[#52525B]">None</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {w.jobsProcessed} / <span className="text-red-400">{w.recentFailures}</span>
                        </td>
                        <td className="px-4 py-3 text-[#71717A]">
                          {w.heartbeatAgeSeconds}s ago
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-[#71717A]">
                        No active background workers registered in fleet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: DISTRIBUTED TRACES */}
        {/* ========================================================================= */}
        {activeTab === "traces" && (
          <div className="space-y-6">
            {/* Trace Search Input */}
            <div className="p-5 rounded-xl bg-[#141417] border border-[#232329] space-y-3">
              <label className="text-xs font-semibold text-white uppercase tracking-wider">
                Investigate Distributed Trace
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter 32-hex Trace ID (e.g. 4bf92f3577b34da6a3ce929d0e0e4736)"
                  value={traceSearchId}
                  onChange={(e) => setTraceSearchId(e.target.value)}
                  className="flex-1 px-3.5 py-2 text-xs rounded-lg bg-[#0F0F12] border border-[#27272A] text-white focus:outline-none focus:border-red-500 font-mono"
                />
                <button
                  onClick={() => handleSearchTrace()}
                  disabled={traceLoading || !traceSearchId.trim()}
                  className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg transition-all"
                >
                  {traceLoading ? "Searching..." : "Inspect Trace"}
                </button>
              </div>

              {traceError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {traceError}
                </div>
              )}
            </div>

            {/* Trace Details View */}
            {activeTrace ? (
              <div className="p-5 rounded-xl bg-[#141417] border border-[#232329] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#232329] gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        Trace: {activeTrace.traceId}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          activeTrace.hasErrors
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}
                      >
                        {activeTrace.hasErrors ? "ERROR" : "SUCCESS"}
                      </span>
                    </div>
                    <div className="text-xs text-[#71717A] mt-1 font-mono">
                      Correlation: {activeTrace.correlationId || "N/A"} · Job: {activeTrace.jobId || "N/A"} · Worker: {activeTrace.workerId || "N/A"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-white">{activeTrace.totalDurationMs} ms</div>
                    <div className="text-[11px] text-[#71717A]">{activeTrace.spans.length} spans recorded</div>
                  </div>
                </div>

                {/* Spans List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider">
                    Execution Span Tree
                  </h4>
                  <div className="divide-y divide-[#232329] border border-[#232329] rounded-lg overflow-hidden bg-[#0F0F12]">
                    {activeTrace.spans.map((span: any, i: number) => (
                      <div key={i} className="p-3 text-xs space-y-1.5 hover:bg-[#141417] transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-white">{span.name}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-semibold ${
                                span.statusCode === "ERROR"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-emerald-500/20 text-emerald-400"
                              }`}
                            >
                              {span.statusCode}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-[#71717A]">{span.durationMs} ms</span>
                        </div>
                        {span.attributes && Object.keys(span.attributes).length > 0 && (
                          <div className="text-[11px] font-mono text-[#71717A] bg-[#0B0B0B] p-2 rounded border border-[#1E1E24]">
                            {JSON.stringify(span.attributes, null, 2)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-[#71717A] bg-[#141417] rounded-xl border border-[#232329]">
                Enter a 32-hex trace ID above to inspect span trees and distributed context propagation.
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: OPERATIONAL ALERTS */}
        {/* ========================================================================= */}
        {activeTab === "alerts" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                Operational Alerts ({alerts.length})
              </h3>
              <span className="text-xs text-[#71717A]">
                Authenticated acknowledge & resolve controls
              </span>
            </div>

            <div className="space-y-3">
              {alerts.length > 0 ? (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-4 rounded-xl bg-[#141417] border border-[#232329] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            alert.severity === "CRITICAL"
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : alert.severity === "ERROR"
                              ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {alert.severity}
                        </span>
                        <h4 className="text-sm font-semibold text-white">{alert.title}</h4>
                        <span className="text-xs text-[#71717A] font-mono">
                          [{alert.status}]
                        </span>
                      </div>
                      <p className="text-xs text-[#A1A1AA]">{alert.description}</p>
                      <div className="text-[11px] text-[#71717A]">
                        Observed: <span className="text-white font-medium">{alert.observedValue} {alert.unit}</span> (Threshold: {alert.threshold}) · First detected: {new Date(alert.firstDetectedAt).toLocaleTimeString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {alert.status === "OPEN" && (
                        <button
                          onClick={() => handleAcknowledgeAlert(alert.id)}
                          disabled={actionLoading === `ack_${alert.id}`}
                          className="px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-all"
                        >
                          Acknowledge
                        </button>
                      )}
                      {alert.status !== "RESOLVED" && (
                        <button
                          onClick={() => handleResolveAlert(alert.id)}
                          disabled={actionLoading === `res_${alert.id}`}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-all"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-[#71717A] bg-[#141417] rounded-xl border border-[#232329]">
                  Zero active operational alerts detected. All systems operating within normal boundaries.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: CAPACITY ADVISORY */}
        {/* ========================================================================= */}
        {activeTab === "capacity" && (
          <div className="space-y-6">
            {/* Prominent Advisory Disclaimer */}
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-3">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold uppercase tracking-wider block">
                  Advisory Scaling Recommendation Only
                </span>
                A capacity recommendation evaluates queue pressure, waiting latency, and worker utilization to provide operational guidance. It is <strong>NOT</strong> an automatically provisioned cloud infrastructure change.
              </div>
            </div>

            {/* Capacity Evaluation Details */}
            {capacity && (
              <div className="p-5 rounded-xl bg-[#141417] border border-[#232329] space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-[#232329]">
                  <div>
                    <h3 className="text-base font-semibold text-white">Capacity Analysis</h3>
                    <p className="text-xs text-[#71717A] mt-0.5">
                      Last evaluated: {new Date(capacity.evaluatedAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <button
                    onClick={handleEvaluateCapacity}
                    disabled={actionLoading === "capacity_eval"}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all"
                  >
                    Re-Evaluate & Snapshot
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3.5 rounded-lg bg-[#0F0F12] border border-[#1E1E24]">
                    <div className="text-xs text-[#71717A]">Queue Pressure</div>
                    <div className="text-xl font-bold text-white mt-1">
                      {capacity.queuePressure}x
                    </div>
                    <div className="text-[11px] text-[#71717A] mt-1">ratio (jobs / slots)</div>
                  </div>
                  <div className="p-3.5 rounded-lg bg-[#0F0F12] border border-[#1E1E24]">
                    <div className="text-xs text-[#71717A]">Active Workers</div>
                    <div className="text-xl font-bold text-white mt-1">
                      {capacity.currentWorkers}
                    </div>
                    <div className="text-[11px] text-[#71717A] mt-1">
                      rec: {capacity.recommendedWorkers} workers
                    </div>
                  </div>
                  <div className="p-3.5 rounded-lg bg-[#0F0F12] border border-[#1E1E24]">
                    <div className="text-xs text-[#71717A]">Capacity Slots</div>
                    <div className="text-xl font-bold text-white mt-1">
                      {capacity.currentSlots}
                    </div>
                    <div className="text-[11px] text-[#71717A] mt-1">
                      rec: {capacity.recommendedSlots} slots
                    </div>
                  </div>
                  <div className="p-3.5 rounded-lg bg-[#0F0F12] border border-[#1E1E24]">
                    <div className="text-xs text-[#71717A]">Recommendation</div>
                    <div className="text-sm font-bold text-red-400 mt-1">
                      {capacity.recommendation}
                    </div>
                    <div className="text-[11px] text-[#71717A] mt-1">advisory guidance</div>
                  </div>
                </div>

                {/* Reason & Evidence Breakdown */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider">
                    Supporting Operational Evidence
                  </h4>
                  <div className="p-4 rounded-lg bg-[#0F0F12] border border-[#1E1E24] space-y-2 text-xs">
                    <p className="text-white font-medium">{capacity.reason}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 text-[#71717A] font-mono text-[11px]">
                      <div>Eligible Queued Jobs: {capacity.evidence?.eligibleQueuedJobs}</div>
                      <div>Available Free Slots: {capacity.evidence?.availableSlots}</div>
                      <div>Total Capacity Slots: {capacity.evidence?.totalCapacitySlots}</div>
                      <div>Unhealthy Workers: {capacity.evidence?.unhealthyWorkers}</div>
                      <div>Recent Failures: {capacity.evidence?.recentFailureCount}</div>
                      <div>Avg Wait Time: {capacity.evidence?.averageWaitTimeMs}ms</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </OperatorGuard>
    </AppShell>
  );
}

