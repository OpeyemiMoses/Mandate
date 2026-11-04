"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Server,
  Key,
  Globe,
  Database,
  Lock,
  Cpu,
  Info,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";

interface ComponentCheck {
  component: string;
  status: "CONFIGURED" | "MISSING" | "INVALID" | "UNAVAILABLE" | "NOT_CONFIGURED_OPTIONAL";
  latencyMs?: number;
  message: string;
  details?: Record<string, any>;
}

interface PreflightReport {
  overallStatus: "READY" | "DEGRADED" | "BLOCKED";
  isProduction: boolean;
  timestamp: string;
  checks: Record<string, ComponentCheck>;
  topology: {
    databaseProvider: "sqlite" | "postgresql" | "unknown";
    singleWriterConstraint: boolean;
    multiInstanceReady: boolean;
    warning?: string;
  };
  summary: {
    totalChecks: number;
    configuredCount: number;
    optionalCount: number;
    unavailableCount: number;
    blockedCount: number;
  };
  envReport: {
    isProduction: boolean;
    valid: boolean;
    totalVariables: number;
    validCount: number;
    missingCount: number;
    invalidCount: number;
    errorCount: number;
    safeErrorMessages: string[];
    variables: Record<
      string,
      {
        name: string;
        classification: string;
        status: string;
        isSecret: boolean;
        message?: string;
      }
    >;
  };
}

export default function ProductionReadinessPage() {
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreflight = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/production/readiness");
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message || "Failed to query readiness endpoint");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreflight();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CONFIGURED":
      case "VALID":
      case "READY":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {status}
          </span>
        );
      case "DEGRADED":
      case "UNAVAILABLE":
      case "INSUFFICIENT_LENGTH":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            {status}
          </span>
        );
      case "BLOCKED":
      case "MISSING":
      case "INVALID":
      case "INSECURE_DEFAULT":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" />
            {status}
          </span>
        );
      case "NOT_CONFIGURED_OPTIONAL":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            OPTIONAL
          </span>
        );
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">Production Readiness Preflight</h1>
              <span className="px-2.5 py-0.5 rounded text-xs font-mono font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Milestone 9.5
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1">
              Centralized runtime validation, cryptographic secret audit, provider connectivity, and database topology.
            </p>
          </div>
          <button
            onClick={fetchPreflight}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-white transition border border-zinc-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Re-run Preflight
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-sm flex items-center gap-3">
            <XCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* System Status Banner */}
        {report && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
              <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Overall Status</div>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-xl font-bold text-white">{report.overallStatus}</span>
                {getStatusBadge(report.overallStatus)}
              </div>
              <div className="text-xs text-zinc-400 mt-2 font-mono">
                Environment: {report.isProduction ? "PRODUCTION" : "DEVELOPMENT"}
              </div>
            </div>

            <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
              <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Configured Checks</div>
              <div className="mt-2 text-2xl font-bold text-emerald-400">
                {report.summary.configuredCount} / {report.summary.totalChecks}
              </div>
              <div className="text-xs text-zinc-500 mt-2">
                {report.summary.optionalCount} optional not configured
              </div>
            </div>

            <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
              <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Blocked / Invalid</div>
              <div className={`mt-2 text-2xl font-bold ${report.summary.blockedCount > 0 ? "text-rose-400" : "text-zinc-400"}`}>
                {report.summary.blockedCount}
              </div>
              <div className="text-xs text-zinc-500 mt-2">
                {report.summary.unavailableCount} endpoints unavailable
              </div>
            </div>

            <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
              <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Database Topology</div>
              <div className="mt-2 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-400" />
                <span className="text-base font-bold text-white uppercase">{report.topology.databaseProvider}</span>
              </div>
              <div className="text-xs text-zinc-400 mt-2">
                {report.topology.multiInstanceReady ? "Horizontal Cluster Ready" : "Single Process Only"}
              </div>
            </div>
          </div>
        )}

        {/* Database Topology Warning Banner */}
        {report?.topology.warning && (
          <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-amber-300 text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Database Concurrency Limitation: </span>
              {report.topology.warning}
            </div>
          </div>
        )}

        {/* Component Health & Connectivity */}
        {report && (
          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-white font-semibold">
                <Server className="w-5 h-5 text-indigo-400" />
                <h2>Provider & Subsystem Connectivity</h2>
              </div>
              <span className="text-xs text-zinc-500">Live network and database probes</span>
            </div>

            <div className="divide-y divide-zinc-800/60">
              {Object.entries(report.checks).map(([key, check]) => (
                <div key={key} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-sm">{check.component}</span>
                      {check.latencyMs !== undefined && (
                        <span className="text-xs font-mono text-zinc-500">({check.latencyMs}ms)</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">{check.message}</p>
                  </div>
                  <div>{getStatusBadge(check.status)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cryptographic Secrets & Environment Audit */}
        {report && (
          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-white font-semibold">
                <Lock className="w-5 h-5 text-purple-400" />
                <h2>Cryptographic Secrets & Configuration Audit</h2>
              </div>
              <span className="text-xs text-zinc-500 font-mono">Zero Secrets Leaked</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase">
                    <th className="py-2.5 font-medium">Variable Name</th>
                    <th className="py-2.5 font-medium">Classification</th>
                    <th className="py-2.5 font-medium">Type</th>
                    <th className="py-2.5 font-medium">Status</th>
                    <th className="py-2.5 font-medium">Verification Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 text-xs">
                  {Object.entries(report.envReport.variables).map(([name, item]) => (
                    <tr key={name} className="hover:bg-zinc-800/20">
                      <td className="py-2.5 font-mono text-zinc-200">{name}</td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 text-zinc-300">
                          {item.classification}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {item.isSecret ? (
                          <span className="inline-flex items-center gap-1 text-purple-400">
                            <Key className="w-3 h-3" /> Secret Key
                          </span>
                        ) : (
                          <span className="text-zinc-400">Config / URL</span>
                        )}
                      </td>
                      <td className="py-2.5">{getStatusBadge(item.status)}</td>
                      <td className="py-2.5 text-zinc-400">{item.message || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

