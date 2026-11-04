# Mandate — Threat Model & Security Controls

## Core Security Invariants

1. **No Key Exposure:** Neither the AI model context nor the browser client ever receives wallet private keys or custody API secrets.
2. **Deterministic Financial Enforcement:** LLMs never decide whether a payment is within policy. Every payment proposal passes through a deterministic evaluator (`evaluatePolicyProposal`).
3. **Atomic Integer Math (`yoctoNEAR`):** All monetary inputs, budgets, limits, and thresholds are converted to and evaluated as `yoctoNEAR` (`10^24` per NEAR) using `BigInt`. Floating-point representation is never used for financial logic.
4. **Fail Closed:** If a mandate is inactive, expired, revoked, or if provider-side policy verification is unconfirmed, execution is rejected immediately.
5. **Approval Cannot Override Hard Limits:** Human approval is triggered for payments above `approvalThresholdAtomic` and below `perTxLimitAtomic`. A payment exceeding `perTxLimitAtomic` or `budgetAtomic` is strictly rejected (`PAYMENT_LIMIT_EXCEEDED` / `BUDGET_EXCEEDED`) and cannot be bypassed via the approval queue.
6. **Ambiguous Status Protection:** Network timeouts or ambiguous provider responses transition a payment to `needs_review` rather than blindly retrying and risking a double-spend.

## Threat Matrix

| Threat | Mitigation in Mandate |
| :--- | :--- |
| **Prompt Injection / Rogue AI Output** | AI output is parsed through a strict Zod schema and checked against the mandate's explicit `allowedRecipients` and `perTxLimitAtomic`. |
| **Precision / Rounding Exploits** | All comparisons use `BigInt` atomic units (`yoctoNEAR`). |
| **Replay / Duplicate Execution** | Every payment proposal carries a deterministic or unique `idempotencyKey` checked against existing payments. |
| **Concurrent Budget Exhaustion** | Budget reservations include both `spentAtomic` and `reservedAtomic` (in-flight/awaiting-approval) amounts before permitting new proposals. |
| **Mandate Revocation Race** | Revoking a mandate immediately transitions its status to `revoked`, cancels pending approvals, and blocks any subsequent task or execution calls. |

