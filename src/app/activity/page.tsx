"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Code2,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Wallet,
  Bot,
  Layers,
  ArrowRight,
  Filter,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Hash,
  Lock,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlowingCard } from "@/components/GlowingCard";
import { MandateMark } from "@/components/MandateLogo";
import { useMandate } from "@/context/MandateContext";

export default function ActivityPage() {
  const { activities, accountId, sessionToken } = useMandate();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Hash chain verification state
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    count: number;
    headHash?: string;
    genesisHash?: string;
    error?: string;
  } | null>(null);

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (accountId) headers["x-near-account"] = accountId;
      if (sessionToken) headers["x-session-token"] = sessionToken;

      const res = await fetch("/api/audit/verify", { headers });
      const data = await res.json();
      if (data.success && data.verification) {
        setVerificationResult({
          verified: data.verification.valid,
          count: data.verification.count,
          headHash: data.verification.headHash,
          genesisHash: data.verification.genesisHash,
          error: data.verification.error,
        });
      }
    } catch (err: any) {
      setVerificationResult({
        verified: false,
        count: 0,
        error: err.message || "Failed to query hash chain integrity",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Filter activities by category and search
  const filtered = activities.filter((a) => {
    // Exclude personal wallet connection events from ledger display
    if (a.title === "WALLET CONNECTED" || a.title?.toLowerCase().includes("wallet connect")) return false;

    // 1. Category Filter matching prompt specification
    if (categoryFilter === "payments" && a.category !== "payment") return false;
    if (categoryFilter === "approvals" && a.category !== "approval") return false;
    if (
      categoryFilter === "blocked" &&
      a.badgeVariant !== "error" &&
      !a.title.includes("BLOCK") &&
      !a.title.includes("REJECT")
    ) {
      return false;
    }
    if (categoryFilter === "agent" && a.category !== "agent") return false;
    if (categoryFilter === "mandate" && a.category !== "mandate") return false;
    if (categoryFilter === "wallet" && a.category !== "funding") return false;

    // 2. Search Query filter
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      const matchTitle = a.title.toLowerCase().includes(query);
      const matchSubtitle = a.subtitle.toLowerCase().includes(query);
      const matchHash = a.txHash?.toLowerCase().includes(query) || false;
      const matchId = a.id.toLowerCase().includes(query);
      const matchPayload = JSON.stringify(a.payloadJson).toLowerCase().includes(query);
      if (!matchTitle && !matchSubtitle && !matchHash && !matchId && !matchPayload) {
        return false;
      }
    }

    return true;
  });

  // Pagination calculations (10 items per page)
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Summary counts
  const totalEvents = activities.length;
  const policyBlocks = activities.filter(
    (a) => a.badgeVariant === "error" || a.title.includes("BLOCK") || a.title.includes("REJECT")
  ).length;
  const humanApprovals = activities.filter((a) => a.category === "approval").length;
  const onchainTransfers = activities.filter(
    (a) => Boolean(a.txHash) || a.category === "payment"
  ).length;

  const badgeStyles: Record<
    "success" | "info" | "warning" | "error",
    string
  > = {
    success:
      "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    info: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    warning: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    error: "bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30",
  };

  const getEventIcon = (item: (typeof activities)[0]) => {
    if (item.category === "policy") {
      return item.badgeVariant === "error" ? (
        <ShieldAlert className="w-4 h-4 text-[#FF3B30]" />
      ) : (
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
      );
    }
    if (item.category === "approval") {
      return item.badgeVariant === "error" ? (
        <XCircle className="w-4 h-4 text-[#FF3B30]" />
      ) : item.badgeVariant === "warning" ? (
        <Clock className="w-4 h-4 text-amber-400" />
      ) : (
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
      );
    }
    if (item.category === "funding") {
      return <Wallet className="w-4 h-4 text-emerald-400" />;
    }
    if (item.category === "agent") {
      return <Bot className="w-4 h-4 text-[#FF3B30]" />;
    }
    if (item.category === "mandate") {
      return <Layers className="w-4 h-4 text-blue-400" />;
    }
    return item.badgeVariant === "success" ? (
      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
    ) : (
      <XCircle className="w-4 h-4 text-[#FF3B30]" />
    );
  };

  return (
    <AppShell>
      <div className="space-y-8 relative">
        <div
          className="pointer-events-none absolute -top-10 right-0 w-[360px] h-[240px] rounded-full opacity-15 blur-[110px]"
          style={{ background: "#FF3B30" }}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10 animate-rise">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Activity &amp; Audit Ledger
            </h1>
            <p className="text-sm text-slate-600 dark:text-[#A1A1AA] mt-1">
              Append-only, tamper-evident cryptographic event history for your autonomous AI agents.
            </p>
          </div>

          {/* On-Demand Hash Chain Verifier Button */}
          <button
            type="button"
            onClick={handleVerifyChain}
            disabled={isVerifying}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-800 hover:text-slate-950 bg-white hover:bg-slate-50 border border-slate-200 dark:text-white dark:bg-[#181316] dark:hover:bg-[#22191D] dark:border-white/10 transition-all shadow-sm hover:shadow dark:shadow-[0_0_24px_rgba(255,59,48,0.2)] disabled:opacity-50 self-start sm:self-auto btn-pop"
          >
            <Lock className="w-3.5 h-3.5 text-[#FF3B30]" />
            {isVerifying ? "Verifying SHA-256 Chain..." : "Verify Hash Chain Integrity"}
          </button>
        </div>

        {/* Cryptographic Verification Banner */}
        {verificationResult && (
          <div
            className={`p-4 rounded-xl border text-xs flex items-start justify-between gap-4 relative z-10 animate-pop ${
              verificationResult.verified
                ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/25 dark:text-emerald-300"
                : "bg-red-50 border-red-200 text-red-700 dark:bg-[#FF3B30]/15 dark:border-[#FF3B30]/40 dark:text-[#FF3B30]"
            }`}
          >
            <div className="flex items-start gap-3">
              {verificationResult.verified ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-[#FF3B30] shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-semibold text-sm">
                  {verificationResult.verified
                    ? "Cryptographic Hash Chain: VERIFIED VALID"
                    : "Cryptographic Tampering Detected!"}
                </div>
                <div>
                  {verificationResult.verified ? (
                    <>
                      All <span className="font-mono font-bold">{verificationResult.count}</span> events
                      are cryptographically linked via predecessor SHA-256 hashes. Head:{" "}
                      <span className="font-mono">{verificationResult.headHash?.slice(0, 16)}...</span>
                    </>
                  ) : (
                    <span>{verificationResult.error}</span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setVerificationResult(null)}
              className="text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-white"
            >
              &times;
            </button>
          </div>
        )}

        {/* Summary Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10">
          <div className="p-4 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] space-y-1 shadow-sm animate-pop hover-pop stagger-1">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
              Total Ledger Records
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {totalEvents}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] space-y-1 shadow-sm animate-pop hover-pop stagger-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
              Firewall Rejections
            </div>
            <div className="text-2xl font-bold text-[#FF3B30] font-mono">
              {policyBlocks}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] space-y-1 shadow-sm animate-pop hover-pop stagger-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
              Human Approvals
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">
              {humanApprovals}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] space-y-1 shadow-sm animate-pop hover-pop stagger-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA]">
              Onchain Settlements
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              {onchainTransfers}
            </div>
          </div>
        </div>

        {/* Filter Controls & Search Bar */}
        <div className="space-y-3 relative z-10 animate-rise stagger-2">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] text-xs shadow-sm">
            {(
              [
                { id: "all", label: "All Events" },
                { id: "payments", label: "Payments" },
                { id: "approvals", label: "Approvals" },
                { id: "blocked", label: "Blocked Actions" },
                { id: "agent", label: "Agent Activity" },
                { id: "mandate", label: "Mandate Changes" },
                { id: "wallet", label: "Wallet Activity" },
              ] as const
            ).map((tab, idx) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(tab.id);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors btn-pop stagger-${idx + 1} ${
                  categoryFilter === tab.id
                    ? "bg-[#FF3B30] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.05]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by event type, task, recipient, or transaction hash..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#FF3B30] shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-xs text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-white absolute right-3.5 top-1/2 -translate-y-1/2"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Activity Feed */}
        {activities.length === 0 ? (
          <GlowingCard intensity="medium" innerClassName="p-10 text-center space-y-3">
            <Activity className="w-8 h-8 text-[#FF3B30] mx-auto" />
            <div className="text-base font-semibold text-white">
              No activity yet.
            </div>
            <p className="text-xs text-[#A1A1AA] max-w-md mx-auto">
              No recent activity — actions will appear here as agents execute tasks.
            </p>
          </GlowingCard>
        ) : filtered.length === 0 ? (
          <GlowingCard intensity="medium" innerClassName="p-10 text-center space-y-3">
            <FileText className="w-8 h-8 text-[#FF3B30] mx-auto" />
            <div className="text-base font-semibold text-white">
              No Audit Records Match Active Filter
            </div>
            <p className="text-xs text-[#A1A1AA] max-w-md mx-auto">
              No recorded events found for &quot;{categoryFilter}&quot;
              {searchQuery ? ` matching "${searchQuery}"` : ""}.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter("all");
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#FF3B30] text-white hover:bg-[#E63228]"
              >
                Reset All Filters
              </button>
            </div>
          </GlowingCard>
        ) : (
          <div className="space-y-4 relative z-10">
            <GlowingCard
              intensity="medium"
              innerClassName="p-0 divide-y divide-white/[0.06]"
              glowPosition="top-right"
            >
              {paginated.map((item, idx) => {
                const isExpanded = expandedId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`p-5 sm:p-6 space-y-3 hover:bg-slate-50 dark:hover:bg-white/[0.015] transition-colors animate-pop hover-pop stagger-${(idx % 10) + 1}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-[#181316] border border-red-200 dark:border-white/10 flex items-center justify-center shrink-0">
                          {getEventIcon(item)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                              {item.title}
                            </span>
                            {item.amountLabel && (
                              <span className="text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20">
                                {item.amountLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-[#A1A1AA] mt-0.5 truncate">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                        <span className="text-xs text-slate-500 dark:text-[#A1A1AA] font-mono">
                          {item.timestampLabel}
                        </span>

                        <span
                          className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                            badgeStyles[item.badgeVariant]
                          }`}
                        >
                          {item.badgeText}
                        </span>

                        {/* Direct Link to Task Details */}
                        {item.taskId && (
                          <Link
                            href={`/tasks/${item.taskId}`}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 dark:bg-[#181316] dark:hover:bg-[#22191D] dark:text-[#A1A1AA] dark:hover:text-white dark:border-white/10 transition-colors btn-pop"
                            title="Inspect full task execution timeline"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </Link>
                        )}

                        {/* Direct Link to NEAR Testnet Explorer */}
                        {item.txHash && (
                          <a
                            href={`https://testnet.nearblocks.io/txns/${item.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 dark:bg-[#181316] dark:hover:bg-[#22191D] dark:text-[#A1A1AA] dark:hover:text-white dark:border-white/10 transition-colors btn-pop"
                            title="View on NearBlocks Testnet Explorer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {/* Inspect Raw Audit JSON */}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : item.id)
                          }
                          className={`p-1.5 rounded-lg border transition-colors ${
                            isExpanded
                              ? "bg-[#FF3B30] text-white border-[#FF3B30]"
                              : "bg-[#181316] hover:bg-[#22191D] text-[#A1A1AA] hover:text-white border-white/10"
                          }`}
                          title="Inspect cryptographic audit JSON record"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
                        <div className="text-[11px] font-mono text-zinc-400 flex flex-wrap items-center justify-between gap-2">
                          <span>Event ID: {item.id}</span>
                          {item.createdAtIso && (
                            <span>Recorded: {item.createdAtIso}</span>
                          )}
                        </div>
                        <pre className="p-3.5 rounded-xl bg-[#09090B] border border-white/10 text-[11px] font-mono text-[#E5E7EB] overflow-x-auto">
                          {JSON.stringify(item.payloadJson, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </GlowingCard>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-[#A1A1AA] pt-2">
                <div>
                  Showing {(currentPage - 1) * pageSize + 1} to{" "}
                  {Math.min(currentPage * pageSize, filtered.length)} of{" "}
                  {filtered.length} events
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg bg-[#09090B] border border-white/10 disabled:opacity-40 hover:text-white"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-mono text-white">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg bg-[#09090B] border border-white/10 disabled:opacity-40 hover:text-white"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
