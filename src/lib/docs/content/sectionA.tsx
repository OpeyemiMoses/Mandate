import React from "react";
import Link from "next/link";
import { DocsCallout } from "@/components/docs/DocsCallout";
import { CodeBlock } from "@/components/docs/CodeBlock";
import {
  MandateArchitectureDiagram,
  WalletSeparationDiagram,
} from "@/components/docs/DocsDiagrams";
import { Shield, CheckCircle2, ArrowRight, Wallet, Bot, Cpu, Lock } from "lucide-react";

export interface DocPageContent {
  slug: string;
  headings: { id: string; text: string; level: number }[];
  content: React.ReactNode;
}

export const SECTION_A_PAGES: Record<string, DocPageContent> = {
  introduction: {
    slug: "introduction",
    headings: [
      { id: "what-is-mandate", text: "What is Mandate?", level: 2 },
      { id: "the-problem", text: "The Problem Mandate Solves", level: 2 },
      { id: "core-principle", text: "Core Architectural Principle", level: 2 },
      { id: "four-responsibilities", text: "The Four Central Responsibilities", level: 3 },
      { id: "how-mandate-differs", text: "How Mandate Differs from Other Systems", level: 2 },
      { id: "architecture-overview", text: "Architecture Overview", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="what-is-mandate">
          <h2 className="text-xl font-bold text-white mb-3">What is Mandate?</h2>
          <p>
            <strong>Mandate</strong> is an autonomous spending firewall and policy-enforced custody layer for artificial intelligence agents on the <strong>NEAR Protocol</strong>. It empowers users and treasury operators to delegate real tasks and budgets to autonomous multi-agent swarms without ever handing over master private keys or granting unconstrained financial authority.
          </p>
          <p className="mt-3">
            In traditional automation, granting an agent an API key or a wallet seed phrase gives it complete, binary access to all stored assets. Mandate replaces this dangerous model with <em>deterministic financial policy enforcement</em> executed within hardware-isolated Trusted Execution Environments (Intel SGX TEE) powered by <strong>OutLayer</strong>.
          </p>
        </section>

        <section id="the-problem">
          <h2 className="text-xl font-bold text-white mb-3">The Problem Mandate Solves</h2>
          <p>
            Large Language Models (LLMs) and autonomous agents are probabilistic reasoning engines. While they excel at planning, researching, writing code, and orchestrating workflows, their probabilistic nature makes them fundamentally unreliable for financial custody:
          </p>
          <ul className="list-disc pl-5 mt-3 space-y-2 text-[#D4D4D8]">
            <li><strong>Hallucinations &amp; Parameter Errors:</strong> An agent could mistakenly submit 100 NEAR instead of 1 NEAR, or send funds to an unintended address.</li>
            <li><strong>Prompt Injection Attacks:</strong> Malicious third-party data or compromised tool responses can instruct an agent to drain its connected wallet.</li>
            <li><strong>Recursive Tool Loops:</strong> Unchecked agent loops can rapidly deplete working balances in minutes through runaway API calls or repeated transactions.</li>
            <li><strong>All-or-Nothing Custody:</strong> Developers previously had to choose between requiring human approval for every trivial micro-payment or granting full, unrestricted wallet access.</li>
          </ul>

          <DocsCallout type="important" title="The Non-Negotiable Invariant">
            An autonomous agent must never gain more authority than the user explicitly granted it. AI proposes operations. Deterministic policy enforces rules. The user controls the purse. Hardware enclaves execute the transfers.
          </DocsCallout>
        </section>

        <section id="core-principle">
          <h2 className="text-xl font-bold text-white mb-3">Core Architectural Principle</h2>
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#1E1114] via-[#141418] to-[#121215] border border-[#FF3B30]/30 font-mono text-center text-sm sm:text-base text-white">
            <span className="text-[#FF3B30] font-bold">AI proposes.</span>{" "}
            <span className="text-white font-bold">Mandate enforces.</span>{" "}
            <span className="text-emerald-400 font-bold">The user controls.</span>{" "}
            <span className="text-purple-400 font-bold">OutLayer executes.</span>
          </div>

          <div id="four-responsibilities" className="mt-6 space-y-3">
            <h3 className="text-base font-semibold text-white">The Four Central Responsibilities</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
                <div className="flex items-center gap-2 font-semibold text-white mb-1">
                  <Bot className="w-4 h-4 text-[#FF3B30]" />
                  1. AI Agents (Swarm)
                </div>
                <p className="text-xs text-[#A1A1AA]">
                  Decompose high-level natural language goals into directed acyclic graphs (DAGs), execute research tools, and propose financial operations with explicit parameters.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
                <div className="flex items-center gap-2 font-semibold text-white mb-1">
                  <Lock className="w-4 h-4 text-amber-400" />
                  2. Mandate Policy Engine
                </div>
                <p className="text-xs text-[#A1A1AA]">
                  Evaluates every proposal against deterministic constraints: maximum budget, per-tx limit, human approval thresholds, expiration dates, and recipient allowlists.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
                <div className="flex items-center gap-2 font-semibold text-white mb-1">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  3. The User
                </div>
                <p className="text-xs text-[#A1A1AA]">
                  Defines financial bounds, approves execution plans, funds dedicated custody accounts, reviews high-value requests, and retains emergency revocation power.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
                <div className="flex items-center gap-2 font-semibold text-white mb-1">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  4. OutLayer Intel SGX TEE
                </div>
                <p className="text-xs text-[#A1A1AA]">
                  Holds agent signing keys in hardware-isolated enclaves. Signs NEAR transactions only after receiving cryptographically nonced authorization envelopes from Mandate.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="how-mandate-differs">
          <h2 className="text-xl font-bold text-white mb-3">How Mandate Differs from Other Systems</h2>
          <div className="overflow-x-auto my-4">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[#A1A1AA]">
                  <th className="py-2.5 pr-4 font-semibold">Capability</th>
                  <th className="py-2.5 pr-4 font-semibold">Ordinary AI Assistants</th>
                  <th className="py-2.5 pr-4 font-semibold">Traditional Automation</th>
                  <th className="py-2.5 font-semibold text-white">Mandate Platform</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="py-3 pr-4 font-medium text-white">Financial Authority</td>
                  <td className="py-3 pr-4 text-[#A1A1AA]">None (Advisory only)</td>
                  <td className="py-3 pr-4 text-red-400">All-or-Nothing API keys</td>
                  <td className="py-3 text-emerald-400 font-semibold">Fine-grained Mandate Policy</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-white">Key Custody</td>
                  <td className="py-3 pr-4 text-[#A1A1AA]">N/A</td>
                  <td className="py-3 pr-4 text-red-400">Environment variables on host</td>
                  <td className="py-3 text-emerald-400 font-semibold">OutLayer Intel SGX TEE</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-white">Human-in-the-Loop</td>
                  <td className="py-3 pr-4 text-[#A1A1AA]">Manual copy-paste</td>
                  <td className="py-3 pr-4 text-[#A1A1AA]">Rarely supported</td>
                  <td className="py-3 text-emerald-400 font-semibold">Automatic Threshold Escrow</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-white">Onchain Settlement</td>
                  <td className="py-3 pr-4 text-[#A1A1AA]">None</td>
                  <td className="py-3 pr-4 text-[#A1A1AA]">Centralized payment rails</td>
                  <td className="py-3 text-emerald-400 font-semibold">Native NEAR Protocol</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-white">Execution Evidence</td>
                  <td className="py-3 pr-4 text-[#A1A1AA]">Chat text</td>
                  <td className="py-3 pr-4 text-[#A1A1AA]">Log files</td>
                  <td className="py-3 text-emerald-400 font-semibold">SHA-256 Hash Chained Audit</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="architecture-overview">
          <h2 className="text-xl font-bold text-white mb-3">Architecture Overview</h2>
          <p>
            The diagram below visualizes how requests travel from user authorization to autonomous agent proposing, through the Universal Policy Engine and Execution Boundary, to OutLayer TEE and the NEAR Testnet blockchain:
          </p>
          <MandateArchitectureDiagram />
        </section>
      </div>
    ),
  },

  quickstart: {
    slug: "quickstart",
    headings: [
      { id: "prerequisites", text: "Prerequisites", level: 2 },
      { id: "step-1-wallet", text: "Step 1: Connect Your NEAR Wallet", level: 2 },
      { id: "step-2-agent", text: "Step 2: Create Your First Agent", level: 2 },
      { id: "step-3-mandate", text: "Step 3: Issue a Capped Mandate", level: 2 },
      { id: "step-4-funding", text: "Step 4: Fund the Agent Custody Account", level: 2 },
      { id: "step-5-objective", text: "Step 5: Create and Authorize an Objective", level: 2 },
      { id: "step-6-monitoring", text: "Step 6: Monitor Autonomous Fulfillment", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <p>
          This guide walks you through creating your first agent, setting a spending mandate, funding the dedicated custody wallet, and executing a real autonomous objective on NEAR Testnet in under 5 minutes.
        </p>

        <section id="prerequisites">
          <h2 className="text-xl font-bold text-white mb-3">Prerequisites</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block mb-1">1. Supported NEAR Wallet</span>
              <p className="text-[#A1A1AA]">
                A browser wallet compatible with <code>@hot-labs/near-connect</code> (HOT Wallet, Meteor, Intear, MyNearWallet, or Ledger).
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block mb-1">2. NEAR Testnet Balance</span>
              <p className="text-[#A1A1AA]">
                At least <strong>1.0 NEAR</strong> on NEAR Testnet for funding your agent custody wallet and paying network transaction fees.
              </p>
            </div>
          </div>
        </section>

        <section id="step-1-wallet">
          <h2 className="text-xl font-bold text-white mb-3">Step 1: Connect Your NEAR Wallet</h2>
          <p>
            Navigate to the <Link href="/dashboard" className="text-[#FF3B30] underline">Mandate Dashboard</Link> or click the <strong>Connect NEAR Wallet</strong> button in the top navigation header.
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-[#D4D4D8]">
            <li>Select your preferred wallet provider from the official Near Connect modal.</li>
            <li>Approve the connection request. Mandate will establish your session identity based on your NEAR address.</li>
            <li>Your personal account address will appear in the top-right pill (e.g. <code>alice.testnet</code>).</li>
          </ul>

          <DocsCallout type="note" title="Personal vs Agent Wallet">
            Connecting your personal wallet does NOT grant agents access to your balance. Your personal wallet is only used to fund the agent&apos;s separate custody account and sign manual approvals.
          </DocsCallout>
        </section>

        <section id="step-2-agent">
          <h2 className="text-xl font-bold text-white mb-3">Step 2: Create Your First Agent</h2>
          <p>
            Go to <Link href="/agents" className="text-[#FF3B30] underline">Agents</Link> and click <strong>Create Agent</strong>:
          </p>
          <div className="p-4 rounded-xl bg-[#141418] border border-white/5 text-xs space-y-2 mt-2">
            <div><strong>Agent Name:</strong> <code>research-scout</code></div>
            <div><strong>Role:</strong> DeFi Intelligence &amp; Protocol Verification</div>
            <div><strong>Capabilities:</strong> Select <code>web_search</code>, <code>api_query</code>, and <code>near_transfer</code>.</div>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-2">
            Mandate provisions an isolated agent profile and generates a dedicated 64-character implicit NEAR custody address managed by OutLayer TEE.
          </p>
        </section>

        <section id="step-3-mandate">
          <h2 className="text-xl font-bold text-white mb-3">Step 3: Issue a Capped Mandate</h2>
          <p>
            Click <Link href="/mandates/new" className="text-[#FF3B30] underline">Create Mandate</Link> in the dashboard to set the agent&apos;s financial boundaries:
          </p>
          <div className="overflow-x-auto my-3">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[#A1A1AA]">
                  <th className="py-2 pr-4 font-semibold">Parameter</th>
                  <th className="py-2 pr-4 font-semibold">Example Value</th>
                  <th className="py-2 font-semibold">Enforcement Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="py-2 pr-4 font-mono text-white">total_budget</td>
                  <td className="py-2 pr-4 text-emerald-400 font-mono">0.5 NEAR</td>
                  <td className="py-2 text-[#A1A1AA]">Hard lifetime ceiling for this mandate</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-white">per_tx_limit</td>
                  <td className="py-2 pr-4 text-emerald-400 font-mono">0.1 NEAR</td>
                  <td className="py-2 text-[#A1A1AA]">Maximum amount in a single operation</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-white">approval_threshold</td>
                  <td className="py-2 pr-4 text-amber-400 font-mono">0.05 NEAR</td>
                  <td className="py-2 text-[#A1A1AA]">Requires human signature if tx exceeds this</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-white">allowed_recipients</td>
                  <td className="py-2 pr-4 font-mono text-[#D4D4D8]">researcher.testnet</td>
                  <td className="py-2 text-[#A1A1AA]">Strict allowlist; transfers elsewhere are DENIED</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="step-4-funding">
          <h2 className="text-xl font-bold text-white mb-3">Step 4: Fund the Agent Custody Account</h2>
          <p>
            Click <strong>Fund Agent</strong> on the dashboard. Deposit <strong>0.5 NEAR</strong> from your connected wallet into the agent&apos;s OutLayer TEE account.
          </p>
          <DocsCallout type="tip" title="Custodial Isolation">
            Even if you deposit 10 NEAR into the agent&apos;s wallet, if its mandate budget is set to 0.5 NEAR, the policy engine will mathematically refuse to authorize more than 0.5 NEAR.
          </DocsCallout>
        </section>

        <section id="step-5-objective">
          <h2 className="text-xl font-bold text-white mb-3">Step 5: Create and Authorize an Objective</h2>
          <p>
            Go to <Link href="/objectives" className="text-[#FF3B30] underline">Objectives</Link> and enter your goal in natural language:
          </p>
          <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5 font-mono text-xs text-[#E5E7EB]">
            &ldquo;Query validator performance data, compile report, and transfer 0.05 NEAR compensation to researcher.testnet upon successful verification.&rdquo;
          </div>
          <p className="mt-3 text-xs text-[#A1A1AA]">
            Mandate synthesizes a structured DAG plan with deterministic SHA-256 plan hash. Review the proposed tasks and click <strong>Authorize Objective</strong>.
          </p>
        </section>

        <section id="step-6-monitoring">
          <h2 className="text-xl font-bold text-white mb-3">Step 6: Monitor Autonomous Fulfillment</h2>
          <p>
            Once authorized, background workers dispatch the DAG tasks to eligible agents. The agent executes research, submits independent verification evidence, and the ExecutionBoundaryService signs the 0.05 NEAR transfer inside OutLayer TEE.
          </p>
          <p className="mt-2 text-xs text-[#A1A1AA]">
            You can monitor real-time execution in the <Link href="/activity" className="text-[#FF3B30] underline">Activity</Link> log and review the finalized NEAR transaction hash directly on NEAR Explorer.
          </p>
        </section>
      </div>
    ),
  },

  "getting-started/account-wallet": {
    slug: "getting-started/account-wallet",
    headings: [
      { id: "supported-wallets", text: "Supported Wallet Providers", level: 2 },
      { id: "personal-vs-agent", text: "Personal Wallet vs Dedicated Agent Wallet", level: 2 },
      { id: "wallet-connection-flow", text: "Wallet Connection & Session Authentication", level: 2 },
      { id: "funding-and-withdrawals", text: "Funding & Withdrawing Assets", level: 2 },
      { id: "wallet-security", text: "Security Guarantees & Private Key Handling", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <p>
          Mandate uses a dual-wallet architecture that cleanly separates the user&apos;s personal signing wallet from the agent&apos;s dedicated OutLayer TEE custody wallet.
        </p>

        <section id="supported-wallets">
          <h2 className="text-xl font-bold text-white mb-3">Supported Wallet Providers</h2>
          <p>
            Browser connections are powered by the official <code>@hot-labs/near-connect</code> SDK. The following wallets are natively supported on NEAR Testnet:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-3 text-xs">
            <div className="p-3 rounded-xl bg-[#141418] border border-white/5 font-semibold text-white">HOT Wallet</div>
            <div className="p-3 rounded-xl bg-[#141418] border border-white/5 font-semibold text-white">Meteor Wallet</div>
            <div className="p-3 rounded-xl bg-[#141418] border border-white/5 font-semibold text-white">Intear Wallet</div>
            <div className="p-3 rounded-xl bg-[#141418] border border-white/5 font-semibold text-white">Ledger (Hardware)</div>
            <div className="p-3 rounded-xl bg-[#141418] border border-white/5 font-semibold text-white">Nightly Wallet</div>
            <div className="p-3 rounded-xl bg-[#141418] border border-white/5 font-semibold text-white">MyNearWallet</div>
          </div>
        </section>

        <section id="personal-vs-agent">
          <h2 className="text-xl font-bold text-white mb-3">Personal Wallet vs Dedicated Agent Wallet</h2>
          <WalletSeparationDiagram />
        </section>

        <section id="funding-and-withdrawals">
          <h2 className="text-xl font-bold text-white mb-3">Funding &amp; Withdrawing Assets</h2>
          <p>
            Users can fund their agent custody wallets using the <strong>Fund Agent</strong> modal on the dashboard or directly via NEAR native transfer to the agent&apos;s 64-character implicit account.
          </p>
          <p className="mt-2 text-xs text-[#A1A1AA]">
            To withdraw surplus funds, the user clicks <strong>Withdraw</strong>. The system generates an OutLayer TEE transfer envelope returning the requested amount directly to the user&apos;s authenticated personal wallet.
          </p>
        </section>

        <section id="wallet-security">
          <h2 className="text-xl font-bold text-white mb-3">Security Guarantees &amp; Private Key Handling</h2>
          <DocsCallout type="warning" title="Never Share Private Keys">
            Mandate will NEVER ask you for your wallet seed phrase, private key, or password. All agent custody keys are generated directly inside Intel SGX hardware enclaves and are inaccessible to anyone—including Mandate engineers and the AI models themselves.
          </DocsCallout>
        </section>
      </div>
    ),
  },

  "getting-started/dashboard": {
    slug: "getting-started/dashboard",
    headings: [
      { id: "dashboard-sections", text: "Customer Dashboard Sections", level: 2 },
      { id: "treasury-metrics", text: "Treasury Metrics & Agent Custody Pill", level: 2 },
      { id: "navigation-architecture", text: "Platform Navigation", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <p>
          The Mandate customer dashboard is your mission control center for monitoring treasury exposure, active mandates, agent swarms, and pending approvals.
        </p>

        <section id="dashboard-sections">
          <h2 className="text-xl font-bold text-white mb-3">Customer Dashboard Sections</h2>
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 text-xs">
              <span className="font-semibold text-white block mb-1">1. Top Quick Action Bar</span>
              <p className="text-[#A1A1AA]">
                Displays your live agent aggregate balance in NEAR, with 1-click modal triggers for <strong>Fund Agent</strong>, <strong>Withdraw</strong>, and <strong>Create Mandate</strong>.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 text-xs">
              <span className="font-semibold text-white block mb-1">2. Treasury &amp; Spending Analytics</span>
              <p className="text-[#A1A1AA]">
                Visualizes total authorized budget vs settled expenditure vs active reservations in real-time atomic yoctoNEAR precision.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 text-xs">
              <span className="font-semibold text-white block mb-1">3. Active Agent Swarm Grid</span>
              <p className="text-[#A1A1AA]">
                Lists all registered agents, their current capability tier, leased tasks, health status, and linked mandate bounds.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 text-xs">
              <span className="font-semibold text-white block mb-1">4. Human Approval Escalations</span>
              <p className="text-[#A1A1AA]">
                Highlights any transactions exceeding the mandate approval threshold, allowing 1-click cryptographic authorization or denial.
              </p>
            </div>
          </div>
        </section>

        <section id="navigation-architecture">
          <h2 className="text-xl font-bold text-white mb-3">Platform Navigation</h2>
          <p className="text-xs text-[#A1A1AA]">
            Use the left sidebar on desktop or the mobile navigation drawer to access:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-[#D4D4D8]">
            <li><strong>/dashboard:</strong> Treasury overview and quick controls.</li>
            <li><strong>/mandates:</strong> Create, inspect, edit limits, pause, or revoke spending authority.</li>
            <li><strong>/agents:</strong> Provision new agents and configure capability permissions.</li>
            <li><strong>/objectives:</strong> Submit natural language goals and approve execution DAGs.</li>
            <li><strong>/tasks:</strong> Inspect individual task execution, agent leases, and verification logs.</li>
            <li><strong>/approvals:</strong> Review and sign transactions requiring human intervention.</li>
            <li><strong>/wallets:</strong> View personal and dedicated agent custody account balances.</li>
            <li><strong>/activity:</strong> Complete chronological append-only audit trail of all proposals and settlements.</li>
          </ul>
        </section>
      </div>
    ),
  },
};

