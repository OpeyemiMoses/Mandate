import { prisma } from "../src/lib/db";
import { yoctoToNear } from "../src/lib/yocto";

async function runMilestone2Tests() {
  console.log("=================================================");
  console.log("🤖 MILESTONE 2: AGENT LIFECYCLE & CUSTODY TEST SUITE");
  console.log("=================================================\n");

  const testUserAccount = `carol-agent-${Date.now().toString().slice(-4)}.testnet`;

  // 1. Connect User
  console.log(`STEP 1: Authenticating user '${testUserAccount}'`);
  const authRes = await fetch("http://localhost:3010/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: testUserAccount }),
  });
  const authData = await authRes.json();
  const sessionToken = authData.user.sessionToken;
  const authHeaders = {
    "Content-Type": "application/json",
    "x-session-token": sessionToken,
    "x-near-account": testUserAccount,
  };
  console.log(`✅ PASS: Connected '${testUserAccount}'\n`);

  // 2. Create Agent with OutLayer TEE Wallet
  console.log("STEP 2: Creating 'Business Assistant' agent with OutLayer TEE provisioning");
  const createRes = await fetch("http://localhost:3010/api/agents", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Business Assistant",
      description: "Researches suppliers and purchases approved market reports",
      purpose: "Procurement & Market Research",
    }),
  });
  const createData = await createRes.json();
  if (!createRes.ok || !createData.success || !createData.agent?.id) {
    throw new Error(`Failed to create agent: ${JSON.stringify(createData)}`);
  }
  const agent = createData.agent;
  console.log(`✅ PASS: Agent created: '${agent.name}' (ID: ${agent.id})`);
  console.log(`   Dedicated OutLayer Custody Wallet: ${agent.wallet.nearAccountId}`);
  if (agent.wallet.nearAccountId.length !== 64) {
    throw new Error("Expected a 64-character ed25519 implicit account from OutLayer TEE");
  }
  console.log("   Verified 64-char implicit ed25519 custody address.\n");

  // 3. List Agents for Authenticated User
  console.log("STEP 3: Listing agents for authenticated user");
  const listRes = await fetch("http://localhost:3010/api/agents", {
    method: "GET",
    headers: authHeaders,
  });
  const listData = await listRes.json();
  if (listData.agents.length !== 1 || listData.agents[0].id !== agent.id) {
    throw new Error(`Agent list mismatch: ${JSON.stringify(listData)}`);
  }
  console.log(`✅ PASS: Listed 1 agent with balance ${listData.agents[0].wallet.balanceNear} NEAR\n`);

  // 4. Pause Agent
  console.log("STEP 4: Pausing agent");
  const pauseRes = await fetch(`http://localhost:3010/api/agents/${agent.id}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ status: "PAUSED" }),
  });
  const pauseData = await pauseRes.json();
  if (pauseData.agent.status !== "PAUSED") {
    throw new Error(`Failed to pause agent: ${JSON.stringify(pauseData)}`);
  }
  console.log("✅ PASS: Agent status updated to PAUSED.\n");

  // 5. Resume Agent
  console.log("STEP 5: Resuming agent");
  const resumeRes = await fetch(`http://localhost:3010/api/agents/${agent.id}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ status: "ACTIVE" }),
  });
  const resumeData = await resumeRes.json();
  if (resumeData.agent.status !== "ACTIVE") {
    throw new Error(`Failed to resume agent: ${JSON.stringify(resumeData)}`);
  }
  console.log("✅ PASS: Agent status updated to ACTIVE.\n");

  // 6. Test Multi-User Isolation
  console.log("STEP 6: Testing multi-user agent isolation (Dave cannot see Carol's agent)");
  const daveHeaders = {
    "Content-Type": "application/json",
    "x-near-account": "dave-agent-isolation.testnet",
  };
  const daveListRes = await fetch("http://localhost:3010/api/agents", {
    method: "GET",
    headers: daveHeaders,
  });
  const daveListData = await daveListRes.json();
  const carolsAgentVisibleToDave = daveListData.agents.find((a: any) => a.id === agent.id);
  if (carolsAgentVisibleToDave) {
    throw new Error("Security leak! Carol's agent is visible to Dave.");
  }
  console.log("✅ PASS: Multi-user agent isolation strictly enforced.\n");

  console.log("=================================================");
  console.log("🎉 ALL MILESTONE 2 AGENT TESTS PASSED!");
  console.log("=================================================");
}

runMilestone2Tests().catch((e) => {
  console.error(e);
  process.exit(1);
});

