"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  RotateCcw,
  LifeBuoy,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Clock,
  ShieldCheck,
  UserCheck,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { OperatorGuard } from "@/components/OperatorGuard";

export default function RecoveryPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "all" | "verified">("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recovery/plans?limit=50");
      const data = await res.json();
      if (data.success) {
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error("Failed to load recovery plans:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleApprove = async (planId: string) => {
    setActionLoading(`approve-${planId}`);
    try {
      const res = await fetch(`/api/recovery/plans/${planId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approverType: "HUMAN" }),
      });
      const data = await res.json();
      if (data.success) {
        fetchPlans();
      } else {
        alert(`Approval error: ${data.error}`);
      }
    } catch (err) {
      console.error("Approval failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecute = async (planId: string) => {
    setActionLoading(`exec-${planId}`);
    try {
      const res = await fetch(`/api/recovery/plans/${planId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        fetchPlans();
      } else {
        alert(`Execution error: ${data.error}`);
      }
    } catch (err) {
      console.error("Execution failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerify = async (planId: string) => {
    setActionLoading(`verify-${planId}`);
    try {
      const res = await fetch(`/api/recovery/plans/${planId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: "DATABASE_CONSISTENCY_CHECK" }),
      });
      const data = await res.json();
      if (data.success) {
        fetchPlans();
      }
    } catch (err) {
      console.error("Verification failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredPlans = plans.filter((p) => {
    if (activeTab === "pending") return p.status === "PENDING_APPROVAL" || p.status === "APPROVED";
    if (activeTab === "verified") return p.status === "VERIFIED";
    return true;
  });

  return (
    <AppShell>
      <OperatorGuard>
        <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <RotateCcw className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                Recovery Orchestration Center
              </h1>
              <p className="text-sm text-zinc-400">
                Safe failure recovery plans, cryptographic human authorizations, and independent post-recovery verifications.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchPlans}
              className="px-3.5 py-2 text-sm font-medium rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/incidents"
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
            >
              Incidents Console
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === "pending"
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Action Required ({plans.filter((p) => p.status === "PENDING_APPROVAL" || p.status === "APPROVED").length})
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === "all"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            All Plans ({plans.length})
          </button>
          <button
            onClick={() => setActiveTab("verified")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === "verified"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Verified Complete ({plans.filter((p) => p.status === "VERIFIED").length})
          </button>
        </div>

        {/* Notice Banner */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-3">
          <Lock className="h-5 w-5 text-amber-400 shrink-0" />
          <div>
            <strong className="font-semibold text-amber-300">Financial Authority Guardrail: </strong>
            Autonomous AI agents cannot approve their own financial recovery plans. Every financial execution recovery plan strictly requires human authorization before execution.
          </div>
        </div>

        {/* Recovery Plans List */}
        <div className="space-y-4">
          {filteredPlans.length === 0 ? (
            <div className="p-12 text-center rounded-xl bg-zinc-900/30 border border-zinc-800/60">
              <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-400/60 mb-2" />
              <p className="text-sm font-semibold text-zinc-300">No active plans in this view</p>
              <p className="text-xs text-zinc-500 mt-1">All recovery plans have been processed or none are currently queued.</p>
            </div>
          ) : (
            filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                        PLAN: {plan.strategy}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold">
                        {plan.status}
                      </span>
                      {plan.isFinancial && (
                        <span className="text-xs px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-semibold flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Financial Authority Bound
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400">
                      Target: <strong className="text-zinc-200">{plan.targetEntityType}</strong> ({plan.targetEntityId})
                      {plan.incident && (
                        <span className="ml-2">
                          Incident: <Link href={`/incidents/${plan.incident.id}`} className="text-rose-400 underline">{plan.incident.incidentNumber}</Link>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {plan.status === "PENDING_APPROVAL" && (
                      <button
                        onClick={() => handleApprove(plan.id)}
                        disabled={actionLoading === `approve-${plan.id}`}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center gap-1.5"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Human Authorization
                      </button>
                    )}

                    {plan.status === "APPROVED" && (
                      <button
                        onClick={() => handleExecute(plan.id)}
                        disabled={actionLoading === `exec-${plan.id}`}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Execute Plan
                      </button>
                    )}

                    {plan.status === "EXECUTED" && (
                      <button
                        onClick={() => handleVerify(plan.id)}
                        disabled={actionLoading === `verify-${plan.id}`}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors flex items-center gap-1.5"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                        Verify Outcome
                      </button>
                    )}

                    {plan.status === "VERIFIED" && (
                      <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" />
                        Verified
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs font-mono space-y-1">
                  <div className="text-zinc-500 truncate">Payload Hash: <span className="text-zinc-400">{plan.payloadHash}</span></div>
                  {plan.mandateVersion && (
                    <div className="text-zinc-500">Bound Mandate Version: <span className="text-zinc-400">v{plan.mandateVersion}</span></div>
                  )}
                </div>

                {/* Verification Evidence */}
                {plan.verifications && plan.verifications.length > 0 && (
                  <div className="text-xs text-emerald-300 bg-emerald-950/20 p-2.5 rounded border border-emerald-900/30 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{plan.verifications[0].outcomeSummary}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      </OperatorGuard>
    </AppShell>
  );
}

