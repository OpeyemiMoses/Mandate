# Security Policy

Mandate is built to provide financial authority to autonomous AI agents without risking custody, private key leakage, or unauthorized treasury depletion. Security is our highest engineering priority.

---

## Supported Versions

Only the latest release on the default branch receives active security updates and patches.

| Version | Supported | Status |
| :--- | :---: | :--- |
| `1.0.x` (Public Beta) | Yes | Active Support (NEAR Testnet) |
| `< 1.0.0` | No | Deprecated / Milestone Prototypes |

---

## Threat Model & Security Invariants

When evaluating potential vulnerabilities, consider Mandate's core security invariants:

1. **Key Isolation**: AI planners and application services never hold, generate, or transmit blockchain private keys. All signing takes place exclusively inside OutLayer Intel SGX Trusted Execution Environments (TEEs).
2. **Deterministic Spending Firewall**: Spending authority is enforced on the server using exact `yoctoNEAR` arithmetic (`1 NEAR = 10^24 yoctoNEAR`). Floating-point approximations are strictly forbidden in financial paths.
3. **Execution Tickets**: On-chain execution requires an HMAC-SHA256 signed `BoundaryExecutionTicket` binding the exact operation, recipient, yoctoNEAR amount, mandate ID, execution ID, network, and a single-use monotonic nonce.
4. **Tenant Isolation**: All database operations and API routes enforce tenant-scoping (`accountId` validation against cryptographic session tokens). Cross-account access is rejected with `403 Forbidden`.
5. **Fail-Closed Default**: Any validation error, RPC timeout, or indeterminate policy state immediately halts execution and releases reserved balances back to the mandate.

---

## Reporting a Vulnerability

If you discover a security vulnerability in Mandate, please do **NOT** open a public issue. Disclose it responsibly so we can remediate the issue before public exposure.

### Contact Information

- **Security Team Email**: [security@mandate.cash](mailto:security@mandate.cash)

### What to Include

Please include as much of the following as possible:
- Detailed description of the vulnerability and attack vector.
- Step-by-step reproduction instructions or a minimal Proof-of-Concept (PoC).
- Potential impact (e.g., unauthorized spending, budget bypass, privilege escalation, cross-tenant data leak).
- Suggested remediation or mitigation (if known).

### Response Timeline

| Milestone | Target Response Window |
| :--- | :--- |
| **Initial Acknowledgment** | Within 24 hours |
| **Triage & Severity Assessment** | Within 72 hours |
| **Patch Development & Testing** | Within 7 business days |
| **Public Disclosure & Credit** | Coordinated post-deployment |

---

## Scope

### In-Scope

- Deterministic policy engine enforcement (`src/lib/policy.ts`).
- Boundary ticket generation and HMAC verification (`src/lib/execution/boundaryTicket.ts`).
- OutLayer TEE enclave signing and custody isolation (`src/lib/outlayer.ts`, `src/lib/providers/`).
- Multi-tenant data segregation and session authentication (`src/lib/auth/`).
- Double-spend, replay, and race condition prevention in atomic budget reservations.

### Out of Scope

- Attacks requiring physical access to a user's unlocked device or compromised browser extension.
- Distributed denial-of-service (DDoS) against public third-party NEAR RPC endpoints.
- Vulnerabilities in third-party wallet providers (e.g., MyNearWallet, Meteor, Here Wallet).
- Theoretical attacks on Intel SGX hardware that require physical lab access and micro-probing.

