import React from "react";
import Link from "next/link";
import { DocsCallout } from "@/components/docs/DocsCallout";
import { CodeBlock } from "@/components/docs/CodeBlock";
import type { DocPageContent } from "./sectionA";

export const SECTION_H_PAGES: Record<string, DocPageContent> = {
  faq: {
    slug: "faq",
    headings: [
      { id: "general-faq", text: "General Platform Questions", level: 2 },
      { id: "spending-faq", text: "Spending & Custody Questions", level: 2 },
      { id: "security-faq", text: "Security & Verification Questions", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="general-faq">
          <h2 className="text-xl font-bold text-white mb-3">General Platform Questions</h2>
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <div className="font-semibold text-white text-sm">What exactly is Mandate?</div>
              <p className="text-[#A1A1AA] leading-relaxed">
                Mandate is a deterministic spending firewall and policy-enforced custody layer for autonomous AI agents on NEAR Protocol. It allows users to give agents real financial budgets without relinquishing master private keys or risking wallet drain.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <div className="font-semibold text-white text-sm">Is Mandate itself an AI agent?</div>
              <p className="text-[#A1A1AA] leading-relaxed">
                No. Mandate is the <em>deterministic infrastructure and policy firewall</em> that governs AI agents. The AI agents propose tasks and transfers, while Mandate enforces mathematical spending rules and dispatches execution inside OutLayer TEE.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <div className="font-semibold text-white text-sm">Can agents spend money independently?</div>
              <p className="text-[#A1A1AA] leading-relaxed">
                Yes, but <strong>only</strong> within the strict limits pre-authorized by the user in an active mandate (e.g. up to 0.1 NEAR per tx to whitelisted recipients). Any transaction exceeding limits is blocked or held for human review.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <div className="font-semibold text-white text-sm">Does every transaction require human approval?</div>
              <p className="text-[#A1A1AA] leading-relaxed">
                No. Transactions that fall within the authorized mandate budget and below the human <code>approval_threshold</code> execute autonomously and instantly.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <div className="font-semibold text-white text-sm">Can an agent increase its own budget?</div>
              <p className="text-[#A1A1AA] leading-relaxed">
                Absolutely not. An agent has zero permission to modify mandate parameters. Only the authenticated user can authorize or adjust a budget.
              </p>
            </div>
          </div>
        </section>

        <section id="spending-faq">
          <h2 className="text-xl font-bold text-white mb-3">Spending &amp; Custody Questions</h2>
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <div className="font-semibold text-white text-sm">What happens when a mandate budget is exhausted?</div>
              <p className="text-[#A1A1AA] leading-relaxed">
                The mandate immediately shifts to the <code>budget_exhausted</code> state. Any subsequent transfer proposals are automatically DENIED by the policy engine. The user must explicitly top up or extend the mandate.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <div className="font-semibold text-white text-sm">What is the difference between my wallet and the agent wallet?</div>
              <p className="text-[#A1A1AA] leading-relaxed">
                Your personal wallet is your own NEAR account (e.g. Meteor, Ledger) which you control. The agent wallet is a dedicated 64-character implicit account generated inside an Intel SGX hardware enclave (OutLayer TEE). Agents can only draw from their own funded enclave wallet.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <div className="font-semibold text-white text-sm">What happens if an agent fails or crashes?</div>
              <p className="text-[#A1A1AA] leading-relaxed">
                The agent&apos;s lease expires automatically in PostgreSQL. The objective pauses or re-assigns the task to another healthy worker. Uncommitted budget reservations are refunded.
              </p>
            </div>
          </div>
        </section>

        <section id="security-faq">
          <h2 className="text-xl font-bold text-white mb-3">Security &amp; Verification Questions</h2>
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <div className="font-semibold text-white text-sm">Is my seed phrase ever shared with Mandate or AI models?</div>
              <p className="text-[#A1A1AA] leading-relaxed">
                Never. Mandate never requests, stores, or transmits your seed phrase. Enclave signing keys are generated inside Intel SGX chips and never leave hardware memory.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <div className="font-semibold text-white text-sm">Does Mandate support NEAR Mainnet?</div>
              <p className="text-[#A1A1AA] leading-relaxed">
                Not currently. Mandate is live exclusively on <strong>NEAR Testnet</strong> during its initial verification phase. Mainnet support is disabled in software.
              </p>
            </div>
          </div>
        </section>
      </div>
    ),
  },

  glossary: {
    slug: "glossary",
    headings: [
      { id: "core-terms", text: "Core Architectural Terms", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="core-terms">
          <h2 className="text-xl font-bold text-white mb-3">Core Architectural Terms</h2>
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white text-sm">Agent</span>
              <p className="text-[#A1A1AA] mt-1">An autonomous AI worker registered in the capability registry that proposes tasks and financial operations.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white text-sm">Mandate</span>
              <p className="text-[#A1A1AA] mt-1">A cryptographically enforced financial contract setting hard ceilings, limits, and allowlists for agent spending.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white text-sm">ExecutionBoundaryService</span>
              <p className="text-[#A1A1AA] mt-1">The sole authorized internal service capable of issuing signed execution envelopes to OutLayer TEE.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white text-sm">OutLayer Intel SGX TEE</span>
              <p className="text-[#A1A1AA] mt-1">Hardware-isolated Trusted Execution Environment protecting agent private signing keys.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white text-sm">Budget Reservation</span>
              <p className="text-[#A1A1AA] mt-1">An atomic two-phase hold on available funds in PostgreSQL preventing concurrent double-spending.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white text-sm">plan_hash</span>
              <p className="text-[#A1A1AA] mt-1">A canonical SHA-256 hash computed over an objective&apos;s DAG tasks to guarantee plan integrity.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141418] border border-white/5">
              <span className="font-semibold text-white text-sm">YoctoNEAR</span>
              <p className="text-[#A1A1AA] mt-1">The atomic sub-unit of NEAR Protocol (10<sup>-24</sup> NEAR). All Mandate balance math is calculated in yoctoNEAR.</p>
            </div>
          </div>
        </section>
      </div>
    ),
  },

  troubleshooting: {
    slug: "troubleshooting",
    headings: [
      { id: "common-issues", text: "Common Issues & Resolutions", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="common-issues">
          <h2 className="text-xl font-bold text-white mb-3">Common Issues &amp; Resolutions</h2>
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <span className="font-semibold text-amber-400">Issue: &ldquo;POLICY_DENIED: Budget Exhausted&rdquo;</span>
              <p className="text-[#A1A1AA]">
                <strong>Cause:</strong> The proposed amount exceeds the available budget remaining on the active mandate.
              </p>
              <p className="text-[#D4D4D8]">
                <strong>Fix:</strong> Navigate to <Link href="/mandates" className="text-[#FF3B30] underline">Mandates</Link>, select your mandate, and edit the authorized budget, or issue a new mandate.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <span className="font-semibold text-amber-400">Issue: &ldquo;POLICY_DENIED: Prohibited Recipient&rdquo;</span>
              <p className="text-[#A1A1AA]">
                <strong>Cause:</strong> The destination NEAR address is not in the mandate&apos;s <code>allowed_recipients</code> allowlist.
              </p>
              <p className="text-[#D4D4D8]">
                <strong>Fix:</strong> Add the recipient address to the mandate configuration or approve via manual escalation.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-1.5">
              <span className="font-semibold text-amber-400">Issue: Transaction stuck in &ldquo;AWAITING_APPROVAL&rdquo;</span>
              <p className="text-[#A1A1AA]">
                <strong>Cause:</strong> The transaction exceeded the mandate&apos;s human threshold.
              </p>
              <p className="text-[#D4D4D8]">
                <strong>Fix:</strong> Go to <Link href="/approvals" className="text-[#FF3B30] underline">Approvals</Link> and sign or reject the transaction.
              </p>
            </div>
          </div>
        </section>
      </div>
    ),
  },

  availability: {
    slug: "availability",
    headings: [
      { id: "current-status", text: "Current Operational Status", level: 2 },
      { id: "supported-environments", text: "Supported Environments", level: 2 },
      { id: "roadmap", text: "Production Roadmap", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="current-status">
          <h2 className="text-xl font-bold text-white mb-3">Current Operational Status</h2>
          <div className="p-4 rounded-xl bg-[#141418] border border-white/5 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-white">Public Developer Testnet: OPERATIONAL</span>
            </div>
            <p className="text-[#A1A1AA]">
              Mandate is operating on <strong>NEAR Testnet</strong> with OutLayer Intel SGX hardware TEE enclaves.
            </p>
          </div>
        </section>

        <section id="supported-environments">
          <h2 className="text-xl font-bold text-white mb-3">Supported Environments</h2>
          <div className="overflow-x-auto my-3">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[#A1A1AA]">
                  <th className="py-2 pr-4 font-semibold">Environment</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Real Assets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="py-2 pr-4 font-mono text-white">NEAR Testnet</td>
                  <td className="py-2 pr-4 text-emerald-400 font-semibold">ACTIVE</td>
                  <td className="py-2 text-[#A1A1AA]">Testnet NEAR (No monetary value)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-white">NEAR Mainnet</td>
                  <td className="py-2 pr-4 text-amber-400 font-semibold">DISABLED / PLANNED</td>
                  <td className="py-2 text-[#A1A1AA]">Awaiting final security review</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="roadmap">
          <h2 className="text-xl font-bold text-white mb-3">Production Roadmap</h2>
          <DocsCallout type="note" title="Mainnet Activation">
            Mainnet activation will only occur following external formal verification and audit sign-off.
          </DocsCallout>
        </section>
      </div>
    ),
  },
};

