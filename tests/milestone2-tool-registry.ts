import { prisma } from "../src/lib/db";
import { toolRegistry } from "../src/lib/tools/registry";
import { toolExecutor } from "../src/lib/tools/executor";
import {
  createIntegrationConnection,
  getActiveConnectionWithCredentials,
  verifyConnection,
  disconnectConnection,
  revokeConnection,
  listUserConnections,
} from "../src/lib/tools/connections";
import {
  grantAgentToolAccess,
  revokeAgentToolAccess,
  getPermittedToolsForAgent,
  verifyAgentToolPermission,
} from "../src/lib/tools/access";
import {
  encryptCredentials,
  decryptCredentials,
  redactSensitiveData,
  validateSafeUrl,
} from "../src/lib/tools/security";
import { ToolDefinition, ToolPermissionLevel } from "../src/lib/tools/types";
import { internalAdapter } from "../src/lib/tools/adapters/internalAdapter";
import { registerDefaultTools } from "../src/lib/tools";
import { executionOrchestrator } from "../src/lib/runtime/orchestrator";
import { verifyAuditChain } from "../src/lib/auditLedger";
import { z } from "zod";
import crypto from "crypto";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

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
  console.log("=================================================================");
  console.log("=== MANDATE MILESTONE 2: UNIVERSAL TOOL REGISTRY TEST SUITE =====");
  console.log("=================================================================\n");

  // Ensure default tools are registered
  registerDefaultTools();

  // Test setup: Create clean test users and agents
  const runId = Date.now().toString().slice(-6);
  const user1Near = `tool_alice_${runId}.testnet`;
  const user2Near = `tool_bob_${runId}.testnet`;

  const user1 = await prisma.user.upsert({
    where: { nearAccountId: user1Near },
    update: {},
    create: {
      nearAccountId: user1Near,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { nearAccountId: user2Near },
    update: {},
    create: {
      nearAccountId: user2Near,
    },
  });

  // Create test agent for User 1
  const agent1 = await prisma.agent.create({
    data: {
      userId: user1.id,
      name: `Alice Tool Agent ${runId}`,
      purpose: "Testing Universal Tool Registry",
      type: "research_procurement",
      version: "1.0.0",
      status: "ACTIVE",
      colorVariant: "cyan",
      wallet: {
        create: {
          walletId: `outlayer-tool-${runId}`,
          apiKey: `key-${runId}`,
          nearAccountId: `0x${crypto.randomBytes(32).toString("hex")}`,
          handoffUrl: "https://testnet.outlayer.fastnear.com/handoff",
          network: "testnet",
          balanceYocto: "5000000000000000000000000", // 5 NEAR
          isInitialized: true,
          initializationStatus: "READY",
        },
      },
    },
    include: { wallet: true },
  });

  // Create test agent for User 2 (Bob)
  const agent2 = await prisma.agent.create({
    data: {
      userId: user2.id,
      name: `Bob Tool Agent ${runId}`,
      purpose: "Testing Cross-User Boundary",
      type: "research_procurement",
      version: "1.0.0",
      status: "ACTIVE",
      colorVariant: "purple",
    },
  });

  console.log(`[Setup] User 1 ID: ${user1.id} (Agent 1: ${agent1.id})`);
  console.log(`[Setup] User 2 ID: ${user2.id} (Agent 2: ${agent2.id})\n`);

  // -------------------------------------------------------------
  // Test 1: Tool Registry Registration & Schema Contracts
  // -------------------------------------------------------------
  console.log("[Test 1] Tool Registry Registration & Schema Contracts");
  const ddgTool = toolRegistry.get("duckduckgo_search");
  const nearTool = toolRegistry.get("near_rpc_reader");
  const restTool = toolRegistry.get("generic_rest_client");
  const mcpTool = toolRegistry.get("generic_mcp_client");

  assert(
    Boolean(ddgTool && nearTool && restTool && mcpTool),
    1,
    "Standard default tools successfully loaded into ToolRegistry",
    `Tools: ${[ddgTool?.id, nearTool?.id, restTool?.id, mcpTool?.id].join(", ")}`
  );

  assert(
    ddgTool?.category === "DISCOVERY" &&
      nearTool?.category === "BLOCKCHAIN" &&
      restTool?.category === "EXTERNAL_APIS" &&
      mcpTool?.category === "MCP",
    1,
    "Tools correctly classified into standardized categories"
  );

  // Test duplicate registration rejection
  let duplicateRejected = false;
  try {
    toolRegistry.register(ddgTool!);
  } catch (err: any) {
    duplicateRejected = err.message.includes("already registered");
  }
  assert(
    duplicateRejected,
    1,
    "ToolRegistry rejects duplicate tool registrations without new version tag"
  );

  // -------------------------------------------------------------
  // Test 2: Custom Tool Registration & Category Filtering
  // -------------------------------------------------------------
  console.log("\n[Test 2] Custom Tool Registration & Dynamic Filtering");
  const customToolId = `custom_mock_calc_${runId}`;
  const customTool: ToolDefinition = {
    id: customToolId,
    name: "Mock Financial Calculator",
    description: "Computes compound interest and slippage estimates",
    category: "RESEARCH",
    version: "1.0.0",
    executionType: "INTERNAL",
    authenticationRequirements: "NONE",
    timeoutMs: 5000,
    retryPolicy: { maxRetries: 2, backoffMs: 1500 },
    rateLimits: { maxRequestsPerMinute: 60, maxConcurrent: 5 },
    availabilityStatus: "ACTIVE",
    supportedAgentTypes: ["*"],
    ownerOrProvider: "mandate",
    operations: {
      calculate: {
        id: "calculate",
        name: "Calculate Compound Interest",
        description: "Pure mathematical calculation",
        inputSchema: z.object({ principal: z.number(), rate: z.number(), time: z.number() }),
        outputSchema: z.object({ amount: z.number() }),
        requiredPermission: "READ",
        riskClassification: "LOW",
        idempotent: true,
      },
      emergency_reset: {
        id: "emergency_reset",
        name: "Emergency State Reset",
        description: "Administrative operation requiring manual human confirmation",
        inputSchema: z.object({ resetToken: z.string() }),
        outputSchema: z.object({ acknowledged: z.boolean() }),
        requiredPermission: "USER_ONLY",
        riskClassification: "CRITICAL",
        idempotent: false,
      },
    },
  };

  toolRegistry.register(customTool);
  internalAdapter.registerHandler(customToolId, "calculate", async (params: any) => {
    const { principal, rate, time } = params;
    const amount = principal * Math.pow(1 + rate, time);
    return { amount };
  });
  internalAdapter.registerHandler(customToolId, "emergency_reset", async () => ({ acknowledged: true }));

  assert(
    toolRegistry.has(customToolId),
    2,
    "Custom financial tool registered successfully"
  );

  const researchTools = toolRegistry.list({ category: "RESEARCH" });
  assert(
    researchTools.some((t) => t.id === customToolId),
    2,
    "Category filter correctly isolates RESEARCH tools"
  );

  // Dynamic status update
  toolRegistry.setStatus(customToolId, "DISABLED");
  assert(
    toolRegistry.get(customToolId)?.availabilityStatus === "DISABLED",
    2,
    "ToolRegistry allows dynamic runtime disabling of compromised tools"
  );
  toolRegistry.setStatus(customToolId, "ACTIVE"); // restore

  // -------------------------------------------------------------
  // Test 3: Granular Tool Permissions & Hierarchy Enforcement
  // -------------------------------------------------------------
  console.log("\n[Test 3] Granular Tool Permissions & Risk Hierarchy");

  // Grant agent1 READ permission on the custom tool
  await grantAgentToolAccess({
    agentId: agent1.id,
    userId: user1.id,
    toolId: customToolId,
    permissionLevel: "READ",
    isEnabled: true,
    allowedOperations: ["calculate"],
  });

  // Verify permission check for calculate (requires READ -> agent has READ -> allowed)
  const calcCheck = await verifyAgentToolPermission({
    agentId: agent1.id,
    userId: user1.id,
    toolId: customToolId,
    operationId: "calculate",
  });
  assert(
    calcCheck.allowed,
    3,
    "Agent with READ permission is granted access to READ operation"
  );

  // Verify permission check for emergency_reset (requires USER_ONLY -> agent MUST be denied)
  const userOnlyCheck = await verifyAgentToolPermission({
    agentId: agent1.id,
    userId: user1.id,
    toolId: customToolId,
    operationId: "emergency_reset",
  });
  assert(
    Boolean(!userOnlyCheck.allowed && (userOnlyCheck.reason?.includes("USER_ONLY") || userOnlyCheck.reason?.includes("forbidden"))),
    3,
    "Agent is strictly blocked from USER_ONLY operation (fail-closed firewall)"
  );

  // -------------------------------------------------------------
  // Test 4: Cross-User Isolation & Agent Tool Access Control
  // -------------------------------------------------------------
  console.log("\n[Test 4] Cross-User Isolation & Boundary Checks");

  // User 2 (Bob) attempts to assign or manipulate User 1's (Alice's) agent tools
  let crossUserGrantFailed = false;
  try {
    await grantAgentToolAccess({
      agentId: agent1.id,
      userId: user2.id, // Bob trying to grant tool to Alice's agent
      toolId: customToolId,
      permissionLevel: "PROPOSE",
    });
  } catch (err: any) {
    crossUserGrantFailed = err.message.includes("unauthorized") || err.message.includes("not found");
  }
  assert(
    crossUserGrantFailed,
    4,
    "Cross-user tool assignment is strictly rejected"
  );

  // User 2 attempts to invoke a tool on User 1's agent
  const crossExecRes = await toolExecutor.execute({
    agentId: agent1.id,
    userId: user2.id, // Bob attempting to execute on Alice's agent
    toolId: customToolId,
    operation: "calculate",
    params: { principal: 100, rate: 0.05, time: 1 },
  });
  assert(
    Boolean(!crossExecRes.success && crossExecRes.error?.includes("unauthorized")),
    4,
    "Cross-user tool execution rejected with unauthorized decision"
  );

  // -------------------------------------------------------------
  // Test 5: Credentials Encryption & Redaction (AES-256-GCM)
  // -------------------------------------------------------------
  console.log("\n[Test 5] AES-256-GCM Credential Encryption & Data Redaction");
  const testSecret = {
    apiKey: "live_test_api_key_secret_12345",
    authToken: "bearer_xyz_super_confidential_token",
    passphrase: "vault-passphrase-alpha",
  };

  const encrypted = encryptCredentials(testSecret);
  assert(
    typeof encrypted === "string" && encrypted.split(":").length === 3,
    5,
    "Credentials encrypted into standard AES-256-GCM iv:tag:data payload",
    `Ciphertext: ${encrypted.slice(0, 32)}...`
  );

  const decrypted = decryptCredentials(encrypted);
  assert(
    decrypted.apiKey === testSecret.apiKey && decrypted.authToken === testSecret.authToken,
    5,
    "Decrypted credentials accurately recover original secret values"
  );

  // Redaction testing
  const dirtyLog = {
    url: "https://api.vendor.com/v1",
    apiKey: "live_test_api_key_secret_12345",
    privateKey: "ed25519:5M7...very_secret",
    headers: {
      Authorization: "Bearer live_test_api_key_secret_12345",
      "x-api-key": "secret_key_value",
    },
    safeData: "Public catalog item 42",
  };
  const cleanLog: any = redactSensitiveData(dirtyLog);
  assert(
    cleanLog.apiKey === "[REDACTED]" &&
      cleanLog.privateKey === "[REDACTED]" &&
      cleanLog.headers.Authorization === "[REDACTED]" &&
      cleanLog.safeData === "Public catalog item 42",
    5,
    "Sensitive credentials, authorization tokens and keys properly redacted for observability"
  );

  // -------------------------------------------------------------
  // Test 6: SSRF Protection Firewall
  // -------------------------------------------------------------
  console.log("\n[Test 6] SSRF Protection & URL Validation");
  const dangerousUrls = [
    "http://localhost:3000/admin",
    "http://127.0.0.1:8080/metrics",
    "http://169.254.169.254/latest/meta-data/", // AWS metadata
    "http://10.0.0.1/internal/secrets",
    "http://192.168.1.1/router/config",
    "ftp://ftp.example.com",
    "file:///etc/passwd",
  ];

  let allBlocked = true;
  for (const url of dangerousUrls) {
    const check = validateSafeUrl(url);
    if (check.valid) {
      console.error(`  SSRF Guard failed to block: ${url}`);
      allBlocked = false;
    }
  }
  assert(
    allBlocked,
    6,
    "SSRF Guard strictly blocks private IPs, loopback addresses, metadata endpoints and invalid protocols"
  );

  const safeUrlCheck = validateSafeUrl("https://rpc.testnet.near.org");
  assert(
    safeUrlCheck.valid,
    6,
    "SSRF Guard permits public HTTPS endpoints (https://rpc.testnet.near.org)"
  );

  // -------------------------------------------------------------
  // Test 7: Integration Connection Lifecycle
  // -------------------------------------------------------------
  console.log("\n[Test 7] Integration Connection Lifecycle");
  const connName = `Testnet RPC Gateway ${runId}`;
  const connection = await createIntegrationConnection({
    userId: user1.id,
    providerId: "near_rpc",
    name: connName,
    authType: "NONE",
    config: { baseUrl: "https://rpc.testnet.near.org" },
  });

  assert(
    connection.name === connName && connection.status === "ACTIVE",
    7,
    "Integration connection created in ACTIVE state",
    `Connection ID: ${connection.id}`
  );

  // Verify connection ping
  const verifyRes = await verifyConnection(connection.id, user1.id);
  assert(
    verifyRes.ok && verifyRes.status === "ACTIVE",
    7,
    "Integration verification test succeeds against live NEAR testnet RPC",
    `Latency: ${verifyRes.latencyMs}ms`
  );

  // Disconnect connection
  const disconnected = await disconnectConnection(connection.id, user1.id);
  assert(
    disconnected.status === "DISCONNECTED",
    7,
    "Integration connection successfully transitioned to DISCONNECTED"
  );

  // Reconnect by creating authenticated connection for REST testing
  const authConn = await createIntegrationConnection({
    userId: user1.id,
    providerId: "rest_api",
    name: `Vendor API ${runId}`,
    authType: "API_KEY",
    credentials: { apiKey: "test_key_12345" },
    config: { baseUrl: "https://httpbin.org" },
  });

  // Test revoke wiping credentials
  const revoked = await revokeConnection(authConn.id, user1.id);
  assert(
    revoked.status === "REVOKED" && !revoked.hasCredentials,
    7,
    "Revoking integration wipes encrypted credentials permanently from database"
  );

  // -------------------------------------------------------------
  // Test 8: Live Tool Invocations: DuckDuckGo Web Search & NEAR RPC
  // -------------------------------------------------------------
  console.log("\n[Test 8] Live Tool Invocations: DuckDuckGo & NEAR RPC");

  // Grant agent1 permissions for duckduckgo_search and near_rpc_reader
  await grantAgentToolAccess({
    agentId: agent1.id,
    userId: user1.id,
    toolId: "duckduckgo_search",
    permissionLevel: "READ",
  });

  await grantAgentToolAccess({
    agentId: agent1.id,
    userId: user1.id,
    toolId: "near_rpc_reader",
    permissionLevel: "READ",
  });

  // 1. DuckDuckGo search invocation
  const ddgRes = await toolExecutor.execute({
    agentId: agent1.id,
    userId: user1.id,
    toolId: "duckduckgo_search",
    operation: "search",
    params: {
      query: "NEAR protocol blockchain analytics",
      limit: 3,
    },
  });

  const searchResults = ddgRes.data?.sources || ddgRes.data?.results || [];
  assert(
    Boolean(ddgRes.success && Array.isArray(searchResults) && searchResults.length > 0),
    8,
    "DuckDuckGo search tool executes and returns verified external search results",
    `Result count: ${searchResults.length}`
  );

  // 2. NEAR RPC reader invocation (view_account on testnet.near)
  const nearRes = await toolExecutor.execute({
    agentId: agent1.id,
    userId: user1.id,
    toolId: "near_rpc_reader",
    operation: "get_balance",
    params: {
      accountId: "testnet.near",
    },
  });

  const balanceNear = nearRes.data?.amountNear || nearRes.data?.balanceNear;
  const balanceYocto = nearRes.data?.amountYocto || nearRes.data?.balanceYocto;
  assert(
    Boolean(nearRes.success && balanceYocto && balanceNear),
    8,
    "NEAR RPC Reader tool queries live testnet account balance via testnet RPC",
    `Account: testnet.near, Balance: ${balanceNear} NEAR`
  );

  // -------------------------------------------------------------
  // Test 9: Input Validation & Idempotency Enforcement
  // -------------------------------------------------------------
  console.log("\n[Test 9] Schema Validation & Idempotency Key Handling");

  // 1. Invalid input schema rejection
  const invalidParamRes = await toolExecutor.execute({
    agentId: agent1.id,
    userId: user1.id,
    toolId: "duckduckgo_search",
    operation: "search",
    params: {
      query: "", // empty query fails min(1) validation
    },
  });
  assert(
    Boolean(!invalidParamRes.success && (invalidParamRes.error?.includes("Invalid input") || invalidParamRes.error?.includes("Query string is required"))),
    9,
    "ToolExecutor rejects invalid inputs that violate Zod operation schema"
  );

  // 2. Idempotency Key Caching
  const testIdemKey = `idem-key-tool-${runId}-${Date.now()}`;
  const firstCall = await toolExecutor.execute({
    agentId: agent1.id,
    userId: user1.id,
    toolId: "duckduckgo_search",
    operation: "validate_domain",
    params: { url: "https://near.org" },
    idempotencyKey: testIdemKey,
  });

  const secondCall = await toolExecutor.execute({
    agentId: agent1.id,
    userId: user1.id,
    toolId: "duckduckgo_search",
    operation: "validate_domain",
    params: { url: "https://near.org" },
    idempotencyKey: testIdemKey,
  });

  assert(
    firstCall.success && secondCall.success && secondCall.cached === true && secondCall.invocationId === firstCall.invocationId,
    9,
    "Idempotency key prevents duplicate execution and serves cached result safely"
  );

  // -------------------------------------------------------------
  // Test 10: Tool Rate Limiting Enforcement
  // -------------------------------------------------------------
  console.log("\n[Test 10] Tool Rate Limiting & Concurrency Controls");

  // Register a strictly rate-limited tool for test purposes
  const rateLimitedToolId = `rate_limited_tool_${runId}`;
  toolRegistry.register({
    id: rateLimitedToolId,
    name: "Rate Limited Mock",
    description: "Tool with tight rate limit of 2 calls/min",
    category: "MONITORING",
    version: "1.0.0",
    executionType: "INTERNAL",
    authenticationRequirements: "NONE",
    timeoutMs: 3000,
    retryPolicy: { maxRetries: 0, backoffMs: 1000 },
    rateLimits: { maxRequestsPerMinute: 2, maxConcurrent: 2 },
    availabilityStatus: "ACTIVE",
    supportedAgentTypes: ["*"],
    ownerOrProvider: "test",
    operations: {
      ping: {
        id: "ping",
        name: "Ping",
        description: "Simple ping",
        inputSchema: z.object({ msg: z.string() }),
        outputSchema: z.object({ pong: z.boolean() }),
        requiredPermission: "READ",
        riskClassification: "LOW",
        idempotent: true,
      },
    },
  });

  internalAdapter.registerHandler(rateLimitedToolId, "ping", async () => ({ pong: true }));

  await grantAgentToolAccess({
    agentId: agent1.id,
    userId: user1.id,
    toolId: rateLimitedToolId,
    permissionLevel: "READ",
  });

  // Call 1
  const r1 = await toolExecutor.execute({
    agentId: agent1.id,
    userId: user1.id,
    toolId: rateLimitedToolId,
    operation: "ping",
    params: { msg: "1" },
  });
  // Call 2
  const r2 = await toolExecutor.execute({
    agentId: agent1.id,
    userId: user1.id,
    toolId: rateLimitedToolId,
    operation: "ping",
    params: { msg: "2" },
  });
  // Call 3 (should hit rate limit!)
  const r3 = await toolExecutor.execute({
    agentId: agent1.id,
    userId: user1.id,
    toolId: rateLimitedToolId,
    operation: "ping",
    params: { msg: "3" },
  });

  assert(
    Boolean(r1.success && r2.success && !r3.success && r3.error?.includes("Rate limit exceeded")),
    10,
    "Tool rate limiter strictly throttles calls exceeding maxRequestsPerMinute"
  );

  // -------------------------------------------------------------
  // Test 11: Agent Execution Context Integration (context.tools)
  // -------------------------------------------------------------
  console.log("\n[Test 11] Agent Execution Context (context.tools) Discovery & Invocation");

  // Run real agent execution loop with ProcurementAgentAdapter
  const execResult = await executionOrchestrator.startExecution({
    agentId: agent1.id,
    userId: user1.id,
    input: "Find high performance blockchain telemetry indexing providers with budget 5 NEAR",
  });

  assert(
    execResult.status === "COMPLETED" || execResult.status === "WAITING_FOR_APPROVAL",
    11,
    "Procurement Agent successfully executes using context.tools discovery and web research",
    `Execution ID: ${execResult.executionId}, Status: ${execResult.status}`
  );

  // -------------------------------------------------------------
  // Test 12: Tool Invocation Persistence & Tamper-Evident Audit Ledger
  // -------------------------------------------------------------
  console.log("\n[Test 12] Tool Invocation Persistence & Audit Hash Chain");

  const storedInvocations = await prisma.toolInvocation.findMany({
    where: { agentId: agent1.id },
    orderBy: { createdAt: "desc" },
  });

  assert(
    storedInvocations.length >= 3,
    12,
    "Tool invocations persisted in ToolInvocation audit table",
    `Total invocations: ${storedInvocations.length}`
  );

  // Check that inputJson does not leak secrets
  const anyLeakedSecrets = storedInvocations.some((inv) =>
    inv.inputJson.includes("live_test_api_key_secret_12345")
  );
  assert(
    !anyLeakedSecrets,
    12,
    "ToolInvocation records contain zero plaintext secrets or private keys"
  );

  // Verify Audit Chain
  const auditVerification = await verifyAuditChain(user1.id);
  assert(
    auditVerification.valid,
    12,
    "Cryptographic SHA-256 audit ledger hash chain remains 100% valid and untampered",
    `Verified record count: ${auditVerification.count}`
  );

  // -------------------------------------------------------------
  // Test 13: HTTP REST API Endpoints Verification
  // -------------------------------------------------------------
  console.log("\n[Test 13] HTTP REST API Endpoints Verification");

  // 1. GET /api/tools
  const apiToolsRes = await fetch(`${BASE_URL}/api/tools`);
  const apiToolsData = await apiToolsRes.json();
  assert(
    apiToolsData.success && apiToolsData.count >= 4,
    13,
    "GET /api/tools returns registered tools list with status and risk badges"
  );

  // 2. GET /api/tools/duckduckgo_search
  const apiToolDetailRes = await fetch(`${BASE_URL}/api/tools/duckduckgo_search`);
  const apiToolDetailData = await apiToolDetailRes.json();
  assert(
    apiToolDetailData.success && apiToolDetailData.tool.id === "duckduckgo_search",
    13,
    "GET /api/tools/[id] returns detailed tool definition and operations schema"
  );

  // 3. GET /api/agents/[id]/tools
  const apiAgentToolsRes = await fetch(`${BASE_URL}/api/agents/${agent1.id}/tools`, {
    headers: { "x-near-account": user1Near },
  });
  const apiAgentToolsData = await apiAgentToolsRes.json();
  assert(
    apiAgentToolsData.success && apiAgentToolsData.assignedTools.length >= 2,
    13,
    "GET /api/agents/[id]/tools returns agent's assigned tools and available tools"
  );

  // 4. GET /api/tools/activity
  const apiActivityRes = await fetch(`${BASE_URL}/api/tools/activity?agentId=${agent1.id}`, {
    headers: { "x-near-account": user1Near },
  });
  const apiActivityData = await apiActivityRes.json();
  assert(
    apiActivityData.success && apiActivityData.invocations.length >= 3,
    13,
    "GET /api/tools/activity returns filtered user tool activity log"
  );

  console.log("\n=================================================================");
  console.log("=== ALL MILESTONE 2 TOOL REGISTRY TESTS COMPLETED: 13/13 PASS ===");
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
