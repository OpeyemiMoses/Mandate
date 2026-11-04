import React from "react";
import Link from "next/link";
import { DocsCallout } from "@/components/docs/DocsCallout";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { MultiAgentObjectiveLifecycleDiagram } from "@/components/docs/DocsDiagrams";
import type { DocPageContent } from "./sectionA";

export const SECTION_D_PAGES: Record<string, DocPageContent> = {
  "orchestration/objective-planning": {
    slug: "orchestration/objective-planning",
    headings: [
      { id: "natural-language-planning", text: "Natural Language Objective Submission", level: 2 },
      { id: "dag-generation", text: "DAG Generation & Dependency Analysis", level: 2 },
      { id: "plan-hashing", text: "Cryptographic Plan Hashing (plan_hash)", level: 2 },
      { id: "plan-approval", text: "User Review & Plan Mutation Guards", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="natural-language-planning">
          <h2 className="text-xl font-bold text-white mb-3">Natural Language Objective Submission</h2>
          <p>
            Users express business or technical objectives in unstructured natural language. The Mandate planning engine decomposes the goal into concrete executable tasks, identifies required external tools and capabilities, and specifies strict validation criteria.
          </p>
        </section>

        <section id="dag-generation">
          <h2 className="text-xl font-bold text-white mb-3">DAG Generation &amp; Dependency Analysis</h2>
          <p>
            The generated tasks are arranged in a <strong>Directed Acyclic Graph (DAG)</strong>. The orchestrator runs cycle-detection algorithms to ensure no circular dependencies exist.
          </p>
        </section>

        <section id="plan-hashing">
          <h2 className="text-xl font-bold text-white mb-3">Cryptographic Plan Hashing (plan_hash)</h2>
          <p>
            To prevent an agent or worker from sneakily altering task parameters after user authorization, Mandate computes a canonical <strong>SHA-256 plan hash</strong> over the entire DAG structure:
          </p>
          <CodeBlock
            language="bash"
            title="Plan Hash Computation"
            code={`plan_hash = SHA256(canonical_json({
  objective_id,
  mandate_id,
  tasks: sorted_by_id(tasks)
}))`}
          />
        </section>

        <section id="plan-approval">
          <h2 className="text-xl font-bold text-white mb-3">User Review &amp; Plan Mutation Guards</h2>
          <DocsCallout type="important" title="Explicit Human Authorization">
            Execution cannot begin until the user has reviewed and signed off on the structured plan hash. If an agent subsequently attempts to add tasks or alter dependencies, the plan hash invalidates and requires re-approval.
          </DocsCallout>
        </section>
      </div>
    ),
  },

  "orchestration/multi-agent": {
    slug: "orchestration/multi-agent",
    headings: [
      { id: "swarms", text: "Multi-Agent Swarm Collaboration", level: 2 },
      { id: "matching", text: "Capability-Based Task Assignment", level: 2 },
      { id: "non-transferable", text: "Non-Transferable Authority", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="swarms">
          <h2 className="text-xl font-bold text-white mb-3">Multi-Agent Swarm Collaboration</h2>
          <p>
            Large objectives frequently require specialized skills: scraping data, querying onchain state, analyzing risk, and executing transfers. Mandate allows multiple specialized agents to collaborate on a single objective without sharing credentials.
          </p>
        </section>

        <section id="matching">
          <h2 className="text-xl font-bold text-white mb-3">Capability-Based Task Assignment</h2>
          <p className="text-xs text-[#A1A1AA]">
            When a task becomes ready in the DAG, the scheduler queries the <code>AgentCapabilityRegistry</code> and selects an eligible idle agent with matching tool permissions and sufficient health scores.
          </p>
        </section>

        <section id="non-transferable">
          <h2 className="text-xl font-bold text-white mb-3">Non-Transferable Authority</h2>
          <DocsCallout type="warning" title="No Authority Delegation Between Agents">
            Agents can delegate work, but they CANNOT transfer financial spending authority to one another. Every proposed transaction must link back to the authorized mandate assigned to the objective.
          </DocsCallout>
        </section>
      </div>
    ),
  },

  "orchestration/verification": {
    slug: "orchestration/verification",
    headings: [
      { id: "verification-levels", text: "The Three Verification Levels", level: 2 },
      { id: "anti-self-certification", text: "Anti-Self-Certification Rule", level: 2 },
      { id: "completion", text: "Objective Completion Invariant", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="verification-levels">
          <h2 className="text-xl font-bold text-white mb-3">The Three Verification Levels</h2>
          <div className="overflow-x-auto my-3">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[#A1A1AA]">
                  <th className="py-2.5 pr-4 font-semibold">Level</th>
                  <th className="py-2.5 pr-4 font-semibold">Verification Method</th>
                  <th className="py-2.5 font-semibold">Trust Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-[#A1A1AA]">AGENT_REPORTED</td>
                  <td className="py-2.5 pr-4 text-[#D4D4D8]">Agent claims task is done; unverified statement</td>
                  <td className="py-2.5 text-amber-400">Untrusted</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-sky-400">SYSTEM_VALIDATED</td>
                  <td className="py-2.5 pr-4 text-[#D4D4D8]">Schema and output format validated by Mandate</td>
                  <td className="py-2.5 text-sky-400">Syntactic</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-emerald-400 font-bold">INDEPENDENTLY_VERIFIED</td>
                  <td className="py-2.5 pr-4 text-[#D4D4D8]">Cryptographic evidence &amp; external state proof confirmed</td>
                  <td className="py-2.5 text-emerald-400 font-semibold">Certified</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="anti-self-certification">
          <h2 className="text-xl font-bold text-white mb-3">Anti-Self-Certification Rule</h2>
          <p>
            An agent that executes a task is strictly forbidden from certifying its own success. Verification must be performed by independent system validators or external cryptographic proofs (such as NEAR transaction finality receipts).
          </p>
        </section>
      </div>
    ),
  },

  "orchestration/recovery": {
    slug: "orchestration/recovery",
    headings: [
      { id: "durable-checkpoints", text: "Durable PostgreSQL Checkpoints", level: 2 },
      { id: "worker-resilience", text: "Worker Crash & Restart Recovery", level: 2 },
      { id: "lease-reclamation", text: "Stale Worker Rejection & Lease Reclamation", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="durable-checkpoints">
          <h2 className="text-xl font-bold text-white mb-3">Durable PostgreSQL Checkpoints</h2>
          <p>
            Every objective lifecycle transition is atomically recorded in PostgreSQL with version counters, lease metadata, and chronological audit entries.
          </p>
        </section>

        <section id="worker-resilience">
          <h2 className="text-xl font-bold text-white mb-3">Worker Crash &amp; Restart Recovery</h2>
          <p>
            If a background worker process terminates unexpectedly mid-task, the system detects lease expiration, resets the task to <code>READY</code> or <code>RECOVERING</code>, and resumes orchestration without duplicate financial broadcasts.
          </p>
        </section>
      </div>
    ),
  },
};

