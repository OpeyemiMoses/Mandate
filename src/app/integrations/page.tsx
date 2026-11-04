"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Wrench,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Shield,
  ShieldCheck,
  Lock,
  Globe,
  Radio,
  FileCode,
  Zap,
  Server,
  Layers,
  ChevronRight,
  ChevronDown,
  Trash2,
  Check,
  Cpu,
  KeyRound,
  RotateCw,
  SlidersHorizontal,
  Bot,
  Compass,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlowingCard } from "@/components/GlowingCard";
import { useMandate } from "@/context/MandateContext";

interface ToolSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  operations: Record<string, {
    id: string;
    name: string;
    description: string;
    requiredPermission: string;
    riskClassification: string;
    inputSchema?: any;
  }>;
  riskClassification: string;
  requiresAuthentication: boolean;
  authType: string;
  status: string;
}

interface ConnectionItem {
  id: string;
  providerId: string;
  adapterType: string;
  name: string;
  status: string;
  authType: string;
  credentialVersion?: number;
  config: Record<string, any>;
  hasCredentials: boolean;
  grantedScopes: string[];
  verifiedScopes: string[];
  health?: Record<string, any>;
  operationsCount?: number;
  enabledOperationsCount?: number;
  lastVerifiedAt: string | null;
  createdAt: string;
}

interface OperationItem {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultPermissionLevel: string;
  currentPermissionLevel: string;
  riskClassification: string;
  isEnabled: boolean;
  requiresApproval: boolean;
  allowedAgentTypes: string[];
  parameters: any[];
}

interface InvocationItem {
  id: string;
  agentId: string;
  agentName: string;
  agentColor: string;
  toolId: string;
  operation: string;
  status: string;
  durationMs: number;
  riskClassification: string;
  params: any;
  result: any;
  errorMessage?: string;
  createdAt: string;
}

const CATEGORIES = [
  { id: "all", label: "All Categories" },
  { id: "search", label: "Web Search" },
  { id: "near_rpc", label: "NEAR RPC" },
  { id: "rest_api", label: "REST APIs" },
  { id: "mcp", label: "MCP Protocol" },
];

export default function IntegrationsPage() {
  const { accountId, sessionToken } = useMandate();
  const [activeTab, setActiveTab] = useState<"catalog" | "connections" | "activity">("connections");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [tools, setTools] = useState<ToolSummary[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [invocations, setInvocations] = useState<InvocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected tool for schema inspection
  const [selectedTool, setSelectedTool] = useState<ToolSummary | null>(null);

  // Selected connection for Operation Permissions Modal
  const [permModalConnection, setPermModalConnection] = useState<ConnectionItem | null>(null);
  const [connectionOps, setConnectionOps] = useState<OperationItem[]>([]);
  const [loadingOps, setLoadingOps] = useState(false);
  const [savingOpId, setSavingOpId] = useState<string | null>(null);

  // New connection wizard state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<"type" | "config">("type");
  const [newConnProvider, setNewConnProvider] = useState("rest_api");
  const [newConnName, setNewConnName] = useState("");
  const [newConnAuthType, setNewConnAuthType] = useState("BEARER_TOKEN");
  const [newConnBaseUrl, setNewConnBaseUrl] = useState("https://api.example.com");
  const [newConnApiKey, setNewConnApiKey] = useState("");
  const [newConnMcpUrl, setNewConnMcpUrl] = useState("");
  const [newConnWebhookUrl, setNewConnWebhookUrl] = useState("");
  const [isSubmittingConn, setIsSubmittingConn] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);

  // Health Test & Action states
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyNotice, setVerifyNotice] = useState<{ id: string; ok: boolean; msg: string; latency?: number } | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);

  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (accountId) headers["x-near-account"] = accountId;
    if (sessionToken) headers["x-session-token"] = sessionToken;
    return headers;
  }, [accountId, sessionToken]);

  const loadData = useCallback(async () => {
    try {
      const headers = getHeaders();
      const [toolsRes, connRes, actRes] = await Promise.all([
        fetch("/api/tools", { headers }),
        fetch("/api/integrations", { headers }),
        fetch("/api/tools/activity?limit=30", { headers }),
      ]);

      const [toolsData, connData, actData] = await Promise.all([
        toolsRes.json(),
        connRes.json(),
        actRes.json(),
      ]);

      if (toolsData.success) setTools(toolsData.tools || []);
      if (connData.success) setConnections(connData.connections || []);
      if (actData.success) setInvocations(actData.invocations || []);
    } catch (err) {
      console.error("Failed to load integrations data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleOpenOpsModal = async (conn: ConnectionItem) => {
    setPermModalConnection(conn);
    setLoadingOps(true);
    try {
      const res = await fetch(`/api/integrations/${conn.id}/operations`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setConnectionOps(data.operations || []);
      }
    } catch (err) {
      console.error("Failed to load operations:", err);
    } finally {
      setLoadingOps(false);
    }
  };

  const handleUpdateOpPermission = async (
    opId: string,
    updates: { permissionLevel?: string; isEnabled?: boolean }
  ) => {
    if (!permModalConnection) return;
    setSavingOpId(opId);
    try {
      const res = await fetch(
        `/api/integrations/${permModalConnection.id}/operations/${opId}/permissions`,
        {
          method: "PATCH",
          headers: getHeaders(),
          body: JSON.stringify(updates),
        }
      );
      const data = await res.json();
      if (data.success) {
        setConnectionOps((prev) =>
          prev.map((op) =>
            op.id === opId
              ? {
                  ...op,
                  currentPermissionLevel: updates.permissionLevel || op.currentPermissionLevel,
                  isEnabled: updates.isEnabled !== undefined ? updates.isEnabled : op.isEnabled,
                }
              : op
          )
        );
      }
    } catch (err) {
      console.error("Failed to update operation permission:", err);
    } finally {
      setSavingOpId(null);
    }
  };

  const handleCreateConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConnName) {
      setConnError("Please enter a connection name");
      return;
    }
    setIsSubmittingConn(true);
    setConnError(null);

    try {
      let endpoint = "/api/integrations/connect";
      let payload: any = {
        providerId: newConnProvider,
        name: newConnName,
        authType: newConnAuthType,
      };

      if (newConnProvider === "mcp_server") {
        endpoint = "/api/integrations/mcp/connect";
        payload = {
          serverUrl: newConnMcpUrl,
          name: newConnName,
          authToken: newConnApiKey || undefined,
        };
      } else if (newConnProvider === "slack") {
        payload.config = { webhookUrl: newConnWebhookUrl };
        if (newConnApiKey) payload.credentials = { apiKey: newConnApiKey };
      } else {
        payload.config = { baseUrl: newConnBaseUrl };
        if (newConnApiKey) {
          payload.credentials = { apiKey: newConnApiKey };
        }
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to create connection");
      }

      setIsModalOpen(false);
      setWizardStep("type");
      setNewConnName("");
      setNewConnApiKey("");
      setNewConnMcpUrl("");
      setNewConnWebhookUrl("");
      await loadData();
    } catch (err: any) {
      setConnError(err.message || "Failed to save integration connection");
    } finally {
      setIsSubmittingConn(false);
    }
  };

  const handleTestHealth = async (id: string) => {
    setVerifyingId(id);
    setVerifyNotice(null);
    try {
      const res = await fetch(`/api/integrations/${id}/test`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success && data.report) {
        const r = data.report;
        setVerifyNotice({
          id,
          ok: r.isHealthy,
          msg: r.isHealthy
            ? `Online & verified (${r.latencyMs}ms)`
            : r.errorMessage || "Diagnostic check failed",
          latency: r.latencyMs,
        });
      } else {
        setVerifyNotice({ id, ok: false, msg: data.error || "Diagnostic check failed" });
      }
      await loadData();
    } catch (err: any) {
      setVerifyNotice({ id, ok: false, msg: err.message || "Network error" });
    } finally {
      setVerifyingId(null);
    }
  };

  const handleRotateKey = async (id: string) => {
    setRotatingId(id);
    try {
      const res = await fetch(`/api/integrations/${id}/rotate-credentials`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Credentials rotated successfully to version ${data.credentialVersion}`);
        await loadData();
      } else {
        alert(`Rotation failed: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Rotation error: ${err.message}`);
    } finally {
      setRotatingId(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm("Are you sure you want to disconnect this integration? Its tools will be disabled.")) return;
    try {
      await fetch(`/api/integrations/${id}/disconnect`, {
        method: "POST",
        headers: getHeaders(),
      });
      await loadData();
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("PERMANENT REVOCATION: All encrypted credentials will be purged and cannot be restored. Proceed?")) return;
    try {
      await fetch(`/api/integrations/${id}/revoke`, {
        method: "POST",
        headers: getHeaders(),
      });
      await loadData();
    } catch (err) {
      console.error("Revoke error:", err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case "ACTIVE":
      case "CONNECTED":
      case "AUTHENTICATED":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            {status}
          </span>
        );
      case "DEGRADED":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" />
            DEGRADED
          </span>
        );
      case "AUTH_EXPIRED":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            AUTH EXPIRED
          </span>
        );
      case "SCOPE_MISSING":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            SCOPE MISSING
          </span>
        );
      case "RATE_LIMITED":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
            RATE LIMITED (429)
          </span>
        );
      case "UNAVAILABLE":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            UNAVAILABLE
          </span>
        );
      case "DISABLED":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
            DISABLED
          </span>
        );
      case "REVOKED":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-red-900/30 text-red-400 border border-red-800/40">
            REVOKED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">
            {status || "UNKNOWN"}
          </span>
        );
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk?.toUpperCase()) {
      case "LOW":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">LOW</span>;
      case "MEDIUM":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">MEDIUM</span>;
      case "HIGH":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">HIGH</span>;
      case "CRITICAL":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-red-500/20 text-red-300 border border-red-500/40">CRITICAL</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">LOW</span>;
    }
  };

  const getPermissionBadge = (perm: string) => {
    switch (perm?.toUpperCase()) {
      case "READ":
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">READ</span>;
      case "PROPOSE":
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono">PROPOSE</span>;
      case "RESTRICTED_EXECUTION":
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-mono">RESTRICTED_EXEC</span>;
      case "USER_ONLY":
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-mono font-bold">USER_ONLY</span>;
      default:
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">{perm}</span>;
    }
  };

  const filteredTools = tools.filter((tool) => {
    const matchesCat = categoryFilter === "all" || tool.category === categoryFilter;
    const matchesSearch =
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <AppShell>
      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-rise">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/10 dark:border-[#FF3B30]/20">
                <Wrench className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Integrations &amp; Tools
              </h1>
            </div>
            <p className="text-xs text-slate-600 dark:text-[#A1A1AA]">
              Universal Integration Framework · One platform. Many agents. Many integrations. One financial control layer.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/discovery"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-700 hover:text-slate-950 bg-white hover:bg-slate-50 border border-slate-200 dark:text-[#A1A1AA] dark:hover:text-white dark:bg-[#141417] dark:border-[#232329] dark:hover:border-[#383842] transition-colors btn-pop shadow-sm"
            >
              <Compass className="w-3.5 h-3.5 text-[#FF3B30]" />
              Discovery Engine
            </Link>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-950 dark:bg-[#141417] dark:border-[#232329] dark:text-[#A1A1AA] dark:hover:text-white dark:hover:border-[#383842] transition-colors disabled:opacity-50 btn-pop shadow-sm"
              title="Refresh integrations"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-[#FF3B30]" : ""}`} />
            </button>
            <button
              onClick={() => {
                setWizardStep("type");
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-lg shadow-[#FF3B30]/20 btn-pop"
            >
              <Plus className="w-4 h-4" />
              Connect Service
            </button>
          </div>
        </div>

        {/* Top Navigation Tabs */}
        <div className="border-b border-slate-200 dark:border-[#1E1E24] pb-2 animate-rise stagger-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("connections")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all btn-pop ${
                activeTab === "connections"
                  ? "bg-red-50 text-[#FF3B30] border border-red-200 font-bold dark:bg-[#1E1E24] dark:text-white dark:border-[#2E2E38] shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-[#A1A1AA] dark:hover:text-white"
              }`}
            >
              Active Integrations ({connections.length})
            </button>
            <button
              onClick={() => setActiveTab("catalog")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "catalog"
                  ? "bg-[#1E1E24] text-white border border-[#2E2E38]"
                  : "text-[#A1A1AA] hover:text-white"
              }`}
            >
              Tool Catalog ({tools.length})
            </button>
            <button
              onClick={() => setActiveTab("activity")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "activity"
                  ? "bg-[#1E1E24] text-white border border-[#2E2E38]"
                  : "text-[#A1A1AA] hover:text-white"
              }`}
            >
              Audit Activity ({invocations.length})
            </button>
          </div>
        </div>

        {/* TAB 1: ACTIVE CONNECTIONS */}
        {activeTab === "connections" && (
          <div className="space-y-4">
            {connections.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-[#121215] border border-[#1E1E24] space-y-3">
                <Server className="w-10 h-10 text-[#71717A] mx-auto" />
                <h3 className="text-base font-bold text-white">No External Integrations Configured</h3>
                <p className="text-xs text-[#A1A1AA] max-w-md mx-auto">
                  Connect authenticated NEAR RPC endpoints, private enterprise REST APIs, MCP servers, or Slack workspaces to expose granular tools to your agents.
                </p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:opacity-90"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Connect First Integration
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {connections.map((conn) => {
                  const isVerifying = verifyingId === conn.id;
                  const isRotating = rotatingId === conn.id;
                  const notice = verifyNotice?.id === conn.id ? verifyNotice : null;

                  return (
                    <GlowingCard key={conn.id}>
                      <div className="p-5 space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-white">{conn.name}</h3>
                              {getStatusBadge(conn.status)}
                            </div>
                            <span className="text-xs font-mono text-[#71717A] block mt-0.5">
                              {conn.providerId} · Adapter: {conn.adapterType || "rest"} · Auth: {conn.authType}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleTestHealth(conn.id)}
                              disabled={isVerifying}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#1A1A20] hover:bg-[#23232A] text-zinc-300 border border-[#2E2E38] transition-all flex items-center gap-1.5"
                              title="Execute Live Diagnostic Health Check"
                            >
                              <Radio className={`w-3 h-3 ${isVerifying ? "animate-spin text-[#FF3B30]" : "text-emerald-400"}`} />
                              <span>{isVerifying ? "Testing..." : "Test Health"}</span>
                            </button>
                          </div>
                        </div>

                        {/* Notice Banner */}
                        {notice && (
                          <div
                            className={`p-2.5 rounded-lg text-xs flex items-center justify-between font-mono ${
                              notice.ok
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            <span>{notice.msg}</span>
                            {notice.latency && <span className="text-[10px] opacity-75">{notice.latency}ms</span>}
                          </div>
                        )}

                        {/* Health & Security Metadata */}
                        <div className="p-3 rounded-lg bg-[#0F0F12] border border-[#1A1A20] text-xs font-mono space-y-1.5 text-zinc-400">
                          <div className="flex justify-between items-center">
                            <span>Credential Vault:</span>
                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              {conn.hasCredentials ? `AES-256-GCM (v${conn.credentialVersion || 1})` : "None"}
                            </span>
                          </div>
                          {conn.config?.baseUrl && (
                            <div className="truncate">Endpoint: <span className="text-zinc-200">{conn.config.baseUrl}</span></div>
                          )}
                          {conn.config?.serverUrl && (
                            <div className="truncate">MCP Server: <span className="text-zinc-200">{conn.config.serverUrl}</span></div>
                          )}
                          <div className="flex justify-between items-center">
                            <span>Operations Configured:</span>
                            <span className="text-white font-semibold">
                              {conn.enabledOperationsCount ?? 0} enabled / {conn.operationsCount ?? 0} total
                            </span>
                          </div>
                          {conn.lastVerifiedAt && (
                            <div className="text-[11px] text-[#71717A]">
                              Last diagnostic: {new Date(conn.lastVerifiedAt).toLocaleString()}
                            </div>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="pt-2 border-t border-[#1E1E24] flex items-center justify-between text-xs">
                          <button
                            onClick={() => handleOpenOpsModal(conn)}
                            className="px-3 py-1.5 rounded-lg bg-[#FF3B30]/10 text-[#FF3B30] hover:bg-[#FF3B30]/20 font-medium flex items-center gap-1.5 transition-colors"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            Manage Permissions
                          </button>

                          <div className="flex items-center gap-2">
                            {conn.hasCredentials && conn.status !== "REVOKED" && (
                              <button
                                onClick={() => handleRotateKey(conn.id)}
                                disabled={isRotating}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                                title="Rotate Encryption Key"
                              >
                                <RotateCw className={`w-3.5 h-3.5 ${isRotating ? "animate-spin" : ""}`} />
                              </button>
                            )}
                            {conn.status !== "REVOKED" && conn.status !== "DISABLED" && (
                              <button
                                onClick={() => handleDisconnect(conn.id)}
                                className="px-2.5 py-1 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/60 transition-colors"
                                title="Disconnect integration"
                              >
                                Disconnect
                              </button>
                            )}
                            {conn.status !== "REVOKED" && (
                              <button
                                onClick={() => handleRevoke(conn.id)}
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Permanently Revoke & Purge Credentials"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </GlowingCard>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TOOLS CATALOG */}
        {activeTab === "catalog" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      categoryFilter === cat.id
                        ? "bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30"
                        : "bg-[#141417] text-[#A1A1AA] border border-[#1E1E24] hover:text-white"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                <input
                  type="text"
                  placeholder="Search tools or operations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#141417] border border-[#232329] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#71717A] focus:outline-none focus:border-[#FF3B30]/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTools.map((tool) => {
                const opEntries = Object.values(tool.operations || {});
                return (
                  <GlowingCard key={tool.id}>
                    <div className="p-5 flex flex-col justify-between h-full space-y-4">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-white tracking-tight">
                                {tool.name}
                              </h3>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                                v{tool.version}
                              </span>
                            </div>
                            <span className="text-xs font-mono text-[#71717A] block mt-0.5">
                              {tool.id}
                            </span>
                          </div>
                          <div>{getRiskBadge(tool.riskClassification)}</div>
                        </div>

                        <p className="text-xs text-[#A1A1AA] mt-2 line-clamp-2">
                          {tool.description}
                        </p>

                        <div className="mt-4 space-y-2">
                          <span className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider block">
                            Operations ({opEntries.length})
                          </span>
                          <div className="space-y-1.5">
                            {opEntries.map((op) => (
                              <div
                                key={op.id}
                                className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-[#0F0F12] border border-[#1A1A20]"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-zinc-300">{op.id}</span>
                                  <span className="text-[11px] text-[#71717A]">· {op.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {getPermissionBadge(op.requiredPermission)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#1E1E24] flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-[#71717A]">
                          <Shield className="w-3.5 h-3.5" />
                          <span>
                            {tool.requiresAuthentication
                              ? `Requires ${tool.authType}`
                              : "Zero Credential (Public)"}
                          </span>
                        </div>
                        <button
                          onClick={() => setSelectedTool(tool)}
                          className="text-[#FF3B30] hover:text-[#FF5247] flex items-center gap-1 font-medium text-xs transition-colors"
                        >
                          <span>Inspect Schema</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </GlowingCard>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT ACTIVITY */}
        {activeTab === "activity" && (
          <div className="space-y-4">
            {invocations.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-[#121215] border border-[#1E1E24]">
                <FileCode className="w-10 h-10 text-[#71717A] mx-auto mb-2" />
                <h3 className="text-base font-bold text-white">No Tool Invocations Yet</h3>
                <p className="text-xs text-[#A1A1AA]">
                  When agents invoke registered tools, auditable execution traces appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#1E1E24]">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#141417] text-[#71717A] uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Agent</th>
                      <th className="p-3">Tool & Operation</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Duration</th>
                      <th className="p-3">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1A1A20] bg-[#0E0E11] text-zinc-300">
                    {invocations.map((inv) => (
                      <tr key={inv.id} className="hover:bg-[#141418]">
                        <td className="p-3 text-[#71717A]">{new Date(inv.createdAt).toLocaleTimeString()}</td>
                        <td className="p-3 font-semibold text-white">{inv.agentName || inv.agentId}</td>
                        <td className="p-3">
                          <span className="text-white">{inv.toolId}</span>
                          <span className="text-[#FF3B30]"> · {inv.operation}</span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              inv.status === "SUCCESS"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-rose-500/10 text-rose-400"
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="p-3">{inv.durationMs}ms</td>
                        <td className="p-3">{getRiskBadge(inv.riskClassification)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* OPERATION PERMISSIONS MODAL */}
        {permModalConnection && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#121215] border border-[#232329] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#232329]">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-[#FF3B30]" />
                    Operation Permissions: {permModalConnection.name}
                  </h3>
                  <p className="text-xs text-[#71717A]">
                    Configure fine-grained execution authority, risk gates, and agent restrictions per operation.
                  </p>
                </div>
                <button
                  onClick={() => setPermModalConnection(null)}
                  className="text-zinc-500 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {loadingOps ? (
                  <div className="p-8 text-center text-xs text-zinc-500">Loading operations...</div>
                ) : connectionOps.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500">No operations found for this adapter.</div>
                ) : (
                  connectionOps.map((op) => {
                    const isSaving = savingOpId === op.id;
                    return (
                      <div
                        key={op.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          op.isEnabled
                            ? "bg-[#0D0D10] border-[#1E1E24]"
                            : "bg-[#09090C] border-[#16161B] opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-white">{op.id}</span>
                              <span className="text-xs text-[#A1A1AA]">· {op.name}</span>
                              {getRiskBadge(op.riskClassification)}
                            </div>
                            <p className="text-[11px] text-[#71717A]">{op.description}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={op.isEnabled}
                                onChange={(e) =>
                                  handleUpdateOpPermission(op.id, { isEnabled: e.target.checked })
                                }
                                disabled={isSaving}
                                className="rounded bg-zinc-800 border-zinc-700 text-[#FF3B30] focus:ring-0"
                              />
                              <span>Enabled</span>
                            </label>
                          </div>
                        </div>

                        {/* Permission Level Selector */}
                        <div className="mt-3 pt-2.5 border-t border-[#18181E] flex items-center justify-between">
                          <span className="text-[10px] font-mono text-[#71717A] uppercase">
                            Permission Level:
                          </span>
                          <select
                            value={op.currentPermissionLevel}
                            onChange={(e) =>
                              handleUpdateOpPermission(op.id, { permissionLevel: e.target.value })
                            }
                            disabled={!op.isEnabled || isSaving}
                            className="bg-[#141417] border border-[#232329] rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-[#FF3B30]"
                          >
                            <option value="READ">READ (Safe read-only)</option>
                            <option value="PROPOSE">PROPOSE (Draft proposal only)</option>
                            <option value="RESTRICTED_EXECUTION">RESTRICTED_EXECUTION (Autonomous with mandate)</option>
                            <option value="USER_ONLY">USER_ONLY (Blocked for agents)</option>
                          </select>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-3 border-t border-[#232329] flex justify-end">
                <button
                  onClick={() => setPermModalConnection(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#1A1A20] hover:bg-[#23232A]"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONNECTION WIZARD MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#121215] border border-[#232329] rounded-2xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#232329]">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-[#FF3B30]" />
                    Connect External Service
                  </h3>
                  <p className="text-xs text-[#71717A]">
                    Establish a secure, authenticated integration connection.
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-zinc-500 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateConnection} className="space-y-4 text-xs">
                {connError && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    {connError}
                  </div>
                )}

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Integration Provider</label>
                  <select
                    value={newConnProvider}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewConnProvider(val);
                      if (val === "near_rpc") {
                        setNewConnName("NEAR Public RPC");
                        setNewConnAuthType("NONE");
                        setNewConnBaseUrl("https://rpc.testnet.near.org");
                      } else if (val === "mcp_server") {
                        setNewConnName("Local MCP Server");
                        setNewConnAuthType("BEARER_TOKEN");
                        setNewConnMcpUrl("http://localhost:8000/sse");
                      } else if (val === "slack") {
                        setNewConnName("Slack Notifications");
                        setNewConnAuthType("API_KEY");
                      } else {
                        setNewConnName("Custom REST API");
                        setNewConnAuthType("BEARER_TOKEN");
                        setNewConnBaseUrl("https://api.example.com");
                      }
                    }}
                    className="w-full bg-[#141417] border border-[#232329] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#FF3B30]"
                  >
                    <option value="rest_api">Custom REST API (HTTP Service)</option>
                    <option value="mcp_server">MCP Server (Model Context Protocol)</option>
                    <option value="near_rpc">NEAR Protocol RPC Node</option>
                    <option value="slack">Slack / Webhook Alerts</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Connection Name</label>
                  <input
                    type="text"
                    value={newConnName}
                    onChange={(e) => setNewConnName(e.target.value)}
                    placeholder="e.g. Production Analytics REST"
                    className="w-full bg-[#141417] border border-[#232329] rounded-xl px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-[#FF3B30]"
                    required
                  />
                </div>

                {newConnProvider === "mcp_server" ? (
                  <div>
                    <label className="block text-zinc-400 mb-1 font-medium">MCP Server Endpoint URL</label>
                    <input
                      type="url"
                      value={newConnMcpUrl}
                      onChange={(e) => setNewConnMcpUrl(e.target.value)}
                      placeholder="https://mcp.internal.domain/sse"
                      className="w-full bg-[#141417] border border-[#232329] rounded-xl px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-[#FF3B30]"
                      required
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">Tools will be automatically discovered via JSON-RPC protocol.</p>
                  </div>
                ) : newConnProvider === "slack" ? (
                  <div>
                    <label className="block text-zinc-400 mb-1 font-medium">Slack Webhook URL (Optional)</label>
                    <input
                      type="url"
                      value={newConnWebhookUrl}
                      onChange={(e) => setNewConnWebhookUrl(e.target.value)}
                      placeholder="https://hooks.slack.com/services/..."
                      className="w-full bg-[#141417] border border-[#232329] rounded-xl px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-[#FF3B30]"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-zinc-400 mb-1 font-medium">Base Endpoint URL</label>
                    <input
                      type="url"
                      value={newConnBaseUrl}
                      onChange={(e) => setNewConnBaseUrl(e.target.value)}
                      className="w-full bg-[#141417] border border-[#232329] rounded-xl px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-[#FF3B30]"
                      required
                    />
                  </div>
                )}

                {newConnProvider !== "near_rpc" && (
                  <div>
                    <label className="block text-zinc-400 mb-1 font-medium">Secret Token / API Key</label>
                    <input
                      type="password"
                      value={newConnApiKey}
                      onChange={(e) => setNewConnApiKey(e.target.value)}
                      placeholder="Protected in AES-256-GCM Credential Vault"
                      className="w-full bg-[#141417] border border-[#232329] rounded-xl px-3 py-2 text-white placeholder-zinc-600 focus:outline-none focus:border-[#FF3B30]"
                    />
                  </div>
                )}

                <div className="pt-3 border-t border-[#232329] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingConn}
                    className="px-4 py-2 rounded-xl font-semibold text-white bg-[#FF3B30] hover:opacity-90 disabled:opacity-50"
                  >
                    {isSubmittingConn ? "Connecting..." : "Save & Verify"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SCHEMA INSPECTOR MODAL */}
        {selectedTool && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#121215] border border-[#232329] rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#232329]">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-[#FF3B30]" />
                    {selectedTool.name}
                  </h3>
                  <span className="text-xs font-mono text-[#71717A]">{selectedTool.id}</span>
                </div>
                <button
                  onClick={() => setSelectedTool(null)}
                  className="text-zinc-500 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Operations Schema
                  </h4>
                  <div className="space-y-3">
                    {Object.values(selectedTool.operations || {}).map((op) => (
                      <div
                        key={op.id}
                        className="p-3.5 rounded-xl bg-[#0B0B0E] border border-[#1E1E24] space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-bold text-white">{op.id}</span>
                          <div className="flex items-center gap-2">
                            {getPermissionBadge(op.requiredPermission)}
                            {getRiskBadge(op.riskClassification)}
                          </div>
                        </div>
                        <p className="text-xs text-[#A1A1AA]">{op.description}</p>
                        {op.inputSchema && (
                          <div className="mt-2">
                            <span className="text-[10px] font-semibold text-[#71717A] uppercase block mb-1">
                              Input JSON Schema:
                            </span>
                            <pre className="p-2.5 rounded-lg bg-[#050507] border border-[#1A1A22] text-[11px] font-mono text-zinc-300 overflow-x-auto">
                              {JSON.stringify(op.inputSchema, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#232329] flex justify-end shrink-0">
                <button
                  onClick={() => setSelectedTool(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#1A1A20] hover:bg-[#23232A]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
