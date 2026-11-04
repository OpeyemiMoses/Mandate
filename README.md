# Mandate — Deterministic Spending Firewall for AI Agents on NEAR

> **Your rules. Our execution.** Give an AI agent a budget, not unlimited control.

Mandate is a policy-enforced spending boundary between autonomous AI agents and on-chain execution on the NEAR ecosystem.

---

## 1. The Problem & Product Thesis

AI agents can plan and execute complex multi-step workflows, but giving an LLM direct access to a wallet private key is a critical security failure—a single prompt injection or model hallucination can drain an entire treasury.

**Mandate separates planning from financial authority:**
1. **Explicit Human Mandate:** The user defines a total budget, per-transaction hard cap, human approval threshold, recipient allowlist, and expiration timestamp.
2. **Untrusted AI Planner:** Converts a plain-language goal into a structured payment proposal validated by strict Zod schemas. The AI never receives private keys or custody credentials.
3. **Deterministic Policy Engine (`src/lib/policy.ts`):** Evaluates every proposal in exact atomic `yoctoNEAR` (`10^24` per NEAR) using `BigInt` integer math—zero floating-point drift.
4. **OutLayer TEE Custody & NEAR Settlement:** Permitted payments are signed inside a Trusted Execution Environment (TEE) and settled on NEAR with verifiable transaction hashes and append-only audit logs.

---

## 2. Hackathon Tracks

- **Primary Track:** `security` (**AI Security & Defense**) — Spending limits, deterministic policy engines, allowlisted recipients, human approval gates, and fail-closed custody controls.
- **Secondary Track:** `agents` (**Agent Economy**) — Enabling AI agents to safely purchase research data, API access, and compute services within human-defined guardrails.

---

## 3. Reproducible Judge Verification ("Do X — See Y")

### Prerequisites
- Node.js `>= 20.x`
- `npm`

### Step 1: Run Deterministic Policy & Atomic `yoctoNEAR` Unit Tests
```bash
./node_modules/.bin/jiti tests/policy.test.ts
```
- **Do X:** Execute the unit test suite.
- **See Y:** `✅ All 9 deterministic policy and schema unit test suites passed.` verifying atomic `yoctoNEAR` conversion, autonomous execution pass (`<= 0.050 NEAR`), human approval gating (`> 0.050 NEAR`), allowlist rejection (`RECIPIENT_NOT_ALLOWED`), per-tx cap rejection (`PAYMENT_LIMIT_EXCEEDED`), budget exhaustion (`BUDGET_EXCEEDED`), replay protection (`DUPLICATE_PAYMENT`), and revocation blocking (`MANDATE_REVOKED`).

### Step 2: Start the Application
```bash
npm run dev
```
- **Do X:** Open `http://localhost:3000` in your browser.
- **See Y:** The Mandate Landing Page with the interactive **Deterministic Policy Simulator** (`/#simulator`).

### Step 3: Verify Interactive Policy Blocking & Approval Gating
1. **Do X:** On `http://localhost:3000/#simulator`, click preset **`3. Blocked: Allowlist (0.030 NEAR → rogue_actor.near)`**.
   - **See Y:** Immediate deterministic verdict **`BLOCKED · RECIPIENT_NOT_ALLOWED`** with a 9-rule breakdown showing `Recipient Allowlist` failed.
2. **Do X:** Navigate to **`/tasks`** and click **`+ New Task`**, choose preset **`1. Allowed (0.040 NEAR)`**, and click **`Plan & Evaluate Policy`**.
   - **See Y:** You are routed to the Task Details page showing **`Ready to Execute`** and all 9 policy checks passed. Click **`Execute Testnet Transfer via OutLayer TEE`** to settle the transfer and inspect the resulting transaction hash and audit trail in **`/activity`**.
3. **Do X:** Navigate to **`/approvals`**.
   - **See Y:** Inspect the queued `0.080 NEAR` payment request (`> 0.050 NEAR` threshold) and click **`Approve`** or **`Reject`** to verify human-in-the-loop settlement.
