<p align="center">
  <img src="public/mandate-logo.svg" alt="Mandate Logo" width="380" />
</p>

<p align="center">
  <strong>Deterministic spending firewall and policy-enforced autonomous execution runtime for AI agents on NEAR Protocol & OutLayer Intel SGX TEE.</strong>
</p>

<p align="center">
  <em>"AI proposes. Mandate enforces. The user controls. OutLayer executes."</em>
</p>

<p align="center">
  <a href="https://mandate-yemigraffixs-projects.vercel.app"><img src="https://img.shields.io/badge/Live%20App-mandate.vercel.app-FF3B30?style=for-the-badge&logo=vercel" alt="Live App"></a>
  <a href="https://mandate-yemigraffixs-projects.vercel.app/api/health/ready"><img src="https://img.shields.io/badge/System%20Status-READY%20(PostgreSQL%2018)-10B981?style=for-the-badge" alt="Status READY"></a>
  <a href="https://testnet.nearblocks.io/txns/F5AFpgRzngjJnsqE6QHtEMJYXnLhPMbwKtVG9pHXyACC"><img src="https://img.shields.io/badge/Settlement-NEAR%20Testnet-00C08B?style=for-the-badge&logo=near" alt="NEAR Testnet"></a>
  <a href="https://outlayer.ai"><img src="https://img.shields.io/badge/Custody-Intel%20SGX%20TEE-0071C5?style=for-the-badge&logo=intel" alt="OutLayer TEE"></a>
  <a href="https://github.com/OpeyemiMoses/Mandate"><img src="https://img.shields.io/badge/GitHub-OpeyemiMoses%2FMandate-181717?style=for-the-badge&logo=github" alt="GitHub Repo"></a>
</p>

---

## ⚖️ Judges' Corner: Live Evaluation & Verification

Mandate provides a **deterministic spending firewall** for AI agents. It gives autonomous agents the ability to execute on-chain financial workflows **without ever possessing raw private keys, exceeding user-defined budgets, or transferring funds to unauthorized recipients**.

---

### 🔗 Quick Links Reference

| Destination | Live URL | Purpose |
| :--- | :--- | :--- |
| 🚀 **Live Production Application** | [mandate-yemigraffixs-projects.vercel.app](https://mandate-yemigraffixs-projects.vercel.app) | Public production web app ready for live testing |
| 🔍 **System Readiness API** | [/api/health/ready](https://mandate-yemigraffixs-projects.vercel.app/api/health/ready) | Live telemetry (Railway PostgreSQL 18.6 & Worker Fleet status) |
| ⚡ **Service Health Check** | [/api/health](https://mandate-yemigraffixs-projects.vercel.app/api/health) | Testnet node connectivity & OutLayer TEE gateway status |
| 🔗 **Verified On-Chain Settlement** | [`F5AFpgRzngj...`](https://testnet.nearblocks.io/txns/F5AFpgRzngjJnsqE6QHtEMJYXnLhPMbwKtVG9pHXyACC) | Autonomous 0.05 NEAR payment executed via OutLayer TEE |
| 🛡️ **Interactive Policy Simulator** | [/governance/simulator](https://mandate-yemigraffixs-projects.vercel.app/governance/simulator) | Test deterministic policy evaluation in real-time |
| 📖 **System Documentation** | [/docs](https://mandate-yemigraffixs-projects.vercel.app/docs) | Complete technical specifications and architecture guides |
| ⚙️ **Railway Production Dashboard** | [Project `mandate`](https://railway.com/project/f060e7a8-6f75-4962-9d2d-b6337907785f) | PostgreSQL 18.6 + Background Worker Daemon runtime |
| 💻 **Vercel Project Console** | [Project `mandate`](https://vercel.com/yemigraffixs-projects/mandate) | Edge routing, Next.js 14 App Router, and serverless APIs |

---

### 🎯 3-Minute Live Walkthrough for Evaluators

```text
  [1. Connect NEAR Wallet] ──> [2. Create Agent] ──> [3. Define Mandate Policy]
             │
             ▼
  [4. 1-Click Fund TEE Vault] ──> [5. Run Autonomous Objective]
             │
             ▼
  [6. Negative Testing (Firewall Rejection)] ──> [7. Inspect Immutable Audit Trail]
```

#### Step 1: Connect Your NEAR Testnet Wallet
- Visit [https://mandate-yemigraffixs-projects.vercel.app](https://mandate-yemigraffixs-projects.vercel.app).
- Click **Connect NEAR Wallet** in the navigation bar.
- Compatible with all major NEAR wallets: **MyNearWallet**, **Meteor**, **Here Wallet**, **Sender**, or **Bitte**.
- Your account is instantly authenticated via secure cryptographic sessions with multi-tenant row-level isolation.

#### Step 2: Create an AI Agent ([/agents](https://mandate-yemigraffixs-projects.vercel.app/agents))
- Click **+ New Agent**.
- Choose a role (e.g. `Treasury`, `Procurement`, `Auditor`, or `Operations`).
- Mandate automatically provisions a dedicated **OutLayer TEE Custody Vault** enclave address for your agent.

#### Step 3: Define a Financial Mandate ([/mandates](https://mandate-yemigraffixs-projects.vercel.app/mandates))
- Click **+ Create Mandate** to set hard guardrails:
  - **Total Budget:** e.g., `5.0 NEAR`
  - **Per-Transaction Ceiling:** e.g., `1.0 NEAR`
  - **Human Approval Threshold:** e.g., `0.5 NEAR` *(Transfers $\le$ 0.5 NEAR execute autonomously; transfers $>$ 0.5 NEAR halt for human sign-off)*.
  - **Recipient Allowlist:** e.g., `treasury.testnet`, `data-provider.testnet`.
  - **Agent Binding:** Bind to your newly created agent.

#### Step 4: 1-Click Fund the Agent Vault ([/wallets](https://mandate-yemigraffixs-projects.vercel.app/wallets))
- Select your agent in the **Wallets** tab and enter deposit amount (e.g., `1.0 NEAR`).
- Click **Connect NEAR Wallet for 1-Click Funding** to deposit Testnet NEAR directly into the agent's OutLayer TEE enclave custody.

#### Step 5: Test Autonomous Execution ([/tasks](https://mandate-yemigraffixs-projects.vercel.app/tasks))
- Create an objective: *"Procure 0.05 NEAR market research subscription from allowlisted provider."*
- Click **Plan & Evaluate Policy**.
- **Observe Autonomous Execution:** Because the request is $\le$ 0.5 NEAR and targets an allowlisted account, Mandate generates an HMAC-SHA256 Boundary Ticket, dispatches it to the OutLayer TEE, and settles on NEAR Testnet **without prompting for manual wallet confirmation**.

#### Step 6: Negative Testing (Verify Firewall Blocking)
Test that rogue agent behavior is deterministically intercepted:
- **Test Case A (Unauthorized Recipient):** Propose payment to `unverified-actor.testnet`.  
  *Result:* Instant deterministic rejection with `RECIPIENT_NOT_ALLOWED`. Zero funds leave the vault.
- **Test Case B (Exceeding Per-Transaction Limit):** Propose payment of `2.0 NEAR` (when ceiling is `1.0 NEAR`).  
  *Result:* Instant deterministic rejection with `PAYMENT_LIMIT_EXCEEDED`.
- **Test Case C (Human Approval Gating):** Propose payment of `0.7 NEAR` (between threshold `0.5` and ceiling `1.0`).  
  *Result:* Status switches to `PENDING_APPROVAL`. Payment halts until approved in the [Approvals Dashboard](https://mandate-yemigraffixs-projects.vercel.app/approvals).

#### Step 7: Audit Trail Verification ([/activity](https://mandate-yemigraffixs-projects.vercel.app/activity))
- View every proposal, policy evaluation, ticket issuance, and on-chain hash recorded with yoctoNEAR precision and immutable correlation IDs.

---

### 📸 Application Interface Preview

<p align="center">
  <img src="shots-dashboard-dark.png" alt="Mandate Live Dashboard" width="90%" />
</p>
<p align="center">
  <em>Mandate Real-Time Governance Dashboard: Agent Status, Active Mandates, and Real-Time Policy Evaluations</em>
</p>

<p align="center">
  <img src="shots-landing-dark.png" alt="Mandate Landing Page & Simulator" width="45%" />
  <img src="shots-modal-dark.png" alt="Mandate Agent Custody Modal" width="45%" />
</p>

---

## 💡 The Problem & The Solution

### The Vulnerability of AI Agent Wallets Today
Autonomous AI agents can analyze markets, interact with web APIs, and write code. However, giving an LLM direct access to private keys or custodial wallets creates severe systemic vulnerabilities:
- **Prompt Injection & Hijacking:** Malicious web inputs or adversarial data can poison the agent prompt and trick the model into sweeping its wallet balance to an attacker.
- **Model Drift & Hallucination:** Stochastic LLM behavior can generate malformed contract calls or unintended spending spikes.
- **Approval Fatigue:** Forcing human operators to click "Approve" for hundreds of micro-transactions destroys agent autonomy.

### The Mandate Solution
Mandate introduces a **deterministic firewall layer** between AI agent intent and blockchain settlement:
1. **Zero Private Key Custody:** Agents propose payment intent; they never hold, read, or export private keys.
2. **Exact yoctoNEAR Integer Arithmetic:** All constraints are calculated using exact `BigInt` integers (`1 NEAR = 10^24 yoctoNEAR`). Floating-point rounding errors and precision exploits are mathematically impossible.
3. **OutLayer Intel SGX TEE Custody:** Signing keys exist strictly inside hardware-isolated secure enclaves. Neither host operators, compromised databases, nor cloud providers can extract enclave keys.
4. **Boundary Execution Tickets:** Financial transactions require an HMAC-SHA256 authorization ticket binding all payment parameters, a monotonic single-use nonce, and an explicit expiration timestamp.

---

## 🏛️ System Architecture

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

## 🔬 Core Technical Features

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
- Any parameter tampering or ticket replay triggers immediate cryptographic rejection.

### 4. Concurrency & Multi-Tenant Isolation
- **PostgreSQL 18.6:** Multi-process concurrency control backed by transactional advisory locks (`pg_try_advisory_xact_lock`).
- **Cryptographic Tenant Isolation:** Every data entity is strictly scoped to the authenticated user's account ID. Cross-tenant access is rejected with `403 Forbidden`.

### 5. Distributed Resilience & Worker Architecture
- Asynchronous task processing powered by dedicated background execution workers.
- Automatic recovery from RPC failovers and idempotency keys on every transaction.
- Comprehensive health, liveness, and readiness endpoints ([`/api/health/ready`](https://mandate-yemigraffixs-projects.vercel.app/api/health/ready)).

---

## 💻 Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend & UI** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons |
| **Backend & API** | Next.js Route Handlers, Node.js 20, Zod Schema Validation |
| **Database & ORM** | PostgreSQL 18.6, Prisma ORM, Transactional Advisory Locks |
| **Blockchain** | NEAR Protocol, `near-api-js`, `@near-wallet-selector` (MyNearWallet, Meteor, Here, Sender, Bitte) |
| **TEE Enclave** | OutLayer Managed Cloud TEE (Intel SGX), OutLayer SDK |
| **Deployment** | Railway (PostgreSQL 18 & Background Workers), Vercel (Next.js Edge & Serverless) |

---

## 🛠️ Quickstart & Local Setup

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

## 🌐 Production Deployment Architecture

Mandate is deployed across **Railway** and **Vercel** for optimal reliability:

```text
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│         VERCEL EDGE & SERVERLESS     │       │           RAILWAY CLOUD              │
│  - Next.js 14 App Router UI          │──────>│  - Managed PostgreSQL 18.6 Database  │
│  - RESTful API Endpoints             │       │  - Asynchronous Background Workers   │
│  - https://mandate.vercel.app        │       │  - Autonomous Job Execution Loop     │
└──────────────────────────────────────┘       └──────────────────────────────────────┘
```

1. **Railway ([Dashboard](https://railway.com/project/f060e7a8-6f75-4962-9d2d-b6337907785f)):**
   - Managed **PostgreSQL 18.6** instance with multi-table schema migrations applied.
   - Long-running background worker daemon (`scripts/worker-process.ts`) polling the job queue.
2. **Vercel ([Dashboard](https://vercel.com/yemigraffixs-projects/mandate)):**
   - High-performance Next.js 14 serverless deployment with global edge CDN caching.
   - Live public deployment accessible at [https://mandate-yemigraffixs-projects.vercel.app](https://mandate-yemigraffixs-projects.vercel.app).

---

## 📁 Repository Structure

```text
├── docs/                      # Architectural & threat model documentation
│   ├── architecture.md        # Trust boundaries and data flow
│   └── threat-model.md        # Comprehensive threat analysis & mitigations
├── prisma/                    # Database schemas and versioned migrations
│   ├── schema.postgresql.prisma
│   └── migrations/
├── public/                    # Static assets, branding, and logo SVGs
│   ├── mandate-logo.svg       # Official Mandate vector logo
│   └── favicon.ico
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

## 👥 Community & Security

- **Code of Conduct:** Please review our [Code of Conduct](CODE_OF_CONDUCT.md).
- **Contributing:** Guidelines for issues and pull requests are detailed in [CONTRIBUTING.md](CONTRIBUTING.md).
- **Security Policy:** To report vulnerabilities responsibly, refer to [SECURITY.md](SECURITY.md).
- **License:** Mandate is released under the [MIT License](LICENSE).
