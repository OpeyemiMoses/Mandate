"use client";

import React, { useState, useEffect } from "react";
import {
  Database,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  PlusCircle,
  FileCheck2,
  HardDrive,
  Clock,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Archive,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { OperatorGuard } from "@/components/OperatorGuard";
import { ModalPortal } from "@/components/ModalPortal";

export default function DisasterRecoveryPage() {
  const [manifests, setManifests] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Restore Modal State
  const [selectedBackup, setSelectedBackup] = useState<any | null>(null);
  const [isDrill, setIsDrill] = useState(true);
  const [operatorId, setOperatorId] = useState("admin_operator_1");
  const [operatorRole, setOperatorRole] = useState("SECURITY_ADMIN");

  const fetchData = async () => {
    try {
      const res = await fetch("/api/disaster-recovery/backups");
      const data = await res.json();
      if (data.success) {
        setManifests(data.manifests || []);
        setMetrics(data.metrics || null);
      }
    } catch (err: any) {
      console.error("Failed to load disaster recovery data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateBackup = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/disaster-recovery/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backupType: "FULL",
          createdBy: operatorId,
          trigger: "MANUAL",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create backup");
      }
      setActionMessage({
        type: "success",
        text: `Online backup ${data.result.fileName} created successfully (${Math.round(data.result.sizeBytes / 1024 / 1024 * 10) / 10} MB, ${data.result.durationMs}ms)`,
      });
      await fetchData();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!selectedBackup) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/disaster-recovery/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backupId: selectedBackup.backupId,
          restoredBy: operatorId,
          restoredByRole: operatorRole,
          isDrill,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Restoration failed");
      }
      setActionMessage({
        type: "success",
        text: isDrill
          ? `Disaster recovery drill passed! Integrity verified in ${data.result.durationMs}ms.`
          : `Live database restored successfully! Post-restore financial reconciliation performed. Maintenance mode retained.`,
      });
      setSelectedBackup(null);
      await fetchData();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message });
    } finally {
      setActionLoading(false);
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
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Database className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Disaster Recovery & Backups</h1>
            </div>
            <p className="text-sm text-[#A1A1AA]">
              Zero-downtime online SQLite database backups, SHA-256 integrity verification, and safe restoration drills.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateBackup}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              Create Online Backup
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#141417] border border-[#232329] text-[#A1A1AA] hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Action Messages */}
        {actionMessage && (
          <div
            className={`p-4 rounded-xl text-xs flex items-center gap-3 ${
              actionMessage.type === "success"
                ? "bg-emerald-950/50 border border-emerald-500/50 text-emerald-300"
                : "bg-red-950/50 border border-red-500/50 text-red-300"
            }`}
          >
            {actionMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-[#121216] border border-[#1E1E24] space-y-1">
            <span className="text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider">Measured RPO</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{metrics?.measuredRpoMinutes ?? "--"}</span>
              <span className="text-xs text-zinc-400">min (Target: {metrics?.targetRpoMinutes ?? 60}m)</span>
            </div>
            <p className="text-[11px] text-zinc-500">Recovery Point Objective</p>
          </div>

          <div className="p-5 rounded-2xl bg-[#121216] border border-[#1E1E24] space-y-1">
            <span className="text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider">Measured RTO</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{metrics?.measuredRtoMinutes ?? "--"}</span>
              <span className="text-xs text-zinc-400">min (Target: {metrics?.targetRtoMinutes ?? 15}m)</span>
            </div>
            <p className="text-[11px] text-zinc-500">Recovery Time Objective</p>
          </div>

          <div className="p-5 rounded-2xl bg-[#121216] border border-[#1E1E24] space-y-1">
            <span className="text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider">Backup Success Rate</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-400">{metrics?.backupSuccessRate ?? 100}%</span>
            </div>
            <p className="text-[11px] text-zinc-500">{metrics?.totalBackupsCount ?? 0} total snapshots taken</p>
          </div>

          <div className="p-5 rounded-2xl bg-[#121216] border border-[#1E1E24] space-y-1">
            <span className="text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider">Last Backup Timestamp</span>
            <div className="text-xs font-medium text-white truncate">
              {metrics?.lastSuccessfulBackupAt ? new Date(metrics.lastSuccessfulBackupAt).toLocaleTimeString() : "Never"}
            </div>
            <p className="text-[11px] text-zinc-500 truncate">
              {metrics?.lastSuccessfulBackupAt ? new Date(metrics.lastSuccessfulBackupAt).toLocaleDateString() : "--"}
            </p>
          </div>
        </div>

        {/* Backups Manifest Table */}
        <div className="p-6 rounded-2xl bg-[#121216] border border-[#1E1E24] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Archive className="w-4 h-4 text-[#A1A1AA]" />
              <h2 className="text-sm font-semibold text-white">Database Backup Manifests & Checksums</h2>
            </div>
            <span className="text-[11px] text-[#A1A1AA]">Online Snapshot Engine (VACUUM INTO)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[#A1A1AA] border-b border-[#1E1E24] text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">File Name</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3">SHA-256 Checksum</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A20] text-zinc-300">
                {manifests && manifests.length > 0 ? (
                  manifests.map((b: any) => (
                    <tr key={b.backupId} className="hover:bg-[#18181F]/50 transition-colors">
                      <td className="py-3 px-3 font-mono text-[11px] text-white flex items-center gap-2">
                        <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                        <span className="truncate max-w-xs">{b.fileName}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#1B1B22] border border-[#2B2B36] text-zinc-300">
                          {b.backupType}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-zinc-400">
                        {Math.round((b.sizeBytes / 1024 / 1024) * 10) / 10} MB
                      </td>
                      <td className="py-3 px-3 font-mono text-[10px] text-zinc-500">
                        {b.checksumSha256 ? `${b.checksumSha256.slice(0, 12)}...` : "--"}
                      </td>
                      <td className="py-3 px-3">
                        {b.integrityVerified ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3 h-3" /> VERIFIED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                            <Clock className="w-3 h-3" /> PENDING
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-zinc-500 whitespace-nowrap">
                        {new Date(b.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedBackup(b);
                            setIsDrill(true);
                          }}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[#1D1D24] hover:bg-[#252530] text-zinc-300 transition-colors"
                        >
                          Drill
                        </button>
                        <button
                          onClick={() => {
                            setSelectedBackup(b);
                            setIsDrill(false);
                          }}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 hover:bg-red-900/60 transition-colors"
                        >
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500">
                      No backup snapshots created yet. Click &quot;Create Online Backup&quot; above to take a consistent snapshot.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Restore Confirmation Modal */}
        <ModalPortal isOpen={!!selectedBackup} onClose={() => setSelectedBackup(null)}>
          {selectedBackup && (
            <div className="bg-white dark:bg-[#121216] border border-slate-200 dark:border-[#2B2B36] rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-lg">
                  {isDrill ? (
                    <>
                      <FileCheck2 className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                      <span>Execute Disaster Recovery Drill</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400" />
                      <span>Live Production Restore Confirmation</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-[#A1A1AA]">
                  {isDrill
                    ? "Drills perform an isolated, non-destructive restoration to test checksum validity and schema integrity without touching live production tables."
                    : "Live restoration overwrites the active database with the selected backup snapshot. System must be in MAINTENANCE_MODE. Post-restore financial reconciliation will run automatically."}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#18181F] border border-slate-200 dark:border-[#2B2B36] text-xs space-y-2 text-slate-800 dark:text-slate-200">
                <div>Backup: <strong className="text-slate-900 dark:text-white">{selectedBackup.fileName}</strong></div>
                <div>Size: <span className="text-slate-600 dark:text-zinc-300">{Math.round(selectedBackup.sizeBytes / 1024 / 1024 * 10) / 10} MB</span></div>
                <div>Checksum: <span className="font-mono text-slate-500 dark:text-zinc-400 break-all">{selectedBackup.checksumSha256}</span></div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-slate-600 dark:text-zinc-400 block mb-1">Restoring Operator</label>
                  <input
                    type="text"
                    value={operatorId}
                    onChange={(e) => setOperatorId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-[#1A1A22] border border-slate-300 dark:border-[#333342] rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-600 dark:text-zinc-400 block mb-1">Elevated Role</label>
                  <select
                    value={operatorRole}
                    onChange={(e) => setOperatorRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-[#1A1A22] border border-slate-300 dark:border-[#333342] rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="SECURITY_ADMIN">SECURITY_ADMIN</option>
                    <option value="OWNER">OWNER</option>
                    <option value="OPERATOR">OPERATOR (Insufficient)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedBackup(null)}
                  disabled={actionLoading}
                  className="w-1/2 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1E1E26] dark:hover:bg-[#282833] text-slate-700 dark:text-zinc-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteRestore}
                  disabled={actionLoading}
                  className={`w-1/2 py-2.5 rounded-xl font-semibold text-xs text-white transition-colors flex items-center justify-center gap-2 ${
                    isDrill ? "bg-blue-600 hover:bg-blue-500" : "bg-red-600 hover:bg-red-500"
                  }`}
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : isDrill ? "Run Drill" : "Confirm Live Restore"}
                </button>
              </div>
            </div>
          )}
        </ModalPortal>
      </div>
      </OperatorGuard>
    </AppShell>
  );
}

