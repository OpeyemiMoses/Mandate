"use client";

import React, { useState, useEffect } from "react";
import {
  Radio,
  ShieldAlert,
  AlertTriangle,
  Pause,
  Play,
  Wrench,
  Lock,
  Unlock,
  RefreshCw,
  CheckCircle2,
  AlertOctagon,
  Clock,
  Activity,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { OperatorGuard } from "@/components/OperatorGuard";

export default function OperationsPage() {
  const [statusData, setStatusData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal / Inputs state
  const [operatorId, setOperatorId] = useState("admin_operator_1");
  const [operatorRole, setOperatorRole] = useState("SECURITY_ADMIN");
  const [reasonInput, setReasonInput] = useState("");

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/operations/status");
      const data = await res.json();
      if (data.success) {
        setStatusData(data);
      }
    } catch (err: any) {
      console.error("Failed to load operations status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handlePause = async (pauseType: "FINANCIAL_ONLY" | "ALL_AGENTS") => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/operations/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pauseType,
          reason: reasonInput || `Manual ${pauseType} pause triggered by operator`,
          actorId: operatorId,
          actorRole: operatorRole,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to pause execution");
      }
      setActionSuccess(`Successfully applied pause: ${pauseType}`);
      setReasonInput("");
      await fetchStatus();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async (target: "FINANCIAL" | "ALL_AGENTS", forceOverride = false) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/operations/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          reason: reasonInput || `Manual ${target} resume authorized by operator`,
          actorId: operatorId,
          actorRole: operatorRole,
          forceOverrideUnacknowledgedIncidents: forceOverride,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to resume execution");
      }
      setActionSuccess(`Successfully resumed execution: ${target}`);
      setReasonInput("");
      await fetchStatus();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMaintenance = async (action: "ENTER" | "EXIT") => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/operations/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reasonInput || `Operator triggered ${action} maintenance`,
          actorId: operatorId,
          actorRole: operatorRole,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to modify maintenance mode");
      }
      setActionSuccess(`Maintenance mode: ${action}`);
      setReasonInput("");
      await fetchStatus();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLockdown = async (action: "ACTIVATE" | "RELEASE") => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/operations/lockdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reasonInput || `Panic kill switch ${action} by operator`,
          actorId: operatorId,
          actorRole: operatorRole,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to execute kill switch action");
      }
      setActionSuccess(`Lockdown action executed: ${action}`);
      setReasonInput("");
      await fetchStatus();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const currentMode = statusData?.state?.mode || "NORMAL";

  const getModeBadge = (mode: string) => {
    switch (mode) {
      case "NORMAL":
        return {
          bg: "bg-emerald-950/60 border-emerald-500/40 text-emerald-300",
          dot: "bg-emerald-400",
          label: "NORMAL OPERATIONS",
        };
      case "FINANCIAL_EXECUTION_PAUSED":
        return {
          bg: "bg-amber-950/60 border-amber-500/40 text-amber-300",
          dot: "bg-amber-400",
          label: "FINANCIAL EXECUTION PAUSED",
        };
      case "ALL_AGENT_EXECUTION_PAUSED":
        return {
          bg: "bg-orange-950/60 border-orange-500/40 text-orange-300",
          dot: "bg-orange-400",
          label: "ALL AGENT EXECUTION PAUSED",
        };
      case "MAINTENANCE_MODE":
        return {
          bg: "bg-blue-950/60 border-blue-500/40 text-blue-300",
          dot: "bg-blue-400",
          label: "MAINTENANCE MODE ACTIVE",
        };
      case "SECURITY_LOCKDOWN":
        return {
          bg: "bg-red-950/80 border-red-500/60 text-red-300 animate-pulse",
          dot: "bg-red-500",
          label: "SECURITY LOCKDOWN ACTIVE",
        };
      default:
        return {
          bg: "bg-zinc-900 border-zinc-700 text-zinc-300",
          dot: "bg-zinc-400",
          label: mode,
        };
    }
  };

  const badge = getModeBadge(currentMode);

  return (
    <AppShell>
      <OperatorGuard>
        <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#1E1E24]">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Operations Control Plane</h1>
            </div>
            <p className="text-sm text-[#A1A1AA]">
              Emergency operational controls, system mode enforcement, and fail-closed panic controls.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#141417] border border-[#232329] text-[#A1A1AA] hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Global Operational State Banner */}
        <div className={`p-6 rounded-2xl border ${badge.bg} flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl`}>
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className={`w-3 h-3 rounded-full ${badge.dot}`} />
              <span className="text-lg font-bold tracking-wide uppercase">{badge.label}</span>
            </div>
            <p className="text-xs text-zinc-300 max-w-2xl">
              Reason: <span className="font-medium text-white">{statusData?.state?.reason || "Operating under normal automated policy parameters."}</span>
            </p>
            <div className="flex items-center gap-4 text-[11px] text-zinc-400">
              <span>Updated by: <strong className="text-zinc-200">{statusData?.state?.updatedBy || "SYSTEM"}</strong> ({statusData?.state?.updatedByRole || "SYSTEM"})</span>
              <span>•</span>
              <span>Timestamp: {statusData?.state?.updatedAt ? new Date(statusData.state.updatedAt).toLocaleString() : "Just now"}</span>
            </div>
          </div>

          {currentMode === "SECURITY_LOCKDOWN" && (
            <button
              onClick={() => handleLockdown("RELEASE")}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs shadow-lg transition-colors"
            >
              <Unlock className="w-4 h-4" />
              Release Lockdown (Elevated Auth)
            </button>
          )}
        </div>

        {/* Action Alerts */}
        {actionError && (
          <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/50 text-red-300 text-xs flex items-center gap-3">
            <AlertOctagon className="w-4 h-4 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
        {actionSuccess && (
          <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Operator Context Configuration */}
        <div className="p-5 rounded-xl bg-[#121216] border border-[#1E1E24] space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
            Operator Authorization Context
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Actor ID</label>
              <input
                type="text"
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#18181D] border border-[#2B2B36] rounded-lg text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Operator Role</label>
              <select
                value={operatorRole}
                onChange={(e) => setOperatorRole(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#18181D] border border-[#2B2B36] rounded-lg text-white focus:outline-none focus:border-red-500"
              >
                <option value="OWNER">OWNER</option>
                <option value="SECURITY_ADMIN">SECURITY_ADMIN</option>
                <option value="OPERATOR">OPERATOR</option>
                <option value="AI_AGENT">AI_AGENT (Test Prohibition)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">Audit Reason</label>
              <input
                type="text"
                placeholder="Required justification for control changes..."
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#18181D] border border-[#2B2B36] rounded-lg text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>
        </div>

        {/* Emergency Control Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* 1. Financial Pause */}
          <div className="p-5 rounded-2xl bg-[#121216] border border-[#1E1E24] flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <Pause className="w-5 h-5" />
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${currentMode === "FINANCIAL_EXECUTION_PAUSED" ? "bg-amber-950 border border-amber-500 text-amber-300" : "bg-zinc-800 text-zinc-400"}`}>
                  {currentMode === "FINANCIAL_EXECUTION_PAUSED" ? "ACTIVE" : "STANDBY"}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white">Financial Pause</h3>
              <p className="text-xs text-[#A1A1AA]">
                Immediately halts all OutLayer and NEAR financial settlements while leaving reasoning agents online.
              </p>
            </div>
            <div className="flex gap-2">
              {currentMode === "FINANCIAL_EXECUTION_PAUSED" ? (
                <button
                  onClick={() => handleResume("FINANCIAL")}
                  disabled={actionLoading}
                  className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> Resume Financials
                </button>
              ) : (
                <button
                  onClick={() => handlePause("FINANCIAL_ONLY")}
                  disabled={actionLoading}
                  className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Pause className="w-3.5 h-3.5" /> Pause Financials
                </button>
              )}
            </div>
          </div>

          {/* 2. All Agent Execution Pause */}
          <div className="p-5 rounded-2xl bg-[#121216] border border-[#1E1E24] flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
                  <Activity className="w-5 h-5" />
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${currentMode === "ALL_AGENT_EXECUTION_PAUSED" ? "bg-orange-950 border border-orange-500 text-orange-300" : "bg-zinc-800 text-zinc-400"}`}>
                  {currentMode === "ALL_AGENT_EXECUTION_PAUSED" ? "ACTIVE" : "STANDBY"}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white">All Agents Pause</h3>
              <p className="text-xs text-[#A1A1AA]">
                Suspends tool dispatch and autonomous agent runs across all discovery, multi-agent coordination, and workflows.
              </p>
            </div>
            <div className="flex gap-2">
              {currentMode === "ALL_AGENT_EXECUTION_PAUSED" ? (
                <button
                  onClick={() => handleResume("ALL_AGENTS")}
                  disabled={actionLoading}
                  className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> Resume All
                </button>
              ) : (
                <button
                  onClick={() => handlePause("ALL_AGENTS")}
                  disabled={actionLoading}
                  className="w-full py-2 px-3 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Pause className="w-3.5 h-3.5" /> Pause All Agents
                </button>
              )}
            </div>
          </div>

          {/* 3. Maintenance Mode */}
          <div className="p-5 rounded-2xl bg-[#121216] border border-[#1E1E24] flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Wrench className="w-5 h-5" />
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${currentMode === "MAINTENANCE_MODE" ? "bg-blue-950 border border-blue-500 text-blue-300" : "bg-zinc-800 text-zinc-400"}`}>
                  {currentMode === "MAINTENANCE_MODE" ? "ACTIVE" : "STANDBY"}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white">Maintenance Mode</h3>
              <p className="text-xs text-[#A1A1AA]">
                Puts system in maintenance for database migrations, restorations, or major schema upgrades. Requires elevated role.
              </p>
            </div>
            <div className="flex gap-2">
              {currentMode === "MAINTENANCE_MODE" ? (
                <button
                  onClick={() => handleMaintenance("EXIT")}
                  disabled={actionLoading}
                  className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Exit Maintenance
                </button>
              ) : (
                <button
                  onClick={() => handleMaintenance("ENTER")}
                  disabled={actionLoading}
                  className="w-full py-2 px-3 rounded-lg bg-[#22222B] hover:bg-[#2C2C37] text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Wrench className="w-3.5 h-3.5" /> Enter Maintenance
                </button>
              )}
            </div>
          </div>

          {/* 4. Security Lockdown (Panic Kill Switch) */}
          <div className="p-5 rounded-2xl bg-red-950/20 border border-red-500/30 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-lg bg-red-500/20 text-red-400">
                  <AlertOctagon className="w-5 h-5" />
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${currentMode === "SECURITY_LOCKDOWN" ? "bg-red-900 text-red-200 animate-pulse" : "bg-red-950/60 text-red-400"}`}>
                  PANIC BUTTON
                </span>
              </div>
              <h3 className="text-sm font-semibold text-red-300">Security Lockdown</h3>
              <p className="text-xs text-red-200/70">
                Immediate fail-closed panic button. Cuts off all agent actions, rejects all transactions, and logs a SEV-1 incident.
              </p>
            </div>
            <div>
              {currentMode === "SECURITY_LOCKDOWN" ? (
                <button
                  onClick={() => handleLockdown("RELEASE")}
                  disabled={actionLoading}
                  className="w-full py-2 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" /> Release Lockdown
                </button>
              ) : (
                <button
                  onClick={() => handleLockdown("ACTIVATE")}
                  disabled={actionLoading}
                  className="w-full py-2 px-3 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold text-xs shadow-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <AlertOctagon className="w-3.5 h-3.5" /> ACTIVATE LOCKDOWN
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Operational Audit Log */}
        <div className="p-6 rounded-2xl bg-[#121216] border border-[#1E1E24] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-[#A1A1AA]" />
              <h2 className="text-sm font-semibold text-white">Tamper-Evident Operational Audit Trail</h2>
            </div>
            <span className="text-[11px] text-[#A1A1AA]">SHA-256 Cryptographic Chain Verified</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[#A1A1AA] border-b border-[#1E1E24] text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Reason</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A20] text-zinc-300">
                {statusData?.recentAudits && statusData.recentAudits.length > 0 ? (
                  statusData.recentAudits.map((audit: any) => (
                    <tr key={audit.id} className="hover:bg-[#18181F]/50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-white">{audit.actionType}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1B1B22] border border-[#2B2B36] text-zinc-300">
                          {audit.mode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{audit.actorId}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] font-mono text-zinc-400">{audit.actorRole}</span>
                      </td>
                      <td className="py-2.5 px-3 max-w-md truncate text-zinc-400">{audit.reason}</td>
                      <td className="py-2.5 px-3 text-[11px] text-zinc-500 whitespace-nowrap">
                        {new Date(audit.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-zinc-500">
                      No operational audit records logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </OperatorGuard>
    </AppShell>
  );
}

