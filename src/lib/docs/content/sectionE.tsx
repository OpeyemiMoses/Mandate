import React from "react";
import Link from "next/link";
import { DocsCallout } from "@/components/docs/DocsCallout";
import { CodeBlock } from "@/components/docs/CodeBlock";
import {
  MandateArchitectureDiagram,
  FinancialAuthorityModelDiagram,
  WalletSeparationDiagram,
} from "@/components/docs/DocsDiagrams";
import type { DocPageContent } from "./sectionA";

export const SECTION_E_PAGES: Record<string, DocPageContent> = {
  "security/architecture": {
    slug: "security/architecture",
    headings: [
      { id: "threat-model", text: "Security Threat Model", level: 2 },
      { id: "defense-in-depth", text: "Defense-in-Depth Architecture", level: 2 },
      { id: "isolation-layers", text: "The Five Isolation Boundaries", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="threat-model">
          <h2 className="text-xl font-bold text-white mb-3">Security Threat Model</h2>
          <p>
            Mandate is engineered under the assumption that <strong>any autonomous agent, LLM prompt, background worker, or external tool can behave maliciously or become compromised</strong>. The platform protects user treasury assets through structural defense-in-depth.
          </p>
        </section>

        <section id="defense-in-depth">
          <h2 className="text-xl font-bold text-white mb-3">Defense-in-Depth Architecture</h2>
          <MandateArchitectureDiagram />
        </section>

        <section id="isolation-layers">
          <h2 className="text-xl font-bold text-white mb-3">The Five Isolation Boundaries</h2>
          <ol className="list-decimal pl-5 mt-2 space-y-2 text-xs text-[#D4D4D8]">
            <li><strong>Tenant Isolation:</strong> Every mandate, agent, and objective is cryptographically bound to the authenticated user session.</li>
            <li><strong>Policy Boundary:</strong> Hard ceilings in yoctoNEAR cannot be expanded by agent prompts.</li>
            <li><strong>Execution Boundary:</strong> Monotonic nonces and SHA-256 authorization envelopes prevent transaction replay.</li>
            <li><strong>Hardware Enclave (TEE):</strong> OutLayer Intel SGX isolates private signing keys from host memory and OS.</li>
            <li><strong>Onchain Finality:</strong> Independent NEAR RPC state verification guards against forged receipts.</li>
          </ol>
        </section>
      </div>
    ),
  },

  "security/outlayer-tee": {
    slug: "security/outlayer-tee",
    headings: [
      { id: "what-is-outlayer", text: "What is OutLayer?", level: 2 },
      { id: "intel-sgx", text: "Intel SGX Enclave Guarantees", level: 2 },
      { id: "what-is-not-guaranteed", text: "What TEE Does and Does Not Guarantee", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="what-is-outlayer">
          <h2 className="text-xl font-bold text-white mb-3">What is OutLayer?</h2>
          <p>
            <strong>OutLayer</strong> is a decentralized confidential computing network providing hardware-protected Trusted Execution Environments (TEEs) powered by Intel SGX.
          </p>
          <p className="mt-2 text-xs text-[#A1A1AA]">
            In Mandate, OutLayer hosts dedicated custody enclaves where agent signing keys are generated and held. The host operating system, hypervisor, cloud provider, and Mandate backend servers cannot extract these keys from enclave memory.
          </p>
        </section>

        <section id="intel-sgx">
          <h2 className="text-xl font-bold text-white mb-3">Intel SGX Enclave Guarantees</h2>
          <p>
            When Mandate dispatches an authorized transfer envelope, the enclave:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-[#D4D4D8]">
            <li>Verifies the envelope signature against Mandate&apos;s authoritative execution key.</li>
            <li>Checks that the recipient and amount match the authorized envelope.</li>
            <li>Signs the NEAR transaction payload inside the enclave.</li>
            <li>Returns a signed execution receipt and the broadcastable transaction bytes.</li>
          </ul>
        </section>

        <section id="what-is-not-guaranteed">
          <h2 className="text-xl font-bold text-white mb-3">What TEE Does and Does Not Guarantee</h2>
          <DocsCallout type="note" title="Managed Cloud TEE Architecture & Attestation">
            OutLayer operates as a managed confidential computing cloud service. Agent execution wallets are provisioned and hosted inside OutLayer&apos;s managed TEE enclave infrastructure. Hardware attestation quotes (Intel SGX DCAP / TDX quotes) are verified server-side by OutLayer&apos;s internal verification infrastructure. Mandate communicates with OutLayer over authenticated, TLS-encrypted REST endpoints using scoped worker API keys (<code>wk_*</code>). Raw hardware attestation bytes are not exposed directly to end-user clients over the public REST API.
          </DocsCallout>
          <div className="mt-4">
            <DocsCallout type="warning" title="Technical Transparency">
              While Intel SGX provides memory encryption and isolated execution, it does not guarantee network availability or RPC node uptime. Mandate layers retry policies, fallback RPC endpoints, and reconciliation watchers on top of OutLayer.
            </DocsCallout>
          </div>
        </section>
      </div>
    ),
  },

  "security/wallet-security": {
    slug: "security/wallet-security",
    headings: [
      { id: "key-separation", text: "Strict Key Separation", level: 2 },
      { id: "custody-diagram", text: "Custody Architecture", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="key-separation">
          <h2 className="text-xl font-bold text-white mb-3">Strict Key Separation</h2>
          <p>
            Personal wallet private keys never touch Mandate. When funding an agent, the user signs a standard NEAR transfer to the agent&apos;s 64-character implicit account. The agent wallet is an isolated sub-account whose keys exist solely within OutLayer TEE.
          </p>
        </section>

        <section id="custody-diagram">
          <h2 className="text-xl font-bold text-white mb-3">Custody Architecture</h2>
          <WalletSeparationDiagram />
        </section>
      </div>
    ),
  },

  "security/policies-governance": {
    slug: "security/policies-governance",
    headings: [
      { id: "policy-hierarchy", text: "Deterministic Policy Hierarchy", level: 2 },
      { id: "fail-closed", text: "Fail-Closed System Invariant", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="policy-hierarchy">
          <h2 className="text-xl font-bold text-white mb-3">Deterministic Policy Hierarchy</h2>
          <p>
            Mandate enforces a strict three-tier policy hierarchy:
          </p>
          <ol className="list-decimal pl-5 mt-2 space-y-1.5 text-xs text-[#D4D4D8]">
            <li><strong>Tier 1 — System Invariants:</strong> Absolute limits (e.g. maximum batch size, prohibited networks). Cannot be bypassed by any user.</li>
            <li><strong>Tier 2 — Mandate Rules:</strong> Authorized budget, per-tx limit, approval thresholds, recipient allowlists. Signed by user.</li>
            <li><strong>Tier 3 — Objective Scope:</strong> Sub-allocations for specific task DAGs within the mandate.</li>
          </ol>
        </section>

        <section id="fail-closed">
          <h2 className="text-xl font-bold text-white mb-3">Fail-Closed System Invariant</h2>
          <DocsCallout type="warning" title="No Exceptions">
            If any policy evaluation experiences a database conflict, ambiguous parameter, or network timeout, the request is automatically DENIED. Funds remain safe in custody.
          </DocsCallout>
        </section>
      </div>
    ),
  },

  "security/audit-verification": {
    slug: "security/audit-verification",
    headings: [
      { id: "append-only-audit", text: "Append-Only Hash-Chained Audit Trail", level: 2 },
      { id: "tamper-evidence", text: "Cryptographic Tamper-Evidence", level: 2 },
    ],
    content: (
      <div className="space-y-6">
        <section id="append-only-audit">
          <h2 className="text-xl font-bold text-white mb-3">Append-Only Hash-Chained Audit Trail</h2>
          <p>
            Every financial event in Mandate—proposal, policy evaluation, budget reservation, human approval signature, OutLayer execution receipt, and NEAR block hash—is written to an append-only audit ledger in PostgreSQL.
          </p>
          <CodeBlock
            language="bash"
            title="Audit Chain Hashing"
            code={`entry_hash = SHA256(previous_entry_hash + timestamp + tenant_id + event_type + payload)`}
          />
        </section>

        <section id="tamper-evidence">
          <h2 className="text-xl font-bold text-white mb-3">Cryptographic Tamper-Evidence</h2>
          <p className="text-xs text-[#A1A1AA]">
            Because each audit entry references the SHA-256 hash of its predecessor, any retroactive database modification or record deletion immediately breaks the cryptographic hash chain and flags a security violation.
          </p>
        </section>
      </div>
    ),
  },
};

