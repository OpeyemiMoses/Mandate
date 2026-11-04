# MANDATE — PUBLIC DOCUMENTATION COMPLETION REPORT
## Complete Documentation Website, User Guides, Architecture & Developer Reference

**Project:** Mandate  
**Release:** Public Documentation Centre v1.0  
**Date:** November 2026  
**Status:** Certified & Deployed  
**Network Scope:** NEAR Testnet ONLY · Intel SGX OutLayer TEE  
**Core Principle:** AI proposes. Mandate enforces. The user controls. OutLayer executes.

---

## 1. Executive Summary

Mandate has successfully designed, implemented, verified, and deployed a comprehensive, public-facing documentation centre under the `/docs` route. 

All **36 required technical documentation pages** across **8 core architectural sections** have been authored with complete, high-fidelity explanations based strictly on the verified production codebase (Milestones 1 through 13.9). There are zero placeholder pages, zero synthetic or fabricated endpoints, and all technical limitations (including disabled Mainnet and experimental features) are explicitly and transparently stated.

In addition, the landing page and app shell have been upgraded with:
1. **Fixed Top Navbar** with backdrop blur and responsive layout.
2. **Auto-Switching Virtual Spending Cards** that rotate every 4.2 seconds while retaining 1-click flip on card click, with the redundant bottom switcher controls removed.
3. **Smooth Rise-In and Pop Animations** across all pages, cards, and buttons.
4. **Light Mode & Theme Toggle** with sun/moon icon controls in the top navigation bar and at the bottom of the left sidebar (sidenav) upon entering the app, persisted in `localStorage`.

---

## 2. Documentation Architecture & Directory

The documentation system is built directly within the Next.js 14 App Router using a maintainable, high-performance static rendering architecture (`/docs/[...slug]` with `generateStaticParams()`).

### Section Breakdown & Routes

| Section | Route Range | Pages | Core Topics |
|---|---|---|---|
| **Section A: Getting Started** | `/docs/introduction` → `/docs/getting-started/dashboard` | 4 | What Mandate is, why agents need controlled authority, 5-minute quickstart, Near Connect wallet setup, dashboard tour. |
| **Section B: Core Concepts** | `/docs/core-concepts/agents` → `/docs/core-concepts/tools-integrations` | 5 | Agents vs financial authority, mandates, yoctoNEAR budgets, objectives, DAG scheduling, MCP tools. |
| **Section C: Autonomous Spending** | `/docs/autonomous-spending` → `/docs/autonomous-spending/pause-revoke` | 5 | Two-phase budget reservations, deterministic policy verdicts, approval thresholds, transaction lifecycle, emergency revocation. |
| **Section D: Objective Orchestration** | `/docs/orchestration/objective-planning` → `/docs/orchestration/recovery` | 4 | DAG plan generation, SHA-256 plan hashing, multi-agent swarms, anti-self-certification, durable crash recovery. |
| **Section E: Security & Trust** | `/docs/security/architecture` → `/docs/security/audit-verification` | 5 | Defense-in-depth threat model, Intel SGX TEE isolation, personal vs agent wallet custody, hash-chained audit trails. |
| **Section F: Networks & Integrations** | `/docs/integrations/near` → `/docs/integrations/troubleshooting` | 4 | NEAR Protocol integration, OutLayer TEE enclave lifecycle, MCP tool schemas, health status classifications. |
| **Section G: Developer Documentation** | `/docs/developers/overview` → `/docs/developers/examples` | 5 | Core service architecture, REST API reference, NEP-413 message signing, event webhooks, TypeScript SDK recipes. |
| **Section H: Help & Reference** | `/docs/faq` → `/docs/availability` | 4 | 22 comprehensive FAQs, 25 system glossary terms, 16 troubleshooting playbooks, current availability & limitations. |

**Total Published Pages:** 36 individual guides + 1 documentation hub (`/docs`) = **37 pages**.

---

## 3. UI, Navigation & Responsive Layout

The documentation interface provides a clean, 3-column layout adhering to Mandate's dark-first luxury aesthetic:

1. **Left Sidebar (Desktop & Tablet):**
   - Documentation overview quicklink.
   - Expandable/collapsible sections with state memory.
   - Active page indicator with subtle red accent line and active typography.
   - Version metadata and network status indicator.
2. **Mobile Navigation Drawer:**
   - Accessible slide-out navigation with quick touch targets for all 36 guides.
3. **Center Main Content:**
   - Breadcrumb navigation (`Docs > Section > Page`).
   - Page title, detailed summary, and Last Verified timestamp.
   - Structured typography, comparative data tables, and syntax-highlighted copyable code blocks.
   - Custom alert callouts: `Note`, `Tip`, `Important`, and `Warning`.
   - Previous and Next page cards for smooth reader progression.
4. **Right Sidebar ("On this page"):**
   - Live scrollspy table of contents tracking active heading in viewport.
   - 1-click &ldquo;Copy page link&rdquo; button with feedback.
   - &ldquo;Back to top&rdquo; smooth scroll control.

---

## 4. Search Implementation

A high-speed client-side search dialog (`DocsSearchModal.tsx`) is triggered via:
- The top search bar input.
- Global keyboard shortcut: **`⌘K`** (or `Ctrl+K`).
- Quick shortcut: **`/`** (when not focused in an input).

The search indexes all 36 pages across:
- Page titles.
- Summaries and descriptions.
- Section categorizations.
- 150+ indexed keywords (e.g. *mandate*, *outlayer*, *budget*, *tee*, *yoctoNEAR*, *intel sgx*, *nonces*, *settlement*, *api*).

---

## 5. Architectural Diagrams Created

Five responsive, dark-first SVG diagrams are embedded in the documentation:

1. **Diagram 1 — End-to-End Execution Architecture:** Visualizes the journey from User → Mandate Application → AI Agent Swarm → Universal Policy Engine → ExecutionBoundaryService → OutLayer Intel SGX TEE → NEAR Protocol Testnet, alongside PostgreSQL durable checkpoints and audit ledgers.
2. **Diagram 2 — Autonomous Spending Pipeline:** Visualizes the six-step financial pipeline (Mandate → Proposal → Policy Evaluation with ALLOW/REQUIRE_APPROVAL/DENY branches → Reservation → OutLayer TEE Signing → Settlement).
3. **Diagram 3 — Multi-Agent Objective Lifecycle:** Visualizes the DAG workflow from Natural Language Goal → Structured Plan → User Plan Approval → Capability Matching → Task Execution → Independent Verification → Completion.
4. **Diagram 4 — Immutable Financial Authority Hierarchy:** Explains the hierarchy from Human User (Root of Authority) → Policy Bounds → Objective Scope → Execution Boundary → Autonomous Agent (Proposer Only, Zero Key Custody).
5. **Diagram 5 — Personal Wallet vs Dedicated Agent Wallet:** Compares the user&apos;s personal signing wallet against the agent&apos;s 64-character implicit account generated inside OutLayer TEE.

---

## 6. Landing Page & Product Enhancements Verified

1. **Fixed Top Navbar:** `header` in `src/app/page.tsx` is now `fixed top-0 left-0 right-0 z-50 bg-[#0B0B0B]/85 backdrop-blur-md border-b border-white/[0.06]`, with hero top padding adjusted to `pt-28 md:pt-36`.
2. **Docs Links Connected:** Top navigation &ldquo;Docs&rdquo; link and footer &ldquo;Docs&rdquo; link now route directly to `/docs`.
3. **Card Switcher Cleaned:** The redundant bottom button bar (`[DeFi Research Agent]`, `[Dev Tools]`, `[NEAR AI Compute]`) was removed. Replaced with auto-cycling interval (`setInterval` 4.2s) in `StackedVirtualCards.tsx`, with card-click flipping active and an indicator.
4. **Light Mode & Theme Toggle:**
   - `ThemeContext.tsx` and `ThemeToggle.tsx` created.
   - Top navbar includes the Sun/Moon toggle.
   - Sidenav (bottom of left sidebar in `AppShell`) includes the Appearance toggle.
   - Light mode palette configured in `globals.css` and `tailwind.config.ts`.
5. **Rise-In & Pop Animations:**
   - Keyframes `@keyframes riseIn` and `@keyframes popIn` added.
   - Utility classes `.animate-rise`, `.animate-pop`, `.hover-pop`, `.btn-pop` integrated across pages, cards, and buttons.

---

## 7. Verification & Build Results

### TypeScript Verification
```bash
npx tsc --noEmit
# Exit Code: 0 (Zero errors)
```

### Next.js Production Build
```bash
NEXT_IGNORE_INCORRECT_LOCKFILE=1 ./node_modules/.bin/next build
# Result: Compiled successfully
# Generating static pages: (109/109)
# All 36 /docs/[...slug] paths prerendered statically
# First Load JS shared by all: 90 kB
# Exit Code: 0
```

### Route Integrity Test (All 36 Routes)
```bash
node -e "...checks all 36 routes..."
# Output: Verified 36/36 documentation pages returned HTTP 200!
```

---

## 8. Remaining Limitations & Explicit Labels

In compliance with task guidelines:
1. **NEAR Mainnet:** Explicitly documented as **DISABLED / PLANNED**. No claims of live Mainnet support are made.
2. **Hardware Attestation:** Clearly distinguishes between signed execution receipts and full hardware enclave remote attestation verification.
3. **OutLayer Availability:** Explicitly documents downtime handling and fail-closed behavior if enclave providers become unreachable.
4. **Audit Storage:** Accurately documents that the audit trail is stored in PostgreSQL with SHA-256 hash chaining, rather than falsely claiming onchain public ledger storage.

---

## 9. Conclusion

The Mandate Public Documentation Centre is complete, verified, responsive, and ready for public review. All acceptance criteria have been fully satisfied.

