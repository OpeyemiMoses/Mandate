"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Scale,
  Shield,
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
} from "lucide-react";

export default function PolicyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const policyId = params.id as string;

  const [policy, setPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"rules" | "versions" | "evaluations">("rules");

  // Rule editing state
  const [rules, setRules] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [changeReason, setChangeReason] = useState("");

  const fetchPolicy = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/governance/policies/${policyId}`);
      const data = await res.json();
      if (data.success && data.policy) {
        setPolicy(data.policy);
        setRules(data.policy.rules || []);
      }
    } catch (err) {
      console.error("Error loading policy:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicy();
  }, [policyId]);

  const handleAddRule = () => {
    setRules([
      ...rules,
      {
        ruleType: "TRANSACTION_LIMIT",
        operator: "GREATER_THAN",
        field: "amountYocto",
        value: "1000000000000000000000000",
        action: "REQUIRE_APPROVAL",
        description: "New rule",
        isEnforced: true,
      },
    ]);
  };

  const handleRemoveRule = (index: number) => {
    const updated = [...rules];
    updated.splice(index, 1);
    setRules(updated);
  };

  const handleRuleChange = (index: number, field: string, val: any) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [field]: val };
    setRules(updated);
  };

  const handleSaveRules = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/governance/policies/${policyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules,
          changeReason: changeReason || "Updated rules via Governance Console",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setChangeReason("");
        await fetchPolicy();
        alert("Policy rules saved and version incremented!");
      } else {
        alert(`Failed to save: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error saving policy: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRevokePolicy = async () => {
    if (!confirm("Are you sure you want to revoke this policy? Revoked policies can never be reactivated.")) return;
    try {
      const res = await fetch(`/api/governance/policies/${policyId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        await fetchPolicy();
      } else {
        alert(`Failed to revoke: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-[#71717A] max-w-5xl mx-auto">
        Loading policy details...
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="p-12 text-center text-white max-w-5xl mx-auto space-y-4">
        <p>Policy not found or access denied.</p>
        <Link href="/governance" className="text-red-400 text-sm hover:underline">
          Return to Governance Center
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Top Breadcrumb & Controls */}
      <div className="flex items-center justify-between border-b border-[#232329] pb-5">
        <div className="flex items-center gap-4">
          <Link
            href="/governance"
            className="p-2 rounded-lg bg-[#141417] border border-[#232329] text-[#A1A1AA] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{policy.name}</h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-[#1E1E24] text-[#A1A1AA] border border-[#2E2E36]">
                v{policy.version}
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  policy.status === "ACTIVE"
                    ? "bg-emerald-950/50 text-emerald-400 border border-emerald-500/20"
                    : "bg-red-950/50 text-red-400 border border-red-500/20"
                }`}
              >
                {policy.status}
              </span>
            </div>
            <p className="text-xs text-[#A1A1AA] mt-1">{policy.description}</p>
          </div>
        </div>

        {!policy.isSystem && policy.status === "ACTIVE" && (
          <button
            onClick={handleRevokePolicy}
            className="px-3 py-1.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-900/50 transition-colors"
          >
            Revoke Policy
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#232329] text-xs">
        {[
          { id: "rules", label: `Policy Rules (${rules.length})` },
          { id: "versions", label: `Version History (${policy.versions?.length || 0})` },
          { id: "evaluations", label: `Recent Evaluations (${policy.evaluations?.length || 0})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-red-500 text-white"
                : "border-transparent text-[#71717A] hover:text-[#A1A1AA]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Policy Rules */}
      {activeTab === "rules" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#A1A1AA]">
              Rules are evaluated deterministically in priority order. All rules fail-closed.
            </p>
            {!policy.isSystem && policy.status === "ACTIVE" && (
              <button
                onClick={handleAddRule}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B1B1F] border border-[#2E2E36] text-xs font-medium text-white hover:bg-[#26262B] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Rule
              </button>
            )}
          </div>

          <div className="space-y-3">
            {rules.map((rule, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-[#141417] border border-[#232329] grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
              >
                <div className="md:col-span-3">
                  <label className="block text-[10px] text-[#71717A] uppercase mb-1">Rule Type</label>
                  <select
                    disabled={policy.isSystem}
                    value={rule.ruleType}
                    onChange={(e) => handleRuleChange(idx, "ruleType", e.target.value)}
                    className="w-full bg-[#0B0B0B] border border-[#232329] rounded px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="TRANSACTION_LIMIT">TRANSACTION_LIMIT</option>
                    <option value="SPENDING_THRESHOLD">SPENDING_THRESHOLD</option>
                    <option value="RECIPIENT_ALLOWLIST">RECIPIENT_ALLOWLIST</option>
                    <option value="RECIPIENT_BLOCKLIST">RECIPIENT_BLOCKLIST</option>
                    <option value="DENIED_TOOLS">DENIED_TOOLS</option>
                    <option value="ALLOWED_OPERATIONS">ALLOWED_OPERATIONS</option>
                    <option value="APPROVAL_REQUIREMENT">APPROVAL_REQUIREMENT</option>
                    <option value="PROHIBITED_ACTION">PROHIBITED_ACTION</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] text-[#71717A] uppercase mb-1">Operator</label>
                  <select
                    disabled={policy.isSystem}
                    value={rule.operator}
                    onChange={(e) => handleRuleChange(idx, "operator", e.target.value)}
                    className="w-full bg-[#0B0B0B] border border-[#232329] rounded px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="GREATER_THAN">GREATER_THAN</option>
                    <option value="LESS_THAN">LESS_THAN</option>
                    <option value="EQUALS">EQUALS</option>
                    <option value="IN">IN</option>
                    <option value="NOT_IN">NOT_IN</option>
                    <option value="CONTAINS">CONTAINS</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[10px] text-[#71717A] uppercase mb-1">Expected Value</label>
                  <input
                    disabled={policy.isSystem}
                    type="text"
                    value={typeof rule.value === "object" ? JSON.stringify(rule.value) : rule.valueJson || rule.value || ""}
                    onChange={(e) => handleRuleChange(idx, "value", e.target.value)}
                    className="w-full bg-[#0B0B0B] border border-[#232329] rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] text-[#71717A] uppercase mb-1">Action</label>
                  <select
                    disabled={policy.isSystem}
                    value={rule.action}
                    onChange={(e) => handleRuleChange(idx, "action", e.target.value)}
                    className="w-full bg-[#0B0B0B] border border-[#232329] rounded px-2.5 py-1.5 text-xs font-semibold text-red-400"
                  >
                    <option value="DENY">DENY</option>
                    <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL</option>
                    <option value="LIMIT">LIMIT</option>
                    <option value="ESCALATE">ESCALATE</option>
                  </select>
                </div>

                <div className="md:col-span-2 flex items-center justify-end gap-2 pt-4 md:pt-0">
                  {!policy.isSystem && (
                    <button
                      onClick={() => handleRemoveRule(idx)}
                      className="p-1.5 rounded hover:bg-red-950/40 text-red-400 transition-colors"
                      title="Remove Rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!policy.isSystem && policy.status === "ACTIVE" && (
            <div className="p-4 rounded-xl bg-[#141417] border border-[#232329] space-y-3">
              <label className="block text-xs font-medium text-[#A1A1AA]">
                Reason for change (recorded in cryptographic version history)
              </label>
              <input
                type="text"
                placeholder="e.g. Tightened procurement limit to 2.0 NEAR"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                className="w-full bg-[#0B0B0B] border border-[#232329] rounded-lg px-3 py-2 text-xs text-white"
              />
              <button
                onClick={handleSaveRules}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? "Publishing v" + (policy.version + 1) + "..." : "Publish New Policy Version"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Version History */}
      {activeTab === "versions" && (
        <div className="space-y-4">
          <div className="space-y-3">
            {policy.versions?.map((v: any) => (
              <div
                key={v.id}
                className="p-4 rounded-xl bg-[#141417] border border-[#232329] flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-white text-sm font-semibold">Version {v.version}</span>
                    <span className="text-[11px] text-[#71717A]">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-[#A1A1AA] mt-1">{v.changeReason || "Version snapshot"}</p>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                  IMMUTABLE
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Recent Evaluations */}
      {activeTab === "evaluations" && (
        <div className="space-y-4">
          <div className="space-y-2.5">
            {policy.evaluations?.map((ev: any) => (
              <div
                key={ev.id}
                className="p-3.5 rounded-xl bg-[#141417] border border-[#232329] flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold ${
                        ev.decision === "ALLOW"
                          ? "text-emerald-400"
                          : ev.decision === "REQUIRE_APPROVAL"
                          ? "text-amber-400"
                          : "text-red-400"
                      }`}
                    >
                      {ev.decision}
                    </span>
                    <span className="text-[#A1A1AA]">{ev.operation || "unspecified"}</span>
                  </div>
                  <p className="text-[11px] text-[#71717A] mt-0.5">
                    {new Date(ev.createdAt).toLocaleString()} · Risk: {ev.riskLevel}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-[#71717A]">{ev.evaluationId}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

