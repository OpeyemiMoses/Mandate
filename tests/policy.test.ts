import assert from "node:assert/strict";
import {
  nearToYocto,
  yoctoToNear,
  addYocto,
  subYocto,
  compareYocto,
} from "../src/lib/yocto";
import {
  evaluatePolicyProposal,
  PlannerProposalSchema,
  type MandateStateForPolicy,
} from "../src/lib/policy";

console.log("Running Mandate deterministic policy & yoctoNEAR unit tests...");

// 1. Test atomic yoctoNEAR conversions
assert.equal(nearToYocto("0.5"), "500000000000000000000000");
assert.equal(nearToYocto("0.1"), "100000000000000000000000");
assert.equal(nearToYocto("0.05"), "50000000000000000000000");
assert.equal(nearToYocto("5"), "5000000000000000000000000");
assert.equal(yoctoToNear("500000000000000000000000", 3), "0.500");
assert.equal(yoctoToNear("1250000000000000000000000", 3), "1.250");
assert.equal(
  addYocto("500000000000000000000000", "250000000000000000000000"),
  "750000000000000000000000"
);
assert.equal(
  subYocto("500000000000000000000000", "100000000000000000000000"),
  "400000000000000000000000"
);
assert.equal(
  compareYocto("100000000000000000000000", "50000000000000000000000"),
  1
);

const baseMandate: MandateStateForPolicy = {
  id: "mandate-1",
  name: "DeFi Research",
  status: "active",
  providerPolicyConfirmed: true,
  budgetAtomic: nearToYocto("0.5"),
  spentAtomic: nearToYocto("0.1"),
  reservedAtomic: nearToYocto("0.05"),
  perTxLimitAtomic: nearToYocto("0.1"),
  approvalThresholdAtomic: nearToYocto("0.05"),
  allowedRecipients: ["researcher.near", "oracle.testnet"],
  expiresAtIso: "2026-11-14T23:59:00.000Z",
};

const now = new Date("2026-11-02T12:00:00.000Z");

// 2. Test autonomous allowed payment (<= 0.05 NEAR)
const allowedAuto = evaluatePolicyProposal(
  baseMandate,
  {
    taskId: "task-1",
    recipient: "researcher.near",
    amountAtomic: nearToYocto("0.04"),
    purpose: "Market liquidity snapshot",
    idempotencyKey: "idem-001",
  },
  new Set(),
  now
);
assert.equal(allowedAuto.allowed, true);
if (allowedAuto.allowed) {
  assert.equal(allowedAuto.requiresApproval, false);
}

// 3. Test allowed payment requiring human approval (> 0.05 NEAR and <= 0.10 NEAR)
const allowedWithApproval = evaluatePolicyProposal(
  baseMandate,
  {
    taskId: "task-2",
    recipient: "researcher.near",
    amountAtomic: nearToYocto("0.08"),
    purpose: "Historical orderbook dataset",
    idempotencyKey: "idem-002",
  },
  new Set(),
  now
);
assert.equal(allowedWithApproval.allowed, true);
if (allowedWithApproval.allowed) {
  assert.equal(allowedWithApproval.requiresApproval, true);
}

// 4. Test RECIPIENT_NOT_ALLOWED
const unapprovedRecipient = evaluatePolicyProposal(
  baseMandate,
  {
    taskId: "task-3",
    recipient: "attacker.near",
    amountAtomic: nearToYocto("0.02"),
    purpose: "Unauthorized exfiltration",
    idempotencyKey: "idem-003",
  },
  new Set(),
  now
);
assert.equal(unapprovedRecipient.allowed, false);
if (!unapprovedRecipient.allowed) {
  assert.equal(unapprovedRecipient.reason, "RECIPIENT_NOT_ALLOWED");
}

// 5. Test PAYMENT_LIMIT_EXCEEDED (> 0.10 NEAR)
const overPerTx = evaluatePolicyProposal(
  baseMandate,
  {
    taskId: "task-4",
    recipient: "researcher.near",
    amountAtomic: nearToYocto("0.20"),
    purpose: "Oversized single payment",
    idempotencyKey: "idem-004",
  },
  new Set(),
  now
);
assert.equal(overPerTx.allowed, false);
if (!overPerTx.allowed) {
  assert.equal(overPerTx.reason, "PAYMENT_LIMIT_EXCEEDED");
}

// 6. Test BUDGET_EXCEEDED (Remaining is 0.5 - 0.1 - 0.05 = 0.35; if perTxLimit is higher, check budget)
const lowBudgetMandate: MandateStateForPolicy = {
  ...baseMandate,
  spentAtomic: nearToYocto("0.45"),
  reservedAtomic: "0",
};
const overBudget = evaluatePolicyProposal(
  lowBudgetMandate,
  {
    taskId: "task-5",
    recipient: "researcher.near",
    amountAtomic: nearToYocto("0.08"),
    purpose: "Exceeds remaining budget",
    idempotencyKey: "idem-005",
  },
  new Set(),
  now
);
assert.equal(overBudget.allowed, false);
if (!overBudget.allowed) {
  assert.equal(overBudget.reason, "BUDGET_EXCEEDED");
}

// 7. Test DUPLICATE_PAYMENT
const duplicateKey = evaluatePolicyProposal(
  baseMandate,
  {
    taskId: "task-6",
    recipient: "researcher.near",
    amountAtomic: nearToYocto("0.02"),
    purpose: "Replay attempt",
    idempotencyKey: "idem-existing",
  },
  new Set(["idem-existing"]),
  now
);
assert.equal(duplicateKey.allowed, false);
if (!duplicateKey.allowed) {
  assert.equal(duplicateKey.reason, "DUPLICATE_PAYMENT");
}

// 8. Test MANDATE_REVOKED & PROVIDER_POLICY_UNCONFIRMED
const revokedDecision = evaluatePolicyProposal(
  { ...baseMandate, status: "revoked" },
  {
    taskId: "task-7",
    recipient: "researcher.near",
    amountAtomic: nearToYocto("0.02"),
    purpose: "Attempt after revoke",
    idempotencyKey: "idem-007",
  },
  new Set(),
  now
);
assert.equal(revokedDecision.allowed, false);
if (!revokedDecision.allowed) {
  assert.equal(revokedDecision.reason, "MANDATE_REVOKED");
}

const unconfirmedPolicy = evaluatePolicyProposal(
  { ...baseMandate, providerPolicyConfirmed: false },
  {
    taskId: "task-8",
    recipient: "researcher.near",
    amountAtomic: nearToYocto("0.02"),
    purpose: "Attempt without TEE policy sync",
    idempotencyKey: "idem-008",
  },
  new Set(),
  now
);
assert.equal(unconfirmedPolicy.allowed, false);
if (!unconfirmedPolicy.allowed) {
  assert.equal(unconfirmedPolicy.reason, "PROVIDER_POLICY_UNCONFIRMED");
}

// 9. Test Zod validation of AI Planner output
const validParse = PlannerProposalSchema.safeParse({
  taskSummary: "Purchase DeFi research dataset",
  steps: [
    {
      id: "s1",
      title: "Verify recipient and amount",
      type: "verify_recipient",
      status: "completed",
    },
  ],
  paymentProposal: {
    recipient: "researcher.near",
    amountAtomic: nearToYocto("0.04"),
    purpose: "Research Data Access",
  },
});
assert.equal(validParse.success, true);

const invalidFloatParse = PlannerProposalSchema.safeParse({
  taskSummary: "Malformed float amount",
  steps: [
    {
      id: "s1",
      title: "Verify recipient",
      type: "verify_recipient",
      status: "completed",
    },
  ],
  paymentProposal: {
    recipient: "researcher.near",
    amountAtomic: "0.04", // Not an integer in yoctoNEAR!
    purpose: "Research Data Access",
  },
});
assert.equal(invalidFloatParse.success, false);

console.log("✅ All 9 deterministic policy and schema unit test suites passed.");
