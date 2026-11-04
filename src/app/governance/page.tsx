"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Scale,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Play,
  RotateCw,
  FileText,
  Sliders,
  Eye,
  Lock,
  ArrowUpRight,
  Filter,
} from "lucide-react";

import { ModalPortal } from "@/components/ModalPortal";

export default function GovernanceCenterPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterScope, setFilterScope] = useState<string>("ALL");
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null);

  // New policy modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState("");
  const [newPolicyDesc, setNewPolicyDesc] = useState("");
  const [newPolicyScope, setNewPolicyScope] = useState("USER");
  const [newPolicyPriority, setNewPolicyPriority] = useState(100);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [polRes, tempRes, violRes] = await Promise.all([
        fetch("/api/governance/policies"),
        fetch("/api/governance/templates"),
        fetch("/api/governance/violations?limit=10"),
      ]);
      const polData = await polRes.json();
      const tempData = await tempRes.json();
      const violData = await violRes.json();

      if (polData.success) setPolicies(polData.policies || []);
      if (tempData.success) setTemplates(tempData.templates || []);
      if (violData.success) setViolations(violData.violations || []);
    } catch (err) {
      console.error("Error fetching governance data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApplyTemplate = async (templateId: string) => {
    setApplyingTemplate(templateId);
    try {
      const res = await fetch("/api/governance/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchData();
      } else {
        alert(`Error applying template: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Request failed: ${err.message}`);
    } finally {
      setApplyingTemplate(null);
    }
  };

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicyName) return;

    try {
      const res = await fetch("/api/governance/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPolicyName,
          description: newPolicyDesc,
          scope: newPolicyScope,
          priority: newPolicyPriority,
          rules: [],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setNewPolicyName("");
        setNewPolicyDesc("");
        await fetchData();
      } else {
        alert(`Failed to create policy: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const filteredPolicies = policies.filter((p) => {
    if (filterScope === "ALL") return true;
    return p.scope === filterScope;
  });

  const activeCount = policies.filter((p) => p.status === "ACTIVE").length;
  const systemCount = policies.filter((p) => p.isSystem).length;
  const violationCount = violations.length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#232329] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/20 text-red-400">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Policy & Compliance Governance
              </h1>
              <p className="text-sm text-[#A1A1AA]">
                Deterministic authority boundaries, rules engine, and compliance auditing.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/governance/simulator"
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#141417] border border-[#2B2B32] text-sm font-medium text-white hover:border-[#3E3E47] transition-colors"
          >
            <Play className="w-4 h-4 text-emerald-400" />
            Policy Simulator
          </Link>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors shadow-lg shadow-red-950/30"
          >
            <Plus className="w-4 h-4" />
            Create Policy
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-[#141417] border border-[#232329]">
          <div className="flex items-center justify-between text-[#A1A1AA] text-xs font-medium uppercase tracking-wider mb-2">
            <span>Active Policies</span>
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold text-white">{activeCount}</div>
          <div className="text-xs text-[#71717A] mt-1">Enforced across agents & tools</div>
        </div>

        <div className="p-5 rounded-xl bg-[#141417] border border-[#232329]">
          <div className="flex items-center justify-between text-[#A1A1AA] text-xs font-medium uppercase tracking-wider mb-2">
            <span>System Guardrails</span>
            <Lock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-bold text-white">{systemCount}</div>
          <div className="text-xs text-[#71717A] mt-1">Immutable platform ceilings</div>
        </div>

        <div className="p-5 rounded-xl bg-[#141417] border border-[#232329]">
          <div className="flex items-center justify-between text-[#A1A1AA] text-xs font-medium uppercase tracking-wider mb-2">
            <span>Rule Templates</span>
            <FileText className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-bold text-white">{templates.length}</div>
          <div className="text-xs text-[#71717A] mt-1">Pre-configured architectures</div>
        </div>

        <div className="p-5 rounded-xl bg-[#141417] border border-[#232329]">
          <div className="flex items-center justify-between text-[#A1A1AA] text-xs font-medium uppercase tracking-wider mb-2">
            <span>Recent Violations</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-3xl font-bold text-white">{violationCount}</div>
          <div className="text-xs text-[#71717A] mt-1">Blocked unauthorized attempts</div>
        </div>
      </div>

      {/* Main Content Layout: Policies & Templates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Policies List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-red-500" />
              Configured Governance Policies
            </h2>

            {/* Scope Filter */}
            <div className="flex items-center gap-1.5 bg-[#141417] border border-[#232329] p-1 rounded-lg text-xs">
              {["ALL", "USER", "AGENT", "MANDATE", "INTEGRATION"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterScope(s)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    filterScope === s
                      ? "bg-red-600/20 text-red-400 border border-red-500/30"
                      : "text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-[#71717A] bg-[#141417] rounded-xl border border-[#232329]">
              Loading governance policies...
            </div>
          ) : filteredPolicies.length === 0 ? (
            <div className="p-12 text-center bg-[#141417] rounded-xl border border-[#232329] space-y-3">
              <Shield className="w-8 h-8 text-[#52525B] mx-auto" />
              <div className="text-white font-medium">No policies found for this filter</div>
              <p className="text-xs text-[#71717A] max-w-sm mx-auto">
                Instantiate a pre-built template from the right panel or create a custom policy rule.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPolicies.map((policy) => (
                <div
                  key={policy.id}
                  className="p-5 rounded-xl bg-[#141417] border border-[#232329] hover:border-[#383842] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{policy.name}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          policy.status === "ACTIVE"
                            ? "bg-emerald-950/50 text-emerald-400 border border-emerald-500/20"
                            : policy.status === "REVOKED"
                            ? "bg-red-950/50 text-red-400 border border-red-500/20"
                            : "bg-amber-950/50 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {policy.status}
                      </span>
                      {policy.isSystem && (
                        <span className="text-[10px] bg-blue-950/50 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-mono">
                          SYSTEM
                        </span>
                      )}
                      <span className="text-xs text-[#71717A]">v{policy.version}</span>
                    </div>

                    <p className="text-xs text-[#A1A1AA] line-clamp-2 max-w-xl">
                      {policy.description || "No description provided."}
                    </p>

                    <div className="flex items-center gap-4 text-[11px] text-[#71717A] pt-1">
                      <span>Scope: <span className="text-white font-medium">{policy.scope}</span></span>
                      <span>Priority: <span className="text-white font-medium">{policy.priority}</span></span>
                      <span>Rules: <span className="text-white font-medium">{policy.rules?.length || 0}</span></span>
                      <span>Evaluations: <span className="text-white font-medium">{policy._count?.evaluations || 0}</span></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/governance/${policy.id}`}
                      className="px-3 py-1.5 rounded-lg bg-[#1B1B1F] hover:bg-[#26262B] text-xs font-medium text-white border border-[#2E2E36] transition-colors flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Configure
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Col: Pre-Built Templates & Violation Stream */}
        <div className="space-y-6">
          {/* Templates Section */}
          <div className="p-5 rounded-xl bg-[#141417] border border-[#232329] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                Policy Templates
              </h3>
              <span className="text-[11px] text-[#71717A]">Instant Deployment</span>
            </div>

            <div className="space-y-3">
              {templates.slice(0, 4).map((tpl) => (
                <div
                  key={tpl.id}
                  className="p-3.5 rounded-lg bg-[#0F0F12] border border-[#1E1E24] space-y-2 hover:border-[#2B2B32] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">{tpl.name}</span>
                    <span className="text-[9px] uppercase font-bold text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/20">
                      {tpl.scope}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#A1A1AA] line-clamp-2">
                    {tpl.description}
                  </p>
                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-[10px] text-[#71717A]">{tpl.rules.length} rules included</span>
                    <button
                      onClick={() => handleApplyTemplate(tpl.id)}
                      disabled={applyingTemplate === tpl.id}
                      className="text-[11px] text-red-400 hover:text-red-300 font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      {applyingTemplate === tpl.id ? "Deploying..." : "Apply Template"}
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Violations Stream */}
          <div className="p-5 rounded-xl bg-[#141417] border border-[#232329] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Recent Policy Violations
              </h3>
              <span className="text-[11px] text-[#71717A]">Fail-Closed Log</span>
            </div>

            {violations.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#71717A]">
                No policy violations recorded. All operations compliant.
              </div>
            ) : (
              <div className="space-y-2.5">
                {violations.map((v) => (
                  <div
                    key={v.id}
                    className="p-3 rounded-lg bg-[#0F0F12] border border-red-500/20 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-red-400 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" />
                        {v.actionAttempted}
                      </span>
                      <span className="text-[10px] text-[#71717A]">
                        {new Date(v.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A1A1AA]">{v.violationReason}</p>
                    <div className="text-[10px] text-[#71717A] flex items-center justify-between pt-1">
                      <span>Policy: {v.policy?.name}</span>
                      <span className="font-mono text-red-500 uppercase">{v.severity}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Policy Modal */}
      <ModalPortal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <div className="bg-white dark:bg-[#141417] border border-slate-200 dark:border-[#2B2B32] rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-red-500" />
            Create Governance Policy
          </h3>

          <form onSubmit={handleCreatePolicy} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#A1A1AA] mb-1">
                Policy Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Treasury Spending Guardrail"
                value={newPolicyName}
                onChange={(e) => setNewPolicyName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0B0B0B] border border-slate-300 dark:border-[#232329] rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#A1A1AA] mb-1">
                Description
              </label>
              <textarea
                rows={3}
                placeholder="Describe the operational boundaries and authority intent..."
                value={newPolicyDesc}
                onChange={(e) => setNewPolicyDesc(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-[#0B0B0B] border border-slate-300 dark:border-[#232329] rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#A1A1AA] mb-1">
                  Scope
                </label>
                <select
                  value={newPolicyScope}
                  onChange={(e) => setNewPolicyScope(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0B0B0B] border border-slate-300 dark:border-[#232329] rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                >
                  <option value="USER">USER (Universal)</option>
                  <option value="AGENT">AGENT</option>
                  <option value="MANDATE">MANDATE</option>
                  <option value="INTEGRATION">INTEGRATION</option>
                  <option value="COORDINATION_RUN">COORDINATION</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#A1A1AA] mb-1">
                  Priority (Lower = Higher)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={newPolicyPriority}
                  onChange={(e) => setNewPolicyPriority(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0B0B0B] border border-slate-300 dark:border-[#232329] rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-[#232329]">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1B1B1F] text-xs font-medium text-slate-600 dark:text-[#A1A1AA] dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium text-white shadow"
              >
                Create Policy
              </button>
            </div>
          </form>
        </div>
      </ModalPortal>
    </div>
  );
}

