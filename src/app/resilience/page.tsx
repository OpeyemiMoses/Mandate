"use client";

import React, { useState, useEffect } from "react";
import {
  Zap,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Cpu,
  Layers,
  Power,
  Server,
  Flame,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { OperatorGuard } from "@/components/OperatorGuard";

const AVAILABLE_DRILLS = [
  { id: "SECURITY_LOCKDOWN_ENFORCEMENT", label: "Security Lockdown Enforcement", desc: "Verifies fail-closed panic button and agent authorization prohibition." },
  { id: "EMERGENCY_PAUSE_FINANCIAL", label: "Emergency Financial Pause", desc: "Verifies financial calls are blocked while non-financial reasoning continues." },
  { id: "SEV1_BLOCKS_PAUSE_RELEASE", label: "SEV-1 Blocks Pause Release", desc: "Guarantees unacknowledged SEV-1 incidents prevent resuming execution without override." },
  { id: "CORRUPTED_BACKUP_DETECTION", label: "Corrupted Backup Detection", desc: "Verifies magic byte headers and checksum validation detect file tampering." },
  { id: "FULL_RESTORE_DRILL", label: "Full Restore Drill", desc: "Executes non-destructive database restore into sandbox and checks integrity." },
  { id: "QUEUE_BACKPRESSURE_OVERLOAD", label: "Queue Backpressure Overload", desc: "Tests queue saturation and verifies financial job durability guarantee." },
  { id: "STALE_WORKER_RECLAMATION", label: "Stale Worker Reclamation", desc: "Simulates worker crash and verifies orphaned lease recovery." },
  { id: "SUDDEN_SIGTERM_SHUTDOWN", label: "Sudden SIGTERM Shutdown", desc: "Tests graceful drain coordinator and in-flight lease preservation." },
  { id: "WORKER_CRASH_FINANCIAL", label: "Worker Crash (Financial Job)", desc: "Guarantees budget reservations remain locked when a financial worker crashes." },
  { id: "WORKER_CRASH_NON_FINANCIAL", label: "Worker Crash (Non-Financial)", desc: "Verifies non-financial tasks are safely returned to PENDING." },
  { id: "AMBIGUOUS_NEAR_TIMEOUT", label: "Ambiguous NEAR RPC Timeout", desc: "Ensures timeout on blockchain broadcast does not drop transaction or double-spend." },
  { id: "AMBIGUOUS_OUTLAYER_TIMEOUT", label: "Ambiguous OutLayer Timeout", desc: "Preserves signing session locks and marks status AMBIGUOUS." },
  { id: "DB_DISCONNECT_CLAIM", label: "Database Disconnect on Claim", desc: "Tests worker backoff when database is temporarily unreachable." },
  { id: "DB_DISCONNECT_EXECUTION", label: "Database Disconnect on Execution", desc: "Verifies execution boundaries halt without uncommitted state drift." },
];

export default function ResiliencePage() {
  const [liveness, setLiveness] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [breakers, setBreakers] = useState<any[]>([]);
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [recentDrills, setRecentDrills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningDrillId, setRunningDrillId] = useState<string | null>(null);
  const [selectedDrillReport, setSelectedDrillReport] = useState<any | null>(null);

  const fetchTelemetry = async () => {
    try {
      const [liveRes, readyRes, breakRes, queueRes, drillRes] = await Promise.all([
        fetch("/api/health/live"),
        fetch("/api/health/ready"),
        fetch("/api/resilience/providers"),
        fetch("/api/resilience/queue"),
        fetch("/api/resilience/drills"),
      ]);

      const [liveData, readyData, breakData, queueData, drillData] = await Promise.all([
        liveRes.json().catch(() => null),
        readyRes.json().catch(() => null),
        breakRes.json().catch(() => null),
        queueRes.json().catch(() => null),
        drillRes.json().catch(() => null),
      ]);

      setLiveness(liveData);
      setReadiness(readyData);
      setBreakers(breakData?.breakers || []);
      setQueueStatus(queueData?.status || null);
      setRecentDrills(drillData?.drills || []);
    } catch (err: any) {
      console.error("Failed to load resilience telemetry:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleRunDrill = async (drillType: string) => {
    setRunningDrillId(drillType);
    setSelectedDrillReport(null);
    try {
      const res = await fetch("/api/resilience/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drillType, actorId: "OPERATOR_ADMIN", actorRole: "SECURITY_ADMIN" }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedDrillReport(data.result);
      } else {
        alert(`Drill failed: ${data.error}`);
      }
      await fetchTelemetry();
    } catch (err: any) {
      alert(`Drill execution error: ${err.message}`);
    } finally {
      setRunningDrillId(null);
    }
  };

  const handleBreakerAction = async (providerId: string, action: "RESET" | "TRIP") => {
    try {
      const res = await fetch("/api/resilience/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          action,
          reason: `Operator manual ${action}`,
          actorId: "OPERATOR_ADMIN",
          actorRole: "SECURITY_ADMIN",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to update circuit breaker");
      }
      await fetchTelemetry();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <AppShell>
      <OperatorGuard>
        <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#1E1E24]">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Zap className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Resilience & Chaos Engineering</h1>
            </div>
            <p className="text-sm text-[#A1A1AA]">
              Circuit breakers, backpressure telemetry, process lifecycle monitoring, and automated resilience drills.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchTelemetry}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#141417] border border-[#232329] text-[#A1A1AA] hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh Telemetry
            </button>
          </div>
        </div>

        {/* Telemetry Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-[#121216] border border-[#1E1E24] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider">Process Liveness</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-xl font-bold text-white">{liveness?.status || "ALIVE"}</div>
            <p className="text-[11px] text-zinc-500">
              PID: {liveness?.pid ?? process.pid} · Uptime: {liveness?.uptimeSeconds ?? "--"}s · {liveness?.memoryUsageMb ?? "--"} MB RSS
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#121216] border border-[#1E1E24] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider">Platform Readiness</span>
              <span className={`w-2 h-2 rounded-full ${readiness?.status === "READY" ? "bg-emerald-400" : "bg-amber-400"}`} />
            </div>
            <div className="text-xl font-bold text-white">{readiness?.status || "READY"}</div>
            <p className="text-[11px] text-zinc-500">
              Database: {readiness?.databaseHealthy ? "OK" : "DOWN"} · Gate: {readiness?.operationalMode || "NORMAL"}
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#121216] border border-[#1E1E24] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider">Queue Backpressure</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${queueStatus?.admissionState === "NORMAL" ? "bg-emerald-950 text-emerald-400" : "bg-amber-950 text-amber-400"}`}>
                {queueStatus?.admissionState || "NORMAL"}
              </span>
            </div>
            <div className="text-xl font-bold text-white">
              {queueStatus?.pendingQueueDepth ?? 0} <span className="text-xs font-normal text-zinc-400">pending jobs</span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Saturation: {queueStatus?.saturationPercentage ?? 0}% · Running: {queueStatus?.runningQueueDepth ?? 0}
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#121216] border border-[#1E1E24] space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider">Active Circuit Breakers</span>
              <Server className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-xl font-bold text-white">{breakers.length} Providers</div>
            <p className="text-[11px] text-zinc-500">
              {breakers.filter((b) => b.state === "CLOSED").length} Closed · {breakers.filter((b) => b.state === "OPEN").length} Open
            </p>
          </div>
        </div>

        {/* Provider Circuit Breakers Section */}
        <div className="p-6 rounded-2xl bg-[#121216] border border-[#1E1E24] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Server className="w-4 h-4 text-[#A1A1AA]" />
              <h2 className="text-sm font-semibold text-white">External RPC & Enclave Circuit Breakers</h2>
            </div>
            <span className="text-[11px] text-[#A1A1AA]">CLOSED ➔ OPEN (5 fails) ➔ HALF_OPEN (30s cooldown)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {breakers.length > 0 ? (
              breakers.map((b: any) => (
                <div key={b.providerId} className="p-4 rounded-xl bg-[#18181F] border border-[#2B2B36] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-white">{b.providerId}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        b.state === "CLOSED"
                          ? "bg-emerald-950 border border-emerald-500/40 text-emerald-300"
                          : b.state === "OPEN"
                          ? "bg-red-950 border border-red-500/40 text-red-300"
                          : "bg-amber-950 border border-amber-500/40 text-amber-300"
                      }`}
                    >
                      {b.state}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 space-y-1">
                    <div>Failures: <strong className="text-zinc-200">{b.failureCount}</strong> / {b.failureThreshold}</div>
                    <div>Successes: <strong className="text-zinc-200">{b.successCount}</strong></div>
                    {b.lastErrorMessage && (
                      <div className="text-red-400 text-[10px] truncate" title={b.lastErrorMessage}>
                        Err: {b.lastErrorMessage}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1 border-t border-[#262630]">
                    <button
                      onClick={() => handleBreakerAction(b.providerId, "RESET")}
                      className="w-1/2 py-1 text-[10px] font-medium rounded bg-[#252530] hover:bg-[#30303D] text-zinc-300 transition-colors"
                    >
                      Reset (Closed)
                    </button>
                    <button
                      onClick={() => handleBreakerAction(b.providerId, "TRIP")}
                      className="w-1/2 py-1 text-[10px] font-medium rounded bg-red-950/40 border border-red-500/30 hover:bg-red-900/60 text-red-300 transition-colors"
                    >
                      Trip (Open)
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-3 text-center py-4 text-xs text-zinc-500">
                Circuit breakers initialized on first RPC invocation.
              </div>
            )}
          </div>
        </div>

        {/* Drill Report Details Banner */}
        {selectedDrillReport && (
          <div className="p-6 rounded-2xl bg-[#14141B] border border-blue-500/40 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Drill Report: {selectedDrillReport.drillType}</h3>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${selectedDrillReport.status === "PASSED" ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"}`}>
                {selectedDrillReport.status} ({selectedDrillReport.assertionsPassed}/{selectedDrillReport.assertions.length} Passed in {selectedDrillReport.durationMs}ms)
              </span>
            </div>

            <div className="space-y-2">
              {selectedDrillReport.assertions.map((assertion: any, idx: number) => (
                <div key={idx} className="p-3 rounded-xl bg-[#181822] border border-[#272736] text-xs flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-white">{assertion.name}</div>
                    <div className="text-[11px] text-zinc-400">Expected: {assertion.expected} · Actual: {assertion.actual}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${assertion.passed ? "text-emerald-400 bg-emerald-950/60" : "text-red-400 bg-red-950/60"}`}>
                    {assertion.passed ? "PASSED" : "FAILED"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 14 Failure Drills Grid */}
        <div className="p-6 rounded-2xl bg-[#121216] border border-[#1E1E24] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Flame className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Automated Failure Injection & Recovery Drills</h2>
            </div>
            <span className="text-[11px] text-[#A1A1AA]">14 Production Resilience Scenarios</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AVAILABLE_DRILLS.map((drill) => (
              <div key={drill.id} className="p-4 rounded-xl bg-[#18181F] border border-[#242430] flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-white">{drill.label}</h4>
                  <p className="text-[11px] text-[#A1A1AA]">{drill.desc}</p>
                </div>
                <button
                  onClick={() => handleRunDrill(drill.id)}
                  disabled={runningDrillId === drill.id}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-medium transition-colors flex items-center gap-1.5 flex-shrink-0"
                >
                  {runningDrillId === drill.id ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  Execute Drill
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      </OperatorGuard>
    </AppShell>
  );
}

