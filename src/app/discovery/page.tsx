"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import {
  Compass,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  Zap,
  RefreshCw,
  ExternalLink,
  Lock,
  Cpu,
  Layers,
  Globe,
  Plus,
  Play,
} from "lucide-react";
import Link from "next/link";

interface Capability {
  id: string;
  name: string;
  description: string;
  category: string;
  status: string;
  providerId?: string;
  toolId?: string;
  agentType?: string;
  operations: Array<{
    name: string;
    description: string;
    riskClassification: string;
    permissionLevel: string;
  }>;
  requiredAuthType: string;
  isHealthy: boolean;
  healthMessage?: string;
  integrationConnectionId?: string;
}

interface IntegrationState {
  catalog: {
    providerId: string;
    name: string;
    category: string;
    description: string;
    authType: string;
    docsUrl?: string;
    supportedOperations: string[];
  };
  isSupported: boolean;
  isConfigured: boolean;
  isAuthenticated: boolean;
  isOperational: boolean;
  connectionId?: string;
  connectionName?: string;
  status?: string;
  lastVerifiedAt?: string;
  healthStatus?: string;
}

export default function DiscoveryPage() {
  const [activeTab, setActiveTab] = useState<"capabilities" | "integrations">("capabilities");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationState[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; message: string; success: boolean } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [capsRes, intsRes] = await Promise.all([
        fetch("/api/discovery/capabilities"),
        fetch("/api/discovery/integrations"),
      ]);

      if (capsRes.ok) {
        const d = await capsRes.json();
        setCapabilities(d.capabilities || []);
      }
      if (intsRes.ok) {
        const d = await intsRes.json();
        setIntegrations(d.integrations || []);
      }
    } catch (e) {
      console.error("Failed to load discovery data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTestConnection = async (connectionId?: string, providerId?: string) => {
    if (!connectionId) return;
    setTestingId(connectionId);
    setTestResult(null);
    try {
      const res = await fetch(`/api/discovery/integrations/${connectionId}/test`, {
        method: "POST",
      });
      const data = await res.json();
      setTestResult({
        id: connectionId,
        message: data.health?.message || (data.success ? "Connection verified healthy!" : "Health test failed"),
        success: data.success,
      });
      fetchData();
    } catch (err: any) {
      setTestResult({
        id: connectionId,
        message: err.message || "Failed to reach endpoint",
        success: false,
      });
    } finally {
      setTestingId(null);
    }
  };

  const filteredCapabilities = capabilities.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.operations.some((o) => o.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === "ALL" || c.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "AVAILABLE":
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">AVAILABLE</span>;
      case "DEGRADED":
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">DEGRADED</span>;
      case "AUTH_REQUIRED":
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">AUTH REQUIRED</span>;
      case "DISABLED":
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30">DISABLED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">{status}</span>;
    }
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-[#1A1A1E] gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/20">
                <Compass className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight">Discovery & Capability Center</h1>
            </div>
            <p className="mt-1 text-sm text-[#A1A1AA]">
              One platform. Many agents. Many objectives. One financial control layer.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#141417] hover:bg-[#1A1A1E] text-zinc-300 border border-[#232329] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh Capabilities
            </button>
            <Link
              href="/objectives"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#FF3B30] hover:bg-[#E0342A] text-white transition-colors shadow-lg shadow-[#FF3B30]/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Plan Objective
            </Link>
          </div>
        </div>

        {/* Tab Switcher & Filters */}
        <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="inline-flex p-1 bg-[#141417] border border-[#232329] rounded-xl text-xs font-medium">
            <button
              onClick={() => setActiveTab("capabilities")}
              className={`px-4 py-1.5 rounded-lg transition-all ${
                activeTab === "capabilities"
                  ? "bg-[#FF3B30] text-white shadow-sm font-semibold"
                  : "text-[#A1A1AA] hover:text-white"
              }`}
            >
              Discovered Capabilities ({capabilities.length})
            </button>
            <button
              onClick={() => setActiveTab("integrations")}
              className={`px-4 py-1.5 rounded-lg transition-all ${
                activeTab === "integrations"
                  ? "bg-[#FF3B30] text-white shadow-sm font-semibold"
                  : "text-[#A1A1AA] hover:text-white"
              }`}
            >
              Integrations Catalog ({integrations.length})
            </button>
          </div>

          {activeTab === "capabilities" && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search capabilities or operations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 rounded-xl bg-[#141417] border border-[#232329] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF3B30] w-64"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#141417] border border-[#232329] text-xs text-zinc-300 focus:outline-none focus:border-[#FF3B30]"
              >
                <option value="ALL">All Categories</option>
                <option value="INFORMATION_DISCOVERY">Information Discovery</option>
                <option value="FINANCIAL_EXECUTION">Financial Execution</option>
                <option value="COMMUNICATION">Communication</option>
                <option value="COMPUTE_ANALYSIS">Compute & Analysis</option>
                <option value="EXTERNAL_INTEGRATION">External Integration</option>
              </select>
            </div>
          )}
        </div>

        {/* Tab 1: Discovered Capabilities Grid */}
        {activeTab === "capabilities" && (
          <div className="mt-6">
            {loading ? (
              <div className="text-center py-20 text-zinc-500">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#FF3B30]" />
                Discovering universal capabilities across tools, agents & integrations...
              </div>
            ) : filteredCapabilities.length === 0 ? (
              <div className="text-center py-16 bg-[#141417]/50 rounded-2xl border border-[#232329]">
                <Layers className="w-10 h-10 mx-auto text-zinc-600 mb-2" />
                <p className="text-sm font-medium text-zinc-400">No matching capabilities discovered</p>
                <p className="text-xs text-zinc-600 mt-1">Try resetting your filter or search query.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCapabilities.map((cap) => (
                  <div
                    key={cap.id}
                    className="p-5 rounded-2xl bg-[#141417] border border-[#232329] hover:border-[#FF3B30]/30 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-semibold text-zinc-500 tracking-wider uppercase">
                            {cap.category.replace("_", " ")}
                          </span>
                          <h3 className="text-base font-bold text-white mt-0.5">{cap.name}</h3>
                        </div>
                        {getStatusBadge(cap.status)}
                      </div>

                      <p className="mt-2 text-xs text-zinc-400 line-clamp-2">{cap.description}</p>

                      <div className="mt-4 pt-3 border-t border-[#1F1F24]">
                        <span className="text-[11px] font-medium text-zinc-400">Supported Operations:</span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {cap.operations.slice(0, 4).map((op) => (
                            <span
                              key={op.name}
                              className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1F1F24] text-zinc-300 border border-[#2A2A32]"
                              title={`${op.description} (Risk: ${op.riskClassification}, Perm: ${op.permissionLevel})`}
                            >
                              {op.name}
                            </span>
                          ))}
                          {cap.operations.length > 4 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1F1F24] text-zinc-500">
                              +{cap.operations.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#1F1F24] flex items-center justify-between text-[11px] text-zinc-500">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            cap.isHealthy ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                          }`}
                        />
                        {cap.healthMessage || "Healthy"}
                      </span>

                      {cap.toolId && (
                        <span className="text-zinc-600 font-mono text-[10px]">tool:{cap.toolId}</span>
                      )}
                      {cap.agentType && (
                        <span className="text-zinc-600 font-mono text-[10px]">agent:{cap.agentType}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Integrations Catalog with 4 Explicit States */}
        {activeTab === "integrations" && (
          <div className="mt-6 space-y-4">
            <div className="p-4 rounded-xl bg-[#141417] border border-[#232329] flex items-center justify-between text-xs text-zinc-400">
              <div className="flex items-center gap-6">
                <span><strong className="text-white">State 1:</strong> Supported by Mandate</span>
                <span><strong className="text-white">State 2:</strong> Configured by User</span>
                <span><strong className="text-white">State 3:</strong> Authenticated</span>
                <span><strong className="text-white">State 4:</strong> Operational</span>
              </div>
              <span className="text-zinc-500 text-[11px]">Fail-closed security: missing capabilities block execution.</span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {integrations.map((item) => (
                <div
                  key={item.catalog.providerId}
                  className="p-5 rounded-2xl bg-[#141417] border border-[#232329] flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">{item.catalog.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#232329] text-zinc-400 uppercase">
                        {item.catalog.category.replace("_", " ")}
                      </span>
                      {item.catalog.authType !== "NONE" && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Lock className="w-2.5 h-2.5" />
                          {item.catalog.authType}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">{item.catalog.description}</p>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 pt-1">
                      <span>Supported Ops:</span>
                      <span className="font-mono text-zinc-400">{item.catalog.supportedOperations.join(", ")}</span>
                    </div>
                  </div>

                  {/* 4 State Badges & Actions */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-[#1A1A1E] text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Supported
                      </div>

                      <div
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border ${
                          item.isConfigured
                            ? "bg-[#1A1A1E] text-emerald-400 border-emerald-500/20"
                            : "bg-[#1A1A1E]/50 text-zinc-600 border-zinc-800"
                        }`}
                      >
                        {item.isConfigured ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 mr-1" />
                        )}
                        Configured
                      </div>

                      <div
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border ${
                          item.isAuthenticated
                            ? "bg-[#1A1A1E] text-emerald-400 border-emerald-500/20"
                            : "bg-[#1A1A1E]/50 text-zinc-600 border-zinc-800"
                        }`}
                      >
                        {item.isAuthenticated ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 mr-1" />
                        )}
                        Authenticated
                      </div>

                      <div
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border ${
                          item.isOperational
                            ? "bg-[#1A1A1E] text-emerald-400 border-emerald-500/20"
                            : "bg-[#1A1A1E]/50 text-zinc-600 border-zinc-800"
                        }`}
                      >
                        {item.isOperational ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 mr-1" />
                        )}
                        Operational
                      </div>
                    </div>

                    {/* Test Button */}
                    {item.connectionId ? (
                      <button
                        onClick={() => handleTestConnection(item.connectionId, item.catalog.providerId)}
                        disabled={testingId === item.connectionId}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#232329] hover:bg-[#2C2C34] text-white border border-[#33333D] transition-colors flex items-center gap-1.5"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${testingId === item.connectionId ? "animate-spin" : ""}`}
                        />
                        Test Health
                      </button>
                    ) : (
                      <Link
                        href="/integrations"
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#FF3B30]/15 hover:bg-[#FF3B30]/25 text-[#FF3B30] border border-[#FF3B30]/30 transition-colors"
                      >
                        Configure
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {testResult && (
              <div
                className={`p-4 rounded-xl border text-xs font-medium ${
                  testResult.success
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-red-500/10 text-red-400 border-red-500/30"
                }`}
              >
                {testResult.message}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

