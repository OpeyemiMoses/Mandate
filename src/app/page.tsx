"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Shield,
  Zap,
  Link2,
  CheckCircle2,
  Lock,
  Cpu,
  CreditCard,
  ArrowRight,
  Ban,
  Eye,
  Sliders,
} from "lucide-react";
import { MandateLogo, MandateMark } from "@/components/MandateLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  StackedVirtualCards,
  type StackedCardItem,
} from "@/components/VirtualSpendingCard";
import { RealWorldCheckoutScene } from "@/components/RealWorldCheckoutScene";
import { GlowingCard } from "@/components/GlowingCard";
import { ScrollRevealInit } from "@/components/ScrollReveal";

const STACKED_CARD_PROFILES: StackedCardItem[] = [
  {
    id: "defi",
    variant: "red",
    colorName: "Crimson",
    label: "DeFi Research Agent",
    mandateName: "DeFi Research Mandate",
    agentHolder: "research-agent.near",
    vaultAddress: "outlayer-vault-8f2a.testnet",
    cardNumberLast4: "8F2A",
    totalBudgetNear: "0.500",
    spentNear: "0.150",
    remainingNear: "0.350",
    perTxLimitNear: "0.100",
    approvalThresholdNear: "0.050",
    allowedRecipients: ["researcher.near", "oracle.testnet"],
    expiresLabel: "11/26",
  },
  {
    id: "devtools",
    variant: "gold",
    colorName: "Gold",
    label: "Dev Tools & RPC Agent",
    mandateName: "Development Tools",
    agentHolder: "devops-agent.near",
    vaultAddress: "outlayer-vault-4c9d.testnet",
    cardNumberLast4: "4C9D",
    totalBudgetNear: "1.000",
    spentNear: "0.200",
    remainingNear: "0.800",
    perTxLimitNear: "0.200",
    approvalThresholdNear: "0.100",
    allowedRecipients: ["dev.near", "rpc-node.testnet"],
    expiresLabel: "11/26",
  },
  {
    id: "compute",
    variant: "white",
    colorName: "White",
    label: "NEAR AI Compute Pool",
    mandateName: "NEAR AI Compute Pool",
    agentHolder: "compute-swarm.near",
    vaultAddress: "outlayer-vault-9a1e.testnet",
    cardNumberLast4: "9A1E",
    totalBudgetNear: "3.500",
    spentNear: "0.800",
    remainingNear: "2.700",
    perTxLimitNear: "0.500",
    approvalThresholdNear: "0.250",
    allowedRecipients: ["nearcloud.near", "researcher.near"],
    expiresLabel: "11/26",
  },
];

export default function LandingPage() {
  const [selectedCardIdx, setSelectedCardIdx] = useState(0);
  const [cardFrozen, setCardFrozen] = useState(false);

  const activeCardProfile = STACKED_CARD_PROFILES[selectedCardIdx];

  return (
    <div className="landing-page min-h-screen bg-white dark:bg-[#0B0B0B] text-slate-900 dark:text-[#E5E7EB] overflow-x-hidden">
      <ScrollRevealInit />
      {/* =====================================================================
          1. TOP HERO SECTION — EXACT MATCH TO 01. LANDING PAGE MOCKUP
      ====================================================================== */}
      <div className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute top-[6%] right-[4%] w-[540px] h-[540px] rounded-full opacity-45 blur-[130px]"
          style={{
            background:
              "radial-gradient(circle, rgba(255,59,48,0.85) 0%, rgba(180,20,15,0.35) 48%, transparent 75%)",
          }}
        />

        <svg
          className="pointer-events-none absolute inset-0 w-full h-full opacity-80"
          viewBox="0 0 1440 760"
          fill="none"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id="mandateWaveGrad"
              x1="180"
              y1="580"
              x2="1080"
              y2="260"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FF3B30" stopOpacity="0" />
              <stop offset="35%" stopColor="#FF3B30" stopOpacity="0.22" />
              <stop offset="70%" stopColor="#FF3B30" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#FF3B30" stopOpacity="0" />
            </linearGradient>
            <filter
              id="waveGlow"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feGaussianBlur stdDeviation="18" />
            </filter>
          </defs>
          <path
            d="M 80 570 C 380 590, 560 470, 770 360 C 940 270, 1100 260, 1290 330"
            stroke="url(#mandateWaveGrad)"
            strokeWidth="26"
            strokeLinecap="round"
            filter="url(#waveGlow)"
          />
          <path
            d="M 120 565 C 400 585, 570 465, 780 355 C 950 265, 1100 260, 1280 325"
            stroke="url(#mandateWaveGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>

        {/* Top Navbar Fixed */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/85 dark:bg-[#0B0B0B]/85 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.06] transition-all">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
            <Link href="/" className="hover:opacity-90 transition-opacity flex items-center">
              <MandateLogo size="sm" className="sm:hidden" />
              <MandateLogo size="md" className="hidden sm:inline-flex" />
            </Link>

            <nav className="hidden md:flex items-center gap-9 text-xs font-medium text-slate-600 dark:text-[#A1A1AA]">
              <a href="#top" className="text-slate-900 dark:text-white transition-colors">
                Home
              </a>
              <a href="#features" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                Features
              </a>
              <Link href="/docs" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                Docs
              </Link>
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center px-3.5 py-2 sm:px-4 sm:py-2 rounded-lg text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_20px_rgba(255,59,48,0.4)] btn-pop whitespace-nowrap"
              >
                Get Started
              </Link>
            </div>
          </div>
        </header>

        {/* Main Hero Content */}
        <section
          id="top"
          className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-14 sm:pb-16 md:pt-36 md:pb-20 animate-rise"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-6 space-y-5 sm:space-y-6 text-center sm:text-left">
              <h1 className="text-3xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-slate-900 dark:text-white leading-[1.14] sm:leading-[1.12] animate-rise">
                Autonomous
                <br />
                spending for a
                <br />
                <span className="text-[#FF3B30]">smarter tomorrow.</span>
              </h1>

              <p className="text-sm sm:text-base text-slate-600 dark:text-[#A1A1AA] max-w-md mx-auto sm:mx-0 leading-relaxed animate-rise stagger-1">
                Mandate gives you control. Your AI agent handles the execution — securely, onchain.
              </p>

              <div className="pt-1 flex justify-center sm:justify-start">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_6px_28px_rgba(255,59,48,0.45)] btn-pop animate-pop stagger-2"
                >
                  Get Started
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6 flex justify-center lg:justify-end overflow-hidden sm:overflow-visible py-2">
              <div
                className="relative w-[280px] sm:w-[340px] h-[310px] sm:h-[360px] flex items-center justify-center animate-pop hover-pop"
                style={{ perspective: "1100px" }}
              >
                <div
                  className="absolute inset-4 rounded-[32px] opacity-75 blur-xl pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(145deg, rgba(255,59,48,0.85) 0%, rgba(255,59,48,0.2) 55%, rgba(255,59,48,0.05) 100%)",
                    transform: "rotateY(-22deg) rotateX(10deg) rotateZ(-4deg)",
                  }}
                />

                <div
                  className="relative w-full h-full rounded-[30px] p-[2px] shadow-[0_12px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_25px_70px_rgba(0,0,0,0.85)] transition-transform duration-500 hover:scale-[1.02]"
                  style={{
                    background:
                      "linear-gradient(145deg, #FF3B30 0%, rgba(255,59,48,0.45) 45%, rgba(60,60,70,0.4) 100%)",
                    transform: "rotateY(-22deg) rotateX(10deg) rotateZ(-4deg)",
                    transformStyle: "preserve-3d",
                  }}
                >
                  <div className="w-full h-full rounded-[28px] bg-white dark:bg-gradient-to-br dark:from-[#161214] dark:via-[#0D0D10] dark:to-[#09090B] p-8 sm:p-9 flex flex-col justify-between relative overflow-hidden border border-slate-200/80 dark:border-white/5">
                    <div
                      className="absolute -top-16 -left-16 w-40 h-40 rounded-full opacity-15 dark:opacity-25 blur-2xl pointer-events-none"
                      style={{ background: "#FF3B30" }}
                    />

                    <div>
                      <MandateMark className="w-9 h-7" />
                    </div>

                    <div className="space-y-4 my-auto pt-4">
                      <div className="text-lg sm:text-xl font-medium text-slate-900 dark:text-white/95 tracking-tight">
                        Your Agent
                      </div>

                      <div className="h-[1px] w-3/4 bg-gradient-to-r from-slate-200 to-transparent dark:from-white/15 dark:to-transparent" />

                      <div className="text-lg sm:text-xl font-medium text-slate-800 dark:text-[#E5E7EB]/90 tracking-tight">
                        Your Rules
                      </div>

                      <div className="h-[1px] w-3/4 bg-gradient-to-r from-[#FF3B30]/30 to-transparent dark:from-[#FF3B30]/40 dark:to-transparent" />

                      <div className="text-lg sm:text-xl font-semibold text-slate-950 dark:text-white tracking-tight">
                        Onchain Execution.
                      </div>
                    </div>

                    <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-[#FF3B30]/30 to-transparent" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3 Feature Cards Directly Under Hero */}
          <div
            id="features"
            className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-16 pt-2"
          >
            <GlowingCard intensity="medium" glowPosition="top-right" className="hover-pop cursor-pointer stagger-1">
              <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
                <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-[#181316] border border-red-200 dark:border-[#FF3B30]/35 flex items-center justify-center mb-4">
                  <Shield className="w-4 h-4 text-[#FF3B30]" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Set Spending Rules
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mt-1">
                  Define limits and recipients
                </p>
              </div>
            </GlowingCard>

            <GlowingCard intensity="medium" glowPosition="top-right" className="hover-pop cursor-pointer stagger-2">
              <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
                <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-[#181316] border border-red-200 dark:border-[#FF3B30]/35 flex items-center justify-center mb-4">
                  <Zap className="w-4 h-4 text-[#FF3B30]" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  AI-Powered Execution
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mt-1">
                  Turn goals into actions
                </p>
              </div>
            </GlowingCard>

            <GlowingCard intensity="medium" glowPosition="top-right" className="hover-pop cursor-pointer stagger-3">
              <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
                <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-[#181316] border border-red-200 dark:border-[#FF3B30]/35 flex items-center justify-center mb-4">
                  <Link2 className="w-4 h-4 text-[#FF3B30]" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Onchain Settlement
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] mt-1">
                  Real transactions, real control
                </p>
              </div>
            </GlowingCard>
          </div>
        </section>
      </div>

      {/* =====================================================================
          2. CAPPED SPENDING VIRTUAL CREDIT CARD STACK (RED, GOLD, WHITE)
      ====================================================================== */}
      <section className="relative border-t border-slate-200 dark:border-[#1A1A20] py-24 overflow-hidden bg-slate-50/50 dark:bg-transparent">
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[360px] rounded-full opacity-15 blur-[130px]"
          style={{ background: "#FF3B30" }}
        />

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 dark:bg-[#171214] border border-red-200 dark:border-[#FF3B30]/35 text-[11px] font-mono uppercase tracking-wider text-[#FF3B30] animate-rise">
                <CreditCard className="w-3.5 h-3.5" />
                Capped Virtual Spending Cards for Agents
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight animate-rise stagger-1">
                Give your agent a{" "}
                <span className="text-[#FF3B30]">capped spending card</span>,
                never your master seed phrase.
              </h2>

              <p className="text-sm text-slate-600 dark:text-[#A1A1AA] leading-relaxed animate-rise stagger-2">
                Issue isolated virtual spending cards backed by OutLayer TEE
                custody on NEAR. Each card enforces a deterministic{" "}
                <code className="text-slate-800 dark:text-[#E5E7EB] font-mono text-xs">
                  yoctoNEAR
                </code>{" "}
                budget, per-transaction limit, human approval threshold, and
                recipient allowlist.
              </p>

              <div className="flex items-center gap-2 pt-1 text-xs font-mono text-slate-500 dark:text-[#A1A1AA] animate-rise stagger-3">
                <span className="w-2 h-2 rounded-full bg-[#FF3B30] animate-pulse" />
                <span>Active Card: <strong className="text-slate-900 dark:text-white">{activeCardProfile.label}</strong></span>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href="/mandates/new"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E63228] transition-all shadow-[0_0_24px_rgba(255,59,48,0.35)] btn-pop animate-pop stagger-3"
                >
                  Issue New Mandate Card
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <button
                  type="button"
                  onClick={() => setCardFrozen((v) => !v)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium text-slate-700 dark:text-[#E5E7EB] bg-white dark:bg-[#141215] hover:bg-slate-50 dark:hover:bg-[#1C181C] border border-slate-200 dark:border-[#FF3B30]/30 shadow-sm transition-colors btn-pop animate-pop stagger-4"
                >
                  <Ban className="w-3.5 h-3.5 text-[#FF3B30]" />
                  {cardFrozen
                    ? "Unfreeze Virtual Card"
                    : "Simulate Instant Kill-Switch"}
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <StackedVirtualCards
                cards={STACKED_CARD_PROFILES}
                activeIndex={selectedCardIdx}
                onSelectIndex={(idx) => {
                  setSelectedCardIdx(idx);
                  setCardFrozen(false);
                }}
                frozen={cardFrozen}
              />

              <div className="grid grid-cols-3 gap-3 mt-5 max-w-[430px] mx-auto">
                <GlowingCard
                  intensity="subtle"
                  innerClassName="p-3 text-center"
                  glowPosition="none"
                >
                  <div className="text-[10px] font-mono uppercase text-slate-500 dark:text-[#A1A1AA]">
                    Hard Cap
                  </div>
                  <div className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                    {activeCardProfile.totalBudgetNear} NEAR
                  </div>
                </GlowingCard>

                <GlowingCard
                  intensity="subtle"
                  innerClassName="p-3 text-center"
                  glowPosition="none"
                >
                  <div className="text-[10px] font-mono uppercase text-slate-500 dark:text-[#A1A1AA]">
                    Max Per Tx
                  </div>
                  <div className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                    {activeCardProfile.perTxLimitNear} NEAR
                  </div>
                </GlowingCard>

                <GlowingCard
                  intensity="subtle"
                  innerClassName="p-3 text-center"
                  glowPosition="none"
                >
                  <div className="text-[10px] font-mono uppercase text-slate-500 dark:text-[#A1A1AA]">
                    Human Gate
                  </div>
                  <div className="text-xs sm:text-sm font-bold font-mono text-[#FF3B30] mt-0.5">
                    &gt; {activeCardProfile.approvalThresholdNear} NEAR
                  </div>
                </GlowingCard>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          3. MANDATE IN MOTION: 3D IMMERSIVE PHONE APP SCENE
      ====================================================================== */}
      <section id="interactive-phone" className="border-t border-slate-200 dark:border-[#1A1A20] py-24 relative overflow-hidden bg-slate-100/60 dark:bg-[#09090B]">
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="max-w-2xl mx-auto text-center space-y-2.5 mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight animate-rise">
              Watch Mandate enforce your rules in real time
            </h2>
            <p className="text-sm text-slate-600 dark:text-[#A1A1AA] leading-relaxed animate-rise stagger-1">
              Follow the live signal pipeline from your{" "}
              <strong className="text-slate-900 dark:text-white font-semibold">AI Agent</strong>{" "}
              through the{" "}
              <strong className="text-slate-900 dark:text-white font-semibold">
                Policy Firewall
              </strong>{" "}
              and{" "}
              <strong className="text-slate-900 dark:text-white font-semibold">
                OutLayer TEE
              </strong>{" "}
              as the{" "}
              <strong className="text-slate-900 dark:text-white font-semibold">
                Mandate App
              </strong>{" "}
              executes, gates, or blocks transactions on NEAR.
            </p>
          </div>

          <RealWorldCheckoutScene />
        </div>
      </section>

      {/* =====================================================================
          4. EVERYTHING MANDATE DOES — COMPLETE ARCHITECTURE & CAPABILITIES
      ====================================================================== */}
      <section
        id="docs"
        className="border-t border-slate-200 dark:border-[#1A1A20] py-24 bg-white dark:bg-[#0B0B0B]"
      >
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div className="max-w-2xl space-y-2.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#FF3B30] font-semibold animate-rise">
                Complete Product Architecture
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight animate-rise stagger-1">
                Everything Mandate does under the hood
              </h2>
              <p className="text-sm text-slate-600 dark:text-[#A1A1AA] leading-relaxed animate-rise stagger-2">
                From natural-language task planning to deterministic{" "}
                <code className="text-slate-800 dark:text-[#E5E7EB] font-mono text-xs">
                  yoctoNEAR
                </code>{" "}
                policy checks, human approval queues, and OutLayer TEE signing
                on NEAR.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-800 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-[#171214] dark:hover:bg-[#21171A] border border-slate-200 dark:border-[#FF3B30]/40 shadow-sm transition-colors shrink-0 self-start md:self-auto btn-pop animate-pop stagger-2"
            >
              Explore Live Dashboard
              <ArrowRight className="w-3.5 h-3.5 text-[#FF3B30]" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <GlowingCard intensity="medium" glowPosition="top-right" className="stagger-1">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-[#191215] border border-red-200 dark:border-[#FF3B30]/40 flex items-center justify-center">
                    <Sliders className="w-4 h-4 text-[#FF3B30]" />
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/15 dark:border-[#FF3B30]/30 font-semibold">
                    01 · AUTHORITY
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Explicit Spending Mandates
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                  Users define a mandate with a total NEAR budget, per-payment
                  hard cap, approval threshold, expiration timestamp, and
                  allowlisted NEAR recipients.
                </p>
              </div>
            </GlowingCard>

            <GlowingCard intensity="medium" glowPosition="top-right" className="stagger-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-[#191215] border border-red-200 dark:border-[#FF3B30]/40 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-[#FF3B30]" />
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/15 dark:border-[#FF3B30]/30 font-semibold">
                    02 · AI PLANNER
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Keyless AI Task Planning
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                  The AI planner converts plain-language goals into structured
                  JSON payment proposals validated by strict Zod schemas. The AI
                  never receives signing keys.
                </p>
              </div>
            </GlowingCard>

            <GlowingCard intensity="medium" glowPosition="top-right" className="stagger-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-[#191215] border border-red-200 dark:border-[#FF3B30]/40 flex items-center justify-center">
                    <Cpu className="w-4 h-4 text-[#FF3B30]" />
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/15 dark:border-[#FF3B30]/30 font-semibold">
                    03 · FIREWALL
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Deterministic yoctoNEAR Engine
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                  Every proposal is checked against 9 deterministic rules in
                  atomic integer yoctoNEAR (10^24) — preventing floating-point
                  drift and prompt-injected drains.
                </p>
              </div>
            </GlowingCard>

            <GlowingCard intensity="medium" glowPosition="top-right" className="stagger-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-[#191215] border border-red-200 dark:border-[#FF3B30]/40 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-[#FF3B30]" />
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/15 dark:border-[#FF3B30]/30 font-semibold">
                    04 · HUMAN GATE
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Bounded Approval Queue
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                  Proposals above the autonomous threshold pause in the
                  Approvals queue for human review. Human approval never
                  overrides hard per-tx or budget limits.
                </p>
              </div>
            </GlowingCard>

            <GlowingCard intensity="medium" glowPosition="top-right" className="stagger-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-[#191215] border border-red-200 dark:border-[#FF3B30]/40 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-[#FF3B30]" />
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/15 dark:border-[#FF3B30]/30 font-semibold">
                    05 · TEE CUSTODY
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  OutLayer TEE &amp; NEAR Settlement
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                  Provider-side policy verification and hardware-isolated TEE
                  custody sign permitted native NEAR transfers and return
                  verifiable explorer transaction hashes.
                </p>
              </div>
            </GlowingCard>

            <GlowingCard intensity="medium" glowPosition="top-right" className="stagger-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-[#191215] border border-red-200 dark:border-[#FF3B30]/40 flex items-center justify-center">
                    <Eye className="w-4 h-4 text-[#FF3B30]" />
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-red-50 text-[#FF3B30] border border-red-200 dark:bg-[#FF3B30]/15 dark:border-[#FF3B30]/30 font-semibold">
                    06 · AUDIT &amp; REVOKE
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Traceable Audit &amp; Revocation
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
                  Every proposal, policy verdict, approval, and settlement hash
                  is logged. Revoking a mandate halts new tasks and cancels
                  queued approvals immediately.
                </p>
              </div>
            </GlowingCard>
          </div>
        </div>
      </section>

      {/* =====================================================================
          5. FINAL CTA & FOOTER
      ====================================================================== */}
      <footer className="border-t border-slate-200 dark:border-[#1A1A20] py-14 bg-slate-50 dark:bg-[#09090B]">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-600 dark:text-[#A1A1AA]">
          <MandateLogo
            size="sm"
            subtitle="Your rules. Our execution. Autonomous spending firewall on NEAR."
          />
          <div className="flex flex-wrap items-center gap-6">
            <Link
              href="/dashboard"
              className="text-slate-900 hover:text-[#FF3B30] dark:text-white dark:hover:text-[#FF3B30] font-semibold transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/docs"
              className="text-slate-900 hover:text-[#FF3B30] dark:text-white dark:hover:text-[#FF3B30] font-semibold transition-colors"
            >
              Docs
            </Link>
            <Link
              href="/mandates"
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Mandates
            </Link>
            <Link href="/tasks" className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Tasks
            </Link>
            <Link
              href="/approvals"
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Approvals
            </Link>
            <Link
              href="/activity"
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Activity
            </Link>
            <Link
              href="/settings"
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Settings
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
