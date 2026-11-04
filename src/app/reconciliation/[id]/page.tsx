"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  FileText,
  Shield,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";

export default function ReconciliationRunDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRun = async () => {
      try {
        const res = await fetch(`/api/reconciliation/runs/${params.id}`);
        const data = await res.json();
        if (data.success) {
          setRun(data.run);
        }
      } catch (err) {
        console.error("Failed to load run details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRun();
  }, [params.id]);

  if (loading) {
    return (
      <AppShell>
        <div className="p-12 text-center text-zinc-500">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-zinc-400" />
          Loading reconciliation run details...
        </div>
      </AppShell>
    );
  }

  if (!run) {
    return (
      <AppShell>
        <div className="p-12 text-center text-zinc-500">
          <p>Reconciliation run not found.</p>
          <Link href="/reconciliation" className="text-purple-400 underline mt-2 inline-block">
            Back to Reconciliation
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/reconciliation"
          className="text-xs font-medium text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Reconciliation Console
        </Link>

        {/* Header Summary */}
        <div className="p-6 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                  RUN {run.id.slice(0, 12)}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                  run.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"
                }`}>
                  {run.status}
                </span>
                <span className="text-xs text-zinc-500">{run.runType}</span>
              </div>
              <h1 className="text-xl font-bold text-zinc-100 mt-1">Reconciliation Sweep Detail</h1>
            </div>

            <div className="text-right text-xs text-zinc-500">
              <div>Started: <strong className="text-zinc-300">{new Date(run.startedAt).toLocaleString()}</strong></div>
              {run.completedAt && (
                <div>Completed: <strong className="text-zinc-300">{new Date(run.completedAt).toLocaleString()}</strong></div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-3 border-t border-zinc-800/80">
            <div>
              <span className="text-zinc-500">Total Evaluated:</span>
              <div className="text-lg font-bold text-zinc-100">{run.totalEvaluated}</div>
            </div>
            <div>
              <span className="text-zinc-500">Matched Clean:</span>
              <div className="text-lg font-bold text-emerald-400">{run.matchedCount}</div>
            </div>
            <div>
              <span className="text-zinc-500">Mismatched:</span>
              <div className="text-lg font-bold text-amber-400">{run.mismatchCount}</div>
            </div>
            <div>
              <span className="text-zinc-500">Ambiguous:</span>
              <div className="text-lg font-bold text-rose-400">{run.ambiguousCount}</div>
            </div>
          </div>
        </div>

        {/* Findings List */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-zinc-100">
            Reconciliation Findings ({run.findings?.length || 0})
          </h2>

          <div className="space-y-3">
            {run.findings?.map((finding: any) => (
              <div
                key={finding.id}
                className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                      {finding.entityType}: {finding.entityId}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                      finding.classification === "MATCHED"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : finding.classification === "AMBIGUOUS"
                        ? "bg-rose-500/10 text-rose-300"
                        : "bg-amber-500/10 text-amber-300"
                    }`}>
                      {finding.classification}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded border border-zinc-700 text-zinc-400">
                      {finding.severity}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-zinc-300">{finding.details}</p>

                <div className="text-xs bg-zinc-950 p-2.5 rounded border border-zinc-800/80 grid grid-cols-2 gap-2">
                  <div>Internal: <strong className="text-zinc-300">{finding.internalState}</strong></div>
                  <div>External: <strong className="text-zinc-300">{finding.externalState || "NONE"}</strong></div>
                </div>

                {/* Evidence Hashes */}
                {finding.evidences && finding.evidences.length > 0 && (
                  <div className="pt-2 border-t border-zinc-800/60 space-y-1">
                    <span className="text-[11px] font-semibold text-zinc-400">Cryptographic Evidence:</span>
                    {finding.evidences.map((ev: any) => (
                      <div key={ev.id} className="text-[11px] font-mono text-zinc-500 flex items-center justify-between bg-zinc-950 px-2 py-1 rounded">
                        <span>Provider: <strong className="text-zinc-400">{ev.sourceProvider}</strong> ({ev.observedState})</span>
                        <span className="truncate max-w-xs">{ev.payloadHash}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

