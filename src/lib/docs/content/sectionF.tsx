import React from "react";
import Link from "next/link";
import { DocsCallout } from "@/components/docs/DocsCallout";
import { CodeBlock } from "@/components/docs/CodeBlock";
import type { DocPageContent } from "./sectionA";

export const SECTION_F_PAGES: Record<string, DocPageContent> = {
  "integrations/near": {
    slug: "integrations/near",
    headings: [
      { id: "why-near", text: "Why NEAR Protocol?", level: 2 },
      { id: "supported-network", text: "Supported Network: NEAR Testnet", level: 2 },
      { id: "account-structure", text: "Account Structure & Precision", level: 2 },
      { id: "rpc-and-finality", text: "RPC Verification & Finality", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="why-near">
          <h2 className="text-xl font-bold text-white mb-3">Why NEAR Protocol?</h2>
          <p>
            Mandate is built natively on <strong>NEAR Protocol</strong> due to its high-throughput sharded architecture, sub-second block finality, low predictable transaction fees, and native support for 64-character implicit cryptographic accounts.
          </p>
        </section>

        <section id="supported-network">
          <h2 className="text-xl font-bold text-white mb-3">Supported Network: NEAR Testnet</h2>
          <DocsCallout type="important" title="Network Status">
            Mandate is currently live exclusively on <strong>NEAR Testnet</strong> (<code>rpc.testnet.near.org</code>). Mainnet transactions remain disabled while the platform undergoes production readiness hardening. Testnet tokens do not possess monetary value.
          </DocsCallout>
        </section>

        <section id="account-structure">
          <h2 className="text-xl font-bold text-white mb-3">Account Structure &amp; Precision</h2>
          <p>
            All accounting in Mandate is performed in <strong>atomic yoctoNEAR</strong> (1 NEAR = 10<sup>24</sup> yoctoNEAR) using native BigInt arithmetic to eliminate floating-point precision loss.
          </p>
        </section>

        <section id="rpc-and-finality">
          <h2 className="text-xl font-bold text-white mb-3">RPC Verification &amp; Finality</h2>
          <p className="text-xs text-[#A1A1AA]">
            When an execution envelope is broadcast, Mandate polls the NEAR RPC for <code>FINAL</code> execution status and inspects <code>execution_outcome</code> receipts to ensure the transaction succeeded onchain before settling reservations.
          </p>
        </section>
      </div>
    ),
  },

  "integrations/outlayer": {
    slug: "integrations/outlayer",
    headings: [
      { id: "provider-connection", text: "OutLayer Provider Connection", level: 2 },
      { id: "enclave-lifecycle", text: "Enclave Key Lifecycle", level: 2 },
      { id: "failure-handling", text: "OutLayer Downtime & Fallback Handling", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="provider-connection">
          <h2 className="text-xl font-bold text-white mb-3">OutLayer Provider Connection</h2>
          <p>
            Mandate connects to OutLayer TEE providers via mutual TLS. The provider exposes confidential enclave signing endpoints for registered agent wallets.
          </p>
        </section>

        <section id="enclave-lifecycle">
          <h2 className="text-xl font-bold text-white mb-3">Enclave Key Lifecycle</h2>
          <p>
            Keys are generated inside Intel SGX hardware using secure entropy. The public key is derived to form the agent&apos;s NEAR implicit account. Private keys remain resident only within hardware-encrypted enclave pages.
          </p>
        </section>

        <section id="failure-handling">
          <h2 className="text-xl font-bold text-white mb-3">OutLayer Downtime &amp; Fallback Handling</h2>
          <DocsCallout type="warning" title="Provider Availability">
            If OutLayer becomes unreachable, Mandate transitions pending tasks into <code>PAUSED</code> or <code>RETRY_QUEUED</code>. No funds are at risk; the system fails closed until the enclave service recovers.
          </DocsCallout>
        </section>
      </div>
    ),
  },

  "integrations/tools-mcp": {
    slug: "integrations/tools-mcp",
    headings: [
      { id: "mcp-overview", text: "Model Context Protocol Integration", level: 2 },
      { id: "supported-tools", text: "Active Registered Tools", level: 2 },
      { id: "tool-permissions", text: "Permission Scoping & Rate Limits", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="mcp-overview">
          <h2 className="text-xl font-bold text-white mb-3">Model Context Protocol Integration</h2>
          <p>
            Mandate supports standard Model Context Protocol (MCP) tool declarations, enabling agents to execute external operations via structured schema definitions.
          </p>
        </section>

        <section id="supported-tools">
          <h2 className="text-xl font-bold text-white mb-3">Active Registered Tools</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs my-3">
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block">near_transfer</span>
              <p className="text-[#A1A1AA] mt-1">Dispatches financial proposals via ExecutionBoundaryService.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block">web_search</span>
              <p className="text-[#A1A1AA] mt-1">Gathers external intelligence and market data.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block">rest_api_query</span>
              <p className="text-[#A1A1AA] mt-1">Queries external authenticated JSON REST endpoints.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white block">proof_validator</span>
              <p className="text-[#A1A1AA] mt-1">Verifies evidence fingerprints against task completion criteria.</p>
            </div>
          </div>
        </section>
      </div>
    ),
  },

  "integrations/troubleshooting": {
    slug: "integrations/troubleshooting",
    headings: [
      { id: "status-classifications", text: "Integration Status Classifications", level: 2 },
      { id: "resolving-errors", text: "Resolving Common Integration Errors", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="status-classifications">
          <h2 className="text-xl font-bold text-white mb-3">Integration Status Classifications</h2>
          <div className="overflow-x-auto my-3">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[#A1A1AA]">
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 pr-4 font-semibold">Meaning</th>
                  <th className="py-2 font-semibold">Action Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="py-2 pr-4 font-mono text-emerald-400">CONFIGURED</td>
                  <td className="py-2 pr-4 text-[#D4D4D8]">Credentials registered and encrypted</td>
                  <td className="py-2 text-[#A1A1AA]">Ready for testing</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-sky-400">CONNECTED</td>
                  <td className="py-2 pr-4 text-[#D4D4D8]">Active heartbeat with provider established</td>
                  <td className="py-2 text-emerald-400">Operational</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-purple-400">EXECUTION_VERIFIED</td>
                  <td className="py-2 pr-4 text-[#D4D4D8]">Real live operation tested and verified</td>
                  <td className="py-2 text-emerald-400">Fully Certified</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-amber-400">DEGRADED</td>
                  <td className="py-2 pr-4 text-[#D4D4D8]">Elevated error rate or latency from upstream provider</td>
                  <td className="py-2 text-amber-400">Monitor or switch provider</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-red-400">UNAVAILABLE</td>
                  <td className="py-2 pr-4 text-[#D4D4D8]">Provider offline or credentials expired</td>
                  <td className="py-2 text-red-400 font-semibold">Re-authenticate</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    ),
  },
};

