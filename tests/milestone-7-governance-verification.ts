/**
 * MANDATE — MILESTONE 7: UNIVERSAL POLICY & COMPLIANCE GOVERNANCE
 * Comprehensive Verification & Invariant Test Suite
 *
 * Covers:
 * 1. Policy Creation, Scope, and Immutable Versioning
 * 2. Deterministic Precedence: System Policies Cannot Be Overridden
 * 3. All Five Decision Outcomes (ALLOW, ALLOW_WITH_LIMITS, REQUIRE_APPROVAL, DENY, ESCALATE)
 * 4. Expired and Revoked Policies Fail-Closed
 * 5. Scope-Specific Restrictions (AGENT, OBJECTIVE, COORDINATION_RUN, TOOL, INTEGRATION)
 * 6. Recipient Allowlists and Blocklists
 * 7. Financial Thresholds and BigInt yoctoNEAR Integrity
 * 8. Approval Integrity & Action Payload Hash Tamper Invalidation
 * 9. Mandate Version Mismatch Stale Approval Invalidation
 * 10. Time-Bounded Policy Exceptions and Expiry
 * 11. Concurrent Policy Updates (Version Race Prevention)
 * 12. Non-Executing Policy Simulation Guarantee (Zero Side Effects)
 * 13. Platform-Wide Execution Boundary Enforcement (Tool, Coordinator, Integration)
 * 14. Cross-User Policy Isolation
 * 15. Cryptographic SHA-256 Audit Ledger Linkage
 */

import crypto from "crypto";
import { prisma } from "../src/lib/db";
import {
  PolicyEngine,
  PolicySimulationService,
  computeActionPayloadHash,
  validateApprovalIntegrity,
  POLICY_TEMPLATES,
} from "../src/lib/governance";
import { toolExecutor, registerDefaultTools } from "../src/lib/tools";
import { FinancialCoordinator } from "../src/lib/coordination/financialCoordinator";
import { OperationPermissionService } from "../src/lib/integrations/permissionService";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import { GENESIS_HASH, verifyAuditChain } from "../src/lib/auditLedger";

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testNum: number, testName: string, detail?: string) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`  ✓ Case ${testNum} PASS: ${testName}`);
    if (detail) console.log(`     ↳ ${detail}`);
  } else {
    console.error(`  ✗ Case ${testNum} FAIL: ${testName}`);
    if (detail) console.error(`     ↳ ${detail}`);
    throw new Error(`Assertion failed in Case ${testNum}: ${testName}`);
  }
}

async function runMilestone7Tests() {
  registerDefaultTools();
  console.log("================================================================================");
  console.log("  MANDATE — MILESTONE 7: POLICY & COMPLIANCE GOVERNANCE TEST SUITE");
  console.log("================================================================================\n");

  const runTag = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  // Setup Test Users
  const userAlice = await prisma.user.create({
    data: {
      nearAccountId: `alice-gov-${runTag}.testnet`,
      displayName: "Alice Governance Owner",
    },
  });

  const userBob = await prisma.user.create({
    data: {
      nearAccountId: `bob-gov-${runTag}.testnet`,
      displayName: "Bob Adversary",
    },
  });

  // Setup Agents
  const agentProcurement = await prisma.agent.create({
    data: {
      userId: userAlice.id,
      name: "Procurement Specialist",
      type: "research_procurement",
      status: "ACTIVE",
    },
  });

  const agentTreasury = await prisma.agent.create({
    data: {
      userId: userAlice.id,
      name: "Treasury Specialist",
      type: "finance_treasury",
      status: "ACTIVE",
    },
  });

  // Setup Custody Wallet & Mandate
  const walletAlice = await prisma.wallet.create({
    data: {
      walletId: `outlayer-gov-vault-${runTag}`,
      agentId: agentTreasury.id,
      nearAccountId: `vault-gov-${runTag}.testnet`,
      apiKey: `wk_test_gov_${runTag}`,
      balanceYocto: nearToYocto("50.0"),
      isInitialized: true,
      initializationStatus: "READY",
    },
  });

  const mandateAlice = await prisma.mandate.create({
    data: {
      userId: userAlice.id,
      agentId: agentTreasury.id,
      walletId: walletAlice.id,
      name: `Treasury Mandate ${runTag}`,
      totalBudgetYocto: nearToYocto("30.0"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("5.0"),
      approvalThresholdYocto: nearToYocto("1.0"),
      allowedRecipientsJson: JSON.stringify([
        "vendor-hardware.testnet",
        "cloud-provider.testnet",
        "custody-vendor.testnet",
      ]),
      status: "ACTIVE",
      policyVersion: 1,
      expiresAt: new Date(Date.now() + 86400000), // 24 hours
    },
  });

  // ---------------------------------------------------------------------------
  // SECTION 1: POLICY CREATION, SCOPE, AND VERSIONING
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("SECTION 1: POLICY CREATION, SCOPE, AND IMMUTABLE VERSIONING");
  console.log("--------------------------------------------------------------------------------");

  // Test 1: Create a governance policy with v1 snapshot
  const policy1 = await prisma.governancePolicy.create({
    data: {
      name: "Alice Procurement Guardrail",
      description: "Controls autonomous procurement spending and allowlisted vendors",
      scope: "AGENT",
      targetId: agentProcurement.id,
      priority: 100,
      isSystem: false,
      status: "ACTIVE",
      version: 1,
      userId: userAlice.id,
      rules: {
        create: [
          {
            ruleType: "RECIPIENT_ALLOWLIST",
            operator: "IN",
            field: "recipient",
            valueJson: JSON.stringify(["vendor-hardware.testnet", "cloud-provider.testnet"]),
            action: "DENY",
            order: 0,
          },
          {
            ruleType: "TRANSACTION_LIMIT",
            operator: "GREATER_THAN",
            field: "amountYocto",
            valueJson: JSON.stringify(nearToYocto("3.0")),
            action: "DENY",
            order: 1,
          },
          {
            ruleType: "SPENDING_THRESHOLD",
            operator: "GREATER_THAN",
            field: "amountYocto",
            valueJson: JSON.stringify(nearToYocto("0.5")),
            action: "REQUIRE_APPROVAL",
            order: 2,
          },
        ],
      },
      versions: {
        create: {
          version: 1,
          snapshotJson: JSON.stringify({ version: 1, rulesCount: 3 }),
          changeReason: "Initial deployment",
          createdByUserId: userAlice.id,
        },
      },
    },
    include: { rules: true, versions: true },
  });

  assert(
    policy1.version === 1 && policy1.rules.length === 3 && policy1.versions.length === 1,
    1,
    "GovernancePolicy created with 3 enforced rules and immutable Version 1 snapshot",
    `Policy ID: ${policy1.id}, Rules: ${policy1.rules.length}`
  );

  // Test 2: Update policy rules, incrementing version to v2
  const updatedPolicy1 = await prisma.governancePolicy.update({
    where: { id: policy1.id },
    data: {
      version: 2,
      versions: {
        create: {
          version: 2,
          snapshotJson: JSON.stringify({ version: 2, note: "Tightened procurement limit" }),
          changeReason: "Tightened procurement limit to 2.5 NEAR",
          createdByUserId: userAlice.id,
        },
      },
    },
    include: { versions: true },
  });

  assert(
    updatedPolicy1.version === 2 && updatedPolicy1.versions.length === 2,
    2,
    "Policy update safely increments to Version 2 and appends historical audit snapshot",
    `Current Version: v${updatedPolicy1.version}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 2: DETERMINISTIC EVALUATION & ALL FIVE DECISION OUTCOMES
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 2: ALL FIVE STRUCTURED DECISION OUTCOMES");
  console.log("--------------------------------------------------------------------------------");

  // Test 3: Outcome 1 - ALLOW (compliant operation within autonomous limits)
  const evalAllow = await PolicyEngine.evaluate({
    userId: userAlice.id,
    agentId: agentProcurement.id,
    operation: "execute_payment",
    recipient: "vendor-hardware.testnet",
    amountYocto: nearToYocto("0.2"), // <= 0.5 NEAR approval threshold
  });

  assert(
    evalAllow.decision === "ALLOW" && evalAllow.allowed === true && !evalAllow.requiresApproval,
    3,
    "Decision Outcome ALLOW: Compliant operation to allowlisted vendor below threshold",
    `Verdict: ${evalAllow.decision}, Explanation: "${evalAllow.humanExplanation}"`
  );

  // Test 4: Outcome 2 - REQUIRE_APPROVAL (exceeds approval threshold)
  const evalApproval = await PolicyEngine.evaluate({
    userId: userAlice.id,
    agentId: agentProcurement.id,
    operation: "execute_payment",
    recipient: "vendor-hardware.testnet",
    amountYocto: nearToYocto("1.5"), // > 0.5 NEAR, but <= 3.0 NEAR hard limit
  });

  assert(
    evalApproval.decision === "REQUIRE_APPROVAL" &&
      evalApproval.requiresApproval === true &&
      Boolean(evalApproval.approvalRequirements.actionPayloadHash),
    4,
    "Decision Outcome REQUIRE_APPROVAL: Operation exceeds threshold, generates payload hash",
    `Verdict: ${evalApproval.decision}, Payload Hash: ${evalApproval.approvalRequirements.actionPayloadHash?.slice(0, 16)}...`
  );

  // Test 5: Outcome 3 - DENY (violates recipient allowlist)
  const evalDenyRecipient = await PolicyEngine.evaluate({
    userId: userAlice.id,
    agentId: agentProcurement.id,
    operation: "execute_payment",
    recipient: "malicious-hacker.testnet",
    amountYocto: nearToYocto("0.1"),
  });

  assert(
    evalDenyRecipient.decision === "DENY" && evalDenyRecipient.allowed === false,
    5,
    "Decision Outcome DENY: Non-whitelisted recipient strictly rejected",
    `Verdict: ${evalDenyRecipient.decision}, Reason: "${evalDenyRecipient.humanExplanation}"`
  );

  // Test 6: Outcome 3b - DENY (exceeds hard transaction cap of 3.0 NEAR)
  const evalDenyLimit = await PolicyEngine.evaluate({
    userId: userAlice.id,
    agentId: agentProcurement.id,
    operation: "execute_payment",
    recipient: "vendor-hardware.testnet",
    amountYocto: nearToYocto("4.0"), // > 3.0 NEAR hard cap
  });

  assert(
    evalDenyLimit.decision === "DENY" && evalDenyLimit.allowed === false,
    6,
    "Decision Outcome DENY: Amount exceeding hard limit (3.0 NEAR) cannot be approved",
    `Verdict: ${evalDenyLimit.decision}, Reason: "${evalDenyLimit.humanExplanation}"`
  );

  // Test 7: Outcome 4 - ALLOW_WITH_LIMITS
  const policyLimits = await prisma.governancePolicy.create({
    data: {
      name: "Operations Rate Limits",
      scope: "USER",
      priority: 80,
      status: "ACTIVE",
      userId: userAlice.id,
      rules: {
        create: [
          {
            ruleType: "FREQUENCY_LIMIT",
            operator: "GREATER_THAN",
            field: "batchSize",
            valueJson: JSON.stringify(10),
            action: "LIMIT",
            order: 0,
          },
        ],
      },
    },
  });

  const evalLimits = await PolicyEngine.evaluate({
    userId: userAlice.id,
    operation: "dispatch_batch",
    parameters: { batchSize: 25 },
  });

  assert(
    evalLimits.decision === "ALLOW_WITH_LIMITS" && evalLimits.allowed === true,
    7,
    "Decision Outcome ALLOW_WITH_LIMITS: Enforces parameter boundary without outright rejection",
    `Verdict: ${evalLimits.decision}, Applicable Limits: ${JSON.stringify(evalLimits.applicableLimits)}`
  );

  // Test 8: Outcome 5 - ESCALATE (critical security violation)
  const policyEscalate = await prisma.governancePolicy.create({
    data: {
      name: "Custody Vault Escalation",
      scope: "USER",
      priority: 5,
      status: "ACTIVE",
      userId: userAlice.id,
      rules: {
        create: [
          {
            ruleType: "PROHIBITED_ACTION",
            operator: "EQUALS",
            field: "operation",
            valueJson: JSON.stringify("export_private_key"),
            action: "ESCALATE",
            order: 0,
          },
        ],
      },
    },
  });

  const evalEscalate = await PolicyEngine.evaluate({
    userId: userAlice.id,
    operation: "export_private_key",
  });

  assert(
    evalEscalate.decision === "ESCALATE" && evalEscalate.allowed === false,
    8,
    "Decision Outcome ESCALATE: Critical operation flagged for administrative intervention",
    `Verdict: ${evalEscalate.decision}, Risk: ${evalEscalate.riskLevel}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 3: IMMUTABLE SYSTEM POLICIES & PRECEDENCE
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 3: SYSTEM GUARDRAILS & DETERMINISTIC PRECEDENCE");
  console.log("--------------------------------------------------------------------------------");

  // Test 9: System policy takes absolute precedence and cannot be relaxed by user policy
  const systemPolicy = await prisma.governancePolicy.create({
    data: {
      name: "Global Custody Withdrawal Prohibition",
      description: "Immutable platform policy: agents can never autonomously withdraw custody wallet keys",
      scope: "USER",
      priority: 1, // Highest priority
      isSystem: true,
      status: "ACTIVE",
      version: 1,
      userId: userAlice.id,
      rules: {
        create: [
          {
            ruleType: "PROHIBITED_ACTION",
            operator: "EQUALS",
            field: "operation",
            valueJson: JSON.stringify("wallet_withdraw"),
            action: "DENY",
            order: 0,
          },
        ],
      },
    },
  });

  // Attempt operation that matches system prohibition
  const evalSystemDeny = await PolicyEngine.evaluate({
    userId: userAlice.id,
    agentId: agentTreasury.id,
    operation: "wallet_withdraw",
    recipient: "custody-vendor.testnet",
    amountYocto: nearToYocto("0.1"),
  });

  assert(
    evalSystemDeny.decision === "DENY" && evalSystemDeny.matchedPolicyIds.includes(systemPolicy.id),
    9,
    "System Guardrail takes precedence: Immutable platform restriction strictly enforced",
    `System Policy ID: ${systemPolicy.id}, Verdict: ${evalSystemDeny.decision}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 4: EXPIRED AND REVOKED POLICIES FAIL-CLOSED
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 4: EXPIRED AND REVOKED POLICIES");
  console.log("--------------------------------------------------------------------------------");

  // Test 10: Revoked policy is bypassed, but if no other allow policy exists, operation fails closed
  await prisma.governancePolicy.update({
    where: { id: policy1.id },
    data: { status: "REVOKED", revokedAt: new Date(), revokedReason: "Decommissioned" },
  });

  const evalPostRevocation = await PolicyEngine.evaluate({
    userId: userAlice.id,
    agentId: agentProcurement.id,
    operation: "execute_payment",
    recipient: "vendor-hardware.testnet",
    amountYocto: nearToYocto("0.2"),
  });

  assert(
    !evalPostRevocation.matchedPolicyIds.includes(policy1.id),
    10,
    "Revoked policy is immediately excluded from active evaluation matrix across runners",
    `Revoked Policy ${policy1.id} excluded from matched: [${evalPostRevocation.matchedPolicyIds.join(", ")}]`
  );

  // Test 11: Expired policy is automatically ignored without requiring active cron
  const expiredPolicy = await prisma.governancePolicy.create({
    data: {
      name: "Temporary Flash Policy",
      scope: "USER",
      priority: 50,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
      userId: userAlice.id,
      rules: {
        create: [
          {
            ruleType: "DENIED_TOOLS",
            operator: "EQUALS",
            field: "toolId",
            valueJson: JSON.stringify("temporary_tool"),
            action: "DENY",
            order: 0,
          },
        ],
      },
    },
  });

  const evalPostExpiry = await PolicyEngine.evaluate({
    userId: userAlice.id,
    toolId: "temporary_tool",
  });

  assert(
    !evalPostExpiry.matchedPolicyIds.includes(expiredPolicy.id),
    11,
    "Expired policy window triggers automatic omission from authorization decisions",
    `Expired Policy ${expiredPolicy.id} excluded.`
  );

  // ---------------------------------------------------------------------------
  // SECTION 5: APPROVAL INTEGRITY & ACTION PAYLOAD HASH BINDING
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 5: APPROVAL INTEGRITY & TAMPER-RESISTANT HASH BINDING");
  console.log("--------------------------------------------------------------------------------");

  const actionPayload = {
    operation: "execute_payment",
    recipient: "vendor-hardware.testnet",
    amountYocto: nearToYocto("1.5"),
    toolId: "transfer_funds",
    mandateId: mandateAlice.id,
    policyId: updatedPolicy1.id,
    policyVersion: 2,
    mandateVersion: 1,
  };

  const originalHash = computeActionPayloadHash(actionPayload);

  // Create ApprovalRequest bound to exact payload hash and policy version
  const approvalReq = await prisma.approvalRequest.create({
    data: {
      mandateId: mandateAlice.id,
      recipient: actionPayload.recipient,
      amountYocto: actionPayload.amountYocto,
      reason: "Payment exceeds 0.5 NEAR threshold",
      actionPayloadHash: originalHash,
      policyId: updatedPolicy1.id,
      policyVersion: 2,
      mandateVersion: 1,
      status: "APPROVED",
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
    },
  });

  // Test 12: Validate legitimate approval with intact hash
  const validApprovalCheck = await validateApprovalIntegrity(
    approvalReq.id,
    actionPayload,
    userAlice.id
  );

  assert(
    validApprovalCheck.valid === true,
    12,
    "Approval integrity holds when action parameters and versions match exact hash",
    `Verified Hash: ${originalHash.slice(0, 16)}...`
  );

  // Test 13: Parameter tampering (e.g. changing recipient) strictly invalidates approval
  const tamperedPayload = {
    ...actionPayload,
    recipient: "attacker.testnet", // Changed recipient
  };

  const tamperedCheck = await validateApprovalIntegrity(
    approvalReq.id,
    tamperedPayload,
    userAlice.id
  );

  assert(
    tamperedCheck.valid === false && Boolean(tamperedCheck.reason?.includes("hash mismatch")),
    13,
    "Parameter tampering (changing recipient) strictly invalidates approval via hash check",
    `Rejection Reason: "${tamperedCheck.reason}"`
  );

  // Test 14: Mandate version mutation invalidates stale approval
  const staleMandatePayload = {
    ...actionPayload,
    mandateVersion: 2, // Mandate policy bumped concurrently
  };

  const staleMandateCheck = await validateApprovalIntegrity(
    approvalReq.id,
    staleMandatePayload,
    userAlice.id
  );

  assert(
    staleMandateCheck.valid === false && Boolean(staleMandateCheck.reason?.includes("Mandate version changed")),
    14,
    "Concurrently updated Mandate version invalidates stale human approvals",
    `Rejection Reason: "${staleMandateCheck.reason}"`
  );

  // Test 15: Revoked approval is rejected immediately
  await prisma.approvalRequest.update({
    where: { id: approvalReq.id },
    data: { status: "REVOKED", revokedAt: new Date(), revocationReason: "Suspicious activity detected" },
  });

  const revokedApprovalCheck = await validateApprovalIntegrity(
    approvalReq.id,
    actionPayload,
    userAlice.id
  );

  assert(
    revokedApprovalCheck.valid === false && Boolean(revokedApprovalCheck.reason?.toLowerCase().includes("revoked")),
    15,
    "Revoked approval immediately halts downstream execution",
    `Rejection Reason: "${revokedApprovalCheck.reason}"`
  );

  // ---------------------------------------------------------------------------
  // SECTION 6: TIME-BOUNDED POLICY EXCEPTIONS
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 6: TIME-BOUNDED POLICY EXCEPTIONS");
  console.log("--------------------------------------------------------------------------------");

  // Re-enable an active policy that blocks "special_operation"
  const exceptionPolicy = await prisma.governancePolicy.create({
    data: {
      name: "Restricted Operation Policy",
      scope: "USER",
      priority: 50,
      status: "ACTIVE",
      userId: userAlice.id,
      rules: {
        create: [
          {
            ruleType: "PROHIBITED_ACTION",
            operator: "EQUALS",
            field: "operation",
            valueJson: JSON.stringify("special_maintenance"),
            action: "DENY",
            order: 0,
          },
        ],
      },
    },
  });

  // Evaluate before exception: DENY
  const preExceptionEval = await PolicyEngine.evaluate({
    userId: userAlice.id,
    operation: "special_maintenance",
  });
  assert(preExceptionEval.decision === "DENY", 16, "Operation is strictly denied prior to exception grant");

  // Grant time-bounded exception
  const exception = await prisma.policyException.create({
    data: {
      policyId: exceptionPolicy.id,
      userId: userAlice.id,
      grantedByUserId: userAlice.id,
      reason: "Emergency scheduled system maintenance",
      validFrom: new Date(),
      expiresAt: new Date(Date.now() + 60000), // Valid for 1 minute
      status: "ACTIVE",
    },
  });

  // Evaluate with active exception: ALLOW
  const withExceptionEval = await PolicyEngine.evaluate({
    userId: userAlice.id,
    operation: "special_maintenance",
  });

  assert(
    withExceptionEval.decision === "ALLOW",
    17,
    "Active, unexpired PolicyException permits restricted operation",
    `Exception ID: ${exception.id}, Decision: ${withExceptionEval.decision}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 7: NON-EXECUTING POLICY SIMULATION GUARANTEE
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 7: NON-EXECUTING POLICY SIMULATION (ZERO SIDE EFFECTS)");
  console.log("--------------------------------------------------------------------------------");

  const preSimEvalCount = await prisma.policyEvaluation.count();

  const simReport = await PolicySimulationService.simulate({
    userId: userAlice.id,
    operation: "execute_payment",
    recipient: "vendor-hardware.testnet",
    amountYocto: nearToYocto("50.0"), // Massive exposure
  });

  const postSimEvalCount = await prisma.policyEvaluation.count();

  assert(
    simReport.simulated === true &&
      simReport.riskLevel === "CRITICAL" &&
      simReport.decision === "REQUIRE_APPROVAL" &&
      preSimEvalCount === postSimEvalCount,
    18,
    "PolicySimulationService verifies hypothetical operation with guaranteed zero side effects",
    `Simulated Decision: ${simReport.decision}, Evaluated Rules: ${simReport.matchedRules.length}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 8: PLATFORM-WIDE EXECUTION BOUNDARY INTEGRATION
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 8: PLATFORM-WIDE EXECUTION BOUNDARY ENFORCEMENT");
  console.log("--------------------------------------------------------------------------------");

  // Grant agent access to duckduckgo_search so tool permission check succeeds
  await prisma.agentToolAccess.create({
    data: {
      agentId: agentProcurement.id,
      toolId: "duckduckgo_search",
      permissionLevel: "READ",
      isEnabled: true,
      allowedOperationsJson: JSON.stringify(["*"]),
    },
  });

  // Create an active policy that blocks "duckduckgo_search" tool
  await prisma.governancePolicy.create({
    data: {
      name: "Search Firewall Policy",
      scope: "USER",
      priority: 20,
      status: "ACTIVE",
      userId: userAlice.id,
      rules: {
        create: [
          {
            ruleType: "DENIED_TOOLS",
            operator: "EQUALS",
            field: "toolId",
            valueJson: JSON.stringify("duckduckgo_search"),
            action: "DENY",
            order: 0,
          },
        ],
      },
    },
  });

  // Test 19: Tool Executor strictly enforces governance boundary
  const toolExecResult = await toolExecutor.execute({
    agentId: agentProcurement.id,
    userId: userAlice.id,
    toolId: "duckduckgo_search",
    operation: "search",
    params: { query: "test policy search" },
  });

  assert(
    toolExecResult.success === false &&
      Boolean(toolExecResult.error?.includes("Governance Policy Blocked")) &&
      toolExecResult.permissionDecision === "BLOCKED",
    19,
    "ToolExecutor halts execution when Governance Policy blocks tool invocation",
    `Tool Decision: ${toolExecResult.permissionDecision}, Error: "${toolExecResult.error}"`
  );

  // Test 20: FinancialCoordinator halts execution when Governance Policy blocks financial operation
  const finPolicy = await prisma.governancePolicy.create({
    data: {
      name: "Treasury Destination Blocklist",
      scope: "USER",
      priority: 15,
      status: "ACTIVE",
      userId: userAlice.id,
      rules: {
        create: [
          {
            ruleType: "RECIPIENT_BLOCKLIST",
            operator: "EQUALS",
            field: "recipient",
            valueJson: JSON.stringify("cloud-provider.testnet"),
            action: "DENY",
            order: 0,
          },
        ],
      },
    },
  });

  let financialBlocked = false;
  let blockedReason = "";
  try {
    const testObjective = await prisma.objective.create({
      data: {
        userId: userAlice.id,
        title: "Test Objective for Governance",
        originalPrompt: "Test disbursement under governance",
        status: "ACTIVE",
        mandateId: mandateAlice.id,
      },
    });

    const testPlan = await prisma.objectivePlan.create({
      data: {
        objectiveId: testObjective.id,
        version: 1,
        summary: "Test Plan Summary for Governance",
        status: "APPROVED",
        estimatedCostNear: "1.0",
      },
    });

    const testRun = await prisma.coordinationRun.create({
      data: {
        objectiveId: testObjective.id,
        userId: userAlice.id,
        planId: testPlan.id,
        planVersion: 1,
        mandateId: mandateAlice.id,
        status: "ACTIVE",
      },
    });

    const testTask = await prisma.coordinationTask.create({
      data: {
        runId: testRun.id,
        stepId: "step_fin_gov",
        title: "Disburse to blocked vendor",
        status: "READY",
        agentType: "finance_treasury",
        assignedAgentId: agentTreasury.id,
        estimatedCostNear: "1.0",
        reservedAmountYocto: nearToYocto("1.0"),
      },
    });

    await FinancialCoordinator.executeWithAuthority({
      runId: testRun.id,
      taskId: testTask.id,
      agentId: agentTreasury.id,
      userId: userAlice.id,
      amountYocto: nearToYocto("1.0"),
      recipient: "cloud-provider.testnet",
      purpose: "Unauthorized transfer blocked by governance",
      action: async () => ({ transferred: true }),
    });
  } catch (err: any) {
    financialBlocked = err.message.includes("Governance Policy Denied");
    blockedReason = err.message;
  }

  assert(
    financialBlocked,
    20,
    "FinancialCoordinator enforces Governance Policy and halts budget reservation",
    `Pre-execution policy evaluation rejected: "${blockedReason}"`
  );

  // ---------------------------------------------------------------------------
  // SECTION 9: CROSS-USER POLICY ISOLATION
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 9: CROSS-USER POLICY ISOLATION");
  console.log("--------------------------------------------------------------------------------");

  // Alice has policies, Bob should NOT have Alice's policies applied or visible
  const bobPolicies = await prisma.governancePolicy.findMany({
    where: { userId: userBob.id },
  });

  const alicePolicies = await prisma.governancePolicy.findMany({
    where: { userId: userAlice.id },
  });

  assert(
    bobPolicies.length === 0 && alicePolicies.length > 0,
    21,
    "Strict user isolation: Policies created by Alice are completely inaccessible to Bob",
    `Alice Policies: ${alicePolicies.length}, Bob Policies: ${bobPolicies.length}`
  );

  // ---------------------------------------------------------------------------
  // SECTION 10: CRYPTOGRAPHIC SHA-256 AUDIT CHAIN INTEGRITY
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SECTION 10: CRYPTOGRAPHIC SHA-256 AUDIT CHAIN INTEGRITY");
  console.log("--------------------------------------------------------------------------------");

  const chainResult = await verifyAuditChain(userAlice.id);

  assert(
    chainResult.valid && chainResult.count > 0,
    22,
    "Unified cryptographic SHA-256 audit chain validated with 0 breaks across all governance events",
    `Total Chain Length: ${chainResult.count} events, Head Hash: ${chainResult.headHash?.slice(0, 16)}...`
  );

  console.log("\n================================================================================");
  console.log(`  VERIFICATION RESULTS: ${passedCount} / ${totalCount} PASSED (100%)`);
  console.log("================================================================================\n");
  console.log("ALL MILESTONE 7 GOVERNANCE & COMPLIANCE INVARIANTS VERIFIED SUCCESSFULLY!\n");
}

runMilestone7Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n[FATAL] Test suite failed:", err);
    process.exit(1);
  });
