"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  Play,
  Pause,
  XCircle,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Layers,
  Terminal,
  Activity,
  ChevronRight,
  ExternalLink,
  Shield,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useMandate } from "@/context/MandateContext";

interface ExecutionEvent {
  id: string;
  eventType: string;
  metadataJson: string;
  timestamp: string;
}

interface ExecutionRecord {
  id: string;
  status: string;
  currentStep?: string;
  inputJson: string;
  outputJson?: string;
  errorDetails?: string;
  retryCount: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  events?: ExecutionEvent[];
}

interface AgentExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: {
    id: string;
    name: string;
    type?: string;
    version?: string;
    purpose?: string;
    status: string;
  } | null;
  onSuccess?: () => void;
}

const PRESET_PROMPTS = [
  "Find top 3 NEAR API analytics providers with pricing under 0.1 NEAR and subscribe to the best option",
  "Benchmark decentralized indexer options on NEAR testnet and prepare procurement quote",
  "Research live RPC node providers on NEAR and verify SLA guarantees without purchasing",
];

export function AgentExecutionModal({
  isOpen,
  onClose,
  agent,
  onSuccess,
}: AgentExecutionModalProps) {
  const { accountId, sessionToken, mandates } = useMandate();
  const [activeTab, setActiveTab] = useState<"run" | "history" | "active">("run");
  const [prompt, setPrompt] = useState(PRESET_PROMPTS[0]);
  const [selectedMandateId, setSelectedMandateId] = useState<string>("");
  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Active execution state
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [executionData, setExecutionData] = useState<ExecutionRecord | null>(null);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // History state
  const [history, setHistory] = useState<ExecutionRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const getHeaders = () => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (accountId) {
      h["x-near-account"] = accountId;
    }
    if (sessionToken) {
      h["x-session-token"] = sessionToken;
    }
    return h;
  };

  // Fetch agent details & capabilities on open
  useEffect(() => {
    if (!isOpen || !agent) return;

    // Filter mandates bound to this agent or user's active mandates
    const agentMandates = mandates.filter(
      (m) => m.status === "active" && (!m.agentId || m.agentId === agent.id)
    );
    if (agentMandates.length > 0) {
      setSelectedMandateId(agentMandates[0].id);
    }

    fetch(`/api/agents/${agent.id}`, { headers: getHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.capabilities) {
          setCapabilities(data.capabilities);
        }
      })
      .catch((err) => console.error("Error loading capabilities:", err));
  }, [isOpen, agent, mandates]);

  // Load history when tab changes
  useEffect(() => {
    if (isOpen && agent && activeTab === "history") {
      setIsLoadingHistory(true);
      fetch(`/api/agents/${agent.id}/executions`, { headers: getHeaders() })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setHistory(data.executions || []);
          }
        })
        .finally(() => setIsLoadingHistory(false));
    }
  }, [isOpen, agent, activeTab]);

  // Polling for active execution
  useEffect(() => {
    if (!currentExecutionId) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/executions/${currentExecutionId}`, {
          headers: getHeaders(),
        });
        const data = await res.json();
        if (data.success && data.execution) {
          setExecutionData(data.execution);
          if (data.events) {
            setEvents(data.events);
          }

          const terminalStates = ["COMPLETED", "FAILED", "CANCELLED", "WAITING_FOR_APPROVAL"];
          if (terminalStates.includes(data.execution.status)) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (onSuccess) onSuccess();
          }
        }
      } catch (e) {
        console.error("Execution poll error:", e);
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, 1500);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [currentExecutionId]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !agent || !mounted) return null;

  const handleStartExecution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/agents/${agent.id}/executions`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          prompt: prompt.trim(),
          mandateId: selectedMandateId || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCurrentExecutionId(data.execution.id);
        setExecutionData(data.execution);
        setActiveTab("active");
      } else {
        setSubmitError(data.error || "Failed to trigger execution");
      }
    } catch (err: any) {
      setSubmitError(err.message || "Failed to trigger execution");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePause = async () => {
    if (!currentExecutionId) return;
    setIsActionLoading(true);
    try {
      await fetch(`/api/executions/${currentExecutionId}/pause`, {
        method: "POST",
        headers: getHeaders(),
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleResume = async () => {
    if (!currentExecutionId) return;
    setIsActionLoading(true);
    try {
      await fetch(`/api/executions/${currentExecutionId}/resume`, {
        method: "POST",
        headers: getHeaders(),
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!currentExecutionId) return;
    if (!confirm("Are you sure you want to cancel this active execution?")) return;
    setIsActionLoading(true);
    try {
      await fetch(`/api/executions/${currentExecutionId}/cancel`, {
        method: "POST",
        headers: getHeaders(),
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "RUNNING":
      case "INITIALIZING":
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30 flex items-center gap-1.5 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            {status}
          </span>
        );
      case "COMPLETED":
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3" />
            COMPLETED
          </span>
        );
      case "WAITING_FOR_APPROVAL":
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" />
            WAITING APPROVAL
          </span>
        );
      case "PAUSED":
      case "PAUSE_REQUESTED":
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 flex items-center gap-1.5">
            <Pause className="w-3 h-3" />
            {status}
          </span>
        );
      case "FAILED":
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-red-500/20 text-red-400 border border-red-500/40 flex items-center gap-1.5">
            <XCircle className="w-3 h-3" />
            FAILED
          </span>
        );
      case "CANCELLED":
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-zinc-700/40 text-zinc-400 border border-zinc-600/40">
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-zinc-800 text-zinc-300">
            {status}
          </span>
        );
    }
  };

  // Parse structured output
  let parsedOutput: any = null;
  if (executionData?.outputJson) {
    try {
      parsedOutput = JSON.parse(executionData.outputJson);
    } catch (e) {
      parsedOutput = null;
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/80 dark:bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6 text-center">
        <div className="relative w-full max-w-3xl text-left max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-[#0F0F14] border border-slate-200 dark:border-[#23232C] shadow-2xl text-slate-900 dark:text-[#E5E7EB] overflow-hidden animate-pop">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-[#141419]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-[#1C1417] border border-red-200 dark:border-[#FF3B30]/30 flex items-center justify-center text-[#FF3B30]">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                    {agent.name}
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-white/10">
                    {agent.type || "research_procurement"} v{agent.version || "1.0.0"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Universal Agent Runtime • Policy-Gated Execution
                </p>
              </div>
            </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-white/5 bg-[#0F0F14]">
          <button
            type="button"
            onClick={() => setActiveTab("run")}
            className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "run"
                ? "border-[#FF3B30] text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            Dispatch Execution
          </button>
          {currentExecutionId && (
            <button
              type="button"
              onClick={() => setActiveTab("active")}
              className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === "active"
                  ? "border-[#FF3B30] text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-[#FF3B30]" />
              Live Execution
              {executionData && (
                <span className="w-2 h-2 rounded-full bg-[#FF3B30] animate-ping ml-1" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "history"
                ? "border-[#FF3B30] text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Execution History
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "run" && (
            <form onSubmit={handleStartExecution} className="space-y-5">
              {/* Capabilities Banner */}
              {capabilities.length > 0 && (
                <div className="p-3.5 rounded-xl bg-[#14141A] border border-white/5 space-y-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF3B30]" />
                    Registered Capabilities
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {capabilities.map((cap) => (
                      <div
                        key={cap.id}
                        className="p-2 rounded-lg bg-[#0F0F14] border border-white/5"
                      >
                        <span className="text-xs font-semibold text-white block">
                          {cap.name}
                        </span>
                        <span className="text-[10px] text-zinc-400 block mt-0.5">
                          {cap.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Task Prompt Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                  <span>Natural Language Directive</span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Deterministic Policy Governed
                  </span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Find 3 NEAR analytics providers and subscribe..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#141419] border border-[#2A2A34] focus:border-[#FF3B30] text-sm text-white placeholder-zinc-500 outline-none transition-all"
                />

                {/* Preset Suggestions */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                    Quick Directives:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_PROMPTS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPrompt(p)}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-[#141419] hover:bg-[#1E1E26] text-zinc-400 hover:text-white border border-white/5 transition-all text-left"
                      >
                        {p.slice(0, 48)}...
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Spending Mandate Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">
                  Select Governing Mandate
                </label>
                <select
                  value={selectedMandateId}
                  onChange={(e) => setSelectedMandateId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#141419] border border-[#2A2A34] focus:border-[#FF3B30] text-sm text-white outline-none"
                >
                  <option value="">No mandate (Research-only, zero spending)</option>
                  {mandates.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — Budget: {m.budgetAtomic} yoctoNEAR (Expires: {m.expiresAtIso?.slice(0, 10)})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-400">
                  Payments proposed by this agent will be checked against this mandate&apos;s 9 policy invariants.
                </p>
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/25 text-xs text-[#FF3B30] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting || !prompt.trim()}
                  className="px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] disabled:opacity-50 transition-all shadow-[0_0_24px_rgba(255,59,48,0.35)] flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Dispatching to Orchestrator...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Execute Agent Now
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {activeTab === "active" && executionData && (
            <div className="space-y-6">
              {/* Execution Summary Bar */}
              <div className="p-4 rounded-xl bg-[#141419] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-zinc-400">
                      ID: {executionData.id.slice(0, 16)}...
                    </span>
                    {getStatusBadge(executionData.status)}
                  </div>
                  <p className="text-sm font-semibold text-white mt-1">
                    {executionData.currentStep || "Running universal agent workflow..."}
                  </p>
                </div>

                {/* Control Actions */}
                <div className="flex items-center gap-2">
                  {(executionData.status === "RUNNING" ||
                    executionData.status === "INITIALIZING") && (
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={handlePause}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 flex items-center gap-1.5 transition-all"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      Pause
                    </button>
                  )}

                  {executionData.status === "PAUSED" && (
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={handleResume}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-1.5 transition-all"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Resume
                    </button>
                  )}

                  {["RUNNING", "PAUSED", "WAITING_FOR_APPROVAL", "INITIALIZING"].includes(
                    executionData.status
                  ) && (
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={handleCancel}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-red-400 bg-zinc-800/40 hover:bg-red-500/10 border border-white/5 hover:border-red-500/30 flex items-center gap-1.5 transition-all"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Waiting for approval alert */}
              {executionData.status === "WAITING_FOR_APPROVAL" && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <Shield className="w-4 h-4 text-amber-400" />
                    Human Approval Required
                  </div>
                  <p className="text-xs text-amber-200/80">
                    The agent formulated a spending proposal exceeding the autonomous approval threshold. Navigate to the Approvals page to authorize or reject this on-chain disbursement.
                  </p>
                </div>
              )}

              {/* Error Details */}
              {executionData.errorDetails && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 space-y-1">
                  <span className="text-xs font-semibold block">Execution Error:</span>
                  <p className="text-xs font-mono">{executionData.errorDetails}</p>
                </div>
              )}

              {/* Structured Output View */}
              {parsedOutput && (
                <div className="space-y-4 p-4 rounded-xl bg-[#14141A] border border-white/5">
                  <span className="text-xs font-semibold text-white uppercase tracking-wider block">
                    Structured Intelligence Output
                  </span>

                  {parsedOutput.recommendation && (
                    <div className="p-3.5 rounded-xl bg-[#0F0F14] border border-emerald-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">
                          Recommended: {parsedOutput.recommendation.selectedProviderName}
                        </span>
                        <span className="text-xs font-mono text-emerald-400 font-bold">
                          {parsedOutput.recommendation.amountNear} NEAR
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {parsedOutput.recommendation.rationale}
                      </p>
                      {parsedOutput.txHash && (
                        <div className="pt-2 flex items-center gap-2">
                          <span className="text-[11px] font-mono text-zinc-500">
                            On-Chain Tx:
                          </span>
                          <a
                            href={`https://testnet.nearblocks.io/txns/${parsedOutput.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-mono text-[#FF3B30] hover:underline flex items-center gap-1"
                          >
                            {parsedOutput.txHash.slice(0, 24)}...
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {parsedOutput.comparison?.matrix && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 text-zinc-400 text-[10px] font-mono">
                            <th className="py-2 px-2">Provider</th>
                            <th className="py-2 px-2">Price</th>
                            <th className="py-2 px-2">Features</th>
                            <th className="py-2 px-2">Turnaround</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {parsedOutput.comparison.matrix.map((row: any, i: number) => (
                            <tr key={i} className="text-zinc-300">
                              <td className="py-2 px-2 font-medium text-white">{row.name}</td>
                              <td className="py-2 px-2 font-mono text-emerald-400">{row.priceNear} NEAR</td>
                              <td className="py-2 px-2 text-zinc-400">{row.features?.join(", ")}</td>
                              <td className="py-2 px-2 text-zinc-400">{row.deliveryInfo}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Event Timeline Stream */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-[#FF3B30]" />
                  Runtime Event Stream ({events.length})
                </span>

                <div className="p-3.5 rounded-xl bg-[#0B0B0E] border border-white/5 space-y-2.5 font-mono text-xs max-h-56 overflow-y-auto">
                  {events.length === 0 ? (
                    <div className="text-zinc-500 text-[11px] italic">
                      Waiting for runtime events...
                    </div>
                  ) : (
                    events.map((evt) => (
                      <div
                        key={evt.id}
                        className="flex items-start gap-2.5 text-[11px] border-b border-white/5 pb-2 last:border-0"
                      >
                        <span className="text-zinc-500 shrink-0">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-[#FF3B30] shrink-0">
                          {evt.eventType}
                        </span>
                        <span className="text-zinc-300 break-all">
                          {evt.metadataJson}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-4">
              {isLoadingHistory ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="w-6 h-6 text-[#FF3B30] animate-spin" />
                  <span className="text-xs text-zinc-400">Loading executions...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500">
                  No execution history recorded for this agent yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setCurrentExecutionId(item.id);
                        setExecutionData(item);
                        setActiveTab("active");
                      }}
                      className="p-3.5 rounded-xl bg-[#141419] hover:bg-[#1A1A22] border border-white/5 hover:border-white/10 cursor-pointer transition-all flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-zinc-400">
                            {item.id.slice(0, 12)}...
                          </span>
                          {getStatusBadge(item.status)}
                        </div>
                        <p className="text-xs text-white truncate mt-1">
                          {item.currentStep || item.inputJson.slice(0, 80)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-zinc-400 shrink-0">
                        <span className="text-[10px] font-mono">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>,
    document.body
  );
}

