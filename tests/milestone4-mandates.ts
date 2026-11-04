import { prisma } from "../src/lib/db";
import { yoctoToNear } from "../src/lib/yocto";

async function runMilestone4Tests() {
  console.log("=================================================");
  console.log("📜 MILESTONE 4: MANDATE BINDING & LIFECYCLE TEST SUITE");
  console.log("=================================================\n");

  const testUserAccount = `george-mandate-${Date.now().toString().slice(-4)}.testnet`;

  // 1. Authenticate user
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
  console.log(`✅ PASS: Connected user '${testUserAccount}'\n`);

  // 2. Create Agent
  console.log("STEP 2: Creating AI Agent 'DeFi Intelligence'");
  const agentRes = await fetch("http://localhost:3010/api/agents", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "DeFi Intelligence",
      purpose: "DeFi Market Data Access",
    }),
  });
  const agentData = await agentRes.json();
  const agent = agentData.agent;
  console.log(`✅ PASS: Created Agent '${agent.name}' with TEE Wallet: ${agent.wallet.nearAccountId}\n`);

  // 3. Create Mandate bound explicitly to Agent
  console.log("STEP 3: Creating spending mandate bound to 'DeFi Intelligence'");
  const mandateRes = await fetch("http://localhost:3010/api/mandates", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Market Intelligence Mandate",
      description: "Autonomous data purchase within strictly bounded budget",
      agentId: agent.id,
      totalBudgetNear: "2.000",
      perTxLimitNear: "0.200",
      approvalThresholdNear: "0.050",
      allowedRecipients: ["oracle.testnet", "market-data.near"],
      expiresAt: "2026-11-20T00:00:00.000Z",
    }),
  });
  const mandateData = await mandateRes.json();
  if (!mandateRes.ok || !mandateData.success || !mandateData.mandate?.id) {
    throw new Error(`Failed to create mandate: ${JSON.stringify(mandateData)}`);
  }
  const mandate = mandateData.mandate;
  console.log(`✅ PASS: Mandate created: '${mandate.name}' (ID: ${mandate.id})`);
  console.log(`   Governing Agent: '${mandate.agentName}' (${mandate.agentId})`);
  console.log(`   Custody Wallet Address: ${mandate.walletAddress}\n`);

  // 4. Verify Mandate appears in /api/mandates with Agent binding
  console.log("STEP 4: Verifying mandate listed with agent details");
  const listRes = await fetch("http://localhost:3010/api/mandates", {
    method: "GET",
    headers: authHeaders,
  });
  const listData = await listRes.json();
  const foundMandate = listData.mandates.find((m: any) => m.id === mandate.id);
  if (!foundMandate || foundMandate.agentId !== agent.id || foundMandate.agentName !== agent.name) {
    throw new Error(`Mandate agent binding mismatch: ${JSON.stringify(foundMandate)}`);
  }
  console.log(`✅ PASS: Verified mandate is bound to agent '${foundMandate.agentName}' and wallet '${foundMandate.wallet.nearAccountId}'\n`);

  // 5. Pause Mandate
  console.log("STEP 5: Pausing mandate via PATCH /api/mandates/[id]");
  const pauseRes = await fetch(`http://localhost:3010/api/mandates/${mandate.id}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ status: "PAUSED" }),
  });
  const pauseData = await pauseRes.json();
  if (pauseData.mandate.status !== "PAUSED") {
    throw new Error(`Failed to pause mandate: ${JSON.stringify(pauseData)}`);
  }
  console.log("✅ PASS: Mandate status updated to PAUSED.\n");

  // 6. Verify policy engine blocks tasks on paused mandate
  console.log("STEP 6: Verifying deterministic policy engine blocks proposals on PAUSED mandate");
  const taskRes = await fetch("http://localhost:3010/api/tasks", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      mandateId: mandate.id,
      title: "Paused Task Test",
      proposedRecipient: "oracle.testnet",
      proposedAmountNear: "0.040",
    }),
  });
  const taskData = await taskRes.json();
  if (taskData.verdict === "BLOCK" && taskData.reasonCode === "MANDATE_NOT_ACTIVE") {
    console.log("✅ PASS: Policy firewall blocked proposal with MANDATE_NOT_ACTIVE\n");
  } else {
    throw new Error(`Expected MANDATE_NOT_ACTIVE block, got: ${JSON.stringify(taskData)}`);
  }

  // 7. Resume Mandate
  console.log("STEP 7: Resuming mandate via PATCH /api/mandates/[id]");
  const resumeRes = await fetch(`http://localhost:3010/api/mandates/${mandate.id}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ status: "ACTIVE" }),
  });
  const resumeData = await resumeRes.json();
  if (resumeData.mandate.status !== "ACTIVE") {
    throw new Error(`Failed to resume mandate: ${JSON.stringify(resumeData)}`);
  }
  console.log("✅ PASS: Mandate resumed to ACTIVE.\n");

  // 8. Revoke Mandate
  console.log("STEP 8: Revoking mandate via DELETE /api/mandates/[id]");
  const revokeRes = await fetch(`http://localhost:3010/api/mandates/${mandate.id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  const revokeData = await revokeRes.json();
  if (revokeData.mandate.status !== "REVOKED") {
    throw new Error(`Failed to revoke mandate: ${JSON.stringify(revokeData)}`);
  }
  console.log("✅ PASS: Mandate successfully REVOKED.\n");

  console.log("=================================================");
  console.log("🎉 ALL MILESTONE 4 MANDATE TESTS PASSED!");
  console.log("=================================================");
}

runMilestone4Tests().catch((e) => {
  console.error(e);
  process.exit(1);
});

