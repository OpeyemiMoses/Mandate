## Summary of Changes

A concise description of what this PR implements, fixes, or refactors.

## Motivation & Context

Why is this change required? What issue does it resolve?
- Closes #[issue-number]

## Architectural & Security Invariants

Please verify how this change affects Mandate's security model:
- [ ] Preserves non-custodial AI planning (agents never receive private keys).
- [ ] Uses strict `yoctoNEAR` integer math (`BigInt`) for all financial operations.
- [ ] Enforces deterministic policy checks before issuing execution tickets.
- [ ] Maintains tenant isolation (all database queries and routes are scoped by authenticated `accountId`).
- [ ] Does not weaken the OutLayer TEE enclave boundary.

## Changes Checklist

- [ ] My code follows the repository's style and TypeScript guidelines.
- [ ] Strict type checking passes (`npm run typecheck`).
- [ ] Linting checks pass (`npm run lint`).
- [ ] Production build succeeds (`npm run build`).
- [ ] New and existing documentation has been updated accordingly.

## Verification & Testing Performed

Describe the testing performed to verify these changes (e.g., local server testing, API route verification, or Testnet wallet interaction):
```text
// Paste test steps or verification output here
```

