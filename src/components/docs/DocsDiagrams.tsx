"use client";

import React from "react";
import {
  Shield,
  Bot,
  Cpu,
  Lock,
  ArrowRight,
  Database,
  CheckCircle2,
  FileCheck,
  Wallet,
  AlertTriangle,
  RotateCw,
  GitBranch,
} from "lucide-react";

/**
 * Diagram 1: Mandate Architecture
 * User -> Mandate App -> AI Agents -> Policy Engine -> Execution Boundary -> OutLayer TEE -> NEAR Network
 * Includes Database, Audit Trail, and Verification components.
 */
export function MandateArchitectureDiagram() {
  return (
    <div className="my-8 p-6 rounded-2xl bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-[#22222A] text-xs shadow-md dark:shadow-xl overflow-x-auto">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-3 mb-6">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#FF3B30]" />
          <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
            Diagram 1: End-to-End Execution Architecture
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-600 dark:text-[#A1A1AA] px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-medium">
          Intel SGX TEE · NEAR Testnet
        </span>
      </div>

      <div className="min-w-[680px] flex flex-col gap-5">
        {/* Top Tier: User to Application */}
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#161418] border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mb-1" />
            <span className="font-bold text-slate-900 dark:text-white">User / Treasury</span>
            <span className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-0.5">Authorizes Mandate &amp; Plan</span>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/50 dark:bg-[#161418] border border-red-200 dark:border-[#FF3B30]/30 flex flex-col items-center justify-center shadow-sm">
            <Bot className="w-4 h-4 text-[#FF3B30] mb-1" />
            <span className="font-bold text-slate-900 dark:text-white">AI Agent Swarm</span>
            <span className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-0.5">Proposes Tasks &amp; Actions</span>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-[#161418] border border-amber-200 dark:border-amber-500/30 flex flex-col items-center justify-center shadow-sm">
            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 mb-1" />
            <span className="font-bold text-slate-900 dark:text-white">Universal Policy Engine</span>
            <span className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-0.5">Evaluates Limits &amp; Rules</span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-[#161418] border border-emerald-200 dark:border-emerald-500/30 flex flex-col items-center justify-center shadow-sm">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1" />
            <span className="font-bold text-slate-900 dark:text-white">Execution Boundary</span>
            <span className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-0.5">Nonced Authorization Envelopes</span>
          </div>
        </div>

        {/* Direction Flow Line */}
        <div className="flex items-center justify-center gap-3 py-1 text-slate-600 dark:text-[#A1A1AA] font-mono text-[10px] font-semibold">
          <span>AI Proposes</span>
          <ArrowRight className="w-3 h-3 text-[#FF3B30]" />
          <span>Mandate Enforces</span>
          <ArrowRight className="w-3 h-3 text-[#FF3B30]" />
          <span>User Controls</span>
          <ArrowRight className="w-3 h-3 text-[#FF3B30]" />
          <span>OutLayer Executes</span>
        </div>

        {/* Bottom Tier: OutLayer TEE, NEAR Network, PostgreSQL & Audit */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-red-50/40 dark:bg-gradient-to-br dark:from-[#1C1315] dark:to-[#121114] border border-red-200 dark:border-[#FF3B30]/40 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <Cpu className="w-4 h-4 text-[#FF3B30]" />
              <span className="font-bold text-slate-900 dark:text-white">OutLayer Intel SGX TEE</span>
            </div>
            <p className="text-[10px] text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
              Protected enclaves holding agent private keys. Signs NEAR transfers only when valid execution envelope is verified.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-sky-50/40 dark:bg-[#14141A] border border-sky-200 dark:border-sky-500/30 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="font-bold text-slate-900 dark:text-white">NEAR Protocol Testnet</span>
            </div>
            <p className="text-[10px] text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
              Final settlement blockchain. Transactions broadcast and independently confirmed via RPC node state proofs.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-purple-50/40 dark:bg-[#141418] border border-purple-200 dark:border-purple-500/30 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <Database className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="font-bold text-slate-900 dark:text-white">Audit &amp; Reconciliation</span>
            </div>
            <p className="text-[10px] text-slate-600 dark:text-[#A1A1AA] leading-relaxed">
              PostgreSQL 18.6 durable checkpoints, SHA-256 hash chaining, idempotency keys, and multi-round lease recovery.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Diagram 2: Autonomous Spending Flow
 */
export function AutonomousSpendingFlowDiagram() {
  return (
    <div className="my-8 p-6 rounded-2xl bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-[#22222A] text-xs shadow-md dark:shadow-xl overflow-x-auto">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-3 mb-6">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#FF3B30]" />
          <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
            Diagram 2: Autonomous Spending Pipeline
          </span>
        </div>
        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">Strict Fail-Closed</span>
      </div>

      <div className="min-w-[700px] flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          {/* Step 1 */}
          <div className="flex-1 p-3 rounded-xl bg-slate-50 dark:bg-[#161418] border border-slate-200 dark:border-white/10 text-center shadow-sm">
            <div className="font-mono text-[10px] text-[#FF3B30] mb-0.5 font-bold">STEP 1</div>
            <div className="font-bold text-slate-900 dark:text-white">Active Mandate</div>
            <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA]">User authorizes budget &amp; limits</div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 dark:text-[#A1A1AA] shrink-0" />

          {/* Step 2 */}
          <div className="flex-1 p-3 rounded-xl bg-slate-50 dark:bg-[#161418] border border-slate-200 dark:border-white/10 text-center shadow-sm">
            <div className="font-mono text-[10px] text-[#FF3B30] mb-0.5 font-bold">STEP 2</div>
            <div className="font-bold text-slate-900 dark:text-white">Agent Proposal</div>
            <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA]">Specifies recipient, amount &amp; reason</div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 dark:text-[#A1A1AA] shrink-0" />

          {/* Step 3 */}
          <div className="flex-1 p-3 rounded-xl bg-amber-50/50 dark:bg-[#161418] border border-amber-200 dark:border-amber-500/30 text-center shadow-sm">
            <div className="font-mono text-[10px] text-amber-600 dark:text-amber-400 mb-0.5 font-bold">STEP 3</div>
            <div className="font-bold text-slate-900 dark:text-white">Policy Evaluation</div>
            <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA]">Checks budget, per-tx limit &amp; recipient</div>
          </div>
        </div>

        {/* Branch: Decision Tree */}
        <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06]">
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-center">
            <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">ALLOW / ALLOW_WITH_LIMITS</span>
            <p className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-1 font-medium">Executes autonomously without human delay</p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-center">
            <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400 font-bold">REQUIRE_APPROVAL</span>
            <p className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-1 font-medium">Pauses in escrow until human signs approval</p>
          </div>
          <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-center">
            <span className="font-mono text-[10px] text-red-700 dark:text-red-400 font-bold">DENY / ESCALATE</span>
            <p className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-1 font-medium">Operation rejected; budget untouched</p>
          </div>
        </div>

        {/* Execution & Settlement */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 p-3 rounded-xl bg-purple-50/50 dark:bg-[#161418] border border-purple-200 dark:border-purple-500/30 text-center shadow-sm">
            <div className="font-mono text-[10px] text-purple-600 dark:text-purple-400 mb-0.5 font-bold">STEP 4</div>
            <div className="font-bold text-slate-900 dark:text-white">Budget Reservation</div>
            <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA]">Funds locked to prevent race conditions</div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 dark:text-[#A1A1AA] shrink-0" />

          <div className="flex-1 p-3 rounded-xl bg-red-50/50 dark:bg-[#161418] border border-red-200 dark:border-[#FF3B30]/30 text-center shadow-sm">
            <div className="font-mono text-[10px] text-[#FF3B30] mb-0.5 font-bold">STEP 5</div>
            <div className="font-bold text-slate-900 dark:text-white">OutLayer TEE Signing</div>
            <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA]">Cryptographic envelope verified</div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 dark:text-[#A1A1AA] shrink-0" />

          <div className="flex-1 p-3 rounded-xl bg-emerald-50/50 dark:bg-[#161418] border border-emerald-200 dark:border-emerald-500/30 text-center shadow-sm">
            <div className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 mb-0.5 font-bold">STEP 6</div>
            <div className="font-bold text-slate-900 dark:text-white">NEAR RPC Settlement</div>
            <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA]">Tx verified &amp; accounting reconciled</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Diagram 3: Multi-Agent Objective Lifecycle
 */
export function MultiAgentObjectiveLifecycleDiagram() {
  return (
    <div className="my-8 p-6 rounded-2xl bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-[#22222A] text-xs shadow-md dark:shadow-xl overflow-x-auto">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-3 mb-6">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-[#FF3B30]" />
          <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
            Diagram 3: Multi-Agent DAG Objective Lifecycle
          </span>
        </div>
        <span className="text-[10px] font-mono text-purple-700 dark:text-purple-400 font-semibold">Anti-Self-Certification</span>
      </div>

      <div className="min-w-[680px] grid grid-cols-4 gap-3 text-center">
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#161418] border border-slate-200 dark:border-white/10 flex flex-col items-center shadow-sm">
          <div className="w-6 h-6 rounded-full bg-red-100 text-[#FF3B30] dark:bg-[#FF3B30]/20 flex items-center justify-center font-bold mb-2">
            1
          </div>
          <span className="font-bold text-slate-900 dark:text-white">Natural Language Goal</span>
          <span className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-1">User defines objective &amp; links active mandate</span>
        </div>

        <div className="p-3.5 rounded-xl bg-sky-50/50 dark:bg-[#161418] border border-sky-200 dark:border-sky-500/30 flex flex-col items-center shadow-sm">
          <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400 flex items-center justify-center font-bold mb-2">
            2
          </div>
          <span className="font-bold text-slate-900 dark:text-white">Structured DAG Plan</span>
          <span className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-1">Tasks, dependencies &amp; deterministic plan hash</span>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-[#161418] border border-amber-200 dark:border-amber-500/30 flex flex-col items-center shadow-sm">
          <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 flex items-center justify-center font-bold mb-2">
            3
          </div>
          <span className="font-bold text-slate-900 dark:text-white">User Plan Approval</span>
          <span className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-1">Human reviews DAG before any execution begins</span>
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-[#161418] border border-emerald-200 dark:border-emerald-500/30 flex flex-col items-center shadow-sm">
          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center justify-center font-bold mb-2">
            4
          </div>
          <span className="font-bold text-slate-900 dark:text-white">Capability Matching</span>
          <span className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-1">Agents leased via capability registry</span>
        </div>
      </div>

      <div className="min-w-[680px] grid grid-cols-3 gap-3 text-center mt-3">
        <div className="p-3.5 rounded-xl bg-purple-50/50 dark:bg-[#161418] border border-purple-200 dark:border-purple-500/30 flex flex-col items-center shadow-sm">
          <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center font-bold mb-2">
            5
          </div>
          <span className="font-bold text-slate-900 dark:text-white">Task Execution</span>
          <span className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-1">Tools &amp; integrations run within policy bounds</span>
        </div>

        <div className="p-3.5 rounded-xl bg-cyan-50/50 dark:bg-[#161418] border border-cyan-200 dark:border-cyan-500/30 flex flex-col items-center shadow-sm">
          <div className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400 flex items-center justify-center font-bold mb-2">
            6
          </div>
          <span className="font-bold text-slate-900 dark:text-white">Independent Verification</span>
          <span className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-1">Outputs verified via system fingerprint proofs</span>
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-[#161418] border border-emerald-200 dark:border-emerald-500/30 flex flex-col items-center shadow-sm">
          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center justify-center font-bold mb-2">
            7
          </div>
          <span className="font-bold text-slate-900 dark:text-white">Objective Completion</span>
          <span className="text-[10px] text-slate-600 dark:text-[#A1A1AA] mt-1">Completed only when all criteria independently pass</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Diagram 4: Financial Authority Model
 */
export function FinancialAuthorityModelDiagram() {
  return (
    <div className="my-8 p-6 rounded-2xl bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-[#22222A] text-xs shadow-md dark:shadow-xl overflow-x-auto">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-3 mb-6">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#FF3B30]" />
          <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
            Diagram 4: Immutable Financial Authority Hierarchy
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#FF3B30] font-bold">Strict Invariant</span>
      </div>

      <div className="min-w-[650px] flex flex-col gap-3">
        <div className="p-4 rounded-xl bg-red-50 dark:bg-gradient-to-r dark:from-[#201315] dark:via-[#161418] dark:to-[#121215] border border-red-200 dark:border-[#FF3B30]/40 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] font-mono text-[#FF3B30] font-bold">ROOT OF AUTHORITY</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">Human User (Treasury Owner)</div>
            <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA]">Signs Mandate, defines yoctoNEAR caps, approves plans</div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-[#FF3B30] dark:bg-[#FF3B30]/20 dark:border-[#FF3B30]/30 border border-red-200 font-bold">
            Full Control
          </span>
        </div>

        <div className="ml-6 border-l-2 border-[#FF3B30]/40 pl-6 flex flex-col gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#161418] border border-slate-200 dark:border-white/10 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-[10px] font-mono text-amber-700 dark:text-amber-400 font-semibold">POLICY LEVEL</div>
              <div className="font-bold text-slate-900 dark:text-white">Mandate Bounds &amp; Restrictions</div>
              <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA]">Total budget, per-tx limit, recipient allowlist, human thresholds</div>
            </div>
            <span className="text-[11px] font-mono text-slate-600 dark:text-[#A1A1AA] font-medium">Deterministic</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#161418] border border-slate-200 dark:border-white/10 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-[10px] font-mono text-purple-700 dark:text-purple-400 font-semibold">OBJECTIVE LEVEL</div>
              <div className="font-bold text-slate-900 dark:text-white">Objective Scope &amp; Plan Hash</div>
              <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA]">Can only spend within the mandate portion allocated to its plan</div>
            </div>
            <span className="text-[11px] font-mono text-slate-600 dark:text-[#A1A1AA] font-medium">Sub-Budget</span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-[#161418] border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold">EXECUTION BOUNDARY</div>
              <div className="font-bold text-slate-900 dark:text-white">ExecutionBoundaryService + OutLayer TEE</div>
              <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA]">Enforces nonces, rejects replays, signs in Intel SGX</div>
            </div>
            <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold">Hardware Isolated</span>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/50 dark:bg-[#131114] border border-red-200 dark:border-red-500/20 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-[10px] font-mono text-red-600 dark:text-red-400 font-semibold">PROPOSAL LEVEL ONLY</div>
              <div className="font-bold text-slate-900 dark:text-white">Autonomous Agent (AI Swarm)</div>
              <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA]">Can propose actions; zero keys, zero ability to self-authorize or raise limits</div>
            </div>
            <span className="text-[11px] font-mono text-red-600 dark:text-red-400 font-bold">Zero Key Custody</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Diagram 5: Wallet Separation
 */
export function WalletSeparationDiagram() {
  return (
    <div className="my-8 p-6 rounded-2xl bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-[#22222A] text-xs shadow-md dark:shadow-xl overflow-x-auto">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.08] pb-3 mb-6">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#FF3B30]" />
          <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
            Diagram 5: Personal Wallet vs Dedicated Agent Wallet
          </span>
        </div>
        <span className="text-[10px] font-mono text-sky-700 dark:text-sky-400 font-semibold">Isolated Custody</span>
      </div>

      <div className="min-w-[650px] grid grid-cols-2 gap-5">
        {/* Personal Wallet */}
        <div className="p-5 rounded-xl bg-sky-50/40 dark:bg-[#141418] border border-sky-200 dark:border-sky-500/30 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Wallet className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              Personal Wallet
            </span>
            <span className="text-[10px] font-mono text-sky-700 dark:text-sky-400 px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 font-semibold">
              User Owned
            </span>
          </div>
          <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA] space-y-1.5 leading-relaxed font-medium">
            <div>• Connected via @hot-labs/near-connect (HOT, Meteor, Intear, Ledger, MyNearWallet)</div>
            <div>• User holds 100% custody of the private key/seed phrase</div>
            <div>• Agents CANNOT initiate transfers from this wallet</div>
            <div>• Used solely to fund dedicated agent custody wallets and sign approvals</div>
          </div>
          <div className="p-2.5 rounded-lg bg-sky-100/60 dark:bg-sky-500/5 border border-sky-200 dark:border-sky-500/10 text-[10px] text-sky-800 dark:text-sky-300 font-mono font-semibold">
            Zero direct automated agent access
          </div>
        </div>

        {/* Dedicated Agent Wallet */}
        <div className="p-5 rounded-xl bg-red-50/40 dark:bg-gradient-to-br dark:from-[#1C1315] dark:to-[#121114] border border-red-200 dark:border-[#FF3B30]/40 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#FF3B30]" />
              Dedicated Agent Wallet
            </span>
            <span className="text-[10px] font-mono text-[#FF3B30] px-2 py-0.5 rounded bg-red-100 dark:bg-[#FF3B30]/10 border border-red-200 dark:border-[#FF3B30]/30 font-bold">
              OutLayer TEE Custody
            </span>
          </div>
          <div className="text-[10px] text-slate-600 dark:text-[#A1A1AA] space-y-1.5 leading-relaxed font-medium">
            <div>• 64-character implicit account generated inside Intel SGX hardware enclave</div>
            <div>• Private key never exposed to host OS, database, agent LLM, or network</div>
            <div>• Funded by user with precise capped working capital (e.g. 0.5 NEAR)</div>
            <div>• Only signs transactions with valid ExecutionBoundaryService authorization envelope</div>
          </div>
          <div className="p-2.5 rounded-lg bg-red-100/60 dark:bg-[#FF3B30]/10 border border-red-200 dark:border-[#FF3B30]/20 text-[10px] text-red-800 dark:text-red-300 font-mono font-semibold">
            Maximum exposure strictly capped to deposited balance
          </div>
        </div>
      </div>
    </div>
  );
}

