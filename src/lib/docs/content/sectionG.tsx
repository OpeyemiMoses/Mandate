import React from "react";
import Link from "next/link";
import { DocsCallout } from "@/components/docs/DocsCallout";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { MandateArchitectureDiagram } from "@/components/docs/DocsDiagrams";
import type { DocPageContent } from "./sectionA";

export const SECTION_G_PAGES: Record<string, DocPageContent> = {
  "developers/overview": {
    slug: "developers/overview",
    headings: [
      { id: "dev-architecture", text: "Developer Architecture Overview", level: 2 },
      { id: "core-services", text: "Core Backend Services", level: 2 },
      { id: "data-flow", text: "Application Data Flow", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="dev-architecture">
          <h2 className="text-xl font-bold text-white mb-3">Developer Architecture Overview</h2>
          <p>
            Mandate is built using <strong>Next.js 14 App Router</strong>, <strong>TypeScript</strong>, <strong>PostgreSQL 18.6</strong>, <strong>Prisma ORM</strong>, and <strong>NEAR API JS</strong>.
          </p>
        </section>

        <section id="core-services">
          <h2 className="text-xl font-bold text-white mb-3">Core Backend Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs my-3">
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block">ExecutionBoundaryService</span>
              <p className="text-[#A1A1AA] mt-1">Nonced cryptographic envelope generation and OutLayer TEE dispatch.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block">UniversalPolicyEngine</span>
              <p className="text-[#A1A1AA] mt-1">Deterministic rule evaluation and budget reservation enforcement.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block">ObjectiveEngine</span>
              <p className="text-[#A1A1AA] mt-1">DAG plan generation, cycle detection, and topological dispatching.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block">ReconciliationService</span>
              <p className="text-[#A1A1AA] mt-1">Background recovery of ambiguous transactions and stale leases.</p>
            </div>
          </div>
        </section>

        <section id="data-flow">
          <h2 className="text-xl font-bold text-white mb-3">Application Data Flow</h2>
          <MandateArchitectureDiagram />
        </section>
      </div>
    ),
  },

  "api-reference": {
    slug: "api-reference",
    headings: [
      { id: "api-overview", text: "REST API Conventions", level: 2 },
      { id: "endpoints-mandates", text: "Mandate Endpoints", level: 2 },
      { id: "endpoints-agents", text: "Agent Endpoints", level: 2 },
      { id: "endpoints-objectives", text: "Objective Endpoints", level: 2 },
      { id: "endpoints-approvals", text: "Approval Endpoints", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="api-overview">
          <h2 className="text-xl font-bold text-white mb-3">REST API Conventions</h2>
          <p>
            All endpoints accept and return <code>application/json</code>. Every authenticated request must include the <code>x-mandate-account-id</code> or active session cookie.
          </p>
        </section>

        <section id="endpoints-mandates">
          <h2 className="text-xl font-bold text-white mb-3">Mandate Endpoints</h2>
          <div className="p-4 rounded-xl bg-[#141418] border border-white/5 text-xs space-y-3">
            <div className="flex items-center gap-2 font-mono">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">GET</span>
              <span className="text-white font-semibold">/api/mandates</span>
            </div>
            <p className="text-[#A1A1AA]">Lists all mandates belonging to the authenticated account.</p>

            <div className="flex items-center gap-2 font-mono pt-3 border-t border-white/5">
              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold">POST</span>
              <span className="text-white font-semibold">/api/mandates</span>
            </div>
            <p className="text-[#A1A1AA]">Creates a new spending mandate with authorized budget, per-tx limits, and allowlists.</p>
            <CodeBlock
              language="bash"
              title="Example: Create Mandate cURL"
              code={`curl -X POST https://mandate.app/api/mandates \\
  -H "Content-Type: application/json" \\
  -H "x-mandate-account-id: alice.testnet" \\
  -d '{
    "title": "DeFi Research Mandate",
    "totalBudgetNear": "1.0",
    "perTxLimitNear": "0.2",
    "approvalThresholdNear": "0.1",
    "allowedRecipients": ["researcher.testnet"]
  }'`}
            />
          </div>
        </section>

        <section id="endpoints-agents">
          <h2 className="text-xl font-bold text-white mb-3">Agent Endpoints</h2>
          <div className="p-4 rounded-xl bg-[#141418] border border-white/5 text-xs space-y-3">
            <div className="flex items-center gap-2 font-mono">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">GET</span>
              <span className="text-white font-semibold">/api/agents</span>
            </div>
            <p className="text-[#A1A1AA]">Returns all registered agents, capability tiers, and health metrics.</p>

            <div className="flex items-center gap-2 font-mono pt-3 border-t border-white/5">
              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold">POST</span>
              <span className="text-white font-semibold">/api/agents</span>
            </div>
            <p className="text-[#A1A1AA]">Provisions a new agent and generates its OutLayer TEE custody wallet.</p>
          </div>
        </section>

        <section id="endpoints-objectives">
          <h2 className="text-xl font-bold text-white mb-3">Objective Endpoints</h2>
          <div className="p-4 rounded-xl bg-[#141418] border border-white/5 text-xs space-y-3">
            <div className="flex items-center gap-2 font-mono">
              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold">POST</span>
              <span className="text-white font-semibold">/api/objectives</span>
            </div>
            <p className="text-[#A1A1AA]">Submits a natural language goal and returns structured DAG with plan hash.</p>
          </div>
        </section>

        <section id="endpoints-approvals">
          <h2 className="text-xl font-bold text-white mb-3">Approval Endpoints</h2>
          <div className="p-4 rounded-xl bg-[#141418] border border-white/5 text-xs space-y-3">
            <div className="flex items-center gap-2 font-mono">
              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold">POST</span>
              <span className="text-white font-semibold">/api/approvals/[id]</span>
            </div>
            <p className="text-[#A1A1AA]">Signs or rejects a pending human escalation transaction.</p>
          </div>
        </section>
      </div>
    ),
  },

  "developers/authentication": {
    slug: "developers/authentication",
    headings: [
      { id: "session-identity", text: "Session Identity & Tenant Header", level: 2 },
      { id: "wallet-auth", text: "NEP-413 Signature Authentication", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="session-identity">
          <h2 className="text-xl font-bold text-white mb-3">Session Identity &amp; Tenant Header</h2>
          <p>
            Mandate enforces tenant-level access control. Requests without a valid authenticated session or verified tenant identifier receive <code>401 Unauthorized</code> or <code>403 Forbidden</code>.
          </p>
        </section>

        <section id="wallet-auth">
          <h2 className="text-xl font-bold text-white mb-3">NEP-413 Signature Authentication</h2>
          <p className="text-xs text-[#A1A1AA]">
            High-privilege actions (such as human threshold approvals or mandate revocation) can be signed directly by the user&apos;s personal NEAR wallet using NEAR NEP-413 standard message signing.
          </p>
        </section>
      </div>
    ),
  },

  "developers/webhooks-events": {
    slug: "developers/webhooks-events",
    headings: [
      { id: "event-types", text: "Supported System Events", level: 2 },
      { id: "delivery-guarantees", text: "Delivery Guarantees & Retries", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="event-types">
          <h2 className="text-xl font-bold text-white mb-3">Supported System Events</h2>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-[#D4D4D8]">
            <li><code>mandate.created</code> — A new spending mandate was issued.</li>
            <li><code>transaction.reserved</code> — A policy reservation was created.</li>
            <li><code>transaction.settled</code> — A transaction was confirmed onchain.</li>
            <li><code>approval.required</code> — A transaction requires human signature.</li>
            <li><code>objective.completed</code> — All DAG tasks passed independent verification.</li>
          </ul>
        </section>

        <section id="delivery-guarantees">
          <h2 className="text-xl font-bold text-white mb-3">Delivery Guarantees &amp; Retries</h2>
          <DocsCallout type="note" title="At-Least-Once Delivery">
            Events are persisted to PostgreSQL before dispatch. In case of network failure, webhooks are retried with exponential backoff up to 5 times.
          </DocsCallout>
        </section>
      </div>
    ),
  },

  "developers/examples": {
    slug: "developers/examples",
    headings: [
      { id: "example-ts", text: "TypeScript / Node.js SDK Example", level: 2 },
      { id: "example-curl", text: "cURL Quick Reference", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="example-ts">
          <h2 className="text-xl font-bold text-white mb-3">TypeScript / Node.js SDK Example</h2>
          <CodeBlock
            language="typescript"
            title="Create Mandate &amp; Objective in TypeScript"
            code={`import axios from "axios";

const mandateClient = axios.create({
  baseURL: "https://mandate.app/api",
  headers: { "x-mandate-account-id": "alice.testnet" }
});

async function runAutonomousWorkflow() {
  // 1. Create a Capped Mandate
  const { data: mandate } = await mandateClient.post("/mandates", {
    title: "Market Maker Sub-Agent",
    totalBudgetNear: "2.0",
    perTxLimitNear: "0.25",
    approvalThresholdNear: "0.10",
    allowedRecipients: ["pool.near", "oracle.testnet"]
  });

  console.log("Mandate Created:", mandate.id);

  // 2. Propose Objective
  const { data: objective } = await mandateClient.post("/objectives", {
    mandateId: mandate.id,
    prompt: "Rebalance pool liquidity and transfer rewards to oracle.testnet"
  });

  console.log("Objective Plan Hash:", objective.planHash);
}

runAutonomousWorkflow();`}
          />
        </section>
      </div>
    ),
  },
};

