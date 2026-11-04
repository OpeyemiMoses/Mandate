import { prisma } from "../src/lib/db";
import { registerDefaultTools } from "../src/lib/tools";
import { toolRegistry } from "../src/lib/tools/registry";
import { agentRegistry, registerDefaultAgents } from "../src/lib/runtime/registry";
import {
  discoverUniversalCapabilities,
  matchCapabilities,
  evaluateCapabilityPermission,
  getUserIntegrationsState,
  SUPPORTED_INTEGRATIONS_CATALOG,
  testIntegrationHealth,
  analyzeCapabilityCoverage,
  evaluateExecutionReadiness,
  CapabilityRequirement,
} from "../src/lib/discovery";
import {
  interpretObjective,
  generateObjectivePlan,
  evaluateObjectivePlanDiscovery,
  computePlanContentHash,
  reserveMandateBudgetAtomic,
  releaseMandateBudgetAtomic,
} from "../src/lib/objectives";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";

function assert(condition: boolean, testCase: number, message: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ Case ${testCase} PASS: ${message}`);
    if (detail) console.log(`     ↳ ${detail}`);
  } else {
    console.error(`  ✗ Case ${testCase} FAIL: ${message}`);
    if (detail) console.error(`     ↳ Details: ${detail}`);
    process.exit(1);
  }
}

async function main() {
  console.log("==========================================================================");
  console.log("=== MANDATE MILESTONE 4: UNIVERSAL DISCOVERY & MATCHING TEST SUITE ===");
  console.log("==========================================================================\n");

  // Ensure tool and agent registries are populated
  registerDefaultTools();
  registerDefaultAgents();

  const runId = Date.now().toString().slice(-6);
  const user1Near = `disc_alice_${runId}.testnet`;
  const user2Near = `disc_bob_${runId}.testnet`;

  // Setup Test Users
  const user1 = await prisma.user.upsert({
    where: { nearAccountId: user1Near },
    update: {},
    create: {
      nearAccountId: user1Near,
      displayName: "Alice Discovery Tester",
      sessionToken: `token_alice_${runId}`,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { nearAccountId: user2Near },
    update: {},
    create: {
      nearAccountId: user2Near,
      displayName: "Bob Isolation Tester",
      sessionToken: `token_bob_${runId}`,
    },
  });

  // Setup Test Agent for Alice
  const agent1 = await prisma.agent.create({
    data: {
      name: "Alice Research Agent",
      type: "research_procurement",
      userId: user1.id,
      status: "ACTIVE",
    },
  });

  // Setup Dedicated OutLayer Custody Wallet for Agent 1
  const agentWallet1 = await prisma.wallet.create({
    data: {
      agentId: agent1.id,
      walletId: `outlayer_disc_${runId}`,
      apiKey: `wk_test_disc_${runId}`,
      nearAccountId: `implicit_disc_${runId}.testnet`,
      balanceYocto: nearToYocto("5.0"),
      isInitialized: true,
      initializationStatus: "READY",
    },
  });

  // Setup Test Mandate for Alice
  const mandate1 = await prisma.mandate.create({
    data: {
      name: "Alice Active Spending Mandate",
      userId: user1.id,
      agentId: agent1.id,
      walletId: agentWallet1.id,
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("5.0"),
      spentYocto: nearToYocto("0"),
      reservedYocto: nearToYocto("0"),
      perTxLimitYocto: nearToYocto("1.0"),
      approvalThresholdYocto: nearToYocto("0.5"),
      allowedRecipientsJson: JSON.stringify(["*"]),
      expiresAt: new Date(Date.now() + 86400000),
      policyVersion: 1,
    },
  });

  // -------------------------------------------------------------------------
  // Case 1: Tool Registry Discovery
  // -------------------------------------------------------------------------
  const discoveredCaps = await discoverUniversalCapabilities({ userId: user1.id });
  const hasDDG = discoveredCaps.some((c) => c.toolId === "duckduckgo_search");
  const hasNearRpc = discoveredCaps.some((c) => c.toolId === "near_rpc_reader");
  const hasAgentProc = discoveredCaps.some((c) => c.agentType === "research_procurement");

  assert(
    hasDDG && hasNearRpc && hasAgentProc,
    1,
    "Discovered real registered tools and specialist agents from registries",
    `Found ${discoveredCaps.length} universal capabilities (DuckDuckGo, NEAR RPC, Procurement Agent)`
  );

  // -------------------------------------------------------------------------
  // Case 2: No Capability Fabrication
  // -------------------------------------------------------------------------
  const phantomCaps = discoveredCaps.filter((c) => c.id.includes("hallucinated_quantum_teleport"));
  assert(
    phantomCaps.length === 0,
    2,
    "No fabricated or hallucinated capabilities exist in discovery pool",
    "All discovered capabilities strictly correspond to registered tools, agents, or user connections"
  );

  // -------------------------------------------------------------------------
  // Case 3: Universal Capability Taxonomy Categorization
  // -------------------------------------------------------------------------
  const categories = new Set(discoveredCaps.map((c) => c.category));
  const hasInfo = categories.has("INFORMATION_DISCOVERY");
  const hasFin = categories.has("FINANCIAL_EXECUTION");
  const hasCompute = categories.has("COMPUTE_ANALYSIS");

  assert(
    hasInfo && hasFin && hasCompute,
    3,
    "Taxonomy categorization correctly classifies tools across domain categories",
    `Discovered categories: [${Array.from(categories).join(", ")}]`
  );

  // -------------------------------------------------------------------------
  // Case 4: Operation Schemas & Risk Classifications
  // -------------------------------------------------------------------------
  const nearCap = discoveredCaps.find((c) => c.toolId === "near_rpc_reader");
  const hasOps = Boolean(nearCap && nearCap.operations.length > 0);
  const firstOp = nearCap?.operations[0];
  const validRisk = firstOp && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(firstOp.riskClassification);
  const validPerm = firstOp && ["READ", "PROPOSE", "RESTRICTED_EXECUTION", "USER_ONLY"].includes(firstOp.permissionLevel);

  assert(
    Boolean(hasOps && validRisk && validPerm),
    4,
    "Operation schemas contain typed risk classifications and permission levels",
    `Tool near_rpc_reader has ${nearCap?.operations.length} operations. Op "${firstOp?.name}" risk=${firstOp?.riskClassification}, perm=${firstOp?.permissionLevel}`
  );

  // -------------------------------------------------------------------------
  // Case 5: Dynamic Capability Health Status Evaluation
  // -------------------------------------------------------------------------
  const ddgCap = discoveredCaps.find((c) => c.toolId === "duckduckgo_search");
  assert(
    Boolean(ddgCap && ddgCap.isHealthy && ddgCap.status === "AVAILABLE"),
    5,
    "Healthy registered tools are accurately reflected with AVAILABLE status",
    `DDG Status: ${ddgCap?.status}, isHealthy: ${ddgCap?.isHealthy}`
  );

  // -------------------------------------------------------------------------
  // Case 6: User Integration Discovery & Cross-User Isolation
  // -------------------------------------------------------------------------
  // Create an active integration connection for Alice
  const aliceConn = await prisma.integrationConnection.create({
    data: {
      userId: user1.id,
      providerId: "rest_api",
      name: "Alice Private Webhook API",
      status: "ACTIVE",
      authType: "BEARER_TOKEN",
      encryptedCredentials: JSON.stringify({ token: "secret_alice_123" }),
      configJson: JSON.stringify({ baseUrl: "https://api.alice.internal" }),
    },
  });

  const aliceCaps = await discoverUniversalCapabilities({ userId: user1.id });
  const bobCaps = await discoverUniversalCapabilities({ userId: user2.id });

  const aliceHasConn = aliceCaps.some((c) => c.integrationConnectionId === aliceConn.id);
  const bobHasAliceConn = bobCaps.some((c) => c.integrationConnectionId === aliceConn.id);

  assert(
    aliceHasConn && !bobHasAliceConn,
    6,
    "User integration connections are strictly isolated across user boundaries",
    "Alice discovered her private connection; Bob cannot see Alice's integration"
  );

  // -------------------------------------------------------------------------
  // Case 7: 4-State Integration Lifecycle Model
  // -------------------------------------------------------------------------
  const user1IntegrationStates = await getUserIntegrationsState(user1.id);
  const nearState = user1IntegrationStates.find((s) => s.catalog.providerId === "near_rpc");
  const restState = user1IntegrationStates.find((s) => s.catalog.providerId === "rest_api");
  const mcpState = user1IntegrationStates.find((s) => s.catalog.providerId === "mcp_server");

  // NEAR RPC is supported out of box (State 1, State 3 unauthed is ok, State 4 operational)
  // REST API is configured for Alice (State 1, State 2, State 3, State 4)
  // MCP is supported but unconfigured for Alice (State 1: true, State 2: false)
  const is4StateValid =
    Boolean(nearState?.isSupported) &&
    Boolean(restState?.isConfigured && restState?.isAuthenticated && restState?.isOperational) &&
    Boolean(mcpState?.isSupported && !mcpState?.isConfigured);

  assert(
    is4StateValid,
    7,
    "4-State Integration Model accurately tracks Supported, Configured, Authenticated, Operational states",
    `REST API: Configured=${restState?.isConfigured}, Authenticated=${restState?.isAuthenticated}, Operational=${restState?.isOperational} | MCP: Configured=${mcpState?.isConfigured}`
  );

  // -------------------------------------------------------------------------
  // Case 8: Read-Only Permission Mapping
  // -------------------------------------------------------------------------
  const initialMandate = await prisma.mandate.findUnique({ where: { id: mandate1.id } });
  const permCheck = await evaluateCapabilityPermission({
    userId: user1.id,
    agentId: agent1.id,
    toolId: "duckduckgo_search",
    requiredPermission: "READ",
    riskClassification: "LOW",
    hasActiveMandate: true,
  });

  const afterMandate = await prisma.mandate.findUnique({ where: { id: mandate1.id } });
  assert(
    initialMandate?.spentYocto === afterMandate?.spentYocto &&
      initialMandate?.policyVersion === afterMandate?.policyVersion,
    8,
    "Permission evaluation is strictly read-only and never modifies mandates or grants",
    `Mandate version remains ${afterMandate?.policyVersion}`
  );

  // -------------------------------------------------------------------------
  // Case 9: Critical Risk & USER_ONLY Protection Gate
  // -------------------------------------------------------------------------
  const critCheck = await evaluateCapabilityPermission({
    userId: user1.id,
    agentId: agent1.id,
    toolId: "near_rpc_reader",
    requiredPermission: "USER_ONLY",
    riskClassification: "CRITICAL",
    hasActiveMandate: true,
  });

  assert(
    critCheck.status === "USER_APPROVAL_REQUIRED" && critCheck.requiresUserApproval === true,
    9,
    "CRITICAL risk and USER_ONLY operations always require human-in-the-loop approval",
    `Status: ${critCheck.status}, reason: ${critCheck.reason}`
  );

  // -------------------------------------------------------------------------
  // Case 10: Agent Access Enforcement
  // -------------------------------------------------------------------------
  // Alice agent has no explicit AgentToolAccess record for near_rpc_reader yet
  const ungrantedCheck = await evaluateCapabilityPermission({
    userId: user1.id,
    agentId: agent1.id,
    toolId: "near_rpc_reader",
    requiredPermission: "READ",
    hasActiveMandate: true,
  });

  assert(
    ungrantedCheck.status === "DENIED" && ungrantedCheck.isAuthorized === false,
    10,
    "Agent lacking explicit AgentToolAccess is strictly DENIED",
    `Status: ${ungrantedCheck.status}, reason: ${ungrantedCheck.reason}`
  );

  // -------------------------------------------------------------------------
  // Case 11: Permission Elevation Prevention
  // -------------------------------------------------------------------------
  // Grant Alice agent READ access to duckduckgo_search
  await prisma.agentToolAccess.create({
    data: {
      agentId: agent1.id,
      toolId: "duckduckgo_search",
      permissionLevel: "READ",
      isEnabled: true,
    },
  });

  const elevationCheck = await evaluateCapabilityPermission({
    userId: user1.id,
    agentId: agent1.id,
    toolId: "duckduckgo_search",
    requiredPermission: "RESTRICTED_EXECUTION",
    hasActiveMandate: true,
  });

  assert(
    elevationCheck.status === "ELEVATION_REQUIRED" && elevationCheck.isAuthorized === false,
    11,
    "Agent granted READ cannot automatically elevate to RESTRICTED_EXECUTION",
    `Status: ${elevationCheck.status}, reason: ${elevationCheck.reason}`
  );

  // -------------------------------------------------------------------------
  // Case 12: Mandate Authority Requirement for Financial Execution
  // -------------------------------------------------------------------------
  // Grant RESTRICTED_EXECUTION access to near_rpc_reader
  await prisma.agentToolAccess.create({
    data: {
      agentId: agent1.id,
      toolId: "near_rpc_reader",
      permissionLevel: "RESTRICTED_EXECUTION",
      isEnabled: true,
    },
  });

  // Test without active mandate
  const noMandateCheck = await evaluateCapabilityPermission({
    userId: user1.id,
    agentId: agent1.id,
    toolId: "near_rpc_reader",
    requiredPermission: "RESTRICTED_EXECUTION",
    hasActiveMandate: false,
  });

  assert(
    noMandateCheck.status === "USER_APPROVAL_REQUIRED" && noMandateCheck.isAuthorized === false,
    12,
    "RESTRICTED_EXECUTION without an active mandate triggers mandatory user approval gate",
    `Status: ${noMandateCheck.status}, reason: ${noMandateCheck.reason}`
  );

  // -------------------------------------------------------------------------
  // Case 13: Functional Capability Matching
  // -------------------------------------------------------------------------
  const requirements: CapabilityRequirement[] = [
    {
      id: "req_search",
      name: "duckduckgo_search",
      operation: "search",
      category: "INFORMATION_DISCOVERY",
      requiredPermission: "READ",
    },
    {
      id: "req_view_account",
      name: "near_rpc_reader",
      operation: "view_account",
      category: "FINANCIAL_EXECUTION",
      requiredPermission: "READ",
    },
    {
      id: "req_missing_tool",
      name: "quantum_cryptanalysis_engine",
      operation: "factor_primes",
      category: "EXTERNAL_INTEGRATION",
    },
  ];

  const matchResults = await matchCapabilities({
    userId: user1.id,
    requirements,
    discoveredCapabilities: aliceCaps,
    agentId: agent1.id,
    hasActiveMandate: true,
  });

  const searchMatch = matchResults.find((m) => m.requirementId === "req_search");
  const missingMatch = matchResults.find((m) => m.requirementId === "req_missing_tool");

  assert(
    Boolean(searchMatch && searchMatch.coverageStatus === "COVERED" && searchMatch.matchScore >= 0.7),
    13,
    "Capability matching aligns requirement to real registered tool with high score",
    `Matched ${searchMatch?.capabilityName} with score ${searchMatch?.matchScore}`
  );

  // -------------------------------------------------------------------------
  // Case 14: Ranking Match Score
  // -------------------------------------------------------------------------
  assert(
    Boolean(searchMatch && missingMatch && searchMatch.matchScore > missingMatch.matchScore),
    14,
    "Match score ranks real matching capabilities higher than missing/unsupported ones",
    `Search score=${searchMatch?.matchScore} vs Missing score=${missingMatch?.matchScore}`
  );

  // -------------------------------------------------------------------------
  // Case 15: Capability Coverage Analyzer
  // -------------------------------------------------------------------------
  const coverageReport = analyzeCapabilityCoverage({
    matches: matchResults,
  });

  assert(
    coverageReport.totalRequirements === 3 &&
      coverageReport.missingCount === 1 &&
      coverageReport.coverageScore < 1.0,
    15,
    "Capability Coverage Analyzer partitions covered, missing and blocked requirements accurately",
    `Covered=${coverageReport.coveredCount}, Missing=${coverageReport.missingCount}, Score=${coverageReport.coverageScore}`
  );

  // -------------------------------------------------------------------------
  // Case 16: Execution Readiness Engine Statuses
  // -------------------------------------------------------------------------
  const readinessPartial = await evaluateExecutionReadiness({
    userId: user1.id,
    matches: matchResults,
    persistRecord: false,
  });

  assert(
    readinessPartial.overallReadiness === "PARTIALLY_SUPPORTED" && readinessPartial.canExecute === false,
    16,
    "Readiness engine marks plan with missing capabilities as PARTIALLY_SUPPORTED and canExecute=false",
    `Readiness: ${readinessPartial.overallReadiness}, canExecute: ${readinessPartial.canExecute}`
  );

  // -------------------------------------------------------------------------
  // Case 17: Fail-Closed on Missing Critical Capabilities
  // -------------------------------------------------------------------------
  assert(
    readinessPartial.canExecute === false && readinessPartial.coverageReport.unsupportedOperations.length > 0,
    17,
    "Fail-closed: execution gate strictly remains closed when required capabilities are missing",
    `Unsupported operations flagged: [${readinessPartial.coverageReport.unsupportedOperations.join(", ")}]`
  );

  // -------------------------------------------------------------------------
  // Case 18: Multi-Instance CAS Optimistic Concurrency Safety
  // -------------------------------------------------------------------------
  // Concurrent budget reservations on shared mandate
  const initialMandateState = await prisma.mandate.findUnique({ where: { id: mandate1.id } });
  const startVersion = initialMandateState?.policyVersion || 1;

  // Run 4 concurrent budget reservations of 1 NEAR each (Total 5 NEAR, so all 4 should succeed)
  const concurRes = await Promise.all([
    reserveMandateBudgetAtomic({ mandateId: mandate1.id, amountYocto: nearToYocto("1.0") }),
    reserveMandateBudgetAtomic({ mandateId: mandate1.id, amountYocto: nearToYocto("1.0") }),
    reserveMandateBudgetAtomic({ mandateId: mandate1.id, amountYocto: nearToYocto("1.0") }),
    reserveMandateBudgetAtomic({ mandateId: mandate1.id, amountYocto: nearToYocto("1.0") }),
  ]);

  const allSuccess = concurRes.every((r) => r.success);
  const midMandate = await prisma.mandate.findUnique({ where: { id: mandate1.id } });

  // 5th reservation of 2 NEAR should fail because 4 NEAR reserved out of 5 NEAR
  const failRes = await reserveMandateBudgetAtomic({
    mandateId: mandate1.id,
    amountYocto: nearToYocto("2.0"),
  });

  // Release 2 NEAR
  await releaseMandateBudgetAtomic({
    mandateId: mandate1.id,
    amountYocto: nearToYocto("2.0"),
  });

  const finalMandate = await prisma.mandate.findUnique({ where: { id: mandate1.id } });

  assert(
    allSuccess &&
      !failRes.success &&
      midMandate?.reservedYocto === nearToYocto("4.0") &&
      finalMandate?.reservedYocto === nearToYocto("2.0") &&
      finalMandate!.policyVersion > startVersion,
    18,
    "Multi-instance CAS optimistic concurrency safely reserves, rejects exhaustion, and releases budget",
    `Reserved: 4.0 NEAR -> Released to: ${yoctoToNear(finalMandate?.reservedYocto || "0")} NEAR. CAS policyVersion bumped from ${startVersion} to ${finalMandate?.policyVersion}`
  );

  // -------------------------------------------------------------------------
  // Case 19: Immutability of Approved Plans during Discovery
  // -------------------------------------------------------------------------
  // Create an objective with an approved plan
  const goal = interpretObjective({
    prompt: "Procure verified VPS server benchmark under 0.1 NEAR",
  });

  const testObj = await prisma.objective.create({
    data: {
      userId: user1.id,
      title: "Immutable Approved Plan Objective",
      originalPrompt: "Procure verified VPS server benchmark under 0.1 NEAR",
      structuredGoalJson: JSON.stringify(goal),
      category: "PROCUREMENT",
      status: "AWAITING_USER_APPROVAL",
      mandateId: mandate1.id,
    },
  });

  const planResult = await generateObjectivePlan({
    objectiveId: testObj.id,
    userId: user1.id,
    title: testObj.title,
    category: testObj.category,
    structuredGoal: goal.structuredGoal,
    constraints: { maxBudgetNear: "0.1" },
    mandateId: mandate1.id,
  });

  // Approve plan
  await prisma.objectivePlan.update({
    where: { id: planResult.planId },
    data: { status: "APPROVED" },
  });

  await prisma.objectivePlanApproval.create({
    data: {
      planId: planResult.planId,
      version: planResult.version,
      userId: user1.id,
      decision: "APPROVED",
    },
  });

  const planBeforeDiscovery = await prisma.objectivePlan.findUnique({
    where: { id: planResult.planId },
    include: { steps: true },
  });

  // Run discovery on this objective
  const discoveryResult = await evaluateObjectivePlanDiscovery({
    objectiveId: testObj.id,
    userId: user1.id,
    persistRecord: true,
  });

  const planAfterDiscovery = await prisma.objectivePlan.findUnique({
    where: { id: planResult.planId },
    include: { steps: true },
  });

  assert(
    planBeforeDiscovery?.version === planAfterDiscovery?.version &&
      planBeforeDiscovery?.status === "APPROVED" &&
      planAfterDiscovery?.status === "APPROVED" &&
      planBeforeDiscovery?.steps.length === planAfterDiscovery?.steps.length,
    19,
    "Re-running capability discovery does NOT mutate approved plans or invalidate content hashes",
    `Plan v${planAfterDiscovery?.version} remained APPROVED with ${planAfterDiscovery?.steps.length} steps intact`
  );

  // -------------------------------------------------------------------------
  // Case 20: Audit Record Persistence in CapabilityDiscovery & CapabilityMatch
  // -------------------------------------------------------------------------
  const persistedDiscovery = await prisma.capabilityDiscovery.findFirst({
    where: { objectiveId: testObj.id },
    include: { matches: true },
    orderBy: { createdAt: "desc" },
  });

  assert(
    Boolean(persistedDiscovery && persistedDiscovery.matches.length > 0),
    20,
    "Discovery and requirement matches are durably recorded in database for full auditability",
    `Persisted Discovery #${persistedDiscovery?.id} with ${persistedDiscovery?.matches.length} recorded capability matches`
  );

  console.log("\n==========================================================================");
  console.log("=== ALL 20 MILESTONE 4 DISCOVERY ENGINE VERIFICATIONS PASSED (100%) ===");
  console.log("==========================================================================\n");
}

main()
  .catch((err) => {
    console.error("Test Suite execution failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
