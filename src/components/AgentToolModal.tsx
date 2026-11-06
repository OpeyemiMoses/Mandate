"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ModalPortal } from "./ModalPortal";
import {
  Wrench,
  Check,
  Trash2,
  Shield,
  AlertTriangle,
  Plus,
  RefreshCw,
  X,
  Lock,
  Cpu,
} from "lucide-react";

interface AssignedTool {
  id: string;
  toolId: string;
  toolName: string;
  toolCategory: string;
  permissionLevel: "READ" | "PROPOSE" | "RESTRICTED_EXECUTION" | "USER_ONLY";
  isEnabled: boolean;
  allowedOperations: string[];
  maxCallsPerExecution?: number | null;
  riskClassification: string;
}

interface AvailableTool {
  id: string;
  name: string;
  description: string;
  category: string;
  riskClassification: string;
  requiresAuthentication: boolean;
  authType: string;
  operations: Array<{
    id: string;
    name: string;
    requiredPermission: string;
    riskClassification: string;
  }>;
  isAssigned: boolean;
}

interface AgentToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: { id: string; name: string } | null;
  getHeaders: () => Record<string, string>;
}

export function AgentToolModal({
  isOpen,
  onClose,
  agent,
  getHeaders,
}: AgentToolModalProps) {
  const [loading, setLoading] = useState(true);
  const [assignedTools, setAssignedTools] = useState<AssignedTool[]>([]);
  const [availableTools, setAvailableTools] = useState<AvailableTool[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [savingToolId, setSavingToolId] = useState<string | null>(null);

  const loadTools = useCallback(async () => {
    if (!agent) return;
    try {
      setLoading(true);
      setActionError(null);
      const res = await fetch(`/api/agents/${agent.id}/tools`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setAssignedTools(data.assignedTools || []);
        setAvailableTools(data.availableTools || []);
      } else {
        setActionError(data.error || "Failed to load agent tools");
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to load agent tools");
    } finally {
      setLoading(false);
    }
  }, [agent, getHeaders]);

  useEffect(() => {
    if (isOpen && agent) {
      loadTools();
    }
  }, [isOpen, agent, loadTools]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !agent || !mounted) return null;

  const handleUpdatePermission = async (
    toolId: string,
    permissionLevel: "READ" | "PROPOSE" | "RESTRICTED_EXECUTION",
    isEnabled: boolean
  ) => {
    try {
      setSavingToolId(toolId);
      setActionError(null);
      setActionSuccess(null);

      const res = await fetch(`/api/agents/${agent.id}/tools`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          toolId,
          permissionLevel,
          isEnabled,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to update tool access");
      }

      setActionSuccess(`Permissions updated for ${toolId}`);
      setTimeout(() => setActionSuccess(null), 2500);
      await loadTools();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setSavingToolId(null);
    }
  };

  const handleAssignTool = async (toolId: string) => {
    await handleUpdatePermission(toolId, "READ", true);
  };

  const handleRevokeTool = async (toolId: string) => {
    try {
      setSavingToolId(toolId);
      setActionError(null);
      const res = await fetch(`/api/agents/${agent.id}/tools?toolId=${toolId}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to revoke tool");
      }
      setActionSuccess(`Access revoked for ${toolId}`);
      setTimeout(() => setActionSuccess(null), 2500);
      await loadTools();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setSavingToolId(null);
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk?.toUpperCase()) {
      case "LOW":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">LOW</span>;
      case "MEDIUM":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">MED</span>;
      case "HIGH":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">HIGH</span>;
      case "CRITICAL":
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-500/20 text-red-300 border border-red-500/40">CRITICAL</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">INFO</span>;
    }
  };

  const unassignedTools = availableTools.filter((t) => !t.isAssigned);

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl" customCard={true}>
      <div
        className="w-full max-w-2xl my-auto bg-white dark:bg-[#141417] border border-slate-200 dark:border-[#232329] rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-slate-900 dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#232329] shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/25">
              <Wrench className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Tool Access & Permissions</span>
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {agent.name}
                </span>
              </h3>
              <p className="text-xs text-[#A1A1AA]">
                Control which external APIs and tools this autonomous agent is authorized to discover and invoke.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notices */}
        {actionError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#FF3B30]" />
              <span>Loading registered tools...</span>
            </div>
          ) : (
            <>
              {/* Assigned Tools Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Assigned Tools ({assignedTools.length})
                  </h4>
                  <span className="text-[11px] text-zinc-500">
                    Enforced server-side
                  </span>
                </div>

                {assignedTools.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#0F0F12] border border-[#1E1E24] text-center text-xs text-zinc-500">
                    No tools currently assigned to this agent.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {assignedTools.map((tool) => (
                      <div
                        key={tool.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          tool.isEnabled
                            ? "bg-[#0F0F12] border-[#1E1E24]"
                            : "bg-[#0B0B0D] border-[#16161B] opacity-60"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">
                                {tool.toolName}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-800">
                                {tool.toolId}
                              </span>
                              {getRiskBadge(tool.riskClassification)}
                            </div>
                            <span className="text-[11px] text-zinc-400 block">
                              Category: {tool.toolCategory}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Permission Level Selector */}
                            <select
                              value={tool.permissionLevel}
                              disabled={savingToolId === tool.toolId}
                              onChange={(e) =>
                                handleUpdatePermission(
                                  tool.toolId,
                                  e.target.value as any,
                                  tool.isEnabled
                                )
                              }
                              className="bg-[#181820] border border-[#2E2E38] rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#FF3B30]"
                            >
                              <option value="READ">READ (Safe Data)</option>
                              <option value="PROPOSE">PROPOSE (Suggest intent)</option>
                              <option value="RESTRICTED_EXECUTION">
                                RESTRICTED_EXEC (Pre-cleared)
                              </option>
                            </select>

                            {/* Toggle Enabled */}
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdatePermission(
                                  tool.toolId,
                                  tool.permissionLevel as any,
                                  !tool.isEnabled
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                tool.isEnabled
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                  : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                              }`}
                            >
                              {tool.isEnabled ? "Active" : "Disabled"}
                            </button>

                            {/* Revoke Button */}
                            <button
                              type="button"
                              disabled={savingToolId === tool.toolId}
                              onClick={() => handleRevokeTool(tool.toolId)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Revoke Tool Access"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Available Unassigned Tools Section */}
              {unassignedTools.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Available Tools to Assign ({unassignedTools.length})
                  </h4>

                  <div className="space-y-2">
                    {unassignedTools.map((avail) => (
                      <div
                        key={avail.id}
                        className="p-3 rounded-xl bg-[#0B0B0E] border border-[#1A1A22] flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{avail.name}</span>
                            <span className="text-[10px] font-mono text-zinc-500">{avail.id}</span>
                            {getRiskBadge(avail.riskClassification)}
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">{avail.description}</p>
                        </div>

                        <button
                          type="button"
                          disabled={savingToolId === avail.id}
                          onClick={() => handleAssignTool(avail.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#1F1F28] hover:bg-[#2A2A38] border border-[#333342] flex items-center gap-1.5 transition-all shrink-0"
                        >
                          <Plus className="w-3 h-3 text-[#FF3B30]" />
                          <span>Assign</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#232329] flex items-center justify-between shrink-0 text-xs text-zinc-500">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Deterministic security boundary active</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-white bg-slate-200 dark:bg-[#1A1A20] hover:bg-slate-300 dark:hover:bg-[#252530] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

