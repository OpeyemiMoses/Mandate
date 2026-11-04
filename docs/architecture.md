# Mandate — Architecture & Trust Boundaries

## Overview

Mandate is a deterministic spending firewall and execution control layer between AI agents and on-chain settlement on NEAR Protocol.

```text
┌───────────────────────────────────────────────────────────┐
│ Browser / Web UI (Next.js App Router)                     │
│ Landing · Dashboard · Mandates · Tasks · Approvals · Audit│
└─────────────────────────────┬─────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────┐
│ Task Orchestration & AI Planner                           │
│ Untrusted input generator · Validated by strict Zod schema│
│ Never receives signing keys or custody API credentials    │
└─────────────────────────────┬─────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────┐
│ Deterministic Policy Engine (`src/lib/policy.ts`)         │
│ Atomic yoctoNEAR integer arithmetic · Allowlist check     │
│ Per-tx limit · Budget reservation · Approval threshold    │
│ Idempotency guard · Fail-closed verification              │
└─────────────────────────────┬─────────────────────────────┘
                              │ allowed + approvals satisfied
┌─────────────────────────────▼─────────────────────────────┐
│ OutLayer Agent Custody Adapter (`src/lib/outlayer.ts`)    │
│ Provider-side policy verification · TEE signing           │
└─────────────────────────────┬─────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────┐
│ NEAR Testnet / Mainnet                                    │
│ On-chain settlement · Verifiable transaction hash         │
└─────────────────────────────┬─────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────┐
│ Audit & Reconciliation Layer                              │
│ Append-only event stream · Needs-review ambiguity handler │
└───────────────────────────────────────────────────────────┘
```

## Trust Boundaries

1. **Browser (Untrusted View Layer):** Renders state, collects human mandates and approvals. Never holds `OUTLAYER_API_KEY` or private keys.
2. **AI Planner (Untrusted Proposal Generator):** Converts plain-language task goals into structured JSON payment proposals. Validated strictly via Zod before inspection.
3. **Deterministic Policy Engine (Authoritative Gatekeeper):** Evaluates proposals using pure `BigInt` atomic `yoctoNEAR` math (`1 NEAR = 10^24 yoctoNEAR`). No floating-point math is ever used for policy decisions.
4. **OutLayer Agent Custody (TEE Execution Boundary):** Enforces provider-side spending constraints and signs native NEAR transactions inside a Trusted Execution Environment.
5. **NEAR Blockchain (Settlement Truth):** Provides final verifiable transaction hashes inspected on NearBlocks.

