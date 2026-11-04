"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  Lock,
  Sparkles,
  ExternalLink,
  ArrowRight,
  Zap,
} from "lucide-react";
import { MandateMark } from "./MandateLogo";

type MotionStageId = "auto_execute" | "human_approval" | "policy_blocked";

interface MotionStage {
  id: MotionStageId;
  title: string;
  subtitle: string;
  taskTitle: string;
  mandateName: string;
  recipient: string;
  amountNear: string;
  budgetRemaining: string;
  verdictBadge: string;
  verdictType: "success" | "warning" | "error";
  txHash?: string;
  reasonCode?: string;
}

const STAGES: MotionStage[] = [
  {
    id: "auto_execute",
    title: "Autonomous Execution",
    subtitle: "Within-cap payment to allowlisted recipient settles automatically",
    taskTitle: "Research Data Access",
    mandateName: "DeFi Research",
    recipient: "researcher.near",
    amountNear: "0.040",
    budgetRemaining: "3.750",
    verdictBadge: "ALLOWED · SETTLED",
    verdictType: "success",
    txHash: "4Kj3...9f2a",
  },
  {
    id: "human_approval",
    title: "Human Approval Gate",
    subtitle: "Spend above 0.050 NEAR pauses on your phone for 1-tap approval",
    taskTitle: "DeFi Market Analysis",
    mandateName: "DeFi Research",
    recipient: "researcher.near",
    amountNear: "0.080",
    budgetRemaining: "3.670",
    verdictBadge: "APPROVAL REQUIRED",
    verdictType: "warning",
    txHash: "5Xp9...9f2a",
  },
  {
    id: "policy_blocked",
    title: "Policy Firewall Block",
    subtitle: "Unapproved recipient is intercepted before OutLayer TEE signing",
    taskTitle: "External Scraper Probe",
    mandateName: "DeFi Research",
    recipient: "unverified-actor.near",
    amountNear: "0.300",
    budgetRemaining: "3.750",
    verdictBadge: "BLOCKED BY FIREWALL",
    verdictType: "error",
    reasonCode: "RECIPIENT_NOT_ALLOWED",
  },
];

export function RealWorldCheckoutScene() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [subStep, setSubStep] = useState(0); // 0 -> 1 -> 2 -> 3 animated progression
  const [manualApproved, setManualApproved] = useState(false);

  const stage = STAGES[activeIdx];

  // Continuous smooth motion cycle
  useEffect(() => {
    const timer = setInterval(() => {
      setSubStep((prev) => {
        if (prev < 3) {
          return prev + 1;
        }
        setActiveIdx((currIdx) => (currIdx + 1) % STAGES.length);
        setManualApproved(false);
        return 0;
      });
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  const handleSelectStage = (idx: number) => {
    setActiveIdx(idx);
    setSubStep(2);
    setManualApproved(false);
  };

  const isBlocked = stage.id === "policy_blocked";
  const isApprovalStage = stage.id === "human_approval";
  const approvalSettled =
    isApprovalStage && (manualApproved || subStep === 3);

  const accentColor = isBlocked
    ? "#FF3B30"
    : isApprovalStage && !approvalSettled
    ? "#F59E0B"
    : "#10B981";

  return (
    <div className="relative select-none">
      {/* Custom 3D & Motion Keyframes */}
      <style jsx>{`
        @keyframes streamDash {
          0% {
            stroke-dashoffset: 160;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        @keyframes phoneFloat3D {
          0%,
          100% {
            transform: rotateY(-18deg) rotateX(10deg) rotateZ(2deg)
              translateY(0px);
          }
          50% {
            transform: rotateY(-15deg) rotateX(8deg) rotateZ(1.5deg)
              translateY(-10px);
          }
        }
        @keyframes nodeFloatLeft {
          0%,
          100% {
            transform: perspective(1200px) rotateY(14deg) rotateX(6deg)
              translateY(0px) translateZ(30px);
          }
          50% {
            transform: perspective(1200px) rotateY(14deg) rotateX(6deg)
              translateY(-7px) translateZ(38px);
          }
        }
        @keyframes nodeFloatRight {
          0%,
          100% {
            transform: perspective(1200px) rotateY(-14deg) rotateX(6deg)
              translateY(0px) translateZ(40px);
          }
          50% {
            transform: perspective(1200px) rotateY(-14deg) rotateX(6deg)
              translateY(-8px) translateZ(48px);
          }
        }
        .beam-flow {
          stroke-dasharray: 10 12;
          animation: streamDash 2.2s linear infinite;
        }
        .phone-3d {
          transform-style: preserve-3d;
          animation: phoneFloat3D 6s ease-in-out infinite;
        }
        .node-3d-left {
          transform-style: preserve-3d;
          animation: nodeFloatLeft 5.2s ease-in-out infinite;
        }
        .node-3d-right {
          transform-style: preserve-3d;
          animation: nodeFloatRight 5.8s ease-in-out infinite;
        }
      `}</style>

      {/* Clean Stage Indicator Badge (Self-switching interval with click-to-cycle) */}
      <div className="flex items-center justify-center mb-8">
        <button
          type="button"
          onClick={() => setActiveIdx((curr) => (curr + 1) % STAGES.length)}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-[#141419] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-[#E5E7EB] shadow-sm hover:border-[#FF3B30]/40 transition-all cursor-pointer btn-pop"
          title="Click to cycle scenario"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              stage.id === "auto_execute"
                ? "bg-emerald-500 animate-pulse"
                : stage.id === "human_approval"
                ? "bg-amber-500 animate-pulse"
                : "bg-[#FF3B30] animate-pulse"
            }`}
          />
          <span className="text-[#FF3B30] font-mono text-[11px] uppercase tracking-wider">Live Pipeline:</span>
          <span>{stage.title}</span>
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">(click to cycle)</span>
        </button>
      </div>

      {/* =====================================================================
          FREE-FLOATING 3D IMMERSIVE STAGE (NO CONTAINER CARD)
      ====================================================================== */}
      <div className="relative max-w-5xl mx-auto py-4 sm:py-8 [perspective:1800px]">
        {/* Ambient 3D Floor Glow */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full blur-[120px] opacity-20 transition-colors duration-700"
          style={{ background: accentColor }}
        />

        {/* Subtle 3D Perspective Floor Grid */}
        <div
          className="pointer-events-none absolute inset-x-8 bottom-0 h-56 opacity-[0.14]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            transform: "perspective(700px) rotateX(62deg)",
            maskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }}
        />

        {/* Curved 3D SVG Signal Trajectories Connecting Floating Nodes to the 3D Phone */}
        <svg
          className="hidden lg:block pointer-events-none absolute inset-0 w-full h-full z-10"
          viewBox="0 0 1000 600"
          fill="none"
        >
          {/* Top-Left Node (AI Agent) -> Center 3D Phone */}
          <path
            d="M 250 155 C 340 155, 370 230, 430 250"
            stroke="#24242E"
            strokeWidth="2.5"
          />
          <path
            d="M 250 155 C 340 155, 370 230, 430 250"
            stroke="#FF3B30"
            strokeWidth="3"
            className="beam-flow"
          />

          {/* Bottom-Left Node (Policy Firewall) -> Center 3D Phone */}
          <path
            d="M 250 430 C 340 430, 370 355, 430 340"
            stroke="#24242E"
            strokeWidth="2.5"
          />
          <path
            d="M 250 430 C 340 430, 370 355, 430 340"
            stroke={accentColor}
            strokeWidth="3"
            className="beam-flow"
          />

          {/* Center 3D Phone -> Top-Right Node (OutLayer TEE) */}
          <path
            d="M 570 250 C 630 230, 660 155, 750 155"
            stroke="#24242E"
            strokeWidth="2.5"
          />
          {!isBlocked && (
            <path
              d="M 570 250 C 630 230, 660 155, 750 155"
              stroke={accentColor}
              strokeWidth="3"
              className="beam-flow"
            />
          )}

          {/* Center 3D Phone -> Bottom-Right Node (NEAR Onchain Settlement) */}
          <path
            d="M 570 340 C 630 355, 660 430, 750 430"
            stroke="#24242E"
            strokeWidth="2.5"
          />
          {!isBlocked && (!isApprovalStage || approvalSettled) && (
            <path
              d="M 570 340 C 630 355, 660 430, 750 430"
              stroke="#10B981"
              strokeWidth="3"
              className="beam-flow"
            />
          )}
        </svg>

        {/* 3D SPATIAL LAYOUT: Left Orbiting Nodes + Center 3D Tilted Phone + Right Orbiting Nodes */}
        <div className="relative z-20 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* LEFT ORBITING 3D NODES (4 Columns) */}
          <div className="lg:col-span-4 flex flex-col gap-6 lg:gap-16 items-center lg:items-end">
            {/* Floating 3D Node 1: AI Agent Intent */}
            <div className="node-3d-left w-full max-w-[270px] rounded-2xl bg-white dark:bg-[#111014]/95 backdrop-blur-md text-slate-900 dark:text-white p-4 border border-slate-200 dark:border-[#FF3B30]/35 shadow-lg dark:shadow-[0_24px_50px_rgba(0,0,0,0.65)]">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#FF3B30] font-semibold">
                  <Sparkles className="w-3 h-3" />
                  AI Agent Proposal
                </span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-300">
                  No Private Keys
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {stage.taskTitle}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500 dark:text-zinc-400 truncate max-w-[130px]">
                  {stage.recipient}
                </span>
                <span className="text-slate-900 dark:text-white font-bold">
                  {stage.amountNear} NEAR
                </span>
              </div>
            </div>

            {/* Floating 3D Node 2: Deterministic Policy Firewall */}
            <div
              className="node-3d-left w-full max-w-[270px] rounded-2xl bg-white dark:bg-[#111014]/95 backdrop-blur-md p-4 border border-slate-200 dark:border-[#FF3B30]/35 shadow-lg dark:shadow-[0_24px_50px_rgba(0,0,0,0.65)]"
              style={{ animationDelay: "0.6s" }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider font-semibold text-slate-900 dark:text-white">
                  <Shield className="w-3.5 h-3.5 text-[#FF3B30]" />
                  Policy Firewall
                </span>
                <span
                  className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                    isBlocked
                      ? "bg-red-50 text-[#FF3B30] border-red-200 dark:bg-[#FF3B30]/15 dark:border-[#FF3B30]/35"
                      : isApprovalStage && !approvalSettled
                      ? "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/35"
                      : "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/35"
                  }`}
                >
                  {isBlocked
                    ? "BLOCKED"
                    : isApprovalStage && !approvalSettled
                    ? "GATE > 0.050"
                    : "9/9 PASSED"}
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                {isBlocked
                  ? "Recipient Not Allowlisted"
                  : isApprovalStage && !approvalSettled
                  ? "Paused for Human Approval"
                  : "Within 0.100 NEAR Per-Tx Cap"}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-[#A1A1AA] mt-1 font-mono">
                Mandate: {stage.mandateName}
              </div>
            </div>
          </div>

          {/* CENTERPIECE: 3D TILTED IMMERSIVE TITANIUM PHONE (4 Columns) */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center relative py-2">
            {/* 3D Floor Drop Shadow under the floating tilted phone */}
            <div
              className="pointer-events-none absolute -bottom-5 w-[220px] h-[34px] rounded-full bg-black/35 blur-xl"
              style={{
                transform: "rotateZ(4deg) scaleX(1.1)",
              }}
            />

            {/* 3D Tilted Titanium Phone Frame */}
            <div className="phone-3d relative w-[276px] sm:w-[290px]">
              {/* 3D Extruded Right Titanium Rim (Gives realistic 3D depth thickness) */}
              <div
                className="pointer-events-none absolute inset-0 rounded-[44px] bg-gradient-to-b from-zinc-600 via-zinc-800 to-zinc-950"
                style={{
                  transform: "translateX(8px) translateY(6px) translateZ(-12px)",
                  boxShadow:
                    "22px 34px 65px rgba(15, 23, 42, 0.38), 0 0 40px rgba(255, 59, 48, 0.18)",
                }}
              />

              {/* Front Titanium Bezel */}
              <div className="relative rounded-[44px] p-[9px] bg-gradient-to-b from-slate-300 via-slate-400 to-slate-500 dark:from-[#3A3A44] dark:via-[#1C1C22] dark:to-[#0B0B0E] border border-slate-300 dark:border-white/25 shadow-2xl">
                {/* Inner OLED Screen */}
                <div className="phone-screen relative rounded-[35px] bg-[#F8FAFC] dark:bg-[#0B0B0B] overflow-hidden border border-slate-300/80 dark:border-white/10 min-h-[500px] flex flex-col justify-between p-4 text-slate-900 dark:text-white shadow-inner">
                  {/* Specular Glass Glare across the 3D Screen */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-15 dark:opacity-20"
                    style={{
                      background:
                        "linear-gradient(125deg, rgba(255,255,255,0.4) 0%, transparent 42%, transparent 100%)",
                    }}
                  />

                  {/* Top Dynamic Island */}
                  <div className="relative z-10 flex items-center justify-between px-1 pt-0.5">
                    <span className="text-[10px] font-bold text-slate-900 dark:text-white/80">
                      9:41
                    </span>
                    <div className="w-20 h-4 rounded-full bg-black border border-black/10 dark:border-white/10 flex items-center justify-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isBlocked
                            ? "bg-[#FF3B30]"
                            : isApprovalStage && !approvalSettled
                            ? "bg-amber-400 animate-ping"
                            : "bg-emerald-400"
                        }`}
                      />
                      <span className="text-[8px] font-mono text-white/90">
                        MANDATE
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      5G
                    </span>
                  </div>

                  {/* App Header inside Phone */}
                  <div className="relative z-10 mt-3 flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-white/[0.08]">
                    <div className="flex items-center gap-1.5">
                      <MandateMark className="w-4 h-3.5" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white tracking-tight">
                        Mandate
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-600 dark:text-[#A1A1AA] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#151519] border border-slate-200 dark:border-white/10 font-semibold">
                      treasury.near
                    </span>
                  </div>

                  {/* Mandate Mini Budget Card inside Phone */}
                  <div className="relative z-10 mt-2.5 rounded-xl p-[1px] bg-gradient-to-r from-[#FF3B30]/70 via-[#FF3B30]/25 to-slate-200 dark:to-white/10 shadow-sm">
                    <div className="rounded-[11px] bg-white dark:bg-[#121013] p-2.5 flex items-center justify-between border border-slate-200/80 dark:border-transparent">
                      <div>
                        <span className="text-[8px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#A1A1AA] block font-semibold">
                          {stage.mandateName} · Remaining
                        </span>
                        <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                          {stage.budgetRemaining} NEAR
                        </span>
                      </div>
                      <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25 font-bold">
                        TEE Synced
                      </span>
                    </div>
                  </div>

                  {/* Active AI Task Plan Checklist inside Phone */}
                  <div className="relative z-10 mt-2.5 rounded-xl bg-white dark:bg-[#111115] border border-slate-200 dark:border-white/[0.07] p-3 space-y-2 my-auto shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-900 dark:text-white">
                        {stage.taskTitle}
                      </span>
                      <span
                        className={`text-[8px] font-mono px-1.5 py-0.5 rounded-full border font-bold ${
                          isBlocked
                            ? "bg-red-50 text-[#FF3B30] border-red-200 dark:bg-[#FF3B30]/10 dark:text-[#FF3B30] dark:border-[#FF3B30]/30"
                            : isApprovalStage && !approvalSettled
                            ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30"
                        }`}
                      >
                        {isBlocked
                          ? "Blocked"
                          : isApprovalStage && !approvalSettled
                          ? "Approval"
                          : "Completed"}
                      </span>
                    </div>

                    {/* Step rows */}
                    <div className="space-y-1.5 text-[10px]">
                      <div className="phone-step-row flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#17171D] border border-slate-200/80 dark:border-transparent">
                        {isBlocked ? (
                          <XCircle className="w-3 h-3 text-[#FF3B30] shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        )}
                        <span className="text-slate-900 dark:text-[#E5E7EB] font-semibold truncate">
                          1. Verify {stage.recipient}
                        </span>
                      </div>

                      <div className="phone-step-row flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#17171D] border border-slate-200/80 dark:border-transparent">
                        {isBlocked ? (
                          <XCircle className="w-3 h-3 text-[#FF3B30] shrink-0" />
                        ) : isApprovalStage && !approvalSettled ? (
                          <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        )}
                        <span className="text-slate-900 dark:text-[#E5E7EB] font-semibold truncate">
                          {isBlocked
                            ? "2. Blocked: Not on allowlist"
                            : isApprovalStage && !approvalSettled
                            ? "2. Above 0.050 NEAR gate"
                            : "2. Policy & budget verified"}
                        </span>
                      </div>

                      <div className="phone-step-row flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#17171D] border border-slate-200/80 dark:border-transparent">
                        {isBlocked ? (
                          <Lock className="w-3 h-3 text-slate-500 dark:text-[#A1A1AA] shrink-0" />
                        ) : isApprovalStage && !approvalSettled ? (
                          <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        )}
                        <span className="text-slate-900 dark:text-[#E5E7EB] font-semibold truncate">
                          {isBlocked
                            ? "3. Execution halted"
                            : isApprovalStage && !approvalSettled
                            ? "3. Awaiting user tap"
                            : "3. OutLayer TEE signed"}
                        </span>
                      </div>
                    </div>

                    {/* Dynamic Action / Settlement Box inside Phone */}
                    {isApprovalStage && !approvalSettled ? (
                      <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-amber-700 dark:text-amber-300 font-semibold">
                            Approve {stage.amountNear} NEAR?
                          </span>
                          <span className="font-mono text-slate-500 dark:text-[#A1A1AA]">
                            &gt; 0.050
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSelectStage(2)}
                            className="py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 dark:bg-[#1A1A22] dark:hover:bg-[#23232E] dark:text-[#E5E7EB] dark:border-transparent text-[10px] font-semibold transition-colors btn-pop"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => setManualApproved(true)}
                            className="py-1.5 rounded-lg bg-[#FF3B30] hover:bg-[#E63228] text-[10px] font-bold text-white shadow-[0_0_12px_rgba(255,59,48,0.4)] btn-pop"
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-slate-200 dark:border-white/10 space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500 dark:text-[#A1A1AA]">Amount</span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {stage.amountNear} NEAR
                          </span>
                        </div>
                        {!isBlocked ? (
                          <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-[#A1A1AA]">Tx Hash</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                              {stage.txHash}
                            </span>
                          </div>
                        ) : (
                          <div className="text-[#FF3B30] font-mono text-[9px] font-bold">
                            ✕ {stage.reasonCode}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Phone Bottom Navigation Bar */}
                  <div className="relative z-10 mt-2.5 pt-2 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-around text-[9px] text-slate-500 dark:text-[#A1A1AA] font-medium">
                    <span className="text-[#FF3B30] font-bold">
                      Mandates
                    </span>
                    <span>Tasks</span>
                    <span>Approvals</span>
                    <span>Activity</span>
                  </div>

                  {/* Home Indicator */}
                  <div className="w-24 h-1 rounded-full bg-slate-300 dark:bg-white/30 mx-auto mt-2" />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT ORBITING 3D NODES (4 Columns) */}
          <div className="lg:col-span-4 flex flex-col gap-6 lg:gap-16 items-center lg:items-start">
            {/* Floating 3D Node 3: OutLayer TEE Custody */}
            <div className="node-3d-right w-full max-w-[270px] rounded-2xl bg-white dark:bg-[#111014]/95 backdrop-blur-md p-4 border border-slate-200 dark:border-[#FF3B30]/35 shadow-lg dark:shadow-[0_24px_50px_rgba(0,0,0,0.65)]">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider font-semibold text-slate-900 dark:text-white">
                  <Cpu className="w-3.5 h-3.5 text-[#FF3B30]" />
                  OutLayer TEE
                </span>
                <span
                  className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                    isBlocked
                      ? "bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/10 dark:text-zinc-400 dark:border-white/15"
                      : isApprovalStage && !approvalSettled
                      ? "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/35"
                      : "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/35"
                  }`}
                >
                  {isBlocked
                    ? "LOCKED"
                    : isApprovalStage && !approvalSettled
                    ? "STANDBY"
                    : "ENCLAVE SIGNED"}
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                {isBlocked
                  ? "Signing Refused by Policy"
                  : isApprovalStage && !approvalSettled
                  ? "Waiting for Human Token"
                  : "Hardware Enclave Signature"}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-[#A1A1AA] mt-1 font-mono">
                Vault: outlayer-vault-8f2a.testnet
              </div>
            </div>

            {/* Floating 3D Node 4: NEAR Onchain Settlement */}
            <div
              className="node-3d-right w-full max-w-[270px] rounded-2xl bg-white dark:bg-[#111014]/95 backdrop-blur-md text-slate-900 dark:text-white p-4 border border-slate-200 dark:border-[#FF3B30]/35 shadow-lg dark:shadow-[0_24px_50px_rgba(0,0,0,0.65)]"
              style={{ animationDelay: "0.8s" }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Zap className="w-3 h-3" />
                  NEAR Settlement
                </span>
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-300">
                  Testnet
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                {isBlocked
                  ? "0.000 NEAR Transferred"
                  : isApprovalStage && !approvalSettled
                  ? "Pending User Confirmation"
                  : `Confirmed (${stage.amountNear} NEAR)`}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500 dark:text-zinc-400">
                  {isBlocked
                    ? "Funds Untouched"
                    : isApprovalStage && !approvalSettled
                    ? "Reserved in Budget"
                    : `Tx ${stage.txHash}`}
                </span>
                <Link
                  href="/tasks/task-research-data"
                  className="text-[#FF3B30] hover:underline inline-flex items-center gap-1 font-semibold"
                >
                  Inspect
                  <ExternalLink className="w-2.5 h-2.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
