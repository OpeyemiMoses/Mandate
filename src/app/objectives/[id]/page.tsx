"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Target,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Shield,
  Layers,
  Wrench,
  Bot,
  ExternalLink,
  ChevronRight,
  Check,
  X,
  FileText,
  Sparkles,
  Zap,
  Network,
  Info,
  Calendar,
  DollarSign,
  Activity,
  Lock,
  Compass,
  RefreshCw,
  Users,
  Share2,
  Key,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlowingCard } from "@/components/GlowingCard";
import { useMandate } from "@/context/MandateContext";

interface StepItem {
  id: string;
  stepId: string;
  title: string;
  description: string;
  order: number;
  status: string;
  taskType?: string;
  agentType: string;
  assignedAgentId?: string;
  dependencies: string[];
  requiredTools: string[];
  requiredCapabilities: string[];
  riskClassification: string;
  estimatedCostNear?: string;
  estimatedCostYocto?: string;
  output?: any;
  errorDetails?: string;
  verificationStatus?: string;
  resultFingerprint?: string;
  completedAt?: string | null;
}

interface AssignmentItem {
  id: string;
  taskId: string;
  agentId: string;
  agent?: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  status: string;
  leaseToken: string;
  leaseExpiresAt: string;
  capabilityVersion: number;
  policyVersion: number;
  planHash: string;
  createdAt: string;
}

interface AgentItem {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface PlanItem {
  id: string;
  version: number;
  summary: string;
  status: string;
  riskClassification: string;
  estimatedCostNear?: string;
  estimatedCostYocto?: string;
  planHash?: string;
  requiresApproval: boolean;
  steps: StepItem[];
  approvals: Array<{ decision: string; comment?: string; createdAt: string }>;
  createdAt: string;
}

interface CriteriaItem {
  id: string;
  description: string;
  measurementType: string;
  target: string;
  verificationMethod: string;
  currentState: string;
}

interface EventItem {
  id: string;
  eventType: string;
  auditLogId?: string;
  actorRole?: string;
  reason?: string;
  metadataJson?: string;
  timestamp: string;
}

interface ObjectiveDetail {
  id: string;
  title: string;
  description: string;
  originalPrompt: string;
  structuredGoal: any;
  category: string;
  status: string;
  priority: string;
  mandate?: any;
  constraints: any;
  progressPercent: number;
  currentPlan?: PlanItem | null;
  plans: PlanItem[];
  criteria: CriteriaItem[];
  events: EventItem[];
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export default function ObjectiveDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const { accountId, sessionToken } = useMandate();
  const [objective, setObjective] = useState<ObjectiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"plan" | "goal" | "criteria" | "events" | "discovery" | "assignments" | "orchestration" | "checkpoints">("plan");
  const [planViewMode, setPlanViewMode] = useState<"dag" | "list">("dag");
  const [graphData, setGraphData] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [discoveryData, setDiscoveryData] = useState<any | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [orchestrationMetrics, setOrchestrationMetrics] = useState<any | null>(null);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState<string>("ALL");

  // Milestone 13.6: Checkpoint State
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [checkpointsLoading, setCheckpointsLoading] = useState(false);
  const [verifiedCheckpoints, setVerifiedCheckpoints] = useState<Record<number, boolean>>({});

  const loadCheckpoints = async () => {
    setCheckpointsLoading(true);
    try {
      const res = await fetch(`/api/objectives/${id}/checkpoints`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success && data.checkpoints) {
        setCheckpoints(data.checkpoints);
      }
    } catch (err: any) {
      console.error("Failed to load checkpoints:", err);
    } finally {
      setCheckpointsLoading(false);
    }
  };

  const verifyCheckpointIntegrity = async (checkpointNumber: number) => {
    try {
      const res = await fetch(`/api/objectives/${id}/checkpoints/${checkpointNumber}`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success && data.integrity) {
        setVerifiedCheckpoints((prev) => ({
          ...prev,
          [checkpointNumber]: data.integrity.isValid,
        }));
      }
    } catch (err: any) {
      console.error("Failed to verify checkpoint integrity:", err);
    }
  };

  const handleRestoreCheckpoint = async (checkpointNumber: number) => {
    if (!confirm(`Are you sure you want to restore Objective state from Checkpoint #${checkpointNumber}? Current running tasks will be safely fenced.`)) {
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/checkpoints/${checkpointNumber}/restore`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ reason: `User initiated restore to Checkpoint #${checkpointNumber}` }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to restore checkpoint");
      setActionSuccess(`Objective successfully restored to Checkpoint #${checkpointNumber}. Stale worker leases fenced.`);
      setTimeout(() => setActionSuccess(null), 3000);
      await loadObjective();
      await loadCheckpoints();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Milestone 13.3: Agent Assignment & Delegation State
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AgentItem[]>([]);
  const [delegationModalStep, setDelegationModalStep] = useState<StepItem | null>(null);
  const [delegationTargetAgentId, setDelegationTargetAgentId] = useState("");
  const [delegationReason, setDelegationReason] = useState("");
  const [eligibilityModalStep, setEligibilityModalStep] = useState<StepItem | null>(null);
  const [eligibilityReports, setEligibilityReports] = useState<any[] | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  // Selected Step for details modal
  const [selectedStep, setSelectedStep] = useState<StepItem | null>(null);

  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (accountId) headers["x-near-account"] = accountId;
    if (sessionToken) headers["x-session-token"] = sessionToken;
    return headers;
  }, [accountId, sessionToken]);

  const loadAssignments = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/objectives/${id}/assignments`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success && data.assignments) {
        setAssignments(data.assignments);
      }
    } catch (err) {
      console.error("Failed to load assignments:", err);
    }
  }, [id, getHeaders]);

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success && data.agents) {
        setAvailableAgents(data.agents);
      }
    } catch (err) {
      console.error("Failed to load agents:", err);
    }
  }, [getHeaders]);

  const runDiscovery = useCallback(async () => {
    if (!id) return;
    setDiscoveryLoading(true);
    try {
      const res = await fetch(`/api/objectives/${id}/discover`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success && data.discovery) {
        setDiscoveryData(data.discovery);
      }
    } catch (err) {
      console.error("Failed to run capability discovery:", err);
    } finally {
      setDiscoveryLoading(false);
    }
  }, [id, getHeaders]);

  const loadGraph = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/objectives/${id}/graph`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success && data.graph) {
        setGraphData(data.graph);
      }
    } catch (err) {
      console.error("Failed to load DAG graph:", err);
    }
  }, [id, getHeaders]);

  const loadObjective = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/objectives/${id}`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success && data.objective) {
        setObjective(data.objective);
      }
    } catch (err) {
      console.error("Failed to load objective details:", err);
    } finally {
      setLoading(false);
    }
  }, [id, getHeaders]);

  const loadOrchestrationMetrics = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/objectives/${id}/progress`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success && data.metrics) {
        setOrchestrationMetrics(data.metrics);
      }
    } catch (err) {
      console.error("Failed to load progress metrics:", err);
    }
  }, [id, getHeaders]);

  const loadHistory = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/objectives/${id}/history`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success && data.history?.items) {
        setHistoryItems(data.history.items);
      }
    } catch (err) {
      console.error("Failed to load audit history:", err);
    }
  }, [id, getHeaders]);

  useEffect(() => {
    loadObjective();
    loadGraph();
    loadAssignments();
    loadAgents();
    loadOrchestrationMetrics();
    loadHistory();
  }, [loadObjective, loadGraph, loadAssignments, loadAgents, loadOrchestrationMetrics, loadHistory]);

  const handleOrchestrate = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/orchestrate`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Orchestration failed");
      setActionSuccess(data.isComplete ? "Objective completed and verified!" : (data.message || "Orchestration round executed."));
      setTimeout(() => setActionSuccess(null), 3500);
      await loadObjective();
      await loadGraph();
      await loadAssignments();
      await loadOrchestrationMetrics();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/pause`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to pause objective");
      setActionSuccess("Objective execution paused.");
      setTimeout(() => setActionSuccess(null), 3000);
      await loadObjective();
      await loadOrchestrationMetrics();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/resume`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to resume objective");
      setActionSuccess("Objective execution resumed.");
      setTimeout(() => setActionSuccess(null), 3000);
      await loadObjective();
      await loadOrchestrationMetrics();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/plan`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to generate autonomous plan");
      setActionSuccess(`Plan v${data.plan.version} generated successfully.`);
      setTimeout(() => setActionSuccess(null), 3000);
      await loadObjective();
      await loadGraph();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReplan = async () => {
    const guidance = prompt("Enter guidance or revision requirements for replanning:");
    if (guidance === null) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/plan/replan`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ guidance }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to replan objective");
      setActionSuccess(`Objective replanned to v${data.plan.version}.`);
      setTimeout(() => setActionSuccess(null), 3000);
      await loadObjective();
      await loadGraph();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprovePlan = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/plan/approve`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          version: objective?.currentPlan?.version,
          planHash: objective?.currentPlan?.planHash,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to approve plan");
      setActionSuccess("Plan approved. Objective is now verified and ready for execution.");
      setTimeout(() => setActionSuccess(null), 3000);
      await loadObjective();
      await loadGraph();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectPlan = async () => {
    const comment = prompt("Enter rejection reason or revision guidance:");
    if (comment === null) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/objectives/${id}/plan/reject`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ version: objective?.currentPlan?.version, comment }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to reject plan");
      setActionSuccess("Plan rejected. Status moved to Planning for revision.");
      setTimeout(() => setActionSuccess(null), 3000);
      await loadObjective();
      await loadGraph();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecute = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/execute`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Execution failed");
      setActionSuccess(data.isComplete ? "Objective completed successfully!" : "Plan step executed successfully.");
      setTimeout(() => setActionSuccess(null), 3000);
      await loadObjective();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivate = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/activate`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to activate objective");
      setActionSuccess("Objective activated successfully!");
      setTimeout(() => setActionSuccess(null), 3000);
      await loadObjective();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this objective?")) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/cancel`, {
        method: "POST",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to cancel objective");
      setActionSuccess("Objective cancelled.");
      setTimeout(() => setActionSuccess(null), 3000);
      await loadObjective();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignAll = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/assign`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to assign agents");
      setActionSuccess(`Successfully assigned ${data.assignments?.length || 0} task(s) to eligible agents.`);
      setTimeout(() => setActionSuccess(null), 3000);
      await loadAssignments();
      await loadObjective();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignSingle = async (taskId: string, preferredAgentId?: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/assign`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ taskId, preferredAgentId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to assign agent");
      setActionSuccess(`Task ${taskId} assigned to agent.`);
      setTimeout(() => setActionSuccess(null), 3000);
      await loadAssignments();
      await loadObjective();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenEligibility = async (step: StepItem) => {
    setEligibilityModalStep(step);
    setEligibilityLoading(true);
    setEligibilityReports(null);
    try {
      const res = await fetch(`/api/objectives/${id}/eligibility`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ taskId: step.stepId }),
      });
      const data = await res.json();
      if (data.success && data.reports) {
        setEligibilityReports(data.reports);
      }
    } catch (err: any) {
      console.error("Failed to check eligibility:", err);
    } finally {
      setEligibilityLoading(false);
    }
  };

  const handleOpenDelegation = (step: StepItem) => {
    setDelegationModalStep(step);
    setDelegationTargetAgentId("");
    setDelegationReason("");
  };

  const handleExecuteDelegation = async () => {
    if (!delegationModalStep) return;
    const assignment = assignments.find((a) => a.taskId === delegationModalStep.stepId);
    if (!assignment) {
      setActionError("No active assignment found for this task.");
      return;
    }
    if (!delegationTargetAgentId) {
      setActionError("Please select a target agent for delegation.");
      return;
    }
    if (!delegationReason || delegationReason.trim().length < 5) {
      setActionError("Please provide a delegation reason (minimum 5 characters).");
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/objectives/${id}/delegate`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          fromAgentId: assignment.agentId,
          toAgentId: delegationTargetAgentId,
          taskId: delegationModalStep.stepId,
          reason: delegationReason.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to delegate task");
      setActionSuccess(`Task successfully delegated.`);
      setDelegationModalStep(null);
      setTimeout(() => setActionSuccess(null), 3000);
      await loadAssignments();
      await loadObjective();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="p-12 text-center text-xs text-zinc-400">Loading objective...</div>
      </AppShell>
    );
  }

  if (!objective) {
    return (
      <AppShell>
        <div className="p-12 text-center text-xs text-rose-400">Objective not found.</div>
      </AppShell>
    );
  }

  const currentPlan = objective.currentPlan;
  const isAwaitingApproval = objective.status === "AWAITING_USER_APPROVAL";
  const isActive = objective.status === "ACTIVE";
  const isPaused = objective.status === "PAUSED";
  const isCompleted = objective.status === "COMPLETED";

  return (
    <AppShell>
      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Back Link & Header */}
        <div className="space-y-3">
          <Link
            href="/objectives"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Objectives</span>
          </Link>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {objective.category}
                </span>
                <span
                  className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                    isActive
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : isAwaitingApproval
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      : isCompleted
                      ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {objective.status}
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  Priority: {objective.priority}
                </span>
                {objective.mandate && (
                  <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    <Shield className="w-3 h-3" />
                    Mandate: {objective.mandate.name}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{objective.title}</h1>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-2 flex-wrap">
              {objective.status === "DRAFT" && (
                <button
                  onClick={handleActivate}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  Activate Objective
                </button>
              )}

              {(!currentPlan || ["DRAFT", "ACTIVE", "PLANNING"].includes(objective.status)) && (
                <button
                  onClick={handleGeneratePlan}
                  disabled={actionLoading}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {currentPlan ? "Re-generate Plan" : "Generate Autonomous Plan"}
                </button>
              )}

              {isAwaitingApproval && (
                <>
                  <button
                    onClick={handleReplan}
                    disabled={actionLoading}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white bg-[#1A1A22] hover:bg-[#252530] border border-[#2E2E38] transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Re-plan with Guidance
                  </button>
                  <button
                    onClick={handleRejectPlan}
                    disabled={actionLoading}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 border border-zinc-700 transition-all disabled:opacity-50"
                  >
                    Reject Plan
                  </button>
                  <button
                    onClick={handleApprovePlan}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve Plan (v{currentPlan?.version || 1})
                  </button>
                </>
              )}

              {["ACTIVE", "RUNNING", "PLANNING", "READY"].includes(objective.status) && (
                <>
                  <button
                    onClick={handlePause}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 flex items-center gap-1.5"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </button>
                  <button
                    onClick={handleExecute}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E6352B] shadow-lg shadow-[#FF3B30]/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {actionLoading ? "Executing..." : "Execute Next Step"}
                  </button>
                </>
              )}

              {isPaused && (
                <button
                  onClick={handleResume}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  Resume Execution
                </button>
              )}

              {!["COMPLETED", "FAILED", "CANCELLED"].includes(objective.status) && (
                <button
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel Objective
                </button>
              )}

              {currentPlan && (
                <button
                  onClick={handleAssignAll}
                  disabled={actionLoading}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Bot className="w-3.5 h-3.5" />
                  Assign Eligible Agents
                </button>
              )}

              {currentPlan?.status === "APPROVED" && (
                <button
                  onClick={handleOrchestrate}
                  disabled={actionLoading}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-md flex items-center gap-1.5 transition-all"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run Multi-Agent Orchestration
                </button>
              )}

              {objective.status === "RUNNING" && (
                <button
                  onClick={handlePause}
                  disabled={actionLoading}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 flex items-center gap-1.5 transition-all"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </button>
              )}

              {objective.status === "PAUSED" && (
                <button
                  onClick={handleResume}
                  disabled={actionLoading}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 flex items-center gap-1.5 transition-all"
                >
                  <Play className="w-3.5 h-3.5" />
                  Resume
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Feedback alerts */}
        {actionError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Progress Strip */}
        <GlowingCard>
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400">Verified Plan Progress</span>
              <span className="text-white font-bold">{objective.progressPercent}%</span>
            </div>
            <div className="h-2 w-full bg-[#1A1A22] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#FF3B30] via-amber-400 to-emerald-400 transition-all duration-500"
                style={{ width: `${objective.progressPercent}%` }}
              />
            </div>
          </div>
        </GlowingCard>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-[#1E1E24] pb-2">
          <button
            onClick={() => setActiveTab("plan")}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === "plan"
                ? "bg-[#1E1E24] text-white border border-[#2E2E38]"
                : "text-[#A1A1AA] hover:text-white"
            }`}
          >
            Plan & Steps ({currentPlan?.steps?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("goal")}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === "goal"
                ? "bg-[#1E1E24] text-white border border-[#2E2E38]"
                : "text-[#A1A1AA] hover:text-white"
            }`}
          >
            Goal & Constraints
          </button>
          <button
            onClick={() => setActiveTab("criteria")}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === "criteria"
                ? "bg-[#1E1E24] text-white border border-[#2E2E38]"
                : "text-[#A1A1AA] hover:text-white"
            }`}
          >
            Success Criteria ({objective.criteria?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("events")}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === "events"
                ? "bg-[#1E1E24] text-white border border-[#2E2E38]"
                : "text-[#A1A1AA] hover:text-white"
            }`}
          >
            Audit Events ({objective.events?.length || 0})
          </button>
          <button
            onClick={() => {
              setActiveTab("discovery");
              if (!discoveryData) runDiscovery();
            }}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "discovery"
                ? "bg-[#FF3B30] text-white font-semibold shadow-sm"
                : "text-[#A1A1AA] hover:text-white"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Discovery & Readiness
          </button>
          <button
            onClick={() => setActiveTab("assignments")}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "assignments"
                ? "bg-indigo-600 text-white font-semibold shadow-sm"
                : "text-[#A1A1AA] hover:text-white"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Assignments ({assignments.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("orchestration");
              loadOrchestrationMetrics();
            }}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "orchestration"
                ? "bg-rose-600 text-white font-semibold shadow-sm"
                : "text-[#A1A1AA] hover:text-white"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Orchestration
          </button>
          <button
            onClick={() => {
              setActiveTab("checkpoints");
              loadCheckpoints();
            }}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "checkpoints"
                ? "bg-amber-600 text-white font-semibold shadow-sm"
                : "text-[#A1A1AA] hover:text-white"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Checkpoints ({checkpoints.length})
          </button>
        </div>

        {/* TAB 1: PLAN & STEPS */}
        {activeTab === "plan" && (
          <div className="space-y-4">
            {/* Clarification Guidance Notice */}
            {objective?.structuredGoal?.clarificationQuestions && objective.structuredGoal.clarificationQuestions.length > 0 && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Clarification Required by Autonomous Understanding Engine</span>
                </div>
                <p className="text-zinc-300">
                  The objective understanding engine flagged items requiring user clarification:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-zinc-300">
                  {objective.structuredGoal.clarificationQuestions.map((q: any) => (
                    <li key={q.id}>
                      <strong className="text-white">{q.question}</strong> — <span className="text-zinc-400">{q.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {currentPlan ? (
              <>
                {/* Plan Meta Header */}
                <div className="p-4 rounded-xl bg-[#121215] border border-[#1E1E24] flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="text-zinc-500 block">Plan Summary:</span>
                    <span className="text-white font-medium">{currentPlan.summary}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-zinc-800 text-zinc-300">
                      Version {currentPlan.version}
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Risk: {currentPlan.riskClassification}
                    </span>
                    {currentPlan.estimatedCostNear && (
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Est: {currentPlan.estimatedCostNear} NEAR
                      </span>
                    )}
                    {currentPlan.planHash && (
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-zinc-900 text-emerald-400 border border-zinc-700 flex items-center gap-1" title={currentPlan.planHash}>
                        <Shield className="w-3 h-3 text-emerald-400" />
                        Hash: {currentPlan.planHash.slice(0, 10)}...
                      </span>
                    )}

                    {/* View Mode Toggle */}
                    <div className="flex items-center gap-1 bg-[#0A0A0D] p-1 rounded-lg border border-[#1E1E24] ml-2">
                      <button
                        onClick={() => setPlanViewMode("dag")}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                          planViewMode === "dag" ? "bg-[#1E1E24] text-white" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        DAG Parallel Levels
                      </button>
                      <button
                        onClick={() => setPlanViewMode("list")}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                          planViewMode === "list" ? "bg-[#1E1E24] text-white" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        Sequential Steps
                      </button>
                    </div>
                  </div>
                </div>

                {/* VIEW MODE A: DAG PARALLEL EXECUTION LEVELS */}
                {planViewMode === "dag" && (
                  <div className="space-y-4">
                    {(graphData?.executionLevels || [currentPlan.steps.map((s) => s.stepId)]).map(
                      (levelStepIds: string[], levelIdx: number) => {
                        const levelSteps = levelStepIds
                          .map((sid) => currentPlan.steps.find((s) => s.stepId === sid))
                          .filter(Boolean) as StepItem[];

                        return (
                          <div
                            key={levelIdx}
                            className="p-4 rounded-xl bg-[#0F0F12] border border-[#1A1A22] space-y-3"
                          >
                            <div className="flex items-center justify-between border-b border-[#1A1A22] pb-2 text-xs">
                              <span className="font-bold text-zinc-300 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                Execution Level {levelIdx} (Parallel Batch)
                              </span>
                              <span className="text-[11px] font-mono text-zinc-500">
                                {levelSteps.length} concurrent task{levelSteps.length > 1 ? "s" : ""}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {levelSteps.map((step) => {
                                const isStepComplete = step.status === "COMPLETED";
                                const isStepRunning = step.status === "RUNNING";
                                const taskType = step.taskType || "EXECUTION";
                                const assignment = assignments.find((a) => a.taskId === step.stepId);

                                const typeColor =
                                  taskType === "RESEARCH"
                                    ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                                    : taskType === "ANALYSIS"
                                    ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                                    : taskType === "PAYMENT"
                                    ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                                    : taskType === "VERIFICATION"
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                    : "bg-amber-500/15 text-amber-400 border-amber-500/30";

                                return (
                                  <div
                                    key={step.id}
                                    className="p-3.5 rounded-lg bg-[#141418] border border-[#22222A] space-y-2.5"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span
                                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${typeColor}`}
                                      >
                                        {taskType}
                                      </span>
                                      <span
                                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                                          isStepComplete
                                            ? "bg-emerald-500/15 text-emerald-400"
                                            : isStepRunning
                                            ? "bg-purple-500/15 text-purple-400 animate-pulse"
                                            : "bg-zinc-800 text-zinc-400"
                                        }`}
                                      >
                                        {step.status}
                                      </span>
                                    </div>

                                    <h5 className="text-xs font-bold text-white leading-snug">
                                      {step.title}
                                    </h5>
                                    <p className="text-[11px] text-zinc-400 line-clamp-2">
                                      {step.description}
                                    </p>

                                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] font-mono text-zinc-500">
                                      {step.dependencies.length > 0 && (
                                        <span>Deps: [{step.dependencies.join(", ")}]</span>
                                      )}
                                      {step.estimatedCostNear && (
                                        <span className="text-emerald-400 ml-auto">
                                          {step.estimatedCostNear} NEAR
                                        </span>
                                      )}
                                    </div>

                                    {/* Assignment Badge & Actions */}
                                    <div className="pt-2 border-t border-[#1E1E26] flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                                      {assignment ? (
                                        <div className="flex items-center gap-1.5 text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                          <Bot className="w-3 h-3" />
                                          <span>{assignment.agent?.name || assignment.agentId.slice(0, 8)} (v{assignment.capabilityVersion})</span>
                                        </div>
                                      ) : (
                                        <span className="text-zinc-500">Unassigned</span>
                                      )}

                                      <div className="flex items-center gap-1.5 ml-auto">
                                        <button
                                          onClick={() => handleOpenEligibility(step)}
                                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                                        >
                                          Eligibility
                                        </button>
                                        {assignment ? (
                                          <button
                                            onClick={() => handleOpenDelegation(step)}
                                            className="px-2 py-0.5 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 transition-colors flex items-center gap-1"
                                          >
                                            <Share2 className="w-2.5 h-2.5" />
                                            Delegate
                                          </button>
                                        ) : (
                                          <button
                                            onClick={() => handleAssignSingle(step.stepId)}
                                            disabled={actionLoading}
                                            className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                                          >
                                            Assign
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}

                {/* VIEW MODE B: SEQUENTIAL STEPS LIST */}
                {planViewMode === "list" && (
                  <div className="space-y-3">
                    {currentPlan.steps.map((step) => {
                      const isStepComplete = step.status === "COMPLETED";
                      const isStepRunning = step.status === "RUNNING";
                      const taskType = step.taskType || "EXECUTION";
                      const assignment = assignments.find((a) => a.taskId === step.stepId);

                      return (
                        <div
                          key={step.id}
                          className={`p-4 rounded-xl border transition-all ${
                            isStepComplete
                              ? "bg-[#0F1410] border-emerald-500/25"
                              : isStepRunning
                              ? "bg-[#14121A] border-purple-500/30"
                              : "bg-[#0F0F12] border-[#1A1A22]"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                                  Step {step.order}
                                </span>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300">
                                  {taskType}
                                </span>
                                <h4 className="text-sm font-bold text-white">{step.title}</h4>
                                <span
                                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                                    isStepComplete
                                      ? "bg-emerald-500/15 text-emerald-400"
                                      : isStepRunning
                                      ? "bg-purple-500/15 text-purple-400 animate-pulse"
                                      : "bg-zinc-800 text-zinc-400"
                                  }`}
                                >
                                  {step.status}
                                </span>
                              </div>

                              <p className="text-xs text-zinc-400">{step.description}</p>

                              {/* Dependencies & Tools Tags */}
                              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono">
                                {step.dependencies.length > 0 && (
                                  <span className="text-zinc-500">
                                    Depends on: [{step.dependencies.join(", ")}]
                                  </span>
                                )}
                                {step.requiredTools.length > 0 && (
                                  <span className="text-cyan-400 flex items-center gap-1">
                                    <Wrench className="w-3 h-3" />
                                    {step.requiredTools.join(", ")}
                                  </span>
                                )}
                                <span className="text-purple-400 flex items-center gap-1">
                                  <Bot className="w-3 h-3" />
                                  {step.agentType}
                                </span>
                                {step.estimatedCostNear && (
                                  <span className="text-emerald-400">
                                    Cost: {step.estimatedCostNear} NEAR
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {assignment ? (
                                <div className="flex items-center gap-1.5 text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20 text-xs font-mono">
                                  <Bot className="w-3.5 h-3.5" />
                                  <span>{assignment.agent?.name || assignment.agentId.slice(0, 8)}</span>
                                  <span className="text-zinc-500 text-[10px]">v{assignment.capabilityVersion}</span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleAssignSingle(step.stepId)}
                                  disabled={actionLoading}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors disabled:opacity-50"
                                >
                                  Assign Agent
                                </button>
                              )}

                              <button
                                onClick={() => handleOpenEligibility(step)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                              >
                                Eligibility
                              </button>

                              {assignment && (
                                <button
                                  onClick={() => handleOpenDelegation(step)}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-300 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 transition-colors flex items-center gap-1"
                                >
                                  <Share2 className="w-3 h-3" />
                                  Delegate
                                </button>
                              )}

                              {step.output && (
                                <button
                                  onClick={() => setSelectedStep(step)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                                >
                                  View Output
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-xs text-zinc-500 space-y-3">
                <p>No autonomous plan formulated yet for this objective.</p>
                <button
                  onClick={handleGeneratePlan}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 shadow-md inline-flex items-center gap-1.5 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Autonomous Plan (DAG Decomposition)
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: GOAL & CONSTRAINTS */}
        {activeTab === "goal" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GlowingCard>
              <div className="p-5 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#FF3B30]" />
                  <span>Natural Language Prompt</span>
                </h3>
                <div className="p-3 rounded-xl bg-[#09090C] border border-[#1A1A22] text-xs text-zinc-300 font-mono">
                  &quot;{objective.originalPrompt}&quot;
                </div>
                <div className="text-xs text-zinc-400 space-y-1">
                  <div>
                    <span className="text-zinc-500">Scope: </span>
                    <span>{objective.structuredGoal?.scope || "Standard scope"}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Entities Detected: </span>
                    <span className="font-mono text-zinc-300">
                      {objective.structuredGoal?.entities?.join(", ") || "None"}
                    </span>
                  </div>
                </div>
              </div>
            </GlowingCard>

            <GlowingCard>
              <div className="p-5 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Authority & Financial Mandate</span>
                </h3>
                {objective.mandate ? (
                  <div className="p-3 rounded-xl bg-[#09090C] border border-[#1A1A22] text-xs space-y-1 font-mono text-zinc-300">
                    <div>Mandate: <span className="text-white">{objective.mandate.name}</span></div>
                    <div>Budget: <span className="text-emerald-400">{objective.mandate.totalBudgetYocto} yocto</span></div>
                    <div>Approval Threshold: <span className="text-amber-400">{objective.mandate.approvalThresholdYocto} yocto</span></div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-[#09090C] border border-[#1A1A22] text-xs text-zinc-500 font-mono">
                    Zero spending authority bound. Pure read/research operations.
                  </div>
                )}
                <div className="text-[11px] text-zinc-500">
                  Mandate policy engine remains the final deterministic authority. The Objective Engine never modifies mandates automatically.
                </div>
              </div>
            </GlowingCard>
          </div>
        )}

        {/* TAB 3: SUCCESS CRITERIA */}
        {activeTab === "criteria" && (
          <div className="space-y-3">
            {objective.criteria.map((crit) => (
              <div
                key={crit.id}
                className="p-4 rounded-xl bg-[#0F0F12] border border-[#1A1A22] flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-zinc-500">{crit.id}</span>
                    <span className="font-bold text-white">{crit.description}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
                    <span>Measurement: {crit.measurementType}</span>
                    <span>Target: {crit.target}</span>
                    <span>Verification: {crit.verificationMethod}</span>
                  </div>
                </div>

                <div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      crit.currentState === "MET"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {crit.currentState}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: UNIFIED CHRONOLOGICAL AUDIT TRAIL (MILESTONE 13.5) */}
        {activeTab === "events" && (
          <div className="rounded-2xl border border-[#1E1E24] bg-[#121215] overflow-hidden space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E1E24]">
              <div>
                <h3 className="text-sm font-bold text-white">Unified Objective Execution History</h3>
                <span className="text-[11px] font-mono text-zinc-500">
                  Authoritative chronological timeline across lifecycle, planning, assignments, tasks, and verification
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {["ALL", "OBJECTIVE_LIFECYCLE", "PLANNING", "APPROVAL", "ASSIGNMENT", "TASK_DISPATCH", "TOOL_EXECUTION", "VERIFICATION", "SUCCESS_CRITERIA"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setHistoryFilter(cat)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                      historyFilter === cat
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        : "bg-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {cat.replace("OBJECTIVE_", "")}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-[#1A1A20]">
              {(historyItems.length > 0 ? historyItems : objective.events.map((e) => ({
                id: e.id,
                timestamp: e.timestamp,
                category: "OBJECTIVE_LIFECYCLE",
                actorRole: e.actorRole || "SYSTEM",
                title: e.eventType,
                summary: e.reason || "Lifecycle transition",
                details: e.metadataJson ? JSON.parse(e.metadataJson) : {},
              })))
                .filter((item) => historyFilter === "ALL" || item.category === historyFilter)
                .map((item) => (
                  <div key={item.id} className="p-3.5 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
                          item.category === "OBJECTIVE_LIFECYCLE" ? "bg-red-500/15 text-red-400 border border-red-500/30" :
                          item.category === "PLANNING" ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" :
                          item.category === "APPROVAL" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                          item.category === "ASSIGNMENT" ? "bg-purple-500/15 text-purple-400 border border-purple-500/30" :
                          item.category === "TASK_DISPATCH" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" :
                          item.category === "TOOL_EXECUTION" ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30" :
                          item.category === "VERIFICATION" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                          "bg-zinc-800 text-zinc-400"
                        }`}>
                          {item.category}
                        </span>
                        <span className="font-bold text-zinc-100">{item.title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-500 text-[11px] font-mono">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">
                          {item.actorRole}
                        </span>
                        <span>{new Date(item.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-300 font-mono">{item.summary}</p>
                    {item.resultFingerprint && (
                      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                        <span className="text-emerald-400 font-bold">Fingerprint:</span>
                        <span className="bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">{item.resultFingerprint.slice(0, 24)}...</span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 5: DISCOVERY & READINESS */}
        {activeTab === "discovery" && (
          <div className="space-y-6">
            {/* Readiness Card */}
            <GlowingCard>
              <div className="p-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-mono text-zinc-400">Execution Readiness Verdict</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                        discoveryData?.overallReadiness === "READY"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : discoveryData?.overallReadiness === "READY_WITH_APPROVALS"
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          : discoveryData?.overallReadiness === "NEEDS_CONFIGURATION"
                          ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                          : "bg-red-500/15 text-red-400 border-red-500/30"
                      }`}>
                        {discoveryData?.overallReadiness || "PENDING EVALUATION"}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {discoveryData?.canExecute ? "Execution Gate Open" : "Execution Blocked"}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={runDiscovery}
                    disabled={discoveryLoading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#FF3B30] hover:bg-[#E6352B] text-white shadow-lg shadow-[#FF3B30]/20 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${discoveryLoading ? "animate-spin" : ""}`} />
                    {discoveryLoading ? "Discovering..." : "Re-evaluate Discovery"}
                  </button>
                </div>

                {/* Coverage Summary */}
                <div className="p-4 rounded-xl bg-[#0F0F12] border border-[#1A1A22] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-medium">Capability Coverage Score</span>
                    <span className="font-bold text-white font-mono">
                      {Math.round((discoveryData?.coverageScore || 0) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-[#1A1A22] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#FF3B30] to-emerald-400 transition-all duration-500"
                      style={{ width: `${Math.round((discoveryData?.coverageScore || 0) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-400">
                    {discoveryData?.coverageReport?.summary || "Analyzing objective capabilities against universal tool registry..."}
                  </p>
                </div>

                {/* Warnings or Blocks */}
                {discoveryData?.blockingReasons?.length > 0 && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1.5">
                    <span className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      Blocking Issues Detected
                    </span>
                    <ul className="text-xs text-red-300 list-disc list-inside space-y-0.5">
                      {discoveryData.blockingReasons.map((b: string, i: number) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {discoveryData?.approvalRequirements?.length > 0 && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <Shield className="w-4 h-4" />
                      Approval Gate Requirements
                    </span>
                    <ul className="text-xs text-amber-300 list-disc list-inside space-y-0.5">
                      {discoveryData.approvalRequirements.map((a: string, i: number) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </GlowingCard>

            {/* Matched Capabilities Table */}
            <div className="rounded-2xl border border-[#1E1E24] bg-[#121215] overflow-hidden">
              <div className="p-4 border-b border-[#1E1E24] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Discovered Capabilities & Mappings</h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Requirements mapped against registered tools, MCP endpoints and OutLayer custody
                  </p>
                </div>
                <Link
                  href="/discovery"
                  className="text-xs text-[#FF3B30] hover:underline flex items-center gap-1"
                >
                  Discovery Center <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              <div className="divide-y divide-[#1A1A20]">
                {discoveryData?.coverageReport?.matches?.map((m: any, idx: number) => (
                  <div key={idx} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{m.capabilityName}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#232329] text-zinc-400 uppercase">
                          {m.category?.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-zinc-400 text-[11px]">{m.matchReason}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-500 block">Match Score</span>
                        <span className="font-mono font-bold text-zinc-300">{Math.round(m.matchScore * 100)}%</span>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        m.coverageStatus === "COVERED"
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : m.coverageStatus === "PARTIALLY_COVERED"
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          : m.coverageStatus === "AUTH_REQUIRED"
                          ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                          : "bg-red-500/15 text-red-400 border border-red-500/30"
                      }`}>
                        {m.coverageStatus}
                      </span>
                    </div>
                  </div>
                ))}

                {(!discoveryData?.coverageReport?.matches || discoveryData.coverageReport.matches.length === 0) && (
                  <div className="p-8 text-center text-zinc-500 text-xs">
                    No capability matches evaluated yet. Click &quot;Re-evaluate Discovery&quot; above.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: AGENT ASSIGNMENTS & GOVERNED DELEGATION */}
        {activeTab === "assignments" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#121215] border border-[#1E1E24] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-zinc-400 font-medium">Deterministic Agent Assignments</span>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Governed assignments with cryptographic lease tokens, capability fingerprinting and plan hash bindings.
                </p>
              </div>
              <button
                onClick={handleAssignAll}
                disabled={actionLoading}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Bot className="w-3.5 h-3.5" />
                Assign All Tasks
              </button>
            </div>

            {assignments.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assignments.map((assignment) => {
                  const step = currentPlan?.steps.find((s) => s.stepId === assignment.taskId);
                  const isLeaseActive = new Date(assignment.leaseExpiresAt) > new Date();

                  return (
                    <div
                      key={assignment.id}
                      className="p-4 rounded-xl bg-[#0F0F12] border border-[#1E1E24] space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-[#1A1A22] pb-2">
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-indigo-400" />
                          <span className="font-bold text-white text-xs">
                            {assignment.agent?.name || "Agent"}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            {assignment.agent?.type || "AGENT"}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                            assignment.status === "ACTIVE"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : assignment.status === "CLAIMED"
                              ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {assignment.status}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between text-zinc-400">
                          <span className="text-zinc-500">Target Task:</span>
                          <span className="text-white font-medium">{step?.title || assignment.taskId}</span>
                        </div>
                        <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
                          <span className="text-zinc-500">Task ID:</span>
                          <span>{assignment.taskId}</span>
                        </div>
                        <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
                          <span className="text-zinc-500">Capability Version:</span>
                          <span className="text-indigo-400">v{assignment.capabilityVersion}</span>
                        </div>
                        <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
                          <span className="text-zinc-500">Policy Version:</span>
                          <span>v{assignment.policyVersion}</span>
                        </div>
                        <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
                          <span className="text-zinc-500">Lease Token:</span>
                          <span className="text-zinc-300 flex items-center gap-1">
                            <Key className="w-3 h-3 text-amber-400" />
                            {assignment.leaseToken.slice(0, 12)}...
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
                          <span className="text-zinc-500">Lease Status:</span>
                          <span className={isLeaseActive ? "text-emerald-400" : "text-rose-400"}>
                            {isLeaseActive ? "Active" : "Expired"} (Expires: {new Date(assignment.leaseExpiresAt).toLocaleTimeString()})
                          </span>
                        </div>
                      </div>

                      {step && (
                        <div className="pt-2 border-t border-[#1A1A22] flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEligibility(step)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
                          >
                            Check Eligibility
                          </button>
                          <button
                            onClick={() => handleOpenDelegation(step)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-300 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 transition-colors flex items-center gap-1"
                          >
                            <Share2 className="w-3 h-3" />
                            Governed Delegation
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-zinc-500 space-y-3 bg-[#0F0F12] border border-[#1A1A22] rounded-xl">
                <Users className="w-8 h-8 text-zinc-600 mx-auto" />
                <p>No active agent assignments for this objective yet.</p>
                <button
                  onClick={handleAssignAll}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md inline-flex items-center gap-1.5 transition-all"
                >
                  <Bot className="w-3.5 h-3.5" />
                  Deterministically Assign Eligible Agents
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 7: MULTI-AGENT ORCHESTRATION & TASK LIFECYCLE (MILESTONE 13.4) */}
        {activeTab === "orchestration" && (
          <div className="space-y-6">
            {/* Control Strip */}
            <div className="p-4 rounded-xl bg-[#121215] border border-[#1E1E24] flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Orchestration Control Plane</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    objective.status === "COMPLETED" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                    objective.status === "RUNNING" ? "bg-rose-500/15 text-rose-400 border border-rose-500/30 animate-pulse" :
                    objective.status === "PAUSED" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" :
                    objective.status === "AWAITING_APPROVAL" ? "bg-blue-500/15 text-blue-400 border border-blue-500/30" :
                    objective.status === "FAILED" ? "bg-red-500/15 text-red-400 border border-red-500/30" :
                    "bg-zinc-800 text-zinc-300"
                  }`}>
                    {objective.status}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Autonomous dependency-aware scheduling, parallel level execution & independent verification.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOrchestrate}
                  disabled={actionLoading || objective.status === "COMPLETED" || objective.status === "CANCELLED"}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 shadow-md flex items-center gap-1.5 transition-all"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run Orchestration Round
                </button>
                {objective.status === "RUNNING" && (
                  <button
                    onClick={handlePause}
                    disabled={actionLoading}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 flex items-center gap-1.5 transition-all"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </button>
                )}
                {objective.status === "PAUSED" && (
                  <button
                    onClick={handleResume}
                    disabled={actionLoading}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 flex items-center gap-1.5 transition-all"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Resume
                  </button>
                )}
                {objective.status !== "COMPLETED" && objective.status !== "CANCELLED" && (
                  <button
                    onClick={handleCancel}
                    disabled={actionLoading}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 bg-zinc-800/80 hover:bg-zinc-700 hover:text-white flex items-center gap-1.5 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* 12-State Metrics Grid */}
            {orchestrationMetrics && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                <div className="p-3 rounded-xl bg-[#0F0F12] border border-[#1E1E24] text-center space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Total Tasks</span>
                  <p className="text-lg font-mono font-bold text-white">{orchestrationMetrics.totalTasks}</p>
                </div>
                <div className="p-3 rounded-xl bg-[#0F0F12] border border-[#1E1E24] text-center space-y-1">
                  <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider">Completed</span>
                  <p className="text-lg font-mono font-bold text-emerald-400">{orchestrationMetrics.completedTasks}</p>
                </div>
                <div className="p-3 rounded-xl bg-[#0F0F12] border border-[#1E1E24] text-center space-y-1">
                  <span className="text-[10px] text-blue-400 uppercase font-bold tracking-wider">Running / Queued</span>
                  <p className="text-lg font-mono font-bold text-blue-400">
                    {orchestrationMetrics.runningTasks + orchestrationMetrics.queuedTasks}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#0F0F12] border border-[#1E1E24] text-center space-y-1">
                  <span className="text-[10px] text-amber-400 uppercase font-bold tracking-wider">Approval Required</span>
                  <p className="text-lg font-mono font-bold text-amber-400">{orchestrationMetrics.awaitingApprovalTasks}</p>
                </div>
                <div className="p-3 rounded-xl bg-[#0F0F12] border border-[#1E1E24] text-center space-y-1">
                  <span className="text-[10px] text-orange-400 uppercase font-bold tracking-wider">Blocked</span>
                  <p className="text-lg font-mono font-bold text-orange-400">{orchestrationMetrics.blockedTasks}</p>
                </div>
                <div className="p-3 rounded-xl bg-[#0F0F12] border border-[#1E1E24] text-center space-y-1">
                  <span className="text-[10px] text-rose-400 uppercase font-bold tracking-wider">Failed / Intervention</span>
                  <p className="text-lg font-mono font-bold text-rose-400">
                    {orchestrationMetrics.failedTasks + orchestrationMetrics.requiringInterventionTasks}
                  </p>
                </div>
              </div>
            )}

            {/* Task Orchestration List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Plan Task Execution & Verification States</h4>
              <div className="space-y-2">
                {currentPlan?.steps.map((step) => {
                  const assignment = assignments.find((a) => a.taskId === step.stepId);
                  return (
                    <div
                      key={step.id}
                      className="p-4 rounded-xl bg-[#0F0F12] border border-[#1E1E24] flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="space-y-1 max-w-md">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{step.title}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            {step.taskType}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 line-clamp-1">{step.description}</p>
                        {step.errorDetails && (
                          <p className="text-[11px] text-rose-400 font-mono mt-1">
                            Error: {step.errorDetails}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {assignment?.agent && (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800">
                            <Bot className="w-3.5 h-3.5 text-indigo-400" />
                            <span>{assignment.agent.name}</span>
                          </div>
                        )}

                        <span
                          className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded border ${
                            step.status === "COMPLETED"
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : step.status === "RUNNING"
                              ? "bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse"
                              : step.status === "QUEUED"
                              ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
                              : step.status === "AWAITING_APPROVAL"
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              : step.status === "BLOCKED"
                              ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                              : step.status === "FAILED"
                              ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                              : step.status === "REQUIRES_INTERVENTION"
                              ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700"
                          }`}
                        >
                          {step.status}
                        </span>

                        {step.output && (
                          <button
                            onClick={() => setSelectedStep(step)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3 text-zinc-400" />
                            Output
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* STEP OUTPUT & EVIDENCE INSPECTOR MODAL (MILESTONE 13.5) */}
        {selectedStep && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-xl bg-[#141417] border border-[#232329] rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#232329]">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">{selectedStep.title}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {selectedStep.taskType}
                    </span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                      selectedStep.status === "COMPLETED"
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-zinc-800 text-zinc-400 border-zinc-700"
                    }`}>
                      {selectedStep.status}
                    </span>
                    {selectedStep.verificationStatus && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                        {selectedStep.verificationStatus}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedStep(null)} className="text-zinc-500 hover:text-white">✕</button>
              </div>

              {selectedStep.resultFingerprint && (
                <div className="p-2.5 rounded-xl bg-[#09090C] border border-[#1A1A22] text-[11px] font-mono space-y-1">
                  <span className="text-emerald-400 font-bold text-[10px] uppercase tracking-wider">Canonical SHA-256 Fingerprint</span>
                  <p className="text-zinc-300 break-all">{selectedStep.resultFingerprint}</p>
                </div>
              )}

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Structured Output Payload</span>
                <pre className="p-3 rounded-xl bg-[#09090C] border border-[#1A1A22] text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-72">
                  {JSON.stringify(selectedStep.output, null, 2)}
                </pre>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setSelectedStep(null)}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: DURABLE OBJECTIVE CHECKPOINTS (MILESTONE 13.6) */}
        {activeTab === "checkpoints" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#121215] border border-[#232329] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span>Durable Objective State Checkpoints</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Point-in-time immutable state snapshots. Enables crash recovery, lease reclamation, and audit verification.
                </p>
              </div>
              <button
                onClick={loadCheckpoints}
                disabled={checkpointsLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 bg-[#1A1A22] hover:bg-[#252530] border border-[#2E2E38] transition-all flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkpointsLoading ? "animate-spin" : ""}`} />
                Refresh Checkpoints
              </button>
            </div>

            {checkpointsLoading && checkpoints.length === 0 ? (
              <div className="p-12 text-center text-xs text-zinc-400 animate-pulse">
                Loading durable checkpoints...
              </div>
            ) : checkpoints.length === 0 ? (
              <div className="p-12 text-center text-xs text-zinc-500 rounded-2xl bg-[#0E0E11] border border-[#1E1E24]">
                No checkpoints created yet. Checkpoints are automatically generated on lifecycle transitions and orchestration rounds.
              </div>
            ) : (
              <div className="space-y-3">
                {checkpoints.map((cp) => {
                  const isVerified = verifiedCheckpoints[cp.checkpointNumber];
                  return (
                    <div
                      key={cp.id}
                      className="p-4 rounded-xl bg-[#0E0E11] border border-[#1E1E24] hover:border-[#2E2E38] transition-all space-y-3"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            #{cp.checkpointNumber}
                          </span>
                          <span className="text-xs font-bold text-white font-mono">
                            {cp.triggerReason}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            Status: {cp.objectiveStatus} (v{cp.objectiveVersion})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                          <span>{new Date(cp.createdAt).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pt-2 border-t border-[#1A1A22] text-[11px] font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">SHA-256:</span>
                          <span className="text-zinc-300 truncate max-w-xs">{cp.checkpointHash}</span>
                          {isVerified === true && (
                            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              ✓ INTEGRITY VERIFIED
                            </span>
                          )}
                          {isVerified === false && (
                            <span className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                              ✕ TAMPERED
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => verifyCheckpointIntegrity(cp.checkpointNumber)}
                            className="px-2.5 py-1 rounded text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
                          >
                            Verify Integrity
                          </button>
                          <button
                            onClick={() => handleRestoreCheckpoint(cp.checkpointNumber)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 rounded text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 transition-colors disabled:opacity-50"
                          >
                            Restore to This State
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* DELEGATION MODAL */}
        {delegationModalStep && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[#141417] border border-[#232329] rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#232329]">
                <div className="flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">Governed Task Delegation</h3>
                </div>
                <button onClick={() => setDelegationModalStep(null)} className="text-zinc-500 hover:text-white">✕</button>
              </div>

              <div className="p-3 rounded-xl bg-[#09090C] border border-[#1A1A22] space-y-1 text-xs">
                <div className="text-zinc-400">
                  <span className="text-zinc-500">Task: </span>
                  <span className="text-white font-medium">{delegationModalStep.title}</span>
                </div>
                <div className="text-zinc-400 font-mono text-[11px]">
                  <span className="text-zinc-500">Task ID: </span>
                  <span>{delegationModalStep.stepId}</span>
                </div>
                <div className="text-zinc-400 font-mono text-[11px]">
                  <span className="text-zinc-500">Current Agent: </span>
                  <span className="text-indigo-400">
                    {assignments.find((a) => a.taskId === delegationModalStep.stepId)?.agent?.name ||
                      assignments.find((a) => a.taskId === delegationModalStep.stepId)?.agentId ||
                      "None"}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300">Target Agent for Delegation</label>
                  <select
                    value={delegationTargetAgentId}
                    onChange={(e) => setDelegationTargetAgentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F0F12] border border-[#232329] text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Select target agent...</option>
                    {availableAgents
                      .filter((ag) => ag.id !== assignments.find((a) => a.taskId === delegationModalStep.stepId)?.agentId)
                      .map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {ag.name} ({ag.type}) — {ag.status}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300">Governed Delegation Reason (Required)</label>
                  <textarea
                    rows={3}
                    value={delegationReason}
                    onChange={(e) => setDelegationReason(e.target.value)}
                    placeholder="Provide explicit operational rationale for task delegation..."
                    className="w-full px-3 py-2 rounded-xl bg-[#0F0F12] border border-[#232329] text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <span className="text-[10px] text-zinc-500">
                    Delegation transfers task execution lease only. Wallet authority and mandate limits are never delegated.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#232329]">
                <button
                  onClick={() => setDelegationModalStep(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteDelegation}
                  disabled={actionLoading || !delegationTargetAgentId || delegationReason.trim().length < 5}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-600/20"
                >
                  {actionLoading ? "Delegating..." : "Execute Governed Delegation"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: DURABLE OBJECTIVE CHECKPOINTS (MILESTONE 13.6) */}
        {activeTab === "checkpoints" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#121215] border border-[#232329] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span>Durable Objective State Checkpoints</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Point-in-time immutable state snapshots. Enables crash recovery, lease reclamation, and audit verification.
                </p>
              </div>
              <button
                onClick={loadCheckpoints}
                disabled={checkpointsLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 bg-[#1A1A22] hover:bg-[#252530] border border-[#2E2E38] transition-all flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkpointsLoading ? "animate-spin" : ""}`} />
                Refresh Checkpoints
              </button>
            </div>

            {checkpointsLoading && checkpoints.length === 0 ? (
              <div className="p-12 text-center text-xs text-zinc-400 animate-pulse">
                Loading durable checkpoints...
              </div>
            ) : checkpoints.length === 0 ? (
              <div className="p-12 text-center text-xs text-zinc-500 rounded-2xl bg-[#0E0E11] border border-[#1E1E24]">
                No checkpoints created yet. Checkpoints are automatically generated on lifecycle transitions and orchestration rounds.
              </div>
            ) : (
              <div className="space-y-3">
                {checkpoints.map((cp) => {
                  const isVerified = verifiedCheckpoints[cp.checkpointNumber];
                  return (
                    <div
                      key={cp.id}
                      className="p-4 rounded-xl bg-[#0E0E11] border border-[#1E1E24] hover:border-[#2E2E38] transition-all space-y-3"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            #{cp.checkpointNumber}
                          </span>
                          <span className="text-xs font-bold text-white font-mono">
                            {cp.triggerReason}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            Status: {cp.objectiveStatus} (v{cp.objectiveVersion})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                          <span>{new Date(cp.createdAt).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pt-2 border-t border-[#1A1A22] text-[11px] font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">SHA-256:</span>
                          <span className="text-zinc-300 truncate max-w-xs">{cp.checkpointHash}</span>
                          {isVerified === true && (
                            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              ✓ INTEGRITY VERIFIED
                            </span>
                          )}
                          {isVerified === false && (
                            <span className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                              ✕ TAMPERED
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => verifyCheckpointIntegrity(cp.checkpointNumber)}
                            className="px-2.5 py-1 rounded text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
                          >
                            Verify Integrity
                          </button>
                          <button
                            onClick={() => handleRestoreCheckpoint(cp.checkpointNumber)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 rounded text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 transition-colors disabled:opacity-50"
                          >
                            Restore to This State
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ELIGIBILITY MODAL */}
        {eligibilityModalStep && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-[#141417] border border-[#232329] rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-[#232329] shrink-0">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Agent Eligibility Evaluation</h3>
                </div>
                <button onClick={() => setEligibilityModalStep(null)} className="text-zinc-500 hover:text-white">✕</button>
              </div>

              <div className="p-3 rounded-xl bg-[#09090C] border border-[#1A1A22] text-xs space-y-1 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">{eligibilityModalStep.title}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    Type: {eligibilityModalStep.taskType || "EXECUTION"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-zinc-400">
                  <span>Req Tools: [{eligibilityModalStep.requiredTools.join(", ") || "None"}]</span>
                  <span>Risk: {eligibilityModalStep.riskClassification}</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {eligibilityLoading ? (
                  <div className="p-8 text-center text-xs text-zinc-400 animate-pulse">
                    Evaluating deterministic eligibility criteria across registered agents...
                  </div>
                ) : eligibilityReports && eligibilityReports.length > 0 ? (
                  eligibilityReports.map((report) => (
                    <div
                      key={report.agentId}
                      className="p-3.5 rounded-xl bg-[#0F0F12] border border-[#1E1E24] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-indigo-400" />
                          <span className="font-bold text-white">{report.agentName || report.agentId}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            report.verdict === "ELIGIBLE"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : report.verdict === "REQUIRES_APPROVAL"
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                              : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {report.verdict}
                        </span>
                      </div>

                      {report.reasons && report.reasons.length > 0 && (
                        <ul className="text-[11px] text-zinc-400 list-disc list-inside space-y-0.5">
                          {report.reasons.map((r: string, idx: number) => (
                            <li key={idx} className={report.isEligible ? "text-zinc-400" : "text-rose-300"}>
                              {r}
                            </li>
                          ))}
                        </ul>
                      )}

                      {report.isEligible && (
                        <div className="pt-2 flex justify-end">
                          <button
                            onClick={() => {
                              handleAssignSingle(eligibilityModalStep.stepId, report.agentId);
                              setEligibilityModalStep(null);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
                          >
                            Assign This Agent
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    No registered agents found for evaluation.
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-[#232329] shrink-0">
                <button
                  onClick={() => setEligibilityModalStep(null)}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: DURABLE OBJECTIVE CHECKPOINTS (MILESTONE 13.6) */}
        {activeTab === "checkpoints" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#121215] border border-[#232329] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span>Durable Objective State Checkpoints</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Point-in-time immutable state snapshots. Enables crash recovery, lease reclamation, and audit verification.
                </p>
              </div>
              <button
                onClick={loadCheckpoints}
                disabled={checkpointsLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 bg-[#1A1A22] hover:bg-[#252530] border border-[#2E2E38] transition-all flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkpointsLoading ? "animate-spin" : ""}`} />
                Refresh Checkpoints
              </button>
            </div>

            {checkpointsLoading && checkpoints.length === 0 ? (
              <div className="p-12 text-center text-xs text-zinc-400 animate-pulse">
                Loading durable checkpoints...
              </div>
            ) : checkpoints.length === 0 ? (
              <div className="p-12 text-center text-xs text-zinc-500 rounded-2xl bg-[#0E0E11] border border-[#1E1E24]">
                No checkpoints created yet. Checkpoints are automatically generated on lifecycle transitions and orchestration rounds.
              </div>
            ) : (
              <div className="space-y-3">
                {checkpoints.map((cp) => {
                  const isVerified = verifiedCheckpoints[cp.checkpointNumber];
                  return (
                    <div
                      key={cp.id}
                      className="p-4 rounded-xl bg-[#0E0E11] border border-[#1E1E24] hover:border-[#2E2E38] transition-all space-y-3"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            #{cp.checkpointNumber}
                          </span>
                          <span className="text-xs font-bold text-white font-mono">
                            {cp.triggerReason}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            Status: {cp.objectiveStatus} (v{cp.objectiveVersion})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                          <span>{new Date(cp.createdAt).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pt-2 border-t border-[#1A1A22] text-[11px] font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">SHA-256:</span>
                          <span className="text-zinc-300 truncate max-w-xs">{cp.checkpointHash}</span>
                          {isVerified === true && (
                            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              ✓ INTEGRITY VERIFIED
                            </span>
                          )}
                          {isVerified === false && (
                            <span className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                              ✕ TAMPERED
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => verifyCheckpointIntegrity(cp.checkpointNumber)}
                            className="px-2.5 py-1 rounded text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
                          >
                            Verify Integrity
                          </button>
                          <button
                            onClick={() => handleRestoreCheckpoint(cp.checkpointNumber)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 rounded text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 transition-colors disabled:opacity-50"
                          >
                            Restore to This State
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

