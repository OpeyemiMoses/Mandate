# Contributing to Mandate

Thank you for your interest in contributing to Mandate! We welcome contributions from developers, researchers, and security practitioners to help build the safest autonomous spending runtime for AI agents.

Please take a moment to review this document before submitting contributions.

---

## Code of Conduct

All contributors are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior to [security@mandate.cash](mailto:security@mandate.cash).

---

## Architectural Principles

When writing or reviewing code for Mandate, remember our foundational architectural invariant:

> **AI proposes. Mandate enforces. The user controls. OutLayer executes.**

1. **Non-Custodial Planning**: AI planners and orchestrators must NEVER hold, receive, or inspect private signing keys or raw TEE credentials.
2. **Deterministic Enforcement**: All financial spending rules (budgets, per-transaction limits, recipient allowlists) must be evaluated deterministically using exact yoctoNEAR integer arithmetic (`BigInt`).
3. **Execution Boundary**: Settlement on NEAR Protocol is strictly gated by single-use, HMAC-signed `BoundaryExecutionTicket` objects and processed within OutLayer Intel SGX secure enclaves.
4. **Fail-Closed**: Any unverified state, missing signature, or indeterminate policy result MUST fail closed and deny execution.

---

## Getting Started

### Prerequisites

- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **PostgreSQL**: v16.x or higher
- **NEAR CLI / Testnet Account**: For on-chain verification testing

### Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/OpeyemiMoses/Mandate.git
   cd Mandate
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to supply your local PostgreSQL database URL and development keys.

4. **Initialize database schema**:
   ```bash
   npx prisma generate --schema=prisma/schema.postgresql.prisma
   npx prisma migrate dev --schema=prisma/schema.postgresql.prisma
   ```

5. **Start development server**:
   ```bash
   npm run dev
   ```
   The application will be accessible at `http://localhost:3000`.

---

## Development Standards

### 1. TypeScript Strictness

- All code must pass strict type checking (`npm run typecheck`).
- Do not use `any` unless wrapping untrusted third-party inputs that are immediately validated with `zod`.
- Use branded types or explicit type aliases for financial quantities (`yoctoNEAR` strings or `bigint`).

### 2. Linting & Formatting

- Run `npm run lint` before committing.
- Ensure all React hooks declare their complete dependency arrays or use `useCallback`/`useMemo` appropriately.

### 3. Git Commit Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` Introduces a new user-facing feature or API capability.
- `fix:` Patches a bug or resolves an unintended behavior.
- `docs:` Documentation changes only (e.g., README, architecture guides).
- `refactor:` Code restructuring that does not alter external behavior.
- `perf:` Performance improvements.
- `chore:` Dependency bumps, build tool configurations, or CI updates.

Example:
```text
feat(policy): enforce dynamic human approval threshold in yoctoNEAR
fix(boundary): prevent nonce reuse across concurrent execution tickets
```

---

## Pull Request Guidelines

1. **Create a topic branch**:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Verify changes locally**:
   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```
3. **Submit a Pull Request**:
   - Provide a clear summary of what changed and why.
   - Reference any related issues (e.g., `Closes #123`).
   - Fill out all sections of the [Pull Request Template](.github/pull_request_template.md).
4. **CI Checks**: Ensure all GitHub Actions CI checks pass before requesting review.

