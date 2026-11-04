"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ShieldAlert,
  Flame,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
  Search,
  Filter,
  PlusCircle,
  AlertOctagon,
  LifeBuoy,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { OperatorGuard } from "@/components/OperatorGuard";

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const url = new URL("/api/incidents", window.location.origin);
      if (severityFilter !== "ALL") url.searchParams.set("severity", severityFilter);
      if (statusFilter !== "ALL") url.searchParams.set("status", statusFilter);

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.success) {
        setIncidents(data.items || []);
      }
    } catch (err) {
      console.error("Failed to load incidents:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [severityFilter, statusFilter]);

  const handleAcknowledge = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/incidents/${id}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Acknowledged from Incidents Console" }),
      });
      const data = await res.json();
      if (data.success) {
        fetchIncidents();
      }
    } catch (err) {
      console.error("Acknowledge failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEscalate = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/incidents/${id}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Manual escalation from Incidents Console" }),
      });
      const data = await res.json();
      if (data.success) {
        fetchIncidents();
      }
    } catch (err) {
      console.error("Escalation failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  // Compute metrics
  const activeCount = incidents.filter((i) => i.status !== "RESOLVED").length;
  const sev1Count = incidents.filter((i) => i.severity === "SEV-1" && i.status !== "RESOLVED").length;
  const unackCount = incidents.filter((i) => i.status === "DETECTED").length;
  const resolvedCount = incidents.filter((i) => i.status === "RESOLVED").length;

  const filteredIncidents = incidents.filter((i) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      i.incidentNumber.toLowerCase().includes(q) ||
      i.title.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q)
    );
  });

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DETECTED":
        return "bg-rose-500/20 text-rose-300 border-rose-500/30";
      case "ACKNOWLEDGED":
      case "INVESTIGATING":
        return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      case "RECOVERY_PENDING":
        return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      case "ESCALATED":
      case "MANUAL_INTERVENTION_REQUIRED":
        return "bg-red-500/30 text-red-200 border-red-500/50 font-bold";
      case "RESOLVED":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
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
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                  Incident Management Console
                </h1>
                <p className="text-sm text-zinc-400">
                  Real-time operational incidents, SLA tracking, and audit-logged recovery orchestration.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchIncidents}
              className="px-3.5 py-2 text-sm font-medium rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/recovery"
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center gap-2 shadow-lg shadow-rose-900/20"
            >
              <LifeBuoy className="h-4 w-4" />
              Recovery Center
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Active Incidents
              </span>
              <AlertOctagon className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-zinc-100">{activeCount}</span>
              <span className="text-xs text-zinc-500">requiring attention</span>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/60 border border-rose-900/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-rose-400">
                SEV-1 Critical
              </span>
              <Flame className="h-4 w-4 text-rose-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-rose-200">{sev1Count}</span>
              <span className="text-xs text-rose-400/80">high financial priority</span>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Unacknowledged
              </span>
              <Clock className="h-4 w-4 text-yellow-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-yellow-200">{unackCount}</span>
              <span className="text-xs text-zinc-500">pending response</span>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Resolved
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-emerald-200">{resolvedCount}</span>
              <span className="text-xs text-zinc-500">closed safely</span>
            </div>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by ID, title, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Severity Filter */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
              {["ALL", "SEV-1", "SEV-2", "SEV-3", "SEV-4"].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    severityFilter === sev
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
              {["ALL", "DETECTED", "ACKNOWLEDGED", "RESOLVED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    statusFilter === st
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Incidents List */}
        <div className="space-y-3">
          {loading ? (
            <div className="p-12 text-center text-zinc-500">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-zinc-400" />
              Loading incident records...
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="p-12 text-center rounded-xl bg-zinc-900/30 border border-zinc-800/60">
              <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-400/60 mb-3" />
              <h3 className="text-sm font-semibold text-zinc-300">No matching incidents</h3>
              <p className="text-xs text-zinc-500 mt-1">All systems are currently running within operational bounds.</p>
            </div>
          ) : (
            filteredIncidents.map((incident) => (
              <div
                key={incident.id}
                className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                      {incident.incidentNumber}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${getSeverityBadge(
                        incident.severity
                      )}`}
                    >
                      {incident.severity}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getStatusBadge(
                        incident.status
                      )}`}
                    >
                      {incident.status}
                    </span>
                    <span className="text-xs text-zinc-500">
                      Detected {new Date(incident.detectedAt).toLocaleString()}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-zinc-100 truncate">
                    {incident.title}
                  </h3>

                  <p className="text-xs text-zinc-400 line-clamp-1">
                    {incident.description}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-zinc-500 pt-1">
                    <span>Category: <strong className="text-zinc-300">{incident.category}</strong></span>
                    {incident.assignedTo && (
                      <span>Assigned: <strong className="text-zinc-300">{incident.assignedTo}</strong></span>
                    )}
                    <span>Timeline Events: {incident._count?.timelineEvents || 0}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end md:self-center">
                  {incident.status === "DETECTED" && (
                    <button
                      onClick={() => handleAcknowledge(incident.id)}
                      disabled={actionLoading === incident.id}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-colors"
                    >
                      Acknowledge
                    </button>
                  )}

                  {incident.status !== "RESOLVED" && incident.status !== "ESCALATED" && (
                    <button
                      onClick={() => handleEscalate(incident.id)}
                      disabled={actionLoading === incident.id}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 transition-colors"
                    >
                      Escalate
                    </button>
                  )}

                  <Link
                    href={`/incidents/${incident.id}`}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors flex items-center gap-1.5"
                  >
                    View Details
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </OperatorGuard>
    </AppShell>
  );
}

