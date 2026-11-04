export interface DocPageMeta {
  title: string;
  route: string;
  slug: string;
  description: string;
  sectionId: string;
  keywords: string[];
}

export interface DocSection {
  id: string;
  title: string;
  description: string;
  pages: DocPageMeta[];
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "getting-started",
    title: "Section A — Getting Started",
    description: "Foundational onboarding, mental model, wallet connections, and initial setup.",
    pages: [
      {
        slug: "introduction",
        route: "/docs/introduction",
        title: "Introduction to Mandate",
        description: "What Mandate is, why autonomous agents need controlled financial authority, and core architecture.",
        sectionId: "getting-started",
        keywords: ["introduction", "architecture", "overview", "what is mandate", "near", "outlayer"],
      },
      {
        slug: "quickstart",
        route: "/docs/quickstart",
        title: "Quickstart Guide",
        description: "Step-by-step walkthrough from wallet connection to your first executed objective.",
        sectionId: "getting-started",
        keywords: ["quickstart", "getting started", "guide", "first objective", "tutorial"],
      },
      {
        slug: "getting-started/account-wallet",
        route: "/docs/getting-started/account-wallet",
        title: "Account and Wallet Setup",
        description: "Connecting personal NEAR wallets via Near Connect, session identity, and personal vs agent wallets.",
        sectionId: "getting-started",
        keywords: ["wallet", "near connect", "intear", "meteor", "ledger", "setup", "funding"],
      },
      {
        slug: "getting-started/dashboard",
        route: "/docs/getting-started/dashboard",
        title: "Understanding the Dashboard",
        description: "Tour of customer-facing dashboard sections: treasury overview, activity, approvals, and metrics.",
        sectionId: "getting-started",
        keywords: ["dashboard", "overview", "ui", "navigation", "approvals", "activity"],
      },
    ],
  },
  {
    id: "core-concepts",
    title: "Section B — Core Concepts",
    description: "Deep dive into agents, mandates, objectives, DAG workflows, and external tools.",
    pages: [
      {
        slug: "core-concepts/agents",
        route: "/docs/core-concepts/agents",
        title: "Understanding Agents",
        description: "Agent identities, capability registry, task delegation, and execution boundaries.",
        sectionId: "core-concepts",
        keywords: ["agents", "capabilities", "delegation", "swarms", "identity"],
      },
      {
        slug: "core-concepts/mandates",
        route: "/docs/core-concepts/mandates",
        title: "Understanding Mandates",
        description: "The core primitive of financial authority: authorized budgets, per-tx limits, and lifecycle states.",
        sectionId: "core-concepts",
        keywords: ["mandates", "budget", "limits", "policy", "revocation", "spending authority"],
      },
      {
        slug: "core-concepts/objectives",
        route: "/docs/core-concepts/objectives",
        title: "Understanding Objectives",
        description: "Translating natural language intent into structured DAG plans linked to authorized mandates.",
        sectionId: "core-concepts",
        keywords: ["objectives", "intent", "planning", "success criteria", "dag"],
      },
      {
        slug: "core-concepts/tasks-workflows",
        route: "/docs/core-concepts/tasks-workflows",
        title: "Tasks and Workflows",
        description: "DAG task scheduling, dependency resolution, agent leases, retries, and verification.",
        sectionId: "core-concepts",
        keywords: ["tasks", "workflows", "dag", "leases", "dependencies", "scheduling"],
      },
      {
        slug: "core-concepts/tools-integrations",
        route: "/docs/core-concepts/tools-integrations",
        title: "Tools and Integrations",
        description: "How agents discover tools, REST/MCP integration boundaries, and credential isolation.",
        sectionId: "core-concepts",
        keywords: ["tools", "integrations", "mcp", "credentials", "rest api"],
      },
    ],
  },
  {
    id: "autonomous-spending",
    title: "Section C — Autonomous Spending",
    description: "Deterministic financial authorization, approval rules, accounting, and lifecycle states.",
    pages: [
      {
        slug: "autonomous-spending",
        route: "/docs/autonomous-spending",
        title: "How Autonomous Spending Works",
        description: "End-to-end authorization pipeline from proposal to OutLayer TEE signing and NEAR settlement.",
        sectionId: "autonomous-spending",
        keywords: ["spending", "financial authorization", "settlement", "yoctoNEAR", "near"],
      },
      {
        slug: "autonomous-spending/approval-rules",
        route: "/docs/autonomous-spending/approval-rules",
        title: "Spending Rules & Approval Requirements",
        description: "Deterministic policy verdicts: ALLOW, ALLOW_WITH_LIMITS, REQUIRE_APPROVAL, ESCALATE, DENY.",
        sectionId: "autonomous-spending",
        keywords: ["rules", "approvals", "policy outcomes", "thresholds", "escalation"],
      },
      {
        slug: "autonomous-spending/budget-management",
        route: "/docs/autonomous-spending/budget-management",
        title: "Budget Management & Reservations",
        description: "Mathematical accounting: spent vs reserved vs available budget, and concurrent spending defense.",
        sectionId: "autonomous-spending",
        keywords: ["budget", "reservations", "accounting", "concurrency", "settlement"],
      },
      {
        slug: "autonomous-spending/transaction-lifecycle",
        route: "/docs/autonomous-spending/transaction-lifecycle",
        title: "Transaction Lifecycle",
        description: "Authorized, Reserved, Executing, Broadcast, Finalized, Settled, and Ambiguous states.",
        sectionId: "autonomous-spending",
        keywords: ["transactions", "lifecycle", "finality", "broadcast", "settled"],
      },
      {
        slug: "autonomous-spending/pause-revoke",
        route: "/docs/autonomous-spending/pause-revoke",
        title: "Pausing & Revoking Authority",
        description: "Emergency kill-switches, handling in-flight operations, and safe resumption.",
        sectionId: "autonomous-spending",
        keywords: ["pause", "revoke", "kill switch", "emergency", "in flight"],
      },
    ],
  },
  {
    id: "orchestration",
    title: "Section D — Objective Execution & Orchestration",
    description: "Autonomous planning, swarms, anti-self-certification, and crash recovery.",
    pages: [
      {
        slug: "orchestration/objective-planning",
        route: "/docs/orchestration/objective-planning",
        title: "Objective Planning & Plan Hashing",
        description: "Converting goals into cryptographically hashed DAGs requiring explicit user review.",
        sectionId: "orchestration",
        keywords: ["planning", "plan hash", "dag", "cycles", "approval"],
      },
      {
        slug: "orchestration/multi-agent",
        route: "/docs/orchestration/multi-agent",
        title: "Multi-Agent Orchestration",
        description: "Swarm coordination, agent leases, capability matching, and non-transferable authority.",
        sectionId: "orchestration",
        keywords: ["multi-agent", "swarms", "coordination", "leases", "handoffs"],
      },
      {
        slug: "orchestration/verification",
        route: "/docs/orchestration/verification",
        title: "Task Verification & Objective Completion",
        description: "Three-tier verification hierarchy and anti-self-certification proofs for objective completion.",
        sectionId: "orchestration",
        keywords: ["verification", "anti-self-certification", "evidence", "proofs", "completion"],
      },
      {
        slug: "orchestration/recovery",
        route: "/docs/orchestration/recovery",
        title: "Recovery & Long-Running Objectives",
        description: "Durable PostgreSQL checkpoints, worker crash resilience, and safe lease reclamation.",
        sectionId: "orchestration",
        keywords: ["recovery", "checkpoints", "worker restart", "leases", "resilience"],
      },
    ],
  },
  {
    id: "security",
    title: "Section E — Security & Trust",
    description: "Threat model, Intel SGX TEE execution, hardware key isolation, and cryptographic audit trails.",
    pages: [
      {
        slug: "security/architecture",
        route: "/docs/security/architecture",
        title: "Security Architecture",
        description: "High-level security controls, tenant isolation, fail-closed boundaries, and nonce enforcement.",
        sectionId: "security",
        keywords: ["security", "architecture", "isolation", "nonce", "threat model"],
      },
      {
        slug: "security/outlayer-tee",
        route: "/docs/security/outlayer-tee",
        title: "OutLayer & Trusted Execution (TEE)",
        description: "Intel SGX protected enclaves, signed execution receipts, and hardware attestation realities.",
        sectionId: "security",
        keywords: ["outlayer", "tee", "intel sgx", "enclave", "attestation", "hardware"],
      },
      {
        slug: "security/wallet-security",
        route: "/docs/security/wallet-security",
        title: "Wallet & Key Security",
        description: "Separation between personal wallets and dedicated TEE agent wallets; zero private key leaks.",
        sectionId: "security",
        keywords: ["keys", "private keys", "wallet custody", "seed phrase", "tee custody"],
      },
      {
        slug: "security/policies-governance",
        route: "/docs/security/policies-governance",
        title: "Policies & Governance",
        description: "Deterministic policy engine hierarchy: system bounds override mandate rules override agent proposals.",
        sectionId: "security",
        keywords: ["governance", "policy hierarchy", "fail-closed", "risk tiers"],
      },
      {
        slug: "security/audit-verification",
        route: "/docs/security/audit-verification",
        title: "Audit Trail & Verification",
        description: "Append-only SHA-256 hash chained event logs, evidence fingerprints, and reconciliation.",
        sectionId: "security",
        keywords: ["audit", "hash chain", "sha-256", "reconciliation", "tamper evident"],
      },
    ],
  },
  {
    id: "integrations",
    title: "Section F — Networks & Integrations",
    description: "NEAR Protocol connectivity, OutLayer TEE provider, Model Context Protocol (MCP), and tools.",
    pages: [
      {
        slug: "integrations/near",
        route: "/docs/integrations/near",
        title: "NEAR Protocol Integration",
        description: "NEAR Testnet RPC, 64-char implicit accounts, yoctoNEAR precision, and finality verification.",
        sectionId: "integrations",
        keywords: ["near protocol", "testnet", "rpc", "transfers", "accounts"],
      },
      {
        slug: "integrations/outlayer",
        route: "/docs/integrations/outlayer",
        title: "OutLayer Integration",
        description: "OutLayer TEE service lifecycle, authorization envelopes, and provider availability tracking.",
        sectionId: "integrations",
        keywords: ["outlayer", "provider", "envelopes", "receipts"],
      },
      {
        slug: "integrations/tools-mcp",
        route: "/docs/integrations/tools-mcp",
        title: "External Tools & MCP Architecture",
        description: "Model Context Protocol tools, REST API integration, permission scopes, and credential encryption.",
        sectionId: "integrations",
        keywords: ["mcp", "tools", "integrations", "rest", "scopes"],
      },
      {
        slug: "integrations/troubleshooting",
        route: "/docs/integrations/troubleshooting",
        title: "Integration Status & Troubleshooting",
        description: "Health classifications (CONFIGURED, CONNECTED, AUTHENTICATED, DEGRADED) and error recovery.",
        sectionId: "integrations",
        keywords: ["troubleshooting", "integration status", "degraded", "reconnect"],
      },
    ],
  },
  {
    id: "developers",
    title: "Section G — Developer Documentation",
    description: "API reference, authentication, webhooks, and code examples for building on Mandate.",
    pages: [
      {
        slug: "developers/overview",
        route: "/docs/developers/overview",
        title: "Developer Overview",
        description: "Architectural overview for developers extending Mandate or integrating external applications.",
        sectionId: "developers",
        keywords: ["developers", "api", "architecture", "sdk", "building"],
      },
      {
        slug: "api-reference",
        route: "/docs/api-reference",
        title: "REST API Reference",
        description: "Complete endpoint reference for Agents, Mandates, Objectives, Tasks, and Approvals.",
        sectionId: "developers",
        keywords: ["api", "endpoints", "rest", "reference", "curl"],
      },
      {
        slug: "developers/authentication",
        route: "/docs/developers/authentication",
        title: "Authentication & Authorization",
        description: "Session identity, tenant headers, wallet signature verification, and security bounds.",
        sectionId: "developers",
        keywords: ["authentication", "session", "headers", "siwe", "nep-413"],
      },
      {
        slug: "developers/webhooks-events",
        route: "/docs/developers/webhooks-events",
        title: "Webhooks & Event System",
        description: "Event notifications, status changes, delivery guarantees, and webhook architectures.",
        sectionId: "developers",
        keywords: ["webhooks", "events", "notifications", "pubsub"],
      },
      {
        slug: "developers/examples",
        route: "/docs/developers/examples",
        title: "Integration Examples",
        description: "Practical TypeScript, Node.js, and cURL examples for orchestrating objectives and managing mandates.",
        sectionId: "developers",
        keywords: ["examples", "typescript", "curl", "snippets", "recipes"],
      },
    ],
  },
  {
    id: "help",
    title: "Section H — Help & Reference",
    description: "Frequently asked questions, system glossary, operational troubleshooting, and network status.",
    pages: [
      {
        slug: "faq",
        route: "/docs/faq",
        title: "Frequently Asked Questions",
        description: "Clear answers to the 22 most common questions about autonomous spending, keys, and limits.",
        sectionId: "help",
        keywords: ["faq", "frequently asked questions", "common questions", "answers"],
      },
      {
        slug: "glossary",
        route: "/docs/glossary",
        title: "System Glossary",
        description: "Definitions of all 25 core Mandate terms: Mandate, Lease, DAG, TEE, YoctoNEAR, and Nonce.",
        sectionId: "help",
        keywords: ["glossary", "terms", "definitions", "vocabulary"],
      },
      {
        slug: "troubleshooting",
        route: "/docs/troubleshooting",
        title: "Troubleshooting Guide",
        description: "Resolving common operational issues: budget exhaustion, pending approvals, and RPC timeouts.",
        sectionId: "help",
        keywords: ["troubleshooting", "errors", "fixes", "debugging", "rpc timeout"],
      },
      {
        slug: "availability",
        route: "/docs/availability",
        title: "Current Availability & Limitations",
        description: "Real-world release status: NEAR Testnet support, disabled Mainnet, and experimental features.",
        sectionId: "help",
        keywords: ["availability", "limitations", "testnet", "mainnet", "roadmap", "release status"],
      },
    ],
  },
];

// Helper to flatten all pages
export const ALL_DOC_PAGES: DocPageMeta[] = DOC_SECTIONS.flatMap((s) => s.pages);

// Helper to lookup a page by its route or slug
export function getDocPageBySlug(slug: string | string[]): DocPageMeta | undefined {
  const normalizedSlug = Array.isArray(slug) ? slug.join("/") : slug;
  return ALL_DOC_PAGES.find(
    (p) => p.slug === normalizedSlug || p.route === `/docs/${normalizedSlug}`
  );
}

// Helper to get previous and next page
export function getPrevNextPages(currentSlug: string): {
  prev: DocPageMeta | null;
  next: DocPageMeta | null;
} {
  const index = ALL_DOC_PAGES.findIndex((p) => p.slug === currentSlug);
  if (index === -1) return { prev: null, next: null };
  return {
    prev: index > 0 ? ALL_DOC_PAGES[index - 1] : null,
    next: index < ALL_DOC_PAGES.length - 1 ? ALL_DOC_PAGES[index + 1] : null,
  };
}

