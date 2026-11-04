"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Layers,
  Clock,
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  RefreshCw,
  Terminal,
  Activity,
  Cpu,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.id as string;

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJob = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      const data = await res.json();
      if (data.success && data.job) {
        setJob(data.job);
      } else {
        setError(data.error || "Failed to load job details");
      }
    } catch (e: any) {
      setError(e.message || "Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) fetchJob();
  }, [jobId]);

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this job?")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cancelled manually by user from UI" }),
      });
      if (res.ok) {
        await fetchJob();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to cancel job");
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="w-6 h-6 animate-spin text-[#FF3B30]" />
        </div>
      </AppShell>
    );
  }

  if (error || !job) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Jobs
          </Link>
          <div className="p-6 rounded-2xl bg-[#141417] border border-red-500/30 text-red-400">
            {error || "Job not found"}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Back link & actions */}
        <div className="flex items-center justify-between">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Queue
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchJob}
              disabled={loading}
              className="p-2 rounded-xl bg-[#141417] border border-[#232329] text-zinc-400 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#FF3B30]" : ""}`} />
            </button>
            {["QUEUED", "SCHEDULED", "RETRY_WAIT"].includes(job.status) && (
              <button
                onClick={handleCancel}
                disabled={actionLoading}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                Cancel Job
              </button>
            )}
          </div>
        </div>

        {/* Header Summary */}
        <div className="p-6 rounded-2xl bg-[#141417] border border-[#232329] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold font-mono text-white">{job.id}</h1>
                <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/40">
                  {job.status}
                </span>
                {job.jobCategory === "FINANCIAL" && (
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    FINANCIAL
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1 font-mono">
                Type: {job.jobType} · Correlation: {job.correlationId}
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs text-zinc-500">Priority Level</span>
              <div className="text-xl font-bold text-white font-mono">{job.priority}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[#232329] text-xs">
            <div>
              <span className="text-zinc-500">Scheduled At</span>
              <div className="text-zinc-300 font-mono mt-0.5">
                {new Date(job.scheduledAt).toLocaleString()}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Attempts Count</span>
              <div className="text-zinc-300 font-mono mt-0.5">
                {job.attempts} of {job.maxAttempts}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Worker Assigned</span>
              <div className="text-zinc-300 font-mono mt-0.5">
                {job.worker ? job.worker.workerName : "None"}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Lease Expiration</span>
              <div className="text-zinc-300 font-mono mt-0.5">
                {job.leaseExpiresAt ? new Date(job.leaseExpiresAt).toLocaleTimeString() : "N/A"}
              </div>
            </div>
          </div>
        </div>

        {/* Payload & Integrity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 rounded-2xl bg-[#141417] border border-[#232329] space-y-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#FF3B30]" />
              Validated Job Payload
            </h2>
            <div className="p-3 bg-[#0B0B0B] rounded-xl border border-[#232329] font-mono text-xs text-zinc-300 overflow-x-auto max-h-60">
              <pre>{JSON.stringify(JSON.parse(job.payload || "{}"), null, 2)}</pre>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono break-all">
              Payload SHA-256: {job.payloadHash}
            </div>
          </div>

          {/* Quarantined details if in Dead Letter */}
          {job.deadLetterRecord ? (
            <div className="p-5 rounded-2xl bg-red-950/20 border border-red-500/40 space-y-3">
              <h2 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Quarantined in Dead-Letter Queue
              </h2>
              <div className="text-xs text-zinc-300 space-y-1">
                <div><span className="text-zinc-500">Reason:</span> {job.deadLetterRecord.reason}</div>
                <div><span className="text-zinc-500">Final Error:</span> {job.deadLetterRecord.finalError}</div>
                <div><span className="text-zinc-500">Quarantined At:</span> {new Date(job.deadLetterRecord.quarantinedAt).toLocaleString()}</div>
                <div><span className="text-zinc-500">Resolution:</span> {job.deadLetterRecord.resolution}</div>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-[#141417] border border-[#232329] space-y-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                Execution Authority Status
              </h2>
              <div className="text-xs text-zinc-400 space-y-2">
                <p>
                  Execution verified under Mandate authority boundaries. Secrets, private keys, and signing tokens are strictly isolated from background job storage.
                </p>
                {job.idempotencyKey && (
                  <div className="font-mono text-[11px] text-zinc-500">
                    Idempotency Key: {job.idempotencyKey}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Processing Attempts History */}
        <div className="p-5 rounded-2xl bg-[#141417] border border-[#232329] space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            Processing Attempt History ({job.attemptsList?.length || 0})
          </h2>

          <div className="space-y-2">
            {!job.attemptsList || job.attemptsList.length === 0 ? (
              <p className="text-xs text-zinc-500 italic py-2">No attempts recorded yet.</p>
            ) : (
              job.attemptsList.map((att: any) => (
                <div
                  key={att.id}
                  className="p-3 rounded-xl bg-[#1A1A1E] border border-[#232329] flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-zinc-200">
                      Attempt #{att.attemptNumber}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        att.outcome === "SUCCESS"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : att.outcome === "RUNNING"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {att.outcome}
                    </span>
                    {att.errorMessage && (
                      <span className="text-zinc-400 truncate max-w-md" title={att.errorMessage}>
                        {att.errorMessage}
                      </span>
                    )}
                  </div>

                  <div className="text-zinc-500 font-mono text-[11px]">
                    {att.durationMs ? `${att.durationMs}ms · ` : ""}
                    {new Date(att.startedAt).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Append-Only Lifecycle Event Timeline */}
        <div className="p-5 rounded-2xl bg-[#141417] border border-[#232329] space-y-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#FF3B30]" />
            Append-Only Lifecycle Event Stream ({job.eventsList?.length || 0})
          </h2>

          <div className="relative pl-6 space-y-4 border-l border-[#232329]">
            {job.eventsList?.map((evt: any) => (
              <div key={evt.id} className="relative text-xs">
                <span className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-[#FF3B30] border-2 border-[#141417]" />
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{evt.eventType}</span>
                  {evt.previousStatus && (
                    <span className="text-zinc-500">
                      {evt.previousStatus} → {evt.newStatus}
                    </span>
                  )}
                  <span className="text-[11px] text-zinc-500 font-mono ml-auto">
                    {new Date(evt.createdAt).toLocaleString()}
                  </span>
                </div>
                {evt.metadata && evt.metadata !== "{}" && (
                  <div className="mt-1 font-mono text-[11px] text-zinc-500">
                    {evt.metadata}
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

