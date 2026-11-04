import React from "react";
import Link from "next/link";
import { DocsCallout } from "@/components/docs/DocsCallout";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { AutonomousSpendingFlowDiagram } from "@/components/docs/DocsDiagrams";
import type { DocPageContent } from "./sectionA";

export const SECTION_C_PAGES: Record<string, DocPageContent> = {
  "autonomous-spending": {
    slug: "autonomous-spending",
    headings: [
      { id: "spending-overview", text: "Autonomous Financial Execution", level: 2 },
      { id: "authorization-pipeline", text: "The End-to-End Spending Pipeline", level: 2 },
      { id: "execution-boundary", text: "Role of ExecutionBoundaryService", level: 2 },
      { id: "outlayer-settlement", text: "OutLayer TEE Signing & NEAR Broadcast", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="spending-overview">
          <h2 className="text-xl font-bold text-white mb-3">Autonomous Financial Execution</h2>
          <p>
            Autonomous spending in Mandate is neither an unconstrained agent free-for-all nor a tedious manual workflow where every trivial micro-transfer requires human approval.
          </p>
          <p className="mt-2">
            Instead, transactions execute <strong>autonomously and instantaneously</strong> as long as they strictly satisfy the deterministic rules, budgets, and allowlists pre-authorized by the user. If a transaction attempts to exceed limits or transfer to an unknown address, it is either safely blocked or escalated for explicit human approval.
          </p>
        </section>

        <section id="authorization-pipeline">
          <h2 className="text-xl font-bold text-white mb-3">The End-to-End Spending Pipeline</h2>
          <AutonomousSpendingFlowDiagram />
        </section>

        <section id="execution-boundary">
          <h2 className="text-xl font-bold text-white mb-3">Role of ExecutionBoundaryService</h2>
          <p>
            The <code>ExecutionBoundaryService</code> is the central choke point of all financial execution in Mandate. It is mathematically impossible for an agent or worker to reach OutLayer TEE or broadcast a NEAR transfer without an execution authorization envelope signed by this service.
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1.5 text-xs text-[#D4D4D8]">
            <li><strong>Atomic Nonce Tracking:</strong> Increments a monotonic integer counter per tenant to prevent replay attacks.</li>
            <li><strong>Idempotency Keys:</strong> Guarantees that network retries or worker restarts never trigger duplicate transfers.</li>
            <li><strong>Tenant Isolation:</strong> Validates session credentials to ensure agents can only draw funds from their owner&apos;s active mandates.</li>
          </ul>
        </section>
      </div>
    ),
  },

  "autonomous-spending/approval-rules": {
    slug: "autonomous-spending/approval-rules",
    headings: [
      { id: "policy-outcomes", text: "Deterministic Policy Outcomes", level: 2 },
      { id: "outcomes-table", text: "Verdict Reference Table", level: 2 },
      { id: "escalation-scenarios", text: "When is Human Approval Required?", level: 2 },
      { id: "fail-closed", text: "Fail-Closed Principle", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="policy-outcomes">
          <h2 className="text-xl font-bold text-white mb-3">Deterministic Policy Outcomes</h2>
          <p>
            Whenever an agent proposes a transfer, the Universal Policy Engine processes the parameters against the active mandate and returns exactly one of five deterministic verdicts:
          </p>
        </section>

        <section id="outcomes-table">
          <h2 className="text-xl font-bold text-white mb-3">Verdict Reference Table</h2>
          <div className="overflow-x-auto my-3">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[#A1A1AA]">
                  <th className="py-2.5 pr-4 font-semibold">Policy Outcome</th>
                  <th className="py-2.5 pr-4 font-semibold">System Behavior</th>
                  <th className="py-2.5 font-semibold">Requires Human?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-emerald-400 font-bold">ALLOW</td>
                  <td className="py-2.5 pr-4 text-[#D4D4D8]">Execute autonomously; within all limits and thresholds</td>
                  <td className="py-2.5 text-emerald-400">NO</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-emerald-300 font-bold">ALLOW_WITH_LIMITS</td>
                  <td className="py-2.5 pr-4 text-[#D4D4D8]">Execute within modified or clamped parameters</td>
                  <td className="py-2.5 text-emerald-400">NO</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-amber-400 font-bold">REQUIRE_APPROVAL</td>
                  <td className="py-2.5 pr-4 text-[#D4D4D8]">Escrow in pending state; await human wallet signature</td>
                  <td className="py-2.5 text-amber-400 font-semibold">YES</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-purple-400 font-bold">ESCALATE</td>
                  <td className="py-2.5 pr-4 text-[#D4D4D8]">Halt automated task; flag for operational supervisor review</td>
                  <td className="py-2.5 text-purple-400 font-semibold">YES</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-red-400 font-bold">DENY</td>
                  <td className="py-2.5 pr-4 text-[#D4D4D8]">Hard rejection; prohibited recipient, exhausted budget, or expired mandate</td>
                  <td className="py-2.5 text-red-400 font-semibold">BLOCKED</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="escalation-scenarios">
          <h2 className="text-xl font-bold text-white mb-3">When is Human Approval Required?</h2>
          <p>
            Human review is strictly reserved for high-value or ambiguous actions:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1.5 text-xs text-[#D4D4D8]">
            <li>The proposed transfer amount exceeds the mandate&apos;s <code>approval_threshold</code>.</li>
            <li>The recipient address is valid but has not yet been explicitly whitelisted.</li>
            <li>The DAG plan was mutated or rescheduled during active execution.</li>
          </ul>
        </section>

        <section id="fail-closed">
          <h2 className="text-xl font-bold text-white mb-3">Fail-Closed Principle</h2>
          <DocsCallout type="warning" title="Fail-Closed Architecture">
            If any policy rule encounters a database timeout, missing signature, or ambiguous condition, the policy engine automatically defaults to <strong>DENY</strong>. The system NEVER &ldquo;fails open&rdquo;.
          </DocsCallout>
        </section>
      </div>
    ),
  },

  "autonomous-spending/budget-management": {
    slug: "autonomous-spending/budget-management",
    headings: [
      { id: "reservations", text: "Two-Phase Budget Reservations", level: 2 },
      { id: "concurrency", text: "Preventing Race Conditions & Double-Spending", level: 2 },
      { id: "settlement", text: "Settlement & Reservation Release", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="reservations">
          <h2 className="text-xl font-bold text-white mb-3">Two-Phase Budget Reservations</h2>
          <p>
            To prevent two concurrent agents from simultaneously spending the same available balance, Mandate uses a <strong>two-phase reservation protocol</strong> in PostgreSQL:
          </p>
          <ol className="list-decimal pl-5 mt-2 space-y-1.5 text-xs text-[#D4D4D8]">
            <li><strong>Phase 1 (Reserve):</strong> Atomically verify availability and lock the exact amount in <code>mandate_reservations</code> using <code>SELECT ... FOR UPDATE</code>.</li>
            <li><strong>Phase 2 (Settle or Release):</strong> Once the NEAR transaction confirms onchain, convert the reservation into a permanent settled expenditure. If the transaction fails, release the reservation back to available budget immediately.</li>
          </ol>
        </section>

        <section id="concurrency">
          <h2 className="text-xl font-bold text-white mb-3">Preventing Race Conditions &amp; Double-Spending</h2>
          <p className="text-xs text-[#A1A1AA]">
            Even under adversarial concurrency tests with 50+ simultaneous agent proposals, Mandate&apos;s reservation engine guarantees that total settled + reserved yoctoNEAR never exceeds authorized budget by even 1 yoctoNEAR.
          </p>
        </section>
      </div>
    ),
  },

  "autonomous-spending/transaction-lifecycle": {
    slug: "autonomous-spending/transaction-lifecycle",
    headings: [
      { id: "lifecycle-states", text: "Transaction State Machine", level: 2 },
      { id: "broadcast-vs-finalized", text: "Broadcast vs Finalized Reality", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="lifecycle-states">
          <h2 className="text-xl font-bold text-white mb-3">Transaction State Machine</h2>
          <div className="overflow-x-auto my-3">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[#A1A1AA]">
                  <th className="py-2 pr-4 font-semibold">State</th>
                  <th className="py-2 font-semibold">Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr>
                  <td className="py-2 pr-4 font-mono text-white">AUTHORIZED</td>
                  <td className="py-2 text-[#D4D4D8]">Approved by policy engine; reservation held</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-purple-400">EXECUTING</td>
                  <td className="py-2 text-[#D4D4D8]">OutLayer Intel SGX TEE is signing the payload</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-sky-400">BROADCAST</td>
                  <td className="py-2 text-[#D4D4D8]">Submitted to NEAR RPC node; awaiting block inclusion</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-emerald-400">SETTLED</td>
                  <td className="py-2 text-[#D4D4D8]">Final block inclusion verified; accounting finalized</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-red-400">FAILED</td>
                  <td className="py-2 text-[#D4D4D8]">Transaction rejected onchain; reservation refunded</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-amber-400">AMBIGUOUS</td>
                  <td className="py-2 text-[#D4D4D8]">RPC timeout during broadcast; queued for reconciliation</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="broadcast-vs-finalized">
          <h2 className="text-xl font-bold text-white mb-3">Broadcast vs Finalized Reality</h2>
          <DocsCallout type="note" title="Blockchain Asynchrony">
            A broadcast transaction is NOT settled. Mandate keeps transactions in <code>AWAITING_FINALITY</code> until independent RPC state queries confirm block height and cryptographic execution status.
          </DocsCallout>
        </section>
      </div>
    ),
  },

  "autonomous-spending/pause-revoke": {
    slug: "autonomous-spending/pause-revoke",
    headings: [
      { id: "instant-killswitch", text: "Instant Kill-Switch", level: 2 },
      { id: "in-flight-handling", text: "Handling In-Flight Operations", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="instant-killswitch">
          <h2 className="text-xl font-bold text-white mb-3">Instant Kill-Switch</h2>
          <p>
            Users can immediately pause an agent or revoke a mandate with a single click. When revoked:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-[#D4D4D8]">
            <li>All active agent leases are revoked immediately.</li>
            <li>All queued approval requests are canceled.</li>
            <li>No further authorization envelopes will be issued by the ExecutionBoundaryService.</li>
          </ul>
        </section>

        <section id="in-flight-handling">
          <h2 className="text-xl font-bold text-white mb-3">Handling In-Flight Operations</h2>
          <p className="text-xs text-[#A1A1AA]">
            If a transaction was already broadcast to the NEAR blockchain before revocation occurred, Mandate does not falsely claim the onchain transaction was canceled. Instead, reconciliation monitors finality, records the outcome in the audit ledger, and refunds any uncommitted reservations.
          </p>
        </section>
      </div>
    ),
  },
};

