"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Shield,
  User,
  CheckCircle2,
  AlertOctagon,
  LifeBuoy,
  Send,
  RotateCcw,
  RefreshCw,
  FileText,
  Lock,
  ExternalLink,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";

export default function IncidentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [incident, setIncident] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState("");

  const fetchIncident = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/incidents/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setIncident(data.incident);
      }
    } catch (err) {
      console.error("Failed to load incident detail:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncident();
  }, [params.id]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/incidents/${params.id}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: commentText.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setCommentText("");
        fetchIncident();
      }
    } catch (err) {
      console.error("Failed to submit comment:", err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCreateRecoveryPlan = async () => {
    if (!incident) return;
    setActionLoading("plan");
    try {
      const res = await fetch("/api/recovery/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: incident.id,
          targetEntityType: incident.targetEntityType || "EXECUTION",
          targetEntityId: incident.targetEntityId || incident.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchIncident();
      }
    } catch (err) {
      console.error("Failed to create recovery plan:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprovePlan = async (planId: string) => {
    setActionLoading(`approve-${planId}`);
    try {
      const res = await fetch(`/api/recovery/plans/${planId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approverType: "HUMAN" }),
      });
      const data = await res.json();
      if (data.success) {
        fetchIncident();
      } else {
        alert(`Approval error: ${data.error}`);
      }
    } catch (err) {
      console.error("Approval failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecutePlan = async (planId: string) => {
    setActionLoading(`exec-${planId}`);
    try {
      const res = await fetch(`/api/recovery/plans/${planId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        fetchIncident();
      } else {
        alert(`Execution error: ${data.error}`);
      }
    } catch (err) {
      console.error("Execution failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveIncident = async () => {
    if (!resolutionSummary.trim()) return;
    setActionLoading("resolve");
    try {
      const res = await fetch(`/api/incidents/${params.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutionSummary: resolutionSummary.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setResolveModalOpen(false);
        fetchIncident();
      }
    } catch (err) {
      console.error("Resolve failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="p-12 text-center text-zinc-500">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-zinc-400" />
          Loading incident details...
        </div>
      </AppShell>
    );
  }

  if (!incident) {
    return (
      <AppShell>
        <div className="p-12 text-center text-zinc-500">
          <p>Incident not found.</p>
          <Link href="/incidents" className="text-rose-400 underline mt-2 inline-block">
            Return to Incidents
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/incidents"
            className="text-xs font-medium text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Incidents
          </Link>

          <div className="flex items-center gap-2">
            {incident.status !== "RESOLVED" && (
              <button
                onClick={() => setResolveModalOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Resolve Incident
              </button>
            )}
          </div>
        </div>

        {/* Incident Header Card */}
        <div className="p-6 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                  {incident.incidentNumber}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full border font-semibold bg-rose-500/20 text-rose-300 border-rose-500/30">
                  {incident.severity}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-zinc-800 text-zinc-300 border-zinc-700">
                  {incident.status}
                </span>
              </div>
              <h1 className="text-xl font-bold text-zinc-100">{incident.title}</h1>
            </div>

            <div className="text-right text-xs text-zinc-500 space-y-1">
              <div>Detected: <strong className="text-zinc-300">{new Date(incident.detectedAt).toLocaleString()}</strong></div>
              {incident.acknowledgedAt && (
                <div>Acknowledged: <strong className="text-zinc-300">{new Date(incident.acknowledgedAt).toLocaleString()}</strong></div>
              )}
              {incident.resolvedAt && (
                <div>Resolved: <strong className="text-emerald-400">{new Date(incident.resolvedAt).toLocaleString()}</strong></div>
              )}
            </div>
          </div>

          <p className="text-sm text-zinc-300 leading-relaxed bg-zinc-950/40 p-4 rounded-lg border border-zinc-800/80">
            {incident.description}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-2 border-t border-zinc-800/80">
            <div>
              <span className="text-zinc-500">Category:</span>
              <div className="font-semibold text-zinc-200 mt-0.5">{incident.category}</div>
            </div>
            <div>
              <span className="text-zinc-500">Target Entity:</span>
              <div className="font-semibold text-zinc-200 mt-0.5">{incident.targetEntityType || "N/A"}</div>
            </div>
            <div>
              <span className="text-zinc-500">Assigned Team:</span>
              <div className="font-semibold text-zinc-200 mt-0.5">{incident.assignedTeam || "Unassigned"}</div>
            </div>
            <div>
              <span className="text-zinc-500">Assigned Responder:</span>
              <div className="font-semibold text-zinc-200 mt-0.5">{incident.assignedTo || "Unassigned"}</div>
            </div>
          </div>
        </div>

        {/* Recovery Plans Section */}
        <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-rose-400" />
              <h2 className="text-base font-semibold text-zinc-100">Recovery Orchestration Plans</h2>
            </div>
            <button
              onClick={handleCreateRecoveryPlan}
              disabled={actionLoading === "plan"}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Generate Recovery Plan
            </button>
          </div>

          {incident.recoveryPlans && incident.recoveryPlans.length > 0 ? (
            <div className="space-y-3">
              {incident.recoveryPlans.map((plan: any) => (
                <div
                  key={plan.id}
                  className="p-4 rounded-lg bg-zinc-900/80 border border-zinc-800 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
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

                    <div className="flex items-center gap-2">
                      {plan.status === "PENDING_APPROVAL" && (
                        <button
                          onClick={() => handleApprovePlan(plan.id)}
                          disabled={actionLoading === `approve-${plan.id}`}
                          className="px-3 py-1 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                        >
                          Approve Recovery (Human)
                        </button>
                      )}

                      {plan.status === "APPROVED" && (
                        <button
                          onClick={() => handleExecutePlan(plan.id)}
                          disabled={actionLoading === `exec-${plan.id}`}
                          className="px-3 py-1 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                        >
                          Execute Recovery
                        </button>
                      )}

                      {plan.status === "VERIFIED" && (
                        <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" />
                          Outcome Independently Verified
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs font-mono text-zinc-500 truncate">
                    Payload Hash: {plan.payloadHash}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 italic">No recovery plan generated yet for this incident.</p>
          )}
        </div>

        {/* Chronological Audit Timeline */}
        <div className="p-6 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-6">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-zinc-400" />
            <h2 className="text-base font-semibold text-zinc-100">Audit-Logged Event Timeline</h2>
          </div>

          <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
            {incident.timelineEvents && incident.timelineEvents.map((event: any) => (
              <div key={event.id} className="relative pl-8 space-y-1">
                <div className="absolute left-1.5 top-1 h-3 w-3 rounded-full bg-zinc-700 border-2 border-zinc-950" />
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-zinc-200">{event.eventType}</span>
                  <span className="text-zinc-500">•</span>
                  <span className="text-zinc-400">By {event.actorId} ({event.actorType})</span>
                  <span className="text-zinc-500">•</span>
                  <span className="text-zinc-500">{new Date(event.createdAt).toLocaleTimeString()}</span>
                </div>
                <p className="text-xs text-zinc-300">{event.notes}</p>
                {event.evidenceHash && (
                  <div className="text-[10px] font-mono text-zinc-500 truncate">
                    Evidence Hash: {event.evidenceHash}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Operator Comment */}
          <form onSubmit={handleAddComment} className="pt-4 border-t border-zinc-800 flex gap-2">
            <input
              type="text"
              placeholder="Add investigator note or operator comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500/50"
            />
            <button
              type="submit"
              disabled={submittingComment || !commentText.trim()}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 transition-colors flex items-center gap-1.5"
            >
              <Send className="h-4 w-4" />
              Post Note
            </button>
          </form>
        </div>

        {/* Resolve Modal */}
        {resolveModalOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <h3 className="text-lg font-bold text-zinc-100">Resolve Incident</h3>
              <p className="text-xs text-zinc-400">
                Provide a definitive resolution summary. All linked discrepancies will also be closed.
              </p>
              <textarea
                rows={3}
                placeholder="Resolution summary..."
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.target.value)}
                className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setResolveModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResolveIncident}
                  disabled={actionLoading === "resolve" || !resolutionSummary.trim()}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Confirm Resolution
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

