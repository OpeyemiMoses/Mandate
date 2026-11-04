# Mandate

> Deterministic spending firewall and policy-enforced autonomous execution runtime for AI agents on NEAR Protocol & OutLayer Intel SGX TEE.

**Core Philosophy:** *AI proposes. Mandate enforces. The user controls. OutLayer executes.*

---

## Note for Judges: How to Test

Mandate is designed to give AI agents financial authority without ever giving them custody of private keys or unlimited spending rights.

Judges can test the platform either locally or via the deployed public web interface. Follow the step-by-step guide below to observe both autonomous execution and deterministic policy rejection.

### Live Testnet Verification Reference
- **Verified On-Chain Transaction Hash:** [`F5AFpgRzngjJnsqE6QHtEMJYXnLhPMbwKtVG9pHXyACC`](https://testnet.nearblocks.io/txns/F5AFpgRzngjJnsqE6QHtEMJYXnLhPMbwKtVG9pHXyACC)
- **Network:** NEAR Testnet
- **Execution Infrastructure:** OutLayer Managed Cloud TEE (Intel SGX secure enclave)
- **Settlement:** 0.05 NEAR transferred from dedicated agent TEE custody vault to allowlisted recipient with final execution outcome.

---

### Step-by-Step Testing Walkthrough

```text
  [1. Connect Wallet] ──> [2. Create Agent] ──> [3. Define Mandate]
           │
           ▼
  [4. 1-Click Fund TEE Vault] ──> [5. Run Autonomous Objective]
           │
           ▼
  [6. Negative Testing (Policy Firewall)] ──> [7. Inspect Explorer & Audit Ledger]
```

#### Step 1: Connect NEAR Testnet Wallet
1. Navigate to the web application.
2. Click **Connect NEAR Wallet** in the top navigation bar.
3. Select your preferred NEAR wallet (MyNearWallet, Meteor, Here Wallet, Sender, or Bitte).
4. Once connected, your account is automatically authenticated via cryptographic session tokens with isolated tenant scoping.

#### Step 2: Create a Dedicated AI Agent
1. Navigate to **Agents** (`/agents`) from the sidebar.
2. Click **+ New Agent**.
3. Provide a name (e.g., `DeFi Research Agent`) and assign a specialized role (`Procurement`, `Treasury`, `Auditor`, or `Operations`).
4. Mandate automatically provisions a dedicated **OutLayer TEE Custody Vault** address for this agent.

#### Step 3: Define a Financial Mandate
1. Navigate to **Mandates** (`/mandates`) and click **+ Create Mandate**.
2. Configure your financial boundaries:
   - **Total Budget:** e.g., `5.0 NEAR`
   - **Per-Transaction Ceiling:** e.g., `1.0 NEAR`
   - **Human Approval Threshold:** e.g., `0.5 NEAR` (transactions $\le$ 0.5 NEAR execute autonomously; transactions $>$ 0.5 NEAR require human sign-off)
   - **Recipient Allowlist:** Specify allowed NEAR Testnet accounts (e.g., `treasury.testnet`, `data-provider.testnet`).
   - **Agent Binding:** Select the agent created in Step 2.
3. Submit the mandate.

#### Step 4: 1-Click Agent TEE Custody Funding
1. Navigate to **Wallets** (`/wallets`) or click **Fund Agent** from the dashboard header.
2. Select your agent. The modal displays the agent's dedicated OutLayer TEE enclave account ID.
3. Enter `1.0 NEAR` and click **Connect NEAR Wallet for 1-Click Funding**.
4. Approve the deposit transaction in your wallet. The agent's vault balance updates instantly.

#### Step 5: Execute an Autonomous Task
1. Navigate to **Objectives** (`/tasks`) and click **+ New Objective**.
2. Select your agent and mandate. Enter a task description:
   - *Example:* "Procure 0.05 NEAR market research subscription from allowlisted provider."
3. Click **Plan & Evaluate Policy**.
4. **Observe Autonomous Execution:**
   - Because `0.05 NEAR` is within the total budget, below the per-transaction ceiling, below the human approval threshold (`0.5 NEAR`), and sent to an allowlisted recipient, Mandate **automatically evaluates, issues a cryptographically signed Boundary Ticket, dispatches to OutLayer TEE, and settles on NEAR Testnet without prompting for manual human transaction confirmation.**
5. Review the resulting transaction hash, block height, and gas consumption in the activity stream.

#### Step 6: Negative Testing (Verify Policy Firewall Blocking)
To verify that agents cannot bypass your rules:
- **Test Case A (Unauthorized Recipient):** Propose a payment to an account NOT on your allowlist (e.g., `unverified-actor.testnet`).
  - **Result:** Instant deterministic rejection: `RECIPIENT_NOT_ALLOWED`. Zero funds leave the vault.
- **Test Case B (Exceeding Per-Transaction Limit):** Propose a payment exceeding your configured per-tx limit.
  - **Result:** Instant deterministic rejection: `PAYMENT_LIMIT_EXCEEDED`.
- **Test Case C (Approval Gating):** Propose a payment between the approval threshold and per-tx ceiling (e.g., `0.6 NEAR`).
  - **Result:** Status changes to `PENDING_APPROVAL`. Payment halts until you manually approve it under **Approvals** (`/approvals`).

#### Step 7: Inspect Cryptographic Audit Trail
1. Navigate to **Activity** (`/activity`).
2. Every proposal, policy check, TEE dispatch, and on-chain settlement is recorded with immutable correlation IDs, timestamps, and yoctoNEAR precision.

---

## Problem & Solution

### The Vulnerability of AI Agent Wallets Today
Modern AI agents can write code, analyze data, and interact with web APIs. However, granting an LLM direct access to private keys or giving it custody of a hot wallet is catastrophic:
- **Prompt Injection:** An adversarial web page or poisoned data stream can hijack the LLM prompt and instruct the agent to transfer all wallet assets to an attacker.
- **Model Hallucination:** Stochastic model drift can result in unintended contract calls or excessive transaction values.
- **Approval Fatigue:** Requiring a human user to review and approve every single micro-transaction negates the speed and utility of autonomous agents.

### The Mandate Solution
Mandate establishes a deterministic execution firewall between AI agents and on-chain settlement:
1. **Keyless Planning:** Agents propose intent; they never see, hold, or store private keys.
2. **Deterministic Enforcement:** All policy rules are evaluated on the server with exact integer arithmetic (`yoctoNEAR`). AI models cannot alter or bypass policy logic.
3. **OutLayer TEE Isolation:** Signing keys are held exclusively inside Intel SGX hardware enclaves managed by OutLayer. Keys cannot be extracted even by host administrators.
4. **Boundary Execution Tickets:** Execution requires a tamper-proof HMAC-SHA256 authorization ticket binding every financial parameter, single-use monotonic nonce, and short expiration window.

---

## System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        AI AGENT ORCHESTRATION                          │
│  - Task Decomposition & DAG Planning                                   │
│  - Parameter Formulation (Amount, Recipient, Operation)               │
│  - Strictly Keyless: Zero Private Key Custody                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Unsigned Payment Proposal
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     MANDATE POLICY FIREWALL                            │
│  - Exact yoctoNEAR Integer Math (BigInt)                               │
│  - Total Budget & Per-Transaction Limit Checks                         │
│  - Recipient Allowlist Verification                                    │
│  - Dynamic Human Approval Threshold Gating                             │
│  - Multi-Tenant Row-Level Isolation (PostgreSQL 18.6)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Deterministic Policy PASS
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  BOUNDARY EXECUTION TICKET (HMAC-SHA256)               │
│  - Binds: ExecutionID, MandateID, UserID, Recipient, yoctoNEAR Amount  │
│  - Atomic Monotonic Nonce Consumption & Anti-Replay Guard              │
│  - Fail-Closed Architecture                                            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Authorized Signed Ticket
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   OUTLAYER MANAGED CLOUD TEE                           │
│  - Intel SGX Secure Hardware Enclave                                   │
│  - Remote Cryptographic Attestation                                    │
│  - Isolated Transaction Signing & Key Custody                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Signed NEAR Transaction
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      NEAR PROTOCOL SETTLEMENT                          │
│  - NEAR Testnet Finality Verification                                  │
│  - Immutable Audit Ledger Entry                                        │
│  - Real-Time Balance Synchronization                                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Core Technical Features

### 1. Deterministic Policy Engine
Spending limits and allowlists are evaluated using strict `yoctoNEAR` integer arithmetic (`1 NEAR = 10^24 yoctoNEAR`). Floating-point approximations are completely eliminated from financial pathways to prevent rounding exploits and precision leakage.

### 2. OutLayer TEE Key Custody
Agent custody accounts exist inside OutLayer Intel SGX secure hardware enclaves. Signing occurs in enclave memory protected from host-level inspection, operating system tampering, or container escape vulnerabilities.

### 3. Boundary Execution Tickets
Every transfer requires an HMAC-SHA256 signed `BoundaryExecutionTicket` containing:
- Unique Execution ID, Mandate ID, and User ID.
- Exact Recipient and yoctoNEAR Amount.
- Target Network (`testnet`).
- Single-use Monotonic Nonce & Expiration Timestamp.
- Parameter tampering or ticket re-use triggers immediate rejection.

### 4. Concurrency & Tenant Isolation
- **PostgreSQL 18.6:** Multi-process concurrency control backed by transactional advisory locks (`pg_try_advisory_xact_lock`).
- **Cryptographic Tenant Isolation:** Every data entity is strictly scoped to the authenticated user's account ID. Cross-tenant access is rejected with `403 Forbidden`.

### 5. Distributed Resilience & Worker Architecture
- Asynchronous task processing powered by dedicated background execution workers.
- Automatic recovery from RPC failovers and idempotency keys on every transaction.
- Comprehensive health, liveness, and readiness endpoints (`/api/health`).

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend & UI** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons |
| **Backend & API** | Next.js Route Handlers, Node.js 20, Zod Schema Validation |
| **Database & ORM** | PostgreSQL 18.6, Prisma ORM, Transactional Advisory Locks |
| **Blockchain** | NEAR Protocol, `near-api-js`, `@near-wallet-selector` (MyNearWallet, Meteor, Here, Sender, Bitte) |
| **TEE Enclave** | OutLayer Managed Cloud TEE (Intel SGX), OutLayer SDK |
| **Deployment** | Railway (PostgreSQL & Background Workers), Vercel (Next.js Edge & Serverless) |

---

## Quickstart & Local Setup

### Prerequisites
- Node.js `v20.x` or higher
- npm `v10.x` or higher
- PostgreSQL `v16.x` or higher (or Docker)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/OpeyemiMoses/Mandate.git
   cd Mandate
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   Provide your PostgreSQL connection string and OutLayer credentials:
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/mandate?schema=public"
   OUTLAYER_API_KEY="your-outlayer-api-key"
   OUTLAYER_EXECUTOR_ACCOUNT_ID="your-outlayer-account-id"
   HMAC_TICKET_SECRET="your-64-character-hex-secret"
   NEAR_NETWORK="testnet"
   NEXT_PUBLIC_NEAR_NETWORK="testnet"
   ```

4. **Initialize Database:**
   ```bash
   npx prisma generate --schema=prisma/schema.postgresql.prisma
   npx prisma migrate deploy --schema=prisma/schema.postgresql.prisma
   ```

5. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

6. **Start Background Worker (Optional for asynchronous queue processing):**
   ```bash
   npx tsx scripts/worker-process.ts --name=worker_1
   ```

---

## Production Deployment

Mandate is built to run seamlessly across Railway and Vercel:

### 1. Railway (PostgreSQL Database & Background Worker)
1. In Railway, click **New Project** $\to$ **Deploy from GitHub repo** $\to$ select `OpeyemiMoses/Mandate`.
2. Add a **PostgreSQL** service in Railway.
3. Railway automatically detects [`railway.json`](railway.json) and [`Procfile`](Procfile) to run the background worker process.
4. Bind the `DATABASE_URL` environment variable.

### 2. Vercel (Next.js Application & API Routes)
1. In Vercel, click **Add New...** $\to$ **Project** $\to$ import `OpeyemiMoses/Mandate`.
2. Configure environment variables in Vercel project settings:
   - `DATABASE_URL` (from Railway PostgreSQL)
   - `OUTLAYER_API_KEY`
   - `OUTLAYER_EXECUTOR_ACCOUNT_ID`
   - `HMAC_TICKET_SECRET`
   - `NEAR_NETWORK="testnet"`
3. Deploy. Vercel builds all application routes and provisions your HTTPS endpoint.

---

## Repository Structure

```text
├── docs/                      # Architectural & threat model documentation
│   ├── architecture.md        # Trust boundaries and data flow
│   └── threat-model.md        # Comprehensive threat analysis & mitigations
├── prisma/                    # Database schemas and versioned migrations
│   ├── schema.postgresql.prisma
│   └── migrations/
├── public/                    # Static assets, branding, and icons
├── scripts/                   # Database migration and worker scripts
│   ├── migrate-sqlite-to-postgres.ts
│   ├── start-postgres.ts
│   └── worker-process.ts
├── src/
│   ├── app/                   # Next.js 14 App Router pages and API routes
│   │   ├── (platform)/        # Protected platform views (Agents, Mandates, Tasks)
│   │   ├── api/               # RESTful API endpoints with tenant scoping
│   │   ├── globals.css        # Tailwind styles & scroll animations
│   │   └── page.tsx           # Public landing page with live simulator
│   ├── components/            # UI components, modals, and wallet connect dialogs
│   ├── context/               # Global state (NEAR Wallet, Mandate, Theme)
│   └── lib/                   # Core business logic & security libraries
│       ├── auth/              # Tenant access & wallet session verification
│       ├── execution/         # Boundary execution ticket generation & HMAC verification
│       ├── orchestration/     # Task DAG planning & agent assignment
│       ├── outlayer.ts        # OutLayer TEE enclave client & signature dispatch
│       ├── policy.ts          # Deterministic yoctoNEAR policy evaluation engine
│       ├── postgresDb.ts      # PostgreSQL connection pool & advisory lock manager
│       ├── reconciliation/    # Distributed state reconcilers & audit proof
│       └── yocto.ts           # Exact integer yoctoNEAR conversion utilities
├── .github/                   # CI/CD workflows, issue templates, and PR template
├── CODE_OF_CONDUCT.md         # Contributor Covenant Code of Conduct
├── CONTRIBUTING.md            # Guidelines for contributing & development standards
├── LICENSE                    # MIT License
├── railway.json               # Railway deployment configuration
├── vercel.json                # Vercel deployment configuration
└── README.md                  # Project overview, judge testing guide & architecture
```

---

## Community & Security

- **Code of Conduct:** Please review our [Code of Conduct](CODE_OF_CONDUCT.md).
- **Contributing:** Guidelines for issues and pull requests are detailed in [CONTRIBUTING.md](CONTRIBUTING.md).
- **Security Policy:** To report vulnerabilities responsibly, refer to [SECURITY.md](SECURITY.md).
- **License:** Mandate is released under the [MIT License](LICENSE).
