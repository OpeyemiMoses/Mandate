"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowRight,
  Filter,
  Play,
  Layers,
  Cpu,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { OperatorGuard } from "@/components/OperatorGuard";

export default function ReconciliationPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningSweep, setRunningSweep] = useState(false);
  const [sweepType, setSweepType] = useState<string>("FULL");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [runsRes, discRes] = await Promise.all([
        fetch("/api/reconciliation/runs?limit=20"),
        fetch("/api/reconciliation/discrepancies?limit=50"),
      ]);

      const runsData = await runsRes.json();
      const discData = await discRes.json();

      if (runsData.success) setRuns(runsData.runs || []);
      if (discData.success) setDiscrepancies(discData.items || []);
    } catch (err) {
      console.error("Failed to load reconciliation data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTriggerSweep = async () => {
    setRunningSweep(true);
    try {
      const res = await fetch("/api/reconciliation/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runType: sweepType }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert(`Reconciliation error: ${data.error}`);
      }
    } catch (err) {
      console.error("Failed to trigger sweep:", err);
    } finally {
      setRunningSweep(false);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "SEV-1":
        return "bg-rose-500/20 text-rose-300 border-rose-500/30";
      case "SEV-2":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      case "SEV-3":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
      default:
        return "bg-zinc-500/20 text-zinc-300 border-zinc-500/30";
    }
  };

  return (
    <AppShell>
      <OperatorGuard>
        <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <RefreshCw className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                Universal Reconciliation Center
              </h1>
              <p className="text-sm text-zinc-400">
                Continuous cross-layer verification of internal database state against NEAR RPC, OutLayer, and worker clusters.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={sweepType}
              onChange={(e) => setSweepType(e.target.value)}
              className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none"
            >
              <option value="FULL">Full Platform Sweep</option>
              <option value="TARGETED_EXECUTION">Executions & On-chain</option>
              <option value="TARGETED_JOB">Background Job Leases</option>
              <option value="TARGETED_WORKER">Worker Heartbeats</option>
              <option value="TARGETED_PROVIDER">External RPC Endpoints</option>
            </select>

            <button
              onClick={handleTriggerSweep}
              disabled={runningSweep}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white transition-colors flex items-center gap-2 shadow-lg shadow-purple-900/20"
            >
              <Play className={`h-4 w-4 ${runningSweep ? "animate-spin" : ""}`} />
              Run Sweep
            </button>
          </div>
        </div>

        {/* Active Discrepancies Queue */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <h2 className="text-base font-semibold text-zinc-100">Active Discrepancies Queue</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold">
                {discrepancies.filter((d) => d.status === "OPEN").length} Open
              </span>
            </div>
          </div>

          {discrepancies.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-zinc-900/30 border border-zinc-800/60">
              <CheckCircle2 className="h-7 w-7 mx-auto text-emerald-400/60 mb-2" />
              <p className="text-xs text-zinc-400">Zero open discrepancies. All states are fully reconciled.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {discrepancies.map((d) => (
                <div
                  key={d.id}
                  className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                      {d.entityType}: {d.entityId.slice(0, 16)}...
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${getSeverityBadge(d.severity)}`}>
                      {d.severity}
                    </span>
                  </div>

                  <div className="text-sm font-semibold text-zinc-200">
                    {d.category.replace(/_/g, " ")}
                  </div>

                  <div className="text-xs bg-zinc-950 p-2.5 rounded border border-zinc-800/80 grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-zinc-500">Internal: </span>
                      <strong className="text-zinc-300">{d.internalState}</strong>
                    </div>
                    <div>
                      <span className="text-zinc-500">External: </span>
                      <strong className="text-zinc-300">{d.externalState || "NONE"}</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-zinc-500">
                      Action: <strong className="text-rose-400">{d.recommendedResponse}</strong>
                    </span>
                    {d.incident && (
                      <Link
                        href={`/incidents/${d.incident.id}`}
                        className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
                      >
                        {d.incident.incidentNumber}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reconciliation Runs History */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-zinc-400" />
            <h2 className="text-base font-semibold text-zinc-100">Reconciliation Run History</h2>
          </div>

          <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 uppercase font-semibold">
                <tr>
                  <th className="p-3.5">Run Type</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Evaluated</th>
                  <th className="p-3.5">Matched</th>
                  <th className="p-3.5">Mismatched</th>
                  <th className="p-3.5">Ambiguous</th>
                  <th className="p-3.5">Started At</th>
                  <th className="p-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="p-3.5 font-semibold text-zinc-200">{run.runType}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        run.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"
                      }`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono">{run.totalEvaluated}</td>
                    <td className="p-3.5 font-mono text-emerald-400">{run.matchedCount}</td>
                    <td className="p-3.5 font-mono text-amber-400">{run.mismatchCount}</td>
                    <td className="p-3.5 font-mono text-rose-400">{run.ambiguousCount}</td>
                    <td className="p-3.5 text-zinc-500">{new Date(run.startedAt).toLocaleTimeString()}</td>
                    <td className="p-3.5 text-right">
                      <Link
                        href={`/reconciliation/${run.id}`}
                        className="text-purple-400 hover:text-purple-300 font-semibold"
                      >
                        View &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </OperatorGuard>
    </AppShell>
  );
}

