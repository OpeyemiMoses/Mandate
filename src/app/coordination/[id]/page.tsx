"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
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
  XCircle,
  FileText,
  GitBranch,
  Key,
  Database,
  Lock,
  ChevronRight,
  Activity,
  History,
  Check,
  X,
  Code,
  Share2,
} from "lucide-react";

export default function CoordinationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params?.id as string;

  const [runData, setRunData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "graph" | "assignments" | "handoffs" | "context" | "timeline"
  >("graph");
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchRunDetails = async () => {
    if (!runId) return;
    try {
      const res = await fetch(`/api/coordination/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setRunData(data.run);
      } else {
        setErrorMsg("Failed to load coordination run details.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load run");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRunDetails();
    const interval = setInterval(fetchRunDetails, 4000);
    return () => clearInterval(interval);
  }, [runId]);

  const handleAction = async (action: "start" | "pause" | "resume" | "cancel" | "recover") => {
    try {
      setActionLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await fetch(`/api/coordination/${runId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action} run`);
      }
      setSuccessMsg(`Action "${action}" executed successfully.`);
      fetchRunDetails();
    } catch (err: any) {
      setErrorMsg(err.message || `Action "${action}" failed`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptHandoff = async (handoffId: string, destAgentId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/coordination/${runId}/handoffs/${handoffId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationAgentId: destAgentId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to accept handoff");
      }
      fetchRunDetails();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="p-16 text-center text-[#A1A1AA]">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-[#FF3B30]" />
          Loading Coordination Console...
        </div>
      </AppShell>
    );
  }

  if (!runData) {
    return (
      <AppShell>
        <div className="p-12 text-center text-[#FF3B30]">
          <AlertCircle className="w-8 h-8 mx-auto mb-3" />
          Coordination Run not found.
        </div>
      </AppShell>
    );
  }

  const tasks = runData.tasks || [];
  const assignments = runData.assignments || [];
  const handoffs = runData.handoffs || [];
  const artifacts = runData.artifacts || [];
  const events = runData.events || [];

  const completedCount = tasks.filter((t: any) => t.status === "COMPLETED").length;
  const progressPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-[#71717A]">
          <Link href="/coordination" className="hover:text-white transition-colors">
            Coordination Center
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-[#A1A1AA] font-mono">{runData.id.slice(0, 14)}...</span>
        </div>

        {/* Top Header Card */}
        <div className="p-6 rounded-2xl bg-[#121215] border border-[#1E1E24] space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                    runData.status === "ACTIVE"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : runData.status === "COMPLETED"
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : runData.status === "PAUSED"
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      : "bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/20"
                  }`}
                >
                  {runData.status === "ACTIVE" && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                  {runData.status}
                </span>

                <span className="text-xs px-2.5 py-1 rounded-md bg-[#1A1A1E] text-[#A1A1AA] font-mono">
                  Plan v{runData.planVersion}
                </span>

                {runData.mandate && (
                  <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    {runData.mandate.name}
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-bold text-white tracking-tight">
                {runData.objective?.title || "Coordinated Objective"}
              </h1>
              <p className="text-xs text-[#A1A1AA] font-mono">
                Run ID: {runData.id} · Concurrency: {runData.concurrencyLimit} workers
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {runData.status === "PENDING" && (
                <button
                  onClick={() => handleAction("start")}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start Workflow
                </button>
              )}

              {runData.status === "ACTIVE" && (
                <button
                  onClick={() => handleAction("pause")}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1A1A1E] hover:bg-[#26262E] text-amber-400 text-xs font-medium border border-[#2E2E38]"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </button>
              )}

              {runData.status === "PAUSED" && (
                <button
                  onClick={() => handleAction("resume")}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                >
                  <Play className="w-3.5 h-3.5" />
                  Resume
                </button>
              )}

              <button
                onClick={() => handleAction("recover")}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141417] hover:bg-[#1E1E24] text-[#A1A1AA] hover:text-white text-xs border border-[#232329]"
                title="Scan and recover abandoned worker leases"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Recover Leases
              </button>

              {["PENDING", "ACTIVE", "PAUSED"].includes(runData.status) && (
                <button
                  onClick={() => handleAction("cancel")}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FF3B30]/10 hover:bg-[#FF3B30]/20 text-[#FF3B30] text-xs font-medium border border-[#FF3B30]/30"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel Run
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5 pt-2 border-t border-[#1E1E24]">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>Workflow Progress</span>
              <span className="font-mono font-medium text-white">
                {completedCount} / {tasks.length} Steps ({progressPercent}%)
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#1A1A1E] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#FF3B30] to-emerald-400 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/30 text-xs text-[#FF3B30] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {successMsg}
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-[#1E1E24] overflow-x-auto pb-1">
          {[
            { id: "graph", label: "Workflow Graph & Tasks", icon: Layers, count: tasks.length },
            { id: "assignments", label: "Agent Assignments", icon: Bot, count: assignments.length },
            { id: "handoffs", label: "Handoff Inspector", icon: GitBranch, count: handoffs.length },
            { id: "context", label: "Shared Context Viewer", icon: Share2, count: artifacts.length },
            { id: "timeline", label: "Coordination Timeline", icon: History, count: events.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-[#1E1E24] text-white border border-[#2E2E38]"
                    : "text-[#A1A1AA] hover:text-white hover:bg-[#141417]"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-[#FF3B30]" : "text-[#71717A]"}`} />
                {tab.label}
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#141417] font-mono text-[#A1A1AA]">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: WORKFLOW GRAPH & TASKS */}
        {activeTab === "graph" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {tasks.map((task: any, index: number) => {
                const deps = JSON.parse(task.dependenciesJson || "[]");
                const caps = JSON.parse(task.requiredCapabilitiesJson || "[]");
                const isCompleted = task.status === "COMPLETED";
                const isRunning = task.status === "RUNNING";
                const isBlocked = task.status === "BLOCKED";
                const isFailed = task.status === "FAILED";

                return (
                  <div
                    key={task.id}
                    className={`p-5 rounded-2xl bg-[#121215] border transition-all ${
                      isRunning
                        ? "border-[#FF3B30]/50 shadow-lg shadow-[#FF3B30]/5"
                        : isCompleted
                        ? "border-emerald-500/30"
                        : isFailed
                        ? "border-[#FF3B30]/40"
                        : isBlocked
                        ? "border-zinc-800 opacity-70"
                        : "border-[#1E1E24]"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#1A1A1E] text-[#A1A1AA]">
                            Step #{task.order}
                          </span>
                          <span
                            className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                              isCompleted
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : isRunning
                                ? "bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/20 animate-pulse"
                                : isFailed
                                ? "bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/20"
                                : isBlocked
                                ? "bg-zinc-800 text-zinc-400"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}
                          >
                            {task.status}
                          </span>

                          {task.financialRequired && (
                            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                              {task.estimatedCostNear} NEAR
                            </span>
                          )}

                          <span className="text-xs text-[#71717A] font-mono">
                            Priority: {task.priority}
                          </span>
                        </div>

                        <h3 className="text-base font-semibold text-white">{task.title}</h3>
                        <p className="text-xs text-[#A1A1AA]">{task.description}</p>
                      </div>

                      <div className="flex flex-col sm:items-end gap-1 text-xs shrink-0">
                        <span className="text-[#71717A]">Assigned Specialist:</span>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#18181C] text-[#E5E7EB] font-medium border border-[#222228]">
                          <Bot className="w-3.5 h-3.5 text-[#FF3B30]" />
                          {task.assignment?.agent?.name || task.agentType}
                        </div>
                      </div>
                    </div>

                    {/* Metadata & Dependencies */}
                    <div className="mt-4 pt-3 border-t border-[#1A1A1E] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-[#71717A] block">Dependencies:</span>
                        {deps.length === 0 ? (
                          <span className="text-zinc-500 font-mono">None (Root Task)</span>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {deps.map((d: string) => (
                              <span
                                key={d}
                                className="px-1.5 py-0.5 rounded bg-[#1A1A1E] font-mono text-[#A1A1AA]"
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <span className="text-[#71717A] block">Required Capabilities:</span>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {caps.map((c: string) => (
                            <span
                              key={c}
                              className="px-1.5 py-0.5 rounded bg-[#18181C] text-[#E5E7EB] text-[10px]"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="text-[#71717A] block">Distributed Lease:</span>
                        {task.lease ? (
                          <span className="font-mono text-[11px] text-[#A1A1AA] truncate block">
                            Worker: {task.lease.workerId} (TTL: {task.lease.expiresAt ? new Date(task.lease.expiresAt).toLocaleTimeString() : "Expired"})
                          </span>
                        ) : (
                          <span className="text-zinc-500 font-mono">Unleased</span>
                        )}
                      </div>
                    </div>

                    {/* Execution Output Preview */}
                    {task.outputJson && (
                      <div className="mt-3 p-3 rounded-xl bg-[#0E0E11] border border-[#1A1A1E] space-y-1">
                        <span className="text-[10px] font-mono text-[#71717A] block uppercase">
                          Verified Output Payload
                        </span>
                        <pre className="text-xs font-mono text-emerald-400 overflow-x-auto max-h-32">
                          {JSON.stringify(JSON.parse(task.outputJson), null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: AGENT ASSIGNMENTS */}
        {activeTab === "assignments" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignments.map((assignment: any) => {
                const caps = JSON.parse(assignment.assignedCapabilitiesJson || "[]");
                return (
                  <div
                    key={assignment.id}
                    className="p-5 rounded-2xl bg-[#121215] border border-[#1E1E24] space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/20 flex items-center justify-center text-[#FF3B30]">
                          <Bot className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-white">
                            {assignment.agent?.name}
                          </h4>
                          <span className="text-xs font-mono text-[#71717A]">
                            Type: {assignment.agent?.type} (v{assignment.agent?.version})
                          </span>
                        </div>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {assignment.status}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs text-[#71717A] block mb-1">
                        Matched Capabilities:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {caps.map((c: string) => (
                          <span
                            key={c}
                            className="px-2 py-0.5 rounded-md bg-[#18181C] text-xs text-[#E5E7EB] border border-[#222228]"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>

                    {assignment.reassignmentReason && (
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                        <span className="font-semibold">Reassigned:</span> {assignment.reassignmentReason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: HANDOFF INSPECTOR */}
        {activeTab === "handoffs" && (
          <div className="space-y-4">
            {handoffs.length === 0 ? (
              <div className="p-12 text-center text-[#A1A1AA] bg-[#121215] rounded-2xl border border-[#1E1E24]">
                No agent handoffs recorded yet. Handoffs are generated as upstream tasks complete.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {handoffs.map((handoff: any) => {
                  const payload = JSON.parse(handoff.structuredPayload || "{}");
                  const isPending = handoff.status === "PENDING";
                  return (
                    <div
                      key={handoff.id}
                      className="p-5 rounded-2xl bg-[#121215] border border-[#1E1E24] space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">
                              {handoff.sourceAgent?.name}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#FF3B30]" />
                            <span className="text-xs font-semibold text-white">
                              {handoff.destinationAgent?.name}
                            </span>
                          </div>
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#1A1A1E] text-[#A1A1AA]">
                            schema v{handoff.schemaVersion}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                              handoff.status === "ACCEPTED"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : handoff.status === "PENDING"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/20"
                            }`}
                          >
                            {handoff.status}
                          </span>

                          {isPending && (
                            <button
                              onClick={() =>
                                handleAcceptHandoff(handoff.id, handoff.destinationAgentId)
                              }
                              disabled={actionLoading}
                              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                            >
                              Accept Handoff
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#0E0E11] border border-[#1A1A1E] space-y-1">
                        <span className="text-[10px] font-mono text-[#71717A] block uppercase">
                          Structured Payload
                        </span>
                        <pre className="text-xs font-mono text-[#A1A1AA] overflow-x-auto max-h-36">
                          {JSON.stringify(payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SHARED CONTEXT VIEWER */}
        {activeTab === "context" && (
          <div className="space-y-4">
            {artifacts.length === 0 ? (
              <div className="p-12 text-center text-[#A1A1AA] bg-[#121215] rounded-2xl border border-[#1E1E24]">
                No artifacts published to shared context yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {artifacts.map((art: any) => {
                  const data = JSON.parse(art.dataJson || "{}");
                  return (
                    <div
                      key={art.id}
                      className="p-5 rounded-2xl bg-[#121215] border border-[#1E1E24] space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-semibold text-white">{art.title}</h4>
                            <span className="text-xs px-2 py-0.5 rounded bg-[#1A1A1E] font-mono text-[#A1A1AA]">
                              v{art.version}
                            </span>
                            {art.isSealed && (
                              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Sealed
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#71717A] font-mono">
                            Produced by: {art.producingAgent?.name} ({art.producingAgent?.type})
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-[11px] text-[#71717A] block">SHA-256 Hash:</span>
                          <span className="text-xs font-mono text-emerald-400 truncate block max-w-xs">
                            {art.dataHash}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-[#0E0E11] border border-[#1A1A1E]">
                        <pre className="text-xs font-mono text-[#A1A1AA] overflow-x-auto max-h-48">
                          {JSON.stringify(data, null, 2)}
                        </pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: COORDINATION TIMELINE (UNIFIED AUDIT) */}
        {activeTab === "timeline" && (
          <div className="space-y-3">
            {events.length === 0 ? (
              <div className="p-12 text-center text-[#A1A1AA] bg-[#121215] rounded-2xl border border-[#1E1E24]">
                No coordination events recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((evt: any) => {
                  const meta = JSON.parse(evt.metadataJson || "{}");
                  return (
                    <div
                      key={evt.id}
                      className="p-3.5 rounded-xl bg-[#121215] border border-[#1E1E24] flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-[#FF3B30]" />
                        <div>
                          <span className="font-semibold text-white font-mono">{evt.eventType}</span>
                          {evt.task && (
                            <span className="text-[#A1A1AA] ml-2">Task: {evt.task.title}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-[#71717A] font-mono">
                        {evt.auditLogId && (
                          <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                            <Lock className="w-3 h-3" />
                            SHA-256 Verified
                          </span>
                        )}
                        <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

