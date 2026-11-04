"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  Play,
  ShieldAlert,
  Bot,
  ShieldCheck,
  History,
  FileText,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Layers,
  Wallet,
  Search,
  Globe,
  Award,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlowingCard } from "@/components/GlowingCard";
import { useMandate } from "@/context/MandateContext";
import { yoctoToNear } from "@/lib/yocto";
import { truncateAddress } from "@/lib/formatters";

export default function TaskDetailsPage() {
  const params = useParams<{ id: string }>();
  const { tasks, executeTaskPayment, accountId, sessionToken } = useMandate();
  const [activeTab, setActiveTab] = useState<
    "overview" | "research" | "plan" | "policy" | "audit"
  >("overview");
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [detailedTask, setDetailedTask] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const getHeaders = useCallback(() => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (accountId) {
      h["x-near-account"] = accountId;
    }
    if (sessionToken) {
      h["x-session-token"] = sessionToken;
    }
    return h;
  }, [accountId, sessionToken]);

  const loadTaskDetail = useCallback(async () => {
    if (!params?.id) return;
    try {
      setIsLoadingDetail(true);
      const res = await fetch(`/api/tasks/${params.id}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.task) {
          setDetailedTask(data.task);
        }
      }
    } catch (err) {
      console.error("Failed to load task details:", err);
    } finally {
      setIsLoadingDetail(false);
    }
  }, [params?.id, getHeaders]);

  useEffect(() => {
    loadTaskDetail();
  }, [loadTaskDetail]);

  const contextTask = tasks.find((t) => t.id === params?.id);
  const task = detailedTask || contextTask;

  if (isLoadingDetail && !task) {
    return (
      <AppShell>
        <div className="py-24 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-[#FF3B30] animate-spin mx-auto" />
          <p className="text-sm text-[#A1A1AA]">Loading task execution state...</p>
        </div>
      </AppShell>
    );
  }

  if (!task) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 text-xs text-[#A1A1AA] hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Tasks
          </Link>
          <p className="text-sm text-[#A1A1AA]">Task not found or unauthorized.</p>
        </div>
      </AppShell>
    );
  }

  const txHash = task.transaction?.txHash || task.txHash;
  const shortHash = txHash
    ? `${txHash.slice(0, 6)}...${txHash.slice(-6)}`
    : null;

  const agentWalletAddress =
    task.agent?.walletAddress || task.mandate?.wallet?.nearAccountId || null;
  const shortAgentAddress = agentWalletAddress
    ? `${agentWalletAddress.slice(0, 8)}...${agentWalletAddress.slice(-6)}`
    : null;

  const copyTxHash = () => {
    if (!txHash) return;
    navigator.clipboard.writeText(txHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 1800);
  };

  const copyAgentAddress = () => {
    if (!agentWalletAddress) return;
    navigator.clipboard.writeText(agentWalletAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 1800);
  };

  const handleExecutePayment = async () => {
    setActionError(null);
    setIsExecuting(true);
    try {
      await executeTaskPayment(task.id);
      await loadTaskDetail();
    } catch (err: any) {
      setActionError(err.message || "Execution failed");
    } finally {
      setIsExecuting(false);
    }
  };

  const rawStatus = (task.status || "").toLowerCase();
  const isSucceeded = rawStatus === "succeeded" || rawStatus === "completed";
  const isAwaitingApproval =
    rawStatus === "awaiting_approval" || rawStatus === "pending_approval";
  const isFailed = rawStatus === "failed" || rawStatus === "rejected";

  const policyDecision = task.policyDecision;
  const planSteps: any[] = task.planSteps || task.steps || [];

  return (
    <AppShell>
      <div className="space-y-7 relative">
        {/* Top Back Link */}
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1.5 text-xs text-[#A1A1AA] hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Tasks
        </Link>

        {/* Task Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {task.title}
              </h1>
            </div>
            <div className="text-xs text-[#A1A1AA] mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                Mandate:{" "}
                <Link
                  href="/mandates"
                  className="text-white hover:text-[#FF3B30] underline font-medium"
                >
                  {task.mandate?.name || task.mandateName || "Governing Mandate"}
                </Link>
              </span>
              <span>·</span>
              <span>
                Agent:{" "}
                <strong className="text-zinc-300 font-medium">
                  {task.agent?.name || "AI Agent"}
                </strong>
              </span>
              {shortAgentAddress && (
                <>
                  <span>·</span>
                  <span className="font-mono text-zinc-400 flex items-center gap-1">
                    TEE Custody: {shortAgentAddress}
                    <button
                      type="button"
                      onClick={copyAgentAddress}
                      className="text-zinc-500 hover:text-white"
                      title="Copy OutLayer custody address"
                    >
                      {copiedAddress ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </span>
                </>
              )}
            </div>
          </div>

          <div>
            {isSucceeded ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Completed &amp; Settled
              </span>
            ) : isAwaitingApproval ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                Awaiting Human Approval
              </span>
            ) : isFailed ? (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30]" />
                {rawStatus === "rejected" ? "Blocked by Policy" : "Execution Refused"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Executing
              </span>
            )}
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex items-center gap-6 border-b border-[#1C1C22]">
          {(
            [
              { id: "overview" as const, label: "Overview & Timeline" },
              ...(task.researchSession || task.taskType === "PROCUREMENT"
                ? [{ id: "research" as const, label: "Research & Evidence" }]
                : []),
              { id: "plan" as const, label: "Agent Plan" },
              { id: "policy" as const, label: "Deterministic Policy Firewall" },
              { id: "audit" as const, label: "Audit Log Trail" },
            ]
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-xs sm:text-sm font-medium transition-colors relative ${
                  isActive
                    ? "text-white"
                    : "text-[#A1A1AA] hover:text-[#E5E7EB]"
                }`}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-[#FF3B30] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Main 2-Column Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Context Tab Content */}
          <div className="lg:col-span-7 space-y-6">
            {activeTab === "overview" && (
              <GlowingCard
                intensity="medium"
                innerClassName="p-6 space-y-6"
                glowPosition="top-left"
              >
                <div>
                  <h2 className="text-sm font-semibold text-white">Task Goal</h2>
                  <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">
                    {task.description || task.goal || task.title}
                  </p>
                </div>

                {/* 5-Stage Visual Execution Timeline */}
                <div className="space-y-4 pt-4 border-t border-white/[0.07]">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-[#FF3B30]" />
                    End-to-End Execution Timeline
                  </h3>

                  <div className="space-y-3">
                    {/* Stage 0: Autonomous Research (if applicable) */}
                    {task.researchSession && (
                      <div className="p-3.5 rounded-xl bg-[#09090B]/90 border border-white/[0.07] flex items-start gap-3">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="text-xs space-y-1">
                          <div className="font-semibold text-white flex items-center gap-2">
                            <span>0. Autonomous Research &amp; Market Intelligence</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-400 border border-blue-500/25">
                              {task.researchSession.sourcesReviewed?.length || 0} Sources Cited
                            </span>
                          </div>
                          <div className="text-zinc-400">
                            Queried live web sources, parsed constraints, and benchmarked{" "}
                            {task.researchSession.candidateOptions?.length || 3} verified candidates against budget.
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Stage 1: Agent Proposal */}
                    <div className="p-3.5 rounded-xl bg-[#09090B]/90 border border-white/[0.07] flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1">
                        <div className="font-semibold text-white">
                          1. Agent Intent Proposal
                        </div>
                        <div className="text-zinc-400">
                          {task.agent?.name || "Agent"} structured the spending intent:{" "}
                          <span className="font-mono text-zinc-200">
                            {task.proposedAmountNear || yoctoToNear(task.amountAtomic, 3)} NEAR
                          </span>{" "}
                          to{" "}
                          <span className="font-mono text-zinc-200">
                            {truncateAddress(task.proposedRecipient || task.recipient, 10, 6)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stage 2: Policy Firewall Evaluation */}
                    <div
                      className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                        policyDecision && !policyDecision.allowed
                          ? "bg-[#FF3B30]/15 border-[#FF3B30]/40"
                          : "bg-[#09090B]/90 border-white/[0.07]"
                      }`}
                    >
                      {policyDecision && !policyDecision.allowed ? (
                        <XCircle className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
                      ) : (
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      )}
                      <div className="text-xs space-y-1">
                        <div className="font-semibold text-white">
                          2. Deterministic Policy Firewall
                        </div>
                        <div className="text-zinc-400">
                          {policyDecision ? (
                            policyDecision.allowed ? (
                              <span className="text-emerald-400">
                                Evaluated 9 deterministic rules: All passed.
                              </span>
                            ) : (
                              <span className="text-[#FF3B30]">
                                Blocked: {policyDecision.humanExplanation || policyDecision.reason}
                              </span>
                            )
                          ) : (
                            <span>Evaluated against mandate budget &amp; recipient allowlist.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stage 3: Human Approval Gate */}
                    <div className="p-3.5 rounded-xl bg-[#09090B]/90 border border-white/[0.07] flex items-start gap-3">
                      {task.approval ? (
                        task.approval.status === "APPROVED" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : task.approval.status === "REJECTED" ? (
                          <XCircle className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        )
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                      )}
                      <div className="text-xs space-y-1">
                        <div className="font-semibold text-white">
                          3. Human Approval Gate
                        </div>
                        <div className="text-zinc-400">
                          {task.approval ? (
                            task.approval.status === "PENDING" ? (
                              <span className="text-amber-400">
                                Pending human approval: {task.approval.reason}
                              </span>
                            ) : task.approval.status === "APPROVED" ? (
                              <span className="text-emerald-400">
                                Approved by user at {task.approval.decidedAt || "recently"}.
                              </span>
                            ) : (
                              <span className="text-[#FF3B30]">
                                Rejected by user. Reserved funds released back to mandate.
                              </span>
                            )
                          ) : (
                            <span className="text-zinc-400">
                              Automated: Amount is within autonomous threshold (&le; 0.050 NEAR).
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stage 4: OutLayer TEE Signing */}
                    <div className="p-3.5 rounded-xl bg-[#09090B]/90 border border-white/[0.07] flex items-start gap-3">
                      {isSucceeded ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : rawStatus === "failed" ? (
                        <XCircle className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
                      ) : rawStatus === "rejected" ? (
                        <span className="w-4 h-4 text-zinc-600 shrink-0 font-mono text-[10px] text-center">
                          —
                        </span>
                      ) : (
                        <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div className="text-xs space-y-1">
                        <div className="font-semibold text-white">
                          4. OutLayer TEE Enclave Custody
                        </div>
                        <div className="text-zinc-400">
                          {isSucceeded ? (
                            <span className="text-emerald-400">
                              Signed in OutLayer TEE enclave and broadcasted to NEAR testnet.
                            </span>
                          ) : rawStatus === "failed" ? (
                            <span className="text-[#FF3B30]">
                              OutLayer refused: Dedicated agent custody wallet is not yet funded on testnet.
                            </span>
                          ) : rawStatus === "rejected" ? (
                            <span className="text-zinc-500">
                              Bypassed: Blocked by deterministic policy before enclave signature.
                            </span>
                          ) : (
                            <span>Awaiting enclave signing instruction.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stage 5: NEAR Settlement */}
                    <div className="p-3.5 rounded-xl bg-[#09090B]/90 border border-white/[0.07] flex items-start gap-3">
                      {isSucceeded && txHash ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <span className="w-4 h-4 text-zinc-600 shrink-0 font-mono text-[10px] text-center">
                          —
                        </span>
                      )}
                      <div className="text-xs space-y-1">
                        <div className="font-semibold text-white">
                          5. NEAR Protocol Settlement
                        </div>
                        <div className="text-zinc-400 font-mono">
                          {txHash ? (
                            <a
                              href={`https://testnet.nearblocks.io/txns/${txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 hover:underline flex items-center gap-1"
                            >
                              Confirmed on Testnet: {shortHash}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-zinc-500">
                              No onchain settlement (Not completed).
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </GlowingCard>
            )}

            {activeTab === "research" && (
              <div className="space-y-6">
                {task.researchSession ? (
                  <>
                    {/* Research Summary Card */}
                    <GlowingCard
                      intensity="medium"
                      innerClassName="p-6 space-y-4"
                      glowPosition="top-left"
                    >
                      <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                        <div className="flex items-center gap-2">
                          <Search className="w-4 h-4 text-[#FF3B30]" />
                          <h2 className="text-sm font-semibold text-white">
                            Autonomous Research Objective
                          </h2>
                        </div>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {task.researchSession.candidateOptions?.length || 0} Candidates Evaluated
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[#09090B] border border-white/[0.06] text-xs">
                        <div className="text-[#A1A1AA] mb-1 font-mono text-[10px] uppercase tracking-wider">
                          Natural Language Prompt
                        </div>
                        <p className="text-white leading-relaxed">
                          {task.researchSession.query || task.rawPrompt || task.description}
                        </p>
                      </div>

                      {/* Criteria Tags */}
                      {task.researchSession.extractedCriteria && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          <span className="text-[#A1A1AA] text-[11px]">Extracted Constraints:</span>
                          {task.researchSession.extractedCriteria.maxBudgetNear && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px]">
                              Max Budget: {task.researchSession.extractedCriteria.maxBudgetNear} NEAR
                            </span>
                          )}
                          {task.researchSession.extractedCriteria.deliveryMaxDays && (
                            <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono text-[11px]">
                              Delivery: &le; {task.researchSession.extractedCriteria.deliveryMaxDays} days
                            </span>
                          )}
                          {(task.researchSession.extractedCriteria.requiredFeatures || []).map((feat: string, i: number) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-md bg-white/[0.05] text-zinc-300 border border-white/[0.08] text-[11px]"
                            >
                              {feat}
                            </span>
                          ))}
                        </div>
                      )}
                    </GlowingCard>

                    {/* Winning Recommendation Card */}
                    {task.researchSession.recommendation && (
                      <GlowingCard
                        intensity="strong"
                        innerClassName="p-6 space-y-4"
                        glowPosition="top-right"
                      >
                        <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                          <div className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-emerald-400" />
                            <h2 className="text-sm font-semibold text-white">
                              Winning Provider Recommendation
                            </h2>
                          </div>
                          {task.researchSession.recommendation.confidenceScore && (
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              Confidence: {Math.round(task.researchSession.recommendation.confidenceScore * 100)}%
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-3.5 rounded-xl bg-[#09090B] border border-white/[0.06]">
                            <div className="text-[11px] text-[#A1A1AA]">Selected Provider</div>
                            <div className="text-sm font-semibold text-white mt-1">
                              {task.researchSession.recommendation.selectedProvider}
                            </div>
                            <div className="text-xs font-mono text-emerald-400 mt-0.5 truncate">
                              {task.researchSession.recommendation.recipientAccount}
                            </div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-[#09090B] border border-white/[0.06]">
                            <div className="text-[11px] text-[#A1A1AA]">Recommended Spend</div>
                            <div className="text-sm font-bold text-white font-mono mt-1">
                              {task.researchSession.recommendation.amountNear} NEAR
                            </div>
                            <div className="text-[11px] text-[#A1A1AA] mt-0.5">
                              Within user budget constraint
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs text-[#A1A1AA] font-medium">Justification &amp; Trade-offs</div>
                          <p className="text-xs text-zinc-300 leading-relaxed bg-[#09090B] p-3 rounded-xl border border-white/[0.06]">
                            {task.researchSession.recommendation.justification ||
                              task.researchSession.reasoningSummary}
                          </p>
                        </div>
                      </GlowingCard>
                    )}

                    {/* Candidate Comparison Matrix */}
                    <GlowingCard
                      intensity="medium"
                      innerClassName="p-6 space-y-4"
                      glowPosition="top-left"
                    >
                      <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-[#FF3B30]" />
                          <h2 className="text-sm font-semibold text-white">
                            Provider Comparison Matrix
                          </h2>
                        </div>
                        <span className="text-[11px] text-zinc-400">
                          {task.researchSession.candidateOptions?.length || 0} evaluated
                        </span>
                      </div>

                      <div className="space-y-3">
                        {(task.researchSession.candidateOptions || []).map((cand: any, idx: number) => {
                          const isWinner =
                            cand.providerName === task.researchSession?.recommendation?.selectedProvider ||
                            cand.recipientAccount === task.researchSession?.recommendation?.recipientAccount;

                          return (
                            <div
                              key={idx}
                              className={`p-4 rounded-xl border text-xs transition-colors ${
                                isWinner
                                  ? "bg-emerald-500/[0.04] border-emerald-500/30"
                                  : "bg-[#09090B] border-white/[0.06]"
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-white text-sm">
                                    {cand.providerName}
                                  </span>
                                  {isWinner && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                      RECOMMENDED
                                    </span>
                                  )}
                                  <span className="text-[10px] font-mono text-zinc-500">
                                    {cand.verifiedStatus || "VERIFIED"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 font-mono">
                                  <span className="text-white font-semibold">
                                    {cand.priceNear} NEAR
                                  </span>
                                  <span className="text-zinc-500 text-[11px]">
                                    SLA: {cand.turnaroundDays}d
                                  </span>
                                </div>
                              </div>

                              <div className="text-[11px] font-mono text-zinc-400 mb-2 truncate">
                                Recipient: {cand.recipientAccount}
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                {(cand.features || []).map((f: string, fi: number) => (
                                  <span
                                    key={fi}
                                    className="px-2 py-0.5 rounded bg-white/[0.03] text-zinc-300 border border-white/[0.06] text-[10px]"
                                  >
                                    {f}
                                  </span>
                                ))}
                              </div>

                              <p className="text-[11px] text-zinc-400 leading-relaxed">
                                {cand.reasoning}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </GlowingCard>

                    {/* Genuine Sources Attribution */}
                    <GlowingCard
                      intensity="medium"
                      innerClassName="p-6 space-y-4"
                      glowPosition="bottom-right"
                    >
                      <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-blue-400" />
                          <h2 className="text-sm font-semibold text-white">
                            Verified External Evidence Sources
                          </h2>
                        </div>
                        <span className="text-[11px] text-zinc-400">
                          {task.researchSession.sourcesReviewed?.length || 0} external sources
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {(task.researchSession.sourcesReviewed || []).map((src: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-[#09090B] border border-white/[0.06] text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-white hover:text-emerald-400 transition-colors flex items-center gap-1 truncate"
                              >
                                {src.title || src.domain}
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-zinc-400 shrink-0">
                                {src.domain}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                              {src.snippet}
                            </p>
                            <div className="text-[10px] text-zinc-500 font-mono">
                              Retrieved: {src.retrievedAt || "Recently"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </GlowingCard>
                  </>
                ) : (
                  <GlowingCard
                    intensity="subtle"
                    innerClassName="p-8 text-center space-y-2"
                  >
                    <Search className="w-8 h-8 text-zinc-600 mx-auto" />
                    <h3 className="text-sm font-semibold text-white">Direct Proposal Task</h3>
                    <p className="text-xs text-[#A1A1AA] max-w-md mx-auto">
                      This task was created as a direct spending proposal without an autonomous research session.
                    </p>
                  </GlowingCard>
                )}
              </div>
            )}

            {activeTab === "plan" && (
              <GlowingCard
                intensity="medium"
                innerClassName="p-6 space-y-5"
                glowPosition="top-left"
              >
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#FF3B30]" />
                    AI Agent Autonomous Plan
                  </h2>
                  <span className="text-[11px] font-mono text-[#A1A1AA]">
                    Planner: {task.aiPlannerModel || "DeepSeek-V3"}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {planSteps.map((step: any, idx: number) => {
                    const stepTitle = typeof step === "string" ? step : step.title;
                    const stepStatus = typeof step === "object" ? step.status : "completed";

                    return (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-[#09090B]/90 border border-white/[0.07] flex items-center gap-3"
                      >
                        {isSucceeded || stepStatus === "completed" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : stepStatus === "blocked" || rawStatus === "rejected" ? (
                          <XCircle className="w-4 h-4 text-[#FF3B30] shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <span className="text-xs sm:text-sm text-[#E5E7EB]">
                          {stepTitle}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </GlowingCard>
            )}

            {activeTab === "policy" && (
              <GlowingCard
                intensity="medium"
                innerClassName="p-6 space-y-5"
                glowPosition="top-left"
              >
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#FF3B30]" />
                    Deterministic Policy Checks
                  </h2>
                  {policyDecision?.checks && (
                    <span className="text-xs font-mono text-emerald-400">
                      {policyDecision.checks.filter((c: any) => c.passed).length}/
                      {policyDecision.checks.length} Passed
                    </span>
                  )}
                </div>

                {policyDecision?.checks ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {policyDecision.checks.map((c: any) => (
                      <div
                        key={c.rule}
                        className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                          c.passed
                            ? "bg-[#09090B]/90 border-white/[0.07]"
                            : "bg-[#FF3B30]/15 border-[#FF3B30]/40"
                        }`}
                      >
                        {c.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-[#FF3B30] shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-white">{c.rule}</div>
                          <div className="text-[11px] text-[#A1A1AA] mt-0.5 leading-relaxed">
                            {c.detail}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.07] text-xs text-[#A1A1AA]">
                    Policy checks verified prior to execution against active mandate policies.
                  </div>
                )}
              </GlowingCard>
            )}

            {activeTab === "audit" && (
              <GlowingCard
                intensity="medium"
                innerClassName="p-6 space-y-5"
                glowPosition="top-left"
              >
                <h2 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-white/[0.07] pb-3">
                  <History className="w-4 h-4 text-[#FF3B30]" />
                  Immutable Audit Records
                </h2>

                <div className="space-y-2.5">
                  {(task.auditLogs || []).length === 0 ? (
                    <p className="text-xs text-[#A1A1AA]">No audit logs recorded for this task.</p>
                  ) : (
                    task.auditLogs.map((log: any) => (
                      <div
                        key={log.id}
                        className="p-3.5 rounded-xl bg-[#09090B]/90 border border-white/[0.07] flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-mono font-medium text-white">
                            {log.eventType}
                          </div>
                          <div className="text-[11px] text-[#A1A1AA] mt-0.5">
                            {log.createdAt}
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                            log.verdict === "SUCCESS" || log.verdict === "ALLOWED"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : log.verdict === "BLOCKED" || log.verdict === "REJECTED" || log.verdict === "FAILED"
                              ? "bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30"
                              : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {log.verdict}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </GlowingCard>
            )}
          </div>

          {/* Right Column: Payment Details Card */}
          <div className="lg:col-span-5 space-y-4">
            <GlowingCard
              intensity="strong"
              innerClassName="p-6 space-y-5"
              glowPosition="bottom-right"
            >
              <h2 className="text-base font-semibold text-white border-b border-white/[0.07] pb-3.5">
                Payment Details
              </h2>

              <div className="space-y-4">
                <div>
                  <div className="text-xs text-[#A1A1AA]">Proposed Recipient</div>
                  <div className="text-sm font-semibold text-white font-mono mt-1">
                    {truncateAddress(task.proposedRecipient || task.recipient, 10, 6)}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[#A1A1AA]">Amount</div>
                  <div className="text-xl font-bold text-white font-mono mt-1">
                    {task.proposedAmountNear || yoctoToNear(task.amountAtomic, 3)} NEAR
                  </div>
                  <div className="text-[11px] font-mono text-[#A1A1AA] mt-0.5 truncate">
                    {task.proposedAmountYocto || task.amountAtomic} yoctoNEAR
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[#A1A1AA]">NEAR Testnet Transaction Hash</div>
                  {txHash ? (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-mono font-medium text-white">
                        {shortHash}
                      </span>
                      <button
                        type="button"
                        onClick={copyTxHash}
                        className="p-1.5 rounded-lg bg-[#181316] hover:bg-[#22191D] text-[#A1A1AA] hover:text-white border border-white/10 transition-colors"
                        title="Copy full transaction hash"
                      >
                        {copiedHash ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={`https://testnet.nearblocks.io/txns/${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg bg-[#181316] hover:bg-[#22191D] text-[#A1A1AA] hover:text-white border border-white/10 transition-colors"
                        title="Inspect on NEAR Testnet Explorer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ) : (
                    <div className="text-xs font-mono text-[#A1A1AA] mt-1">
                      {rawStatus === "rejected"
                        ? "None (Policy firewall blocked execution before signing)"
                        : "Awaiting testnet broadcast"}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs text-[#A1A1AA] mb-1.5">Firewall Status</div>
                  {isSucceeded ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Settled on NEAR Testnet
                    </span>
                  ) : isAwaitingApproval ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      <Clock className="w-3.5 h-3.5" />
                      Requires Human Approval Gate
                    </span>
                  ) : isFailed ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      {rawStatus === "rejected"
                        ? `Rejected: ${policyDecision?.reason || "POLICY_VIOLATION"}`
                        : "Chain Refused (Unfunded Custody Account)"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      <Play className="w-3.5 h-3.5" />
                      Policy Checked · In Progress
                    </span>
                  )}
                </div>
              </div>

              {actionError && (
                <div className="p-3 rounded-xl bg-[#FF3B30]/15 border border-[#FF3B30]/35 text-xs text-[#FF3B30] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Action Buttons */}
              {isAwaitingApproval && (
                <div className="pt-4 border-t border-white/[0.07]">
                  <Link
                    href="/approvals"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_24px_rgba(255,59,48,0.4)]"
                  >
                    Review in Approvals Queue &rarr;
                  </Link>
                </div>
              )}

              {rawStatus === "failed" && (
                <div className="pt-4 border-t border-white/[0.07] space-y-3">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      OutLayer implicit accounts require a small onchain deposit (testnet NEAR)
                      for account activation and storage before transfers succeed.
                    </span>
                  </div>
                  <Link
                    href="/wallets"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#181316] hover:bg-[#22191D] border border-white/10 transition-colors"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    Fund Agent Custody Account
                  </Link>
                </div>
              )}
            </GlowingCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
