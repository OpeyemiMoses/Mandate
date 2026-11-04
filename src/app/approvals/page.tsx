"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  CheckCircle2,
  ArrowRight,
  Bot,
  ExternalLink,
  Loader2,
  Clock,
  Layers,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlowingCard } from "@/components/GlowingCard";
import { MandateMark } from "@/components/MandateLogo";
import { useMandate, ApprovalItem } from "@/context/MandateContext";
import { yoctoToNear } from "@/lib/yocto";
import { WalletSignatureModal } from "@/components/WalletSignatureModal";
import { truncateAddress } from "@/lib/formatters";

export default function ApprovalsPage() {
  const { approvals, approvePayment, rejectPayment } = useMandate();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [signingItem, setSigningItem] = useState<ApprovalItem | null>(null);

  const pending = approvals.filter((a) => a.status === "pending");
  const history = approvals.filter((a) => a.status !== "pending");

  const handleOpenSignature = (item: ApprovalItem) => {
    setSigningItem(item);
  };

  const handleConfirmSignature = async (approvalId: string, signatureDetails: any) => {
    try {
      setProcessingId(approvalId);
      await approvePayment(approvalId, signatureDetails);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    try {
      setProcessingId(id);
      await rejectPayment(id);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-8 relative">
        <div
          className="pointer-events-none absolute -top-10 right-0 w-[360px] h-[240px] rounded-full opacity-15 blur-[110px]"
          style={{ background: "#FF3B30" }}
        />

        {/* Header */}
        <div className="relative z-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Approvals
          </h1>
          <p className="text-sm text-[#A1A1AA] mt-1">
            Review and approve pending high-value agent spending requests.
          </p>
        </div>

        {/* Security invariant banner */}
        <GlowingCard
          intensity="subtle"
          innerClassName="p-4"
          glowPosition="top-left"
        >
          <div className="flex items-center gap-3 text-xs text-[#A1A1AA]">
            <ShieldAlert className="w-4 h-4 text-[#FF3B30] shrink-0" />
            <span>
              Payments exceeding a mandate&apos;s autonomous threshold require
              explicit human sign-off.{" "}
              <strong className="text-[#E5E7EB] font-medium">
                Human approval can never override hard per-transaction caps or total
                budget limits.
              </strong>
            </span>
          </div>
        </GlowingCard>

        {/* Pending Approvals */}
        {pending.length === 0 ? (
          <GlowingCard
            intensity="medium"
            innerClassName="p-10 text-center space-y-3"
          >
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <div className="text-base font-semibold text-white">
              No Pending Approvals
            </div>
            <p className="text-xs text-[#A1A1AA] max-w-md mx-auto">
              No pending approvals — all agent actions are within policy limits. High-value spending proposals exceeding mandate thresholds will appear here for cryptographic review.
            </p>
            <div className="pt-2">
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#FF3B30] text-white hover:bg-[#E63228]"
              >
                Dispatch Test Task
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </GlowingCard>
        ) : (
          <div className="space-y-4 relative z-10 max-w-3xl">
            {pending.map((item) => {
              const isWorking = processingId === item.id;
              return (
                <GlowingCard
                  key={item.id}
                  intensity="strong"
                  innerClassName="p-6 space-y-5"
                  glowPosition="top-right"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-2xl bg-[#181316] border border-[#FF3B30]/35 flex items-center justify-center shrink-0 mt-0.5">
                        <MandateMark className="w-6 h-5" />
                      </div>

                      <div className="space-y-1.5 min-w-0">
                        <div className="text-xs uppercase font-semibold tracking-wider text-amber-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          Pending Human Approval
                        </div>
                        <div className="text-2xl font-bold text-white font-mono">
                          {yoctoToNear(item.amountAtomic, 3)} NEAR
                        </div>
                        <div className="text-xs font-mono text-[#E5E7EB] truncate">
                          Recipient: {truncateAddress(item.recipient, 8, 6)}
                        </div>
                        <div className="text-xs text-[#A1A1AA] pt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>
                            Agent:{" "}
                            <strong className="text-zinc-300">
                              {item.agentName || "AI Agent"}
                            </strong>
                          </span>
                          <span>·</span>
                          <span>Mandate: {item.mandateName}</span>
                          {item.mandateRemainingNear && (
                            <>
                              <span>·</span>
                              <span>
                                Remaining: {item.mandateRemainingNear} NEAR
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end justify-between gap-2 text-xs shrink-0">
                      <div className="flex items-center gap-2 text-[#A1A1AA]">
                        <span className="font-mono text-[#E5E7EB]">
                          &gt; {yoctoToNear(item.thresholdAtomic, 3)} NEAR
                        </span>
                        <span>·</span>
                        <span>{item.createdAtLabel}</span>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 self-start sm:self-end mt-1">
                        Requires approval
                      </span>
                    </div>
                  </div>

                  {/* Policy trigger reason */}
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between text-xs text-[#A1A1AA]">
                    <div className="flex items-center gap-2 truncate">
                      <Layers className="w-3.5 h-3.5 text-[#FF3B30] shrink-0" />
                      <span className="truncate">
                        Trigger: {item.purpose || "Amount exceeds autonomous threshold"}
                      </span>
                    </div>
                    {item.taskId && (
                      <Link
                        href={`/tasks/${item.taskId}`}
                        className="text-white hover:text-[#FF3B30] font-medium shrink-0 ml-2 inline-flex items-center gap-1"
                      >
                        Inspect Task Audit
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>

                  {/* Bottom Action Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.07]">
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => handleReject(item.id)}
                      className="px-6 py-2.5 rounded-xl text-xs font-medium text-[#E5E7EB] bg-[#181316] hover:bg-[#22191D] border border-white/10 transition-colors disabled:opacity-50"
                    >
                      {isWorking ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        "Reject Payment"
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => handleOpenSignature(item)}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_24px_rgba(255,59,48,0.4)] disabled:opacity-50"
                    >
                      {isWorking ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Signing with Wallet...
                        </>
                      ) : (
                        "Authorize & Execute"
                      )}
                    </button>
                  </div>
                </GlowingCard>
              );
            })}
          </div>
        )}

        {/* Resolved Approvals History */}
        {history.length > 0 && (
          <div className="space-y-3 pt-4 max-w-3xl">
            <h2 className="text-sm font-semibold text-[#A1A1AA]">
              Recently Resolved
            </h2>
            <div className="space-y-2.5">
              {history.map((item) => (
                <GlowingCard
                  key={item.id}
                  intensity="subtle"
                  innerClassName="p-4 flex items-center justify-between text-xs"
                  glowPosition="none"
                >
                  <div className="min-w-0 pr-3">
                    <span className="font-mono text-white font-semibold">
                      {yoctoToNear(item.amountAtomic, 3)} NEAR
                    </span>{" "}
                    <span className="text-[#A1A1AA]">to</span>{" "}
                    <span className="font-mono text-[#E5E7EB]">
                      {truncateAddress(item.recipient, 8, 6)}
                    </span>{" "}
                    <span className="text-[#A1A1AA]">· {item.taskTitle}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {item.taskId && (
                      <Link
                        href={`/tasks/${item.taskId}`}
                        className="text-zinc-400 hover:text-white"
                        title="View Task Details"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    )}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                        item.status === "approved"
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : "bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30"
                      }`}
                    >
                      {item.status === "approved" ? "Approved" : "Rejected"}
                    </span>
                  </div>
                </GlowingCard>
              ))}
            </div>
          </div>
        )}
        {/* Personal Wallet Signature Request Modal */}
        <WalletSignatureModal
          isOpen={Boolean(signingItem)}
          approvalItem={signingItem}
          onClose={() => setSigningItem(null)}
          onConfirmSign={handleConfirmSignature}
        />
      </div>
    </AppShell>
  );
}
