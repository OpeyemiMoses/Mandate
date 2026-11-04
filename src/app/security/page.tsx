"use client";

import React, { useEffect, useState } from "react";
import {
  ShieldCheck,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ExternalLink,
  KeyRound,
  FileCheck2,
  Terminal,
  Activity,
  Layers,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { OperatorGuard } from "@/components/OperatorGuard";
import { ModalPortal } from "@/components/ModalPortal";
import { yoctoToNear } from "@/lib/yocto";

interface ExecutionItem {
  id: string;
  idempotencyKey: string;
  status: string;
  operation: string;
  recipient: string;
  amountYocto: string;
  txHash?: string;
  blockHash?: string;
  nonce: string;
  authSignature: string;
  isNonceConsumed: boolean;
  expiresAt: string;
  createdAt: string;
  errorReason?: string;
  recoveryStatus?: string;
  mandate?: { id: string; name: string };
  agent?: { id: string; name: string; type: string };
}

export default function ExecutionSecurityPage() {
  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionItem | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

  const fetchExecutions = async () => {
    try {
      const res = await fetch("/api/execution");
      const data = await res.json();
      if (data.success) {
        setExecutions(data.executions || []);
      }
    } catch (err) {
      console.error("Failed to load executions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExecutions();
    const interval = setInterval(fetchExecutions, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRecover = async (executionId: string) => {
    setReconciling(true);
    setRecoveryMessage(null);
    try {
      const res = await fetch("/api/execution/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionId }),
      });
      const data = await res.json();
      if (data.success) {
        setRecoveryMessage(`Recovery status: ${data.status} — ${data.notes}`);
        await fetchExecutions();
      } else {
        setRecoveryMessage(`Recovery failed: ${data.error}`);
      }
    } catch (err: any) {
      setRecoveryMessage(`Recovery error: ${err.message}`);
    } finally {
      setReconciling(false);
    }
  };

  // Metrics calculation
  const totalCount = executions.length;
  const confirmedCount = executions.filter((e) => e.status === "CONFIRMED").length;
  const broadcastCount = executions.filter((e) => e.status === "BROADCAST" || e.status === "CONFIRMING").length;
  const recoveryCount = executions.filter((e) => e.status === "REQUIRES_RECOVERY" || e.recoveryStatus).length;
  const failedCount = executions.filter((e) => e.status === "FAILED").length;

  return (
    <AppShell>
      <OperatorGuard>
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1E1E24] pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white">Execution Security & Boundary Control</h1>
          </div>
          <p className="text-sm text-[#A1A1AA]">
            Milestone 8 Authoritative Execution Pipeline: Cryptographic Authorization Envelopes, Single-Use Nonces, and Settlement Integrity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchExecutions()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#18181B] hover:bg-[#27272A] border border-[#27272A] text-xs text-[#E4E4E7] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-[#121215] border border-[#1E1E24]">
          <div className="flex items-center justify-between text-xs text-[#A1A1AA] mb-1">
            <span>Total Dispatched</span>
            <Layers className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold text-white">{totalCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-[#121215] border border-[#1E1E24]">
          <div className="flex items-center justify-between text-xs text-[#A1A1AA] mb-1">
            <span>Confirmed On-Chain</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{confirmedCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-[#121215] border border-[#1E1E24]">
          <div className="flex items-center justify-between text-xs text-[#A1A1AA] mb-1">
            <span>Broadcasting / In-Flight</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400">{broadcastCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-[#121215] border border-[#1E1E24]">
          <div className="flex items-center justify-between text-xs text-[#A1A1AA] mb-1">
            <span>Requires Recovery</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{recoveryCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-[#121215] border border-[#1E1E24]">
          <div className="flex items-center justify-between text-xs text-[#A1A1AA] mb-1">
            <span>Rejected / Failed</span>
            <Lock className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400">{failedCount}</div>
        </div>
      </div>

      {recoveryMessage && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
          {recoveryMessage}
        </div>
      )}

      {/* Main Execution Table */}
      <div className="rounded-xl border border-[#1E1E24] bg-[#121215] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1E1E24] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Authoritative Execution Registry</h2>
          </div>
          <span className="text-xs text-[#71717A]">Auto-refreshes every 10s</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-[#A1A1AA]">Loading authoritative executions...</div>
        ) : executions.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#A1A1AA]">
            No execution envelopes recorded yet. Executions dispatched through autonomous agents, coordination runs, or approved requests will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#18181D] text-[#A1A1AA] border-b border-[#1E1E24]">
                <tr>
                  <th className="px-6 py-3 font-medium">Execution ID / Nonce</th>
                  <th className="px-6 py-3 font-medium">Mandate / Agent</th>
                  <th className="px-6 py-3 font-medium">Recipient</th>
                  <th className="px-6 py-3 font-medium">Amount (NEAR)</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Tx Hash / On-Chain</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E1E24] text-[#E4E4E7]">
                {executions.map((exec) => (
                  <tr key={exec.id} className="hover:bg-[#18181D]/60 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-mono text-[11px] text-white">{exec.id.slice(0, 16)}...</div>
                      <div className="font-mono text-[10px] text-[#71717A] mt-0.5 flex items-center gap-1">
                        <KeyRound className="w-2.5 h-2.5" />
                        {exec.nonce}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{exec.mandate?.name || "Shared Mandate"}</div>
                      <div className="text-[11px] text-[#A1A1AA]">{exec.agent?.name || "Specialist Agent"}</div>
                    </td>

                    <td className="px-6 py-4 font-mono text-[11px] text-zinc-300">
                      {exec.recipient}
                    </td>

                    <td className="px-6 py-4 font-semibold text-white">
                      {yoctoToNear(exec.amountYocto, 4)} NEAR
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                          exec.status === "CONFIRMED"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : exec.status === "BROADCAST" || exec.status === "CONFIRMING"
                            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                            : exec.status === "REQUIRES_RECOVERY"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        }`}
                      >
                        {exec.status}
                      </span>
                    </td>

                    <td className="px-6 py-4 font-mono text-[11px]">
                      {exec.txHash ? (
                        <a
                          href={`https://testnet.nearblocks.io/txns/${exec.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-400 hover:underline inline-flex items-center gap-1"
                        >
                          {exec.txHash.slice(0, 10)}...
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[#71717A]">Awaiting broadcast</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedExecution(exec)}
                          className="px-2.5 py-1 rounded bg-[#27272A] hover:bg-[#3F3F46] text-[11px] text-white transition-colors"
                        >
                          Details
                        </button>
                        {(exec.status === "REQUIRES_RECOVERY" || exec.status === "CONFIRMING") && (
                          <button
                            onClick={() => handleRecover(exec.id)}
                            disabled={reconciling}
                            className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] transition-colors"
                          >
                            Recover
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Execution Detail Modal */}
      <ModalPortal isOpen={!!selectedExecution} onClose={() => setSelectedExecution(null)}>
        {selectedExecution && (
          <div className="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#27272A] pb-4">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Cryptographic Authorization Envelope</h3>
              </div>
              <button
                onClick={() => setSelectedExecution(null)}
                className="text-slate-400 hover:text-slate-900 dark:text-[#A1A1AA] dark:hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="p-3 bg-slate-50 dark:bg-[#18181D] rounded-lg border border-slate-200 dark:border-[#27272A] space-y-1">
                <div className="text-slate-500 dark:text-[#A1A1AA]">Execution ID:</div>
                <div className="text-slate-900 dark:text-white break-all">{selectedExecution.id}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-[#18181D] rounded-lg border border-slate-200 dark:border-[#27272A] space-y-1">
                  <div className="text-slate-500 dark:text-[#A1A1AA]">Nonce:</div>
                  <div className="text-slate-900 dark:text-white break-all">{selectedExecution.nonce}</div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-[#18181D] rounded-lg border border-slate-200 dark:border-[#27272A] space-y-1">
                  <div className="text-slate-500 dark:text-[#A1A1AA]">Nonce Consumed:</div>
                  <div className={selectedExecution.isNonceConsumed ? "text-emerald-500 dark:text-emerald-400 font-bold" : "text-amber-500 dark:text-amber-400 font-bold"}>
                    {selectedExecution.isNonceConsumed ? "YES (Single-Use Locked)" : "NO (Pending)"}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-[#18181D] rounded-lg border border-slate-200 dark:border-[#27272A] space-y-1">
                <div className="text-slate-500 dark:text-[#A1A1AA]">HMAC-SHA256 Authorization Signature:</div>
                <div className="text-emerald-600 dark:text-emerald-400 break-all">{selectedExecution.authSignature}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-[#18181D] rounded-lg border border-slate-200 dark:border-[#27272A] space-y-1">
                  <div className="text-slate-500 dark:text-[#A1A1AA]">Recipient Account:</div>
                  <div className="text-slate-900 dark:text-white break-all">{selectedExecution.recipient}</div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-[#18181D] rounded-lg border border-slate-200 dark:border-[#27272A] space-y-1">
                  <div className="text-slate-500 dark:text-[#A1A1AA]">Amount:</div>
                  <div className="text-slate-900 dark:text-white font-bold">{yoctoToNear(selectedExecution.amountYocto)} NEAR</div>
                </div>
              </div>

              {selectedExecution.txHash && (
                <div className="p-3 bg-slate-50 dark:bg-[#18181D] rounded-lg border border-slate-200 dark:border-[#27272A] space-y-1">
                  <div className="text-slate-500 dark:text-[#A1A1AA]">NEAR Testnet Transaction Hash:</div>
                  <div className="text-cyan-600 dark:text-cyan-400 break-all">{selectedExecution.txHash}</div>
                </div>
              )}

              {selectedExecution.errorReason && (
                <div className="p-3 bg-rose-500/10 rounded-lg border border-rose-500/20 text-rose-600 dark:text-rose-300">
                  <div className="font-bold mb-1">Execution Failure / Refusal:</div>
                  <div>{selectedExecution.errorReason}</div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-[#27272A]">
              <button
                onClick={() => setSelectedExecution(null)}
                className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-[#27272A] dark:hover:bg-[#3F3F46] text-xs text-slate-800 dark:text-white font-medium"
              >
                Close
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

