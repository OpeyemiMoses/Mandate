import { z } from "zod";
import { isPositiveYoctoString, isValidYoctoString } from "./yocto";

export type PolicyRejectionReason =
  | "MANDATE_REVOKED"
  | "MANDATE_EXPIRED"
  | "MANDATE_NOT_ACTIVE"
  | "RECIPIENT_NOT_ALLOWED"
  | "INVALID_AMOUNT"
  | "PAYMENT_LIMIT_EXCEEDED"
  | "BUDGET_EXCEEDED"
  | "DUPLICATE_PAYMENT"
  | "PROVIDER_POLICY_UNCONFIRMED";

export type PolicyRuleCheck = {
  rule: string;
  passed: boolean;
  detail: string;
};

export type PolicyDecision =
  | {
      allowed: true;
      requiresApproval: boolean;
      reasons: string[];
      checks: PolicyRuleCheck[];
    }
  | {
      allowed: false;
      reason: PolicyRejectionReason;
      humanExplanation: string;
      checks: PolicyRuleCheck[];
    };

export type PaymentProposal = {
  taskId: string;
  recipient: string;
  amountAtomic: string;
  purpose: string;
  idempotencyKey: string;
};

export type MandateStateForPolicy = {
  id: string;
  name: string;
  status:
    | "active"
    | "paused"
    | "revoked"
    | "expired"
    | "budget_exhausted"
    | "completed"
    | "draft"
    | "pending_policy";
  providerPolicyConfirmed: boolean;
  budgetAtomic: string;
  spentAtomic: string;
  reservedAtomic: string;
  perTxLimitAtomic: string;
  approvalThresholdAtomic: string;
  allowedRecipients: string[];
  expiresAtIso: string;
};

export const NearAccountIdSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(
    /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/,
    "Must be a valid lowercase NEAR account ID"
  );

export const PlannerProposalSchema = z.object({
  taskSummary: z.string().min(5).max(400),
  steps: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().min(2).max(160),
        type: z.enum([
          "verify_recipient",
          "check_policy",
          "execute_payment",
          "confirm_settlement",
          "request_service",
        ]),
        status: z.enum(["completed", "pending", "blocked", "in_progress"]),
      })
    )
    .min(1)
    .max(8),
  paymentProposal: z
    .object({
      recipient: z.string().min(2).max(64),
      amountAtomic: z.string().refine(isPositiveYoctoString, {
        message: "amountAtomic must be a positive integer string in yoctoNEAR",
      }),
      purpose: z.string().min(3).max(280),
    })
    .strict(),
});

const REJECTION_MESSAGES: Record<PolicyRejectionReason, string> = {
  MANDATE_REVOKED:
    "Mandate has been revoked by the owner. All new tasks and queued transfers are halted.",
  MANDATE_EXPIRED:
    "Mandate has passed its configured expiration timestamp. Fail-closed protection triggered.",
  MANDATE_NOT_ACTIVE:
    "Mandate is paused or not active. No new tasks or payments permitted.",
  PROVIDER_POLICY_UNCONFIRMED:
    "OutLayer TEE provider-side policy has not been confirmed. Mandate fails closed until verified.",
  INVALID_AMOUNT:
    "Proposed payment amount is not a strictly positive integer in atomic yoctoNEAR.",
  RECIPIENT_NOT_ALLOWED:
    "Proposed recipient is not on this mandate's explicit allowlist.",
  DUPLICATE_PAYMENT:
    "Idempotency key has already been processed or reserved. Duplicate transfer blocked.",
  PAYMENT_LIMIT_EXCEEDED:
    "Proposed amount exceeds the mandate's hard per-transaction limit. Human approval cannot override hard limits.",
  BUDGET_EXCEEDED:
    "Proposed amount exceeds the remaining unreserved mandate budget.",
};

/**
 * Deterministic policy evaluation engine.
 * Never relies on an LLM or floating-point math.
 * Evaluates all rules in strict priority order and returns detailed check evidence.
 */
export function evaluatePolicyProposal(
  mandate: MandateStateForPolicy,
  proposal: PaymentProposal,
  existingIdempotencyKeys: Set<string>,
  now: Date = new Date()
): PolicyDecision {
  const checks: PolicyRuleCheck[] = [];
  let firstFailure: PolicyRejectionReason | null = null;

  // 1. Mandate active check
  const isActive = mandate.status === "active";
  checks.push({
    rule: "Mandate Active Status",
    passed: isActive,
    detail: isActive
      ? `Mandate "${mandate.name}" is active`
      : `Mandate status is "${mandate.status}"`,
  });
  if (!isActive && !firstFailure) {
    firstFailure =
      mandate.status === "paused"
        ? "MANDATE_NOT_ACTIVE"
        : mandate.status === "expired"
        ? "MANDATE_EXPIRED"
        : "MANDATE_REVOKED";
  }

  // 2. Provider policy confirmed check
  const providerConfirmed = Boolean(mandate.providerPolicyConfirmed);
  checks.push({
    rule: "OutLayer TEE Policy Synced",
    passed: providerConfirmed,
    detail: providerConfirmed
      ? "Provider-side TEE policy read-back verified"
      : "Provider-side policy unconfirmed (fail-closed)",
  });
  if (!providerConfirmed && !firstFailure) {
    firstFailure = "PROVIDER_POLICY_UNCONFIRMED";
  }

  // 3. Expiration check
  const expiresAt = new Date(mandate.expiresAtIso);
  const notExpired = !isNaN(expiresAt.getTime()) && now < expiresAt;
  checks.push({
    rule: "Mandate Expiration Window",
    passed: notExpired,
    detail: notExpired
      ? `Valid until ${expiresAt.toISOString().slice(0, 10)}`
      : `Expired at ${mandate.expiresAtIso}`,
  });
  if (!notExpired && !firstFailure) {
    firstFailure = "MANDATE_EXPIRED";
  }

  // 4. Positive atomic amount check
  const validAmount =
    isPositiveYoctoString(proposal.amountAtomic) &&
    isValidYoctoString(mandate.budgetAtomic) &&
    isValidYoctoString(mandate.perTxLimitAtomic) &&
    isValidYoctoString(mandate.approvalThresholdAtomic);

  checks.push({
    rule: "Atomic yoctoNEAR Integrity",
    passed: validAmount,
    detail: validAmount
      ? `Valid integer (${proposal.amountAtomic} yoctoNEAR)`
      : `Malformed atomic amount "${proposal.amountAtomic}"`,
  });
  if (!validAmount) {
    return {
      allowed: false,
      reason: firstFailure ?? "INVALID_AMOUNT",
      humanExplanation: REJECTION_MESSAGES[firstFailure ?? "INVALID_AMOUNT"],
      checks,
    };
  }

  // 5. Recipient allowlist check
  const normalizedRecipient = proposal.recipient.trim().toLowerCase();
  const normalizedAllowlist = mandate.allowedRecipients.map((r) =>
    r.trim().toLowerCase()
  );
  const recipientAllowed = normalizedAllowlist.includes(normalizedRecipient);
  checks.push({
    rule: "Recipient Allowlist",
    passed: recipientAllowed,
    detail: recipientAllowed
      ? `"${normalizedRecipient}" is explicitly allowlisted`
      : `"${normalizedRecipient}" is NOT in [${normalizedAllowlist.join(", ")}]`,
  });
  if (!recipientAllowed && !firstFailure) {
    firstFailure = "RECIPIENT_NOT_ALLOWED";
  }

  // 6. Idempotency check
  const isUniqueKey =
    Boolean(proposal.idempotencyKey.trim()) &&
    !existingIdempotencyKeys.has(proposal.idempotencyKey.trim());
  checks.push({
    rule: "Idempotency Guard",
    passed: isUniqueKey,
    detail: isUniqueKey
      ? `Key "${proposal.idempotencyKey}" is unique`
      : `Duplicate idempotency key "${proposal.idempotencyKey}"`,
  });
  if (!isUniqueKey && !firstFailure) {
    firstFailure = "DUPLICATE_PAYMENT";
  }

  // 7. Per-transaction limit check
  const amountBig = BigInt(proposal.amountAtomic.trim());
  const perTxLimitBig = BigInt(mandate.perTxLimitAtomic.trim());
  const withinPerTx = amountBig <= perTxLimitBig;
  checks.push({
    rule: "Per-Transaction Hard Cap",
    passed: withinPerTx,
    detail: withinPerTx
      ? "Within per-transaction cap"
      : "Exceeds mandate per-transaction hard limit",
  });
  if (!withinPerTx && !firstFailure) {
    firstFailure = "PAYMENT_LIMIT_EXCEEDED";
  }

  // 8. Total budget + reservation check
  const budgetBig = BigInt(mandate.budgetAtomic.trim());
  const spentBig = BigInt((mandate.spentAtomic || "0").trim());
  const reservedBig = BigInt((mandate.reservedAtomic || "0").trim());
  const remainingBig = budgetBig - spentBig - reservedBig;
  const withinBudget = amountBig <= remainingBig;
  checks.push({
    rule: "Total Mandate Budget & Reservations",
    passed: withinBudget,
    detail: withinBudget
      ? "Sufficient unreserved budget available"
      : "Insufficient remaining budget (accounting for spent + reserved)",
  });
  if (!withinBudget && !firstFailure) {
    firstFailure = "BUDGET_EXCEEDED";
  }

  if (firstFailure) {
    return {
      allowed: false,
      reason: firstFailure,
      humanExplanation: REJECTION_MESSAGES[firstFailure],
      checks,
    };
  }

  // 9. Approval threshold evaluation
  const thresholdBig = BigInt(mandate.approvalThresholdAtomic.trim());
  const requiresApproval = amountBig > thresholdBig;
  checks.push({
    rule: "Human Approval Threshold",
    passed: true,
    detail: requiresApproval
      ? "Amount exceeds auto-execution threshold -> Queued for human approval"
      : "Amount is within autonomous execution threshold",
  });

  return {
    allowed: true,
    requiresApproval,
    reasons: requiresApproval
      ? [
          "All hard mandate constraints passed.",
          "Payment exceeds autonomous threshold and requires human sign-off before OutLayer TEE signing.",
        ]
      : [
          "All deterministic policy rules passed.",
          "Payment is eligible for immediate OutLayer TEE execution.",
        ],
    checks,
  };
}

