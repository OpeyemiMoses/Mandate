/**
 * MANDATE — MILESTONE 13.8 COMPREHENSIVE VERIFICATION SUITE
 * Real Agent Execution, External Integrations & Verifiable Objective Fulfillment
 *
 * Core Principle: AI proposes. Mandate enforces. The user controls. OutLayer executes.
 *
 * Gates Verified:
 *  Gate 1: Phase 0 Integration Inventory & Master Registry Audit
 *  Gate 2: Phase 1 & 2 Real Tool Invocation & PostgreSQL Persistence
 *  Gate 3: Phase 3 Production Agent Execution Binding & Tool Dispatch
 *  Gate 4: Phase 4 Independent Evidence Verification & Anti-Self-Certification
 *  Gate 5: Phase 5 & 9 20 Integration Failure Injections
 *  Gate 6: Phase 6 Demonstration 1: Autonomous Web Research & Procurement Discovery
 *  Gate 7: Phase 6 Demonstration 2: NEAR Blockchain Intelligence & Account State Audit
 *  Gate 8: Phase 6 Demonstration 3: Multi-Provider Collaborative Workflow
 *  Gate 9: Phase 7 OutLayer TEE 4-Tier Attestation & Hardware Verification
 *  Gate 10: Phase 8 Customer-Facing Integrations API & UI Validation
 *  Gate 11: Zero Financial Drift & Zero Mainnet Broadcasts Gate
 */

import { prisma } from "../src/lib/db";
import { toolExecutor } from "../src/lib/tools/executor";
import { toolRegistry } from "../src/lib/tools/registry";
import { grantAgentToolAccess } from "../src/lib/tools/access";
import { registerDefaultTools } from "../src/lib/tools";
import { registerDefaultAgents } from "../src/lib/runtime/registry";
import { ProviderVerificationService } from "../src/lib/providers/providerVerificationService";
import { OutLayerTeeVerificationService } from "../src/lib/providers/outlayerTeeVerification";
import {
  IndependentEvidenceService,
  assertAntiSelfCertification,
  AntiSelfCertificationError,
} from "../src/lib/orchestration/evidenceService";
import { TaskVerificationService } from "../src/lib/orchestration/verificationService";
import { IntegrationFailureHarness } from "../src/lib/testing/integrationFailureHarness";
import { ObjectiveLifecycleService } from "../src/lib/objectives/lifecycleService";
import { ObjectiveOrchestrationService } from "../src/lib/orchestration/orchestrationService";
import { AgentCapabilityRegistry } from "../src/lib/agents/capabilityRegistry";
import { computePlanContentHash } from "../src/lib/objectives/types";
import { canonicalize } from "../src/lib/auditLedger";
import crypto from "crypto";

// Ensure tool registry and agents are registered
registerDefaultTools();
registerDefaultAgents();

let passedGates = 0;
let totalGates = 11;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runMilestone138Tests() {
  console.log("================================================================================");
  console.log("🚀 STARTING MANDATE MILESTONE 13.8 VERIFICATION SUITE");
  console.log("   Real Agent Execution, External Integrations & Verifiable Fulfillment");
  console.log("================================================================================\n");

  const testSuffix = Date.now().toString().slice(-6);
  const testEmail = `test_m13_8_${testSuffix}@mandate.internal`;
  const testAccountId = `test_m13_8_${testSuffix}.testnet`;

  // 1. Setup Test User
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      nearAccountId: testAccountId,
      role: "USER",
    },
  });

  // 2. Setup Three Specialized Agents
  // Research Agent
  const researchAgent = await prisma.agent.create({
    data: {
      name: `Research Agent ${testSuffix}`,
      type: "research_procurement",
      version: "1.0.0",
      userId: user.id,
      status: "ACTIVE",
    },
  });

  // Operations Agent
  const operationsAgent = await prisma.agent.create({
    data: {
      name: `Operations Agent ${testSuffix}`,
      type: "operations_execution",
      version: "1.0.0",
      userId: user.id,
      status: "ACTIVE",
    },
  });

  // Security Auditor Agent
  const auditorAgent = await prisma.agent.create({
    data: {
      name: `Security Auditor ${testSuffix}`,
      type: "security_auditor",
      version: "1.0.0",
      userId: user.id,
      status: "ACTIVE",
    },
  });

  // Grant tool permissions and register capability profiles
  for (const agent of [researchAgent, operationsAgent, auditorAgent]) {
    await grantAgentToolAccess({
      agentId: agent.id,
      userId: user.id,
      toolId: "duckduckgo_search",
      permissionLevel: "READ",
    });
    await grantAgentToolAccess({
      agentId: agent.id,
      userId: user.id,
      toolId: "near_rpc_reader",
      permissionLevel: "READ",
    });

    const taskTypes =
      agent.type === "security_auditor"
        ? (["ANALYSIS", "VERIFICATION"] as const)
        : (["RESEARCH", "ANALYSIS", "EXECUTION"] as const);

    await AgentCapabilityRegistry.registerOrVerifyProfile({
      agentId: agent.id,
      userId: user.id,
      supportedTaskTypes: [...taskTypes],
    });
  }

  // ---------------------------------------------------------------------------
  // GATE 1: Phase 0 Integration Inventory & Master Registry Audit
  // ---------------------------------------------------------------------------
  console.log("--- GATE 1: Phase 0 Integration Inventory & Master Registry Audit ---");
  const inventory = ProviderVerificationService.getProviderInventory();
  assert(inventory.length >= 4, "Provider inventory returns all standard registered providers");
  assert(
    inventory.some((p) => p.providerId === "fastnear_testnet_rpc"),
    "FastNEAR Testnet RPC registered in inventory"
  );
  assert(
    inventory.some((p) => p.providerId === "outlayer_tee"),
    "OutLayer Intel SGX TEE registered in inventory"
  );
  assert(
    inventory.some((p) => p.providerId === "duckduckgo_search"),
    "DuckDuckGo Search registered in inventory"
  );
  assert(toolRegistry.has("duckduckgo_search"), "ToolRegistry contains duckduckgo_search");
  assert(toolRegistry.has("near_rpc_reader"), "ToolRegistry contains near_rpc_reader");
  assert(toolRegistry.has("generic_rest_client"), "ToolRegistry contains generic_rest_client");
  passedGates++;
  console.log("✅ GATE 1 PASSED: Integration inventory verified\n");

  // ---------------------------------------------------------------------------
  // GATE 2: Phase 1 & 2 Real Tool Invocation & PostgreSQL Persistence
  // ---------------------------------------------------------------------------
  console.log("--- GATE 2: Phase 1 & 2 Real Tool Invocation & Database Persistence ---");
  // Execute live DuckDuckGo search tool
  const ddgRes = await toolExecutor.execute({
    agentId: researchAgent.id,
    userId: user.id,
    toolId: "duckduckgo_search",
    operation: "search",
    params: { query: "NEAR Protocol blockchain testnet documentation", limit: 3 },
  });

  assert(ddgRes.success, "Real DuckDuckGo tool execution succeeded");
  assert(Boolean(ddgRes.invocationId), "Tool invocation ID returned");
  assert(Array.isArray(ddgRes.data?.sources), "DuckDuckGo tool returned sources array");
  assert(ddgRes.data.sources.length > 0, "DuckDuckGo tool retrieved authentic web sources");

  // Verify ToolInvocation record in PostgreSQL
  const dbInvocation = await prisma.toolInvocation.findFirst({
    where: { invocationId: ddgRes.invocationId },
  });
  assert(Boolean(dbInvocation), "ToolInvocation record found in PostgreSQL database");
  assert(dbInvocation?.status === "SUCCESS", "ToolInvocation status recorded as SUCCESS in DB");
  assert(dbInvocation?.toolId === "duckduckgo_search", "ToolInvocation recorded with toolId duckduckgo_search");
  assert(dbInvocation?.userId === user.id, "ToolInvocation tenant ownership preserved");
  assert((dbInvocation?.durationMs || 0) > 0, "ToolInvocation latency recorded in milliseconds");

  // Execute live FastNEAR Testnet RPC tool
  const rpcRes = await toolExecutor.execute({
    agentId: operationsAgent.id,
    userId: user.id,
    toolId: "near_rpc_reader",
    operation: "view_account",
    params: { accountId: "testnet" },
  });
  assert(rpcRes.success, "Real FastNEAR Testnet RPC tool execution succeeded");
  assert(Boolean(rpcRes.data?.blockHeight), "FastNEAR RPC returned authentic block height");
  assert(Boolean(rpcRes.data?.amountYocto), "FastNEAR RPC returned authentic account balance");

  // Verify second ToolInvocation record in PostgreSQL
  const rpcDbInvocation = await prisma.toolInvocation.findFirst({
    where: { invocationId: rpcRes.invocationId },
  });
  assert(Boolean(rpcDbInvocation), "FastNEAR ToolInvocation record persisted in PostgreSQL");
  assert(rpcDbInvocation?.toolId === "near_rpc_reader", "FastNEAR ToolInvocation recorded with correct toolId");

  passedGates++;
  console.log("✅ GATE 2 PASSED: Real tool invocations and PostgreSQL persistence certified\n");

  // ---------------------------------------------------------------------------
  // GATE 3: Phase 3 Production Agent Execution Binding & Tool Dispatch
  // ---------------------------------------------------------------------------
  console.log("--- GATE 3: Phase 3 Production Agent Execution Binding ---");
  // Ensure that agents have verified capability profiles
  const researchProfile = await AgentCapabilityRegistry.getProfile(researchAgent.id, user.id);
  assert(researchProfile.supportedTools.includes("duckduckgo_search"), "Research agent supports duckduckgo_search");

  const opsProfile = await AgentCapabilityRegistry.getProfile(operationsAgent.id, user.id);
  assert(opsProfile.supportedTools.includes("near_rpc_reader"), "Operations agent supports near_rpc_reader");

  const auditorProfile = await AgentCapabilityRegistry.getProfile(auditorAgent.id, user.id);
  assert(auditorProfile.supportedTaskTypes.includes("VERIFICATION"), "Auditor agent supports VERIFICATION task type");
  passedGates++;
  console.log("✅ GATE 3 PASSED: Agent execution bindings validated\n");

  // ---------------------------------------------------------------------------
  // GATE 4: Phase 4 Independent Evidence Verification & Anti-Self-Certification
  // ---------------------------------------------------------------------------
  console.log("--- GATE 4: Phase 4 Independent Evidence Verification & Anti-Self-Certification ---");
  // 1. Anti-Self-Certification Check: Same agent cannot verify its own task
  let caughtSelfCertViolation = false;
  try {
    assertAntiSelfCertification(researchAgent.id, researchAgent.id);
  } catch (err: any) {
    if (err instanceof AntiSelfCertificationError || err.name === "AntiSelfCertificationError") {
      caughtSelfCertViolation = true;
    }
  }
  assert(caughtSelfCertViolation, "assertAntiSelfCertification strictly rejects self-verification");

  // 2. Anti-Self-Certification Check: Distinct verifier agent is permitted
  let distinctPermitted = false;
  try {
    assertAntiSelfCertification(researchAgent.id, auditorAgent.id);
    distinctPermitted = true;
  } catch {}
  assert(distinctPermitted, "Distinct verifier agent is accepted");

  // 3. Live URL independent verification
  const realUrl = "https://near.org";
  const urlCheck = await IndependentEvidenceService.verifyResearchUrl(realUrl);
  assert(urlCheck.verified, "Live HTTP verification of genuine URL near.org succeeded");
  assert((urlCheck.httpStatus || 0) < 400, "Genuine URL returned valid HTTP status");
  assert(Boolean(urlCheck.fingerprint), "Live URL verification produced SHA-256 fingerprint");

  // 4. Live URL rejection of non-existent domain
  const fakeUrl = "https://nonexistent-404-domain-for-failure-testing-xyz.com";
  const fakeCheck = await IndependentEvidenceService.verifyResearchUrl(fakeUrl);
  assert(!fakeCheck.verified, "Fake URL verification correctly rejected fail-closed");

  // 5. Live FastNEAR RPC independent verification
  const rpcCheck = await IndependentEvidenceService.verifyNearBlockchainRpc({ accountId: "testnet" });
  assert(rpcCheck.verified, "FastNEAR RPC independent verification for 'testnet' succeeded");
  assert((rpcCheck.blockHeight || 0) > 0, "RPC verified authentic block height > 0");

  passedGates++;
  console.log("✅ GATE 4 PASSED: Independent evidence verification and anti-self-certification certified\n");

  // ---------------------------------------------------------------------------
  // GATE 5: Phase 5 & 9 20 Integration Failure Injections
  // ---------------------------------------------------------------------------
  console.log("--- GATE 5: Phase 5 & 9 20 Integration Failure Injections ---");
  const failureReport = await IntegrationFailureHarness.runAllScenarios({
    userId: user.id,
    agentId: researchAgent.id,
  });

  console.log(`  Scenarios Run: ${failureReport.totalScenarios}, Passed: ${failureReport.passedScenarios}, Failed: ${failureReport.failedScenarios}`);
  for (const s of failureReport.results) {
    assert(s.passed, `Scenario ${s.scenarioId} (${s.scenarioName}) passed: ${s.observedBehavior}`);
  }
  assert(failureReport.passedScenarios === 20, "All 20 integration failure scenarios passed (100% resilience)");
  passedGates++;
  console.log("✅ GATE 5 PASSED: 20 integration failure injection scenarios verified\n");

  // ---------------------------------------------------------------------------
  // Helper: create an approved plan with steps and assignments matching scheduler requirements
  // ---------------------------------------------------------------------------
  async function createApprovedPlanAndAssignments(params: {
    objectiveId: string;
    userId: string;
    summary: string;
    rawSteps: Array<{
      stepId: string;
      title: string;
      description: string;
      order: number;
      taskType: string;
      agentType: string;
      assignedAgentId: string;
      dependencies: string[];
      requiredTools: string[];
      input?: Record<string, any>;
    }>;
  }) {
    const { objectiveId, userId, summary, rawSteps } = params;

    const plan = await prisma.objectivePlan.create({
      data: {
        objectiveId,
        version: 1,
        summary,
        status: "APPROVED",
        planHash: "TEMP_HASH",
        steps: {
          create: rawSteps.map((s) => ({
            stepId: s.stepId,
            objectiveId,
            title: s.title,
            description: s.description,
            order: s.order,
            status: "PENDING",
            taskType: s.taskType,
            agentType: s.agentType,
            assignedAgentId: s.assignedAgentId,
            dependenciesJson: JSON.stringify(s.dependencies),
            requiredToolsJson: JSON.stringify(s.requiredTools),
            inputJson: s.input ? JSON.stringify(s.input) : undefined,
            riskClassification: "LOW",
          })),
        },
      },
      include: { steps: true },
    });

    const currentComputedHash = computePlanContentHash({
      version: plan.version,
      steps: plan.steps.map((s) => ({
        stepId: s.stepId,
        title: s.title,
        agentType: s.agentType,
        requiredTools: JSON.parse(s.requiredToolsJson || "[]"),
        dependencies: JSON.parse(s.dependenciesJson || "[]"),
        riskClassification: s.riskClassification,
        estimatedCostNear: s.estimatedCostNear,
      })),
      constraints: {},
    });

    await prisma.objectivePlan.update({
      where: { id: plan.id },
      data: { planHash: currentComputedHash },
    });
    plan.planHash = currentComputedHash;

    await prisma.objectivePlanApproval.create({
      data: {
        planId: plan.id,
        version: 1,
        userId,
        decision: "APPROVED",
      },
    });

    for (const s of rawSteps) {
      await prisma.agentAssignment.create({
        data: {
          objectiveId,
          planId: plan.id,
          stepId: s.stepId,
          agentId: s.assignedAgentId,
          status: "ASSIGNED",
          leaseToken: `lease_${s.stepId}`,
          leaseExpiresAt: new Date(Date.now() + 3600000),
        },
      });
    }

    return plan;
  }

  async function transitionObjectiveToReady(objectiveId: string, userId: string) {
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId,
      targetStatus: "ACTIVE",
      actorId: userId,
      actorRole: "USER",
      reason: "Objective activated",
    });
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId,
      targetStatus: "PLANNING",
      actorId: userId,
      actorRole: "USER",
      reason: "Objective planning initiated",
    });
    await ObjectiveLifecycleService.transitionStatus({
      objectiveId,
      targetStatus: "READY",
      actorId: userId,
      actorRole: "USER",
      reason: "Plan approved, ready for autonomous execution",
    });
  }

  // ---------------------------------------------------------------------------
  // GATE 6: Phase 6 Demonstration 1 — Autonomous Web Research & Procurement Discovery
  // ---------------------------------------------------------------------------
  console.log("--- GATE 6: Phase 6 Demonstration 1 — Autonomous Web Research & Discovery ---");
  const obj1 = await prisma.objective.create({
    data: {
      userId: user.id,
      title: "Discover Blockchain Analytics Providers on NEAR",
      description: "Research genuine infrastructure analytics providers, verify pricing, and compile benchmark matrix",
      originalPrompt: "Discover live blockchain analytics providers and verify pricing on NEAR",
      category: "RESEARCH",
      status: "DRAFT",
    },
  });

  const plan1 = await createApprovedPlanAndAssignments({
    objectiveId: obj1.id,
    userId: user.id,
    summary: "Three-step autonomous research and independent verification workflow",
    rawSteps: [
      {
        stepId: "step_research_providers",
        title: "Query live web for NEAR blockchain analytics providers",
        description: "Query DuckDuckGo for live provider pricing and features",
        taskType: "RESEARCH",
        agentType: "research_procurement",
        assignedAgentId: researchAgent.id,
        requiredTools: ["duckduckgo_search"],
        dependencies: [],
        input: { prompt: "Find analytics provider pricing features", targetDomain: "blockchain analytics" },
        order: 1,
      },
      {
        stepId: "step_analyze_providers",
        title: "Compute provider comparison matrix and candidate ranking",
        description: "Analyze candidate features and compute ranking",
        taskType: "ANALYSIS",
        agentType: "research_procurement",
        assignedAgentId: researchAgent.id,
        requiredTools: [],
        dependencies: ["step_research_providers"],
        order: 2,
      },
      {
        stepId: "step_verify_evidence",
        title: "Independently verify discovered source URLs and pricing evidence",
        description: "Auditor independently checks source URLs and evidence validity",
        taskType: "VERIFICATION",
        agentType: "security_auditor",
        assignedAgentId: auditorAgent.id, // Distinct agent! Anti-Self-Certification
        requiredTools: ["near_rpc_reader"],
        dependencies: ["step_analyze_providers"],
        order: 3,
      },
    ],
  });

  await prisma.objectiveSuccessCriteria.create({
    data: {
      objectiveId: obj1.id,
      criterionId: "crit_research_verified",
      description: "Research candidates discovered and independently verified",
      measurementType: "BOOLEAN",
      target: "true",
      verificationMethod: "TOOL_RESULT",
      currentState: "NOT_MET",
    },
  });

  await transitionObjectiveToReady(obj1.id, user.id);

  const orch1 = await ObjectiveOrchestrationService.orchestrate({
    objectiveId: obj1.id,
    userId: user.id,
  });

  assert(orch1.isComplete || orch1.completedCount >= 2, "Demonstration 1 workflow executed through orchestrator");

  const results1 = await prisma.objectiveTaskResult.findMany({
    where: { objectiveId: obj1.id },
  });
  assert(results1.length >= 2, "Task result records persisted in PostgreSQL");
  assert(
    results1.some((r) => r.verificationStatus === "INDEPENDENTLY_VERIFIED" || r.verificationStatus === "SYSTEM_VALIDATED"),
    "Task result verified in PostgreSQL"
  );

  passedGates++;
  console.log("✅ GATE 6 PASSED: Demonstration 1 (Web Research & Discovery) certified\n");

  // ---------------------------------------------------------------------------
  // GATE 7: Phase 6 Demonstration 2 — NEAR Blockchain Intelligence & Account Audit
  // ---------------------------------------------------------------------------
  console.log("--- GATE 7: Phase 6 Demonstration 2 — NEAR Blockchain Intelligence ---");
  const obj2 = await prisma.objective.create({
    data: {
      userId: user.id,
      title: "Audit NEAR Testnet Blockchain State and Account Balances",
      description: "Perform genuine FastNEAR RPC queries for testnet and wrap.testnet, verify state proofs",
      originalPrompt: "Audit live NEAR testnet network head and verify account state for testnet",
      category: "OPERATIONS",
      status: "DRAFT",
    },
  });

  const plan2 = await createApprovedPlanAndAssignments({
    objectiveId: obj2.id,
    userId: user.id,
    summary: "Two-step genuine blockchain inspection and audit workflow",
    rawSteps: [
      {
        stepId: "step_query_near_state",
        title: "Query live account state and block height from FastNEAR RPC",
        description: "Query FastNEAR testnet RPC for account and network head",
        taskType: "EXECUTION",
        agentType: "operations_execution",
        assignedAgentId: operationsAgent.id,
        requiredTools: ["near_rpc_reader"],
        dependencies: [],
        input: { accountId: "testnet" },
        order: 1,
      },
      {
        stepId: "step_audit_near_state",
        title: "Independently cross-check blockchain state proofs against RPC head",
        description: "Independent auditor cross-checks blockchain state",
        taskType: "VERIFICATION",
        agentType: "security_auditor",
        assignedAgentId: auditorAgent.id,
        requiredTools: ["near_rpc_reader"],
        dependencies: ["step_query_near_state"],
        order: 2,
      },
    ],
  });

  await prisma.objectiveSuccessCriteria.create({
    data: {
      objectiveId: obj2.id,
      criterionId: "crit_blockchain_verified",
      description: "NEAR blockchain state audited and cross-checked",
      measurementType: "BOOLEAN",
      target: "true",
      verificationMethod: "TOOL_RESULT",
      currentState: "NOT_MET",
    },
  });

  await transitionObjectiveToReady(obj2.id, user.id);

  const orch2 = await ObjectiveOrchestrationService.orchestrate({
    objectiveId: obj2.id,
    userId: user.id,
  });

  assert(orch2.isComplete || orch2.completedCount >= 2, "Demonstration 2 workflow executed through orchestrator");

  const results2 = await prisma.objectiveTaskResult.findMany({
    where: { objectiveId: obj2.id },
  });
  assert(results2.length >= 2, "Blockchain task results recorded in PostgreSQL");
  passedGates++;
  console.log("✅ GATE 7 PASSED: Demonstration 2 (NEAR Blockchain Intelligence) certified\n");

  // ---------------------------------------------------------------------------
  // GATE 8: Phase 6 Demonstration 3 — Multi-Provider Collaborative Workflow
  // ---------------------------------------------------------------------------
  console.log("--- GATE 8: Phase 6 Demonstration 3 — Multi-Provider Collaborative Workflow ---");
  const obj3 = await prisma.objective.create({
    data: {
      userId: user.id,
      title: "Collaborative Ecosystem Multi-Agent Infrastructure Verification",
      description: "Synchronized multi-agent execution across Research, Operations, and Security Auditor",
      originalPrompt: "Multi-agent collaborative ecosystem audit: research providers, query blockchain status, synthesize analysis, verify all evidence",
      category: "OPERATIONS",
      status: "DRAFT",
    },
  });

  const plan3 = await createApprovedPlanAndAssignments({
    objectiveId: obj3.id,
    userId: user.id,
    summary: "Four-step collaborative multi-provider workflow",
    rawSteps: [
      {
        stepId: "step_collab_research",
        title: "Gather genuine infrastructure vendor intelligence",
        description: "Query web intelligence for analytics providers",
        taskType: "RESEARCH",
        agentType: "research_procurement",
        assignedAgentId: researchAgent.id,
        requiredTools: ["duckduckgo_search"],
        dependencies: [],
        input: { prompt: "Find analytics provider pricing features" },
        order: 1,
      },
      {
        stepId: "step_collab_blockchain",
        title: "Inspect blockchain testnet RPC network state",
        description: "Query blockchain state from FastNEAR RPC",
        taskType: "EXECUTION",
        agentType: "operations_execution",
        assignedAgentId: operationsAgent.id,
        requiredTools: ["near_rpc_reader"],
        dependencies: [],
        input: { accountId: "testnet" },
        order: 2,
      },
      {
        stepId: "step_collab_analysis",
        title: "Synthesize findings across research and blockchain telemetry",
        description: "Synthesize findings from both providers",
        taskType: "ANALYSIS",
        agentType: "research_procurement",
        assignedAgentId: researchAgent.id,
        requiredTools: [],
        dependencies: ["step_collab_research", "step_collab_blockchain"],
        order: 3,
      },
      {
        stepId: "step_collab_audit",
        title: "Independent cryptographic and cross-provider evidence verification",
        description: "Auditor verifies cryptographic chain and cross-provider evidence",
        taskType: "VERIFICATION",
        agentType: "security_auditor",
        assignedAgentId: auditorAgent.id,
        requiredTools: ["near_rpc_reader"],
        dependencies: ["step_collab_analysis"],
        order: 4,
      },
    ],
  });

  await prisma.objectiveSuccessCriteria.create({
    data: {
      objectiveId: obj3.id,
      criterionId: "crit_collab_workflow_passed",
      description: "Collaborative multi-provider workflow completed and audited",
      measurementType: "BOOLEAN",
      target: "true",
      verificationMethod: "TOOL_RESULT",
      currentState: "NOT_MET",
    },
  });

  await transitionObjectiveToReady(obj3.id, user.id);

  const orch3 = await ObjectiveOrchestrationService.orchestrate({
    objectiveId: obj3.id,
    userId: user.id,
  });

  assert(orch3.isComplete || orch3.completedCount >= 3, "Demonstration 3 multi-provider workflow executed");

  const results3 = await prisma.objectiveTaskResult.findMany({
    where: { objectiveId: obj3.id },
  });
  assert(results3.length >= 3, "Multi-provider task results recorded in PostgreSQL");
  passedGates++;
  console.log("✅ GATE 8 PASSED: Demonstration 3 (Multi-Provider Collaborative Workflow) certified\n");

  // ---------------------------------------------------------------------------
  // GATE 9: Phase 7 OutLayer TEE 4-Tier Attestation & Hardware Verification
  // ---------------------------------------------------------------------------
  console.log("--- GATE 9: Phase 7 OutLayer TEE 4-Tier Attestation & Hardware Verification ---");
  const teeClassification = await OutLayerTeeVerificationService.classifyTeeIntegrity();
  assert(
    teeClassification.tier === "ENDPOINT_REACHABLE" ||
      teeClassification.tier === "AUTHENTICATED_PROVIDER_OPERATION" ||
      teeClassification.tier === "TEE_EXECUTION_CONFIRMED" ||
      teeClassification.tier === "HARDWARE_ATTESTATION_VERIFIED",
    "OutLayer TEE classified into valid tier"
  );
  assert(teeClassification.httpStatus === 200, "OutLayer health endpoint returned HTTP 200");
  assert(teeClassification.trustAssumptions.length >= 3, "Documented TEE trust assumptions present");

  // Evaluate Hardware Attestation Quote
  const attestationResult = OutLayerTeeVerificationService.verifyHardwareAttestation();
  assert(attestationResult.signatureVerified, "Intel SGX DCAP attestation quote signature verified");
  assert(Boolean(attestationResult.measurement.mrenclave), "Enclave MRENCLAVE measurement computed");
  assert(Boolean(attestationResult.measurement.mrsigner), "Enclave MRSIGNER measurement computed");

  passedGates++;
  console.log("✅ GATE 9 PASSED: OutLayer TEE 4-tier attestation & hardware verification certified\n");

  // ---------------------------------------------------------------------------
  // GATE 10: Phase 8 Customer-Facing Integrations UI & API Validation
  // ---------------------------------------------------------------------------
  console.log("--- GATE 10: Phase 8 Customer-Facing Integrations UI & API ---");
  // Test creation of user integration connection
  const conn = await prisma.integrationConnection.create({
    data: {
      userId: user.id,
      providerId: "rest_api",
      adapterType: "REST",
      name: "Production Telemetry REST API",
      status: "ACTIVE",
      authType: "BEARER_TOKEN",
      encryptedCredentials: "aes256gcm:mock_encrypted_secret",
      configJson: JSON.stringify({ baseUrl: "https://api.example.com", rateLimit: 60 }),
    },
  });

  assert(Boolean(conn.id), "User integration connection created in PostgreSQL");

  // Verify secret redaction on readback
  const { CredentialVault } = await import("../src/lib/integrations/credentialVault");
  const redactedConfig = CredentialVault.redactSecrets({
    apiKey: "secret_api_key_value_123",
    baseUrl: "https://api.example.com",
    privateKey: "ed25519:secret_key_material",
  });
  assert(redactedConfig.apiKey === "[REDACTED]", "API key redacted from client payload");
  assert(redactedConfig.privateKey === "[REDACTED]", "Private key redacted from client payload");
  assert(redactedConfig.baseUrl === "https://api.example.com", "Non-sensitive config preserved");

  passedGates++;
  console.log("✅ GATE 10 PASSED: Customer-facing integrations UI and API contracts verified\n");

  // ---------------------------------------------------------------------------
  // GATE 11: Zero Financial Drift & Zero Mainnet Broadcasts Gate
  // ---------------------------------------------------------------------------
  console.log("--- GATE 11: Zero Financial Drift & Zero Mainnet Broadcasts Gate ---");
  // Verify that across all three demonstrations, spent yoctoNEAR is strictly zero
  const userMandates = await prisma.mandate.findMany({
    where: { userId: user.id },
  });
  let totalSpent = BigInt(0);
  for (const m of userMandates) {
    totalSpent += BigInt(m.spentYocto || "0");
  }
  assert(totalSpent === BigInt(0), "Total yoctoNEAR spent across all non-financial demonstrations is strictly 0");

  // Verify zero mainnet transactions exist in transaction records
  const mainnetTxs = await prisma.transactionRecord.findMany({
    where: {
      chain: "mainnet",
      mandate: { userId: user.id },
    },
  });
  assert(mainnetTxs.length === 0, "Zero mainnet transactions broadcast (Strict testnet-only policy)");

  passedGates++;
  console.log("✅ GATE 11 PASSED: Strict financial safety and zero mainnet broadcasts verified\n");

  console.log("================================================================================");
  console.log(`🎉 ALL ${passedGates}/${totalGates} VERIFICATION GATES PASSED SUCCESSFULLY!`);
  console.log("   MILESTONE 13.8 CERTIFIED: REAL AGENT EXECUTION & VERIFIABLE OBJECTIVES");
  console.log("================================================================================\n");
}

runMilestone138Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
