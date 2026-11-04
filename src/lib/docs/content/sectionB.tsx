import React from "react";
import Link from "next/link";
import { DocsCallout } from "@/components/docs/DocsCallout";
import { CodeBlock } from "@/components/docs/CodeBlock";
import {
  FinancialAuthorityModelDiagram,
  MultiAgentObjectiveLifecycleDiagram,
} from "@/components/docs/DocsDiagrams";
import type { DocPageContent } from "./sectionA";

export const SECTION_B_PAGES: Record<string, DocPageContent> = {
  "core-concepts/agents": {
    slug: "core-concepts/agents",
    headings: [
      { id: "what-is-an-agent", text: "What is an Agent?", level: 2 },
      { id: "capabilities-vs-authority", text: "Capability vs Financial Authority", level: 2 },
      { id: "agent-identities", text: "Agent Identities & Keys", level: 2 },
      { id: "capability-registry", text: "The Capability Registry", level: 2 },
      { id: "delegation-and-swarms", text: "Agent-to-Agent Delegation & Swarms", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="what-is-an-agent">
          <h2 className="text-xl font-bold text-white mb-3">What is an Agent?</h2>
          <p>
            In Mandate, an <strong>Agent</strong> is a specialized autonomous worker equipped with a defined role, tools, and execution capabilities. Agents can analyze data, browse web resources, formulate DAG plans, query APIs, and propose financial disbursements.
          </p>
          <p className="mt-3">
            However, agents in Mandate are strictly <em>unprivileged proposers</em>. They never possess raw cryptographic signing keys and cannot execute any transfer without an active, policy-compliant mandate signed by the user.
          </p>
        </section>

        <section id="capabilities-vs-authority">
          <h2 className="text-xl font-bold text-white mb-3">Capability vs Financial Authority</h2>
          <DocsCallout type="important" title="Crucial Distinction">
            An agent may possess the <em>technical capability</em> to interact with the NEAR blockchain, but it has <em>zero financial authority</em> unless an explicit, active mandate has authorized it to draw against a defined budget.
          </DocsCallout>
          <div className="overflow-x-auto my-4">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[#A1A1AA]">
                  <th className="py-2.5 pr-4 font-semibold">Aspect</th>
                  <th className="py-2.5 pr-4 font-semibold">Capability</th>
                  <th className="py-2.5 font-semibold text-white">Financial Authority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="py-3 pr-4 font-medium text-white">Defined By</td>
                  <td className="py-3 pr-4 text-[#D4D4D8]">Agent Capability Registry &amp; Tools</td>
                  <td className="py-3 text-emerald-400 font-semibold">User Mandate Policy</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-white">Example</td>
                  <td className="py-3 pr-4 text-[#D4D4D8]"><code>near_transfer</code>, <code>web_search</code></td>
                  <td className="py-3 text-emerald-400 font-semibold">Max 0.5 NEAR to <code>researcher.testnet</code></td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-white">Transferability</td>
                  <td className="py-3 pr-4 text-[#D4D4D8]">Agents can sub-delegate tasks</td>
                  <td className="py-3 text-red-400 font-semibold">Non-transferable; bound to mandate ID</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="agent-identities">
          <h2 className="text-xl font-bold text-white mb-3">Agent Identities &amp; Keys</h2>
          <p>
            Every agent in Mandate receives a tenant-isolated identity consisting of:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1.5 text-xs text-[#D4D4D8]">
            <li><strong>Agent UUID:</strong> Unique identifier in the PostgreSQL database.</li>
            <li><strong>Dedicated Implicit Account:</strong> A 64-character hex NEAR address derived inside OutLayer Intel SGX TEE.</li>
            <li><strong>Tenant Ownership:</strong> Strictly tied to the user&apos;s authenticated account session.</li>
          </ul>
        </section>

        <section id="delegation-and-swarms">
          <h2 className="text-xl font-bold text-white mb-3">Agent-to-Agent Delegation &amp; Swarms</h2>
          <p>
            When executing large objectives, a lead planning agent can assign tasks to specialized sub-agents (e.g. a <em>research-scout</em> delegating data compilation to an <em>analyst-agent</em>).
          </p>
          <p className="mt-2 text-xs text-[#A1A1AA]">
            Delegation transfers work, <strong>never financial custody</strong>. Any financial proposal originated by a sub-agent is evaluated against the top-level mandate authorized by the human user.
          </p>
        </section>
      </div>
    ),
  },

  "core-concepts/mandates": {
    slug: "core-concepts/mandates",
    headings: [
      { id: "what-is-a-mandate", text: "What is a Mandate?", level: 2 },
      { id: "parameters", text: "Mandate Policy Parameters", level: 2 },
      { id: "accounting-math", text: "Mathematical Accounting: Spent vs Reserved vs Available", level: 2 },
      { id: "lifecycle-states", text: "Mandate Lifecycle States", level: 2 },
      { id: "authority-model", text: "The Financial Authority Model", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="what-is-a-mandate">
          <h2 className="text-xl font-bold text-white mb-3">What is a Mandate?</h2>
          <p>
            A <strong>Mandate</strong> is a legally and cryptographically binding contract between the user and the Mandate execution engine. It establishes the immutable financial perimeter within which autonomous agents are permitted to operate.
          </p>
          <p className="mt-2">
            No agent, task, or objective can spend even a single yoctoNEAR without being attached to an active, non-expired mandate that has sufficient available budget.
          </p>
        </section>

        <section id="parameters">
          <h2 className="text-xl font-bold text-white mb-3">Mandate Policy Parameters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block">Authorized Budget (total_budget)</span>
              <p className="text-[#A1A1AA] mt-1">
                The absolute maximum amount of NEAR the mandate can authorize over its entire lifetime.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block">Per-Transaction Limit (per_tx_limit)</span>
              <p className="text-[#A1A1AA] mt-1">
                The ceiling for any single transaction proposal. Any request exceeding this limit is rejected immediately.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block">Approval Threshold (approval_threshold)</span>
              <p className="text-[#A1A1AA] mt-1">
                Transactions below this execute autonomously. Transactions above this threshold are escrowed pending human review.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block">Recipient Allowlist (allowed_recipients)</span>
              <p className="text-[#A1A1AA] mt-1">
                An explicit set of approved NEAR addresses. Transfers to any other recipient result in policy DENIAL.
              </p>
            </div>
          </div>
        </section>

        <section id="accounting-math">
          <h2 className="text-xl font-bold text-white mb-3">Mathematical Accounting: Spent vs Reserved vs Available</h2>
          <p>
            Mandate tracks balance state using strict integer math in <strong>yoctoNEAR</strong> (1 NEAR = 10<sup>24</sup> yoctoNEAR). Budget availability is governed by the invariant:
          </p>
          <div className="p-3 rounded-xl bg-[#141418] border border-emerald-500/30 font-mono text-center text-xs text-emerald-400 my-3">
            Available = Authorized - (Settled_Spent + Active_Reservations)
          </div>

          <div className="p-4 rounded-xl bg-[#161418] border border-white/5 text-xs space-y-2">
            <div className="font-semibold text-white">Practical Example:</div>
            <div>A user authorizes a <strong>5.0 NEAR</strong> mandate.</div>
            <div>• An agent completes a task, settling <strong>1.0 NEAR</strong>.</div>
            <div>• Another agent dispatches a task, creating a reservation of <strong>0.5 NEAR</strong>.</div>
            <div className="pt-2 border-t border-white/10 font-mono text-emerald-300">
              Authorized: 5.0 NEAR | Spent: 1.0 NEAR | Reserved: 0.5 NEAR | <strong>Available: 3.5 NEAR</strong>
            </div>
          </div>
        </section>

        <section id="lifecycle-states">
          <h2 className="text-xl font-bold text-white mb-3">Mandate Lifecycle States</h2>
          <div className="overflow-x-auto my-3">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[#A1A1AA]">
                  <th className="py-2 pr-4 font-semibold">State</th>
                  <th className="py-2 pr-4 font-semibold">Description</th>
                  <th className="py-2 font-semibold">Can Spend?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="py-2 pr-4 font-mono text-emerald-400">active</td>
                  <td className="py-2 pr-4 text-[#D4D4D8]">Normal operating state; available budget can be allocated</td>
                  <td className="py-2 text-emerald-400 font-semibold">YES</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-amber-400">paused</td>
                  <td className="py-2 pr-4 text-[#D4D4D8]">Temporarily suspended by user; no new transactions permitted</td>
                  <td className="py-2 text-red-400 font-semibold">NO</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-purple-400">budget_exhausted</td>
                  <td className="py-2 pr-4 text-[#D4D4D8]">Authorized budget completely consumed or reserved</td>
                  <td className="py-2 text-red-400 font-semibold">NO</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-[#A1A1AA]">expired</td>
                  <td className="py-2 pr-4 text-[#D4D4D8]">Mandate expiration date elapsed; terminal state</td>
                  <td className="py-2 text-red-400 font-semibold">NO</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-red-400">revoked</td>
                  <td className="py-2 pr-4 text-[#D4D4D8]">Explicitly killed by user; all pending approvals canceled</td>
                  <td className="py-2 text-red-400 font-semibold">NO</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="authority-model">
          <h2 className="text-xl font-bold text-white mb-3">The Financial Authority Model</h2>
          <FinancialAuthorityModelDiagram />
        </section>
      </div>
    ),
  },

  "core-concepts/objectives": {
    slug: "core-concepts/objectives",
    headings: [
      { id: "what-is-an-objective", text: "What is an Objective?", level: 2 },
      { id: "natural-language-to-plan", text: "Natural Language to Structured Plan", level: 2 },
      { id: "success-criteria", text: "Independent Success Criteria", level: 2 },
      { id: "lifecycle", text: "Objective Lifecycle", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="what-is-an-objective">
          <h2 className="text-xl font-bold text-white mb-3">What is an Objective?</h2>
          <p>
            An <strong>Objective</strong> represents a high-level business or research goal submitted by a user. While a mandate defines the financial ceiling, the objective defines <em>what work should be performed, how it is broken down into tasks, and when it is considered successfully completed</em>.
          </p>
        </section>

        <section id="natural-language-to-plan">
          <h2 className="text-xl font-bold text-white mb-3">Natural Language to Structured Plan</h2>
          <p>
            Users enter goals in plain English. Mandate&apos;s planning orchestrator converts the text into a Directed Acyclic Graph (DAG) with explicit task dependencies, required agent capabilities, and a deterministic SHA-256 plan hash.
          </p>
          <CodeBlock
            language="json"
            title="Generated DAG Plan Structure"
            code={`{
  "objective_id": "obj_98a2f",
  "plan_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "mandate_id": "man_441bc",
  "tasks": [
    {
      "task_id": "task_1",
      "type": "RESEARCH",
      "dependencies": [],
      "required_capability": "web_search"
    },
    {
      "task_id": "task_2",
      "type": "FINANCIAL_DISBURSEMENT",
      "dependencies": ["task_1"],
      "required_capability": "near_transfer",
      "max_amount_near": "0.10"
    }
  ]
}`}
          />
        </section>

        <section id="success-criteria">
          <h2 className="text-xl font-bold text-white mb-3">Independent Success Criteria</h2>
          <p>
            Objectives do not complete based on self-reported agent statements. Completion requires <strong>independent verification</strong>:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1.5 text-xs text-[#D4D4D8]">
            <li>All dependent DAG tasks must have reached verified terminal states.</li>
            <li>All financial disbursements must have confirmed onchain transaction receipts on NEAR.</li>
            <li>Verification evidence must match expected output fingerprints.</li>
          </ul>
        </section>

        <section id="lifecycle">
          <h2 className="text-xl font-bold text-white mb-3">Objective Lifecycle</h2>
          <MultiAgentObjectiveLifecycleDiagram />
        </section>
      </div>
    ),
  },

  "core-concepts/tasks-workflows": {
    slug: "core-concepts/tasks-workflows",
    headings: [
      { id: "dag-scheduling", text: "DAG Task Scheduling", level: 2 },
      { id: "agent-leases", text: "Agent Leases & Concurrency", level: 2 },
      { id: "task-verification", text: "Task Verification & Fingerprinting", level: 2 },
      { id: "failure-recovery", text: "Failure Handling & Automatic Retries", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="dag-scheduling">
          <h2 className="text-xl font-bold text-white mb-3">DAG Task Scheduling</h2>
          <p>
            Mandate executes tasks via a topological sort of the Directed Acyclic Graph (DAG). Tasks with zero unfulfilled dependencies are unlocked concurrently, allowing parallel agent execution where safe.
          </p>
        </section>

        <section id="agent-leases">
          <h2 className="text-xl font-bold text-white mb-3">Agent Leases &amp; Concurrency</h2>
          <p>
            To prevent race conditions, workers acquire atomic <strong>leases</strong> in PostgreSQL before processing a task. Each lease includes a <code>lease_generation</code> and <code>expires_at</code> timestamp. Stale workers that crash or stall have their leases reclaimed safely without double-spending.
          </p>
        </section>

        <section id="task-verification">
          <h2 className="text-xl font-bold text-white mb-3">Task Verification &amp; Fingerprinting</h2>
          <p>
            When an agent submits task output, Mandate hashes the payload using SHA-256 to produce an immutable <code>result_fingerprint</code>. Downstream dependent tasks can verify the integrity of upstream outputs before proceeding.
          </p>
        </section>
      </div>
    ),
  },

  "core-concepts/tools-integrations": {
    slug: "core-concepts/tools-integrations",
    headings: [
      { id: "tool-registry", text: "The Tool Registry", level: 2 },
      { id: "mcp-architecture", text: "Model Context Protocol (MCP) Integration", level: 2 },
      { id: "credential-protection", text: "Credential Protection & Isolation", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="tool-registry">
          <h2 className="text-xl font-bold text-white mb-3">The Tool Registry</h2>
          <p>
            Agents discover capabilities through a centralized <code>ToolRegistry</code>. Every tool invocation is recorded with input parameters, execution duration, provider status, and output fingerprint.
          </p>
        </section>

        <section id="mcp-architecture">
          <h2 className="text-xl font-bold text-white mb-3">Model Context Protocol (MCP) Integration</h2>
          <p>
            Mandate supports standard Model Context Protocol (MCP) servers, enabling agents to query local tools, database connections, and external APIs using standard JSON-RPC 2.0 schemas.
          </p>
        </section>

        <section id="credential-protection">
          <h2 className="text-xl font-bold text-white mb-3">Credential Protection &amp; Isolation</h2>
          <DocsCallout type="warning" title="Zero Plaintext Secrets">
            API keys and third-party integration credentials are encrypted at rest using AES-256-GCM and injected only into sandboxed worker environments. Agents never see raw API secrets.
          </DocsCallout>
        </section>
      </div>
    ),
  },
};

