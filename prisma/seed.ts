import { prisma } from "../src/lib/db";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import { registerOutlayerWallet } from "../src/lib/outlayer";

async function main() {
  console.log("🌱 Seeding Mandate database with Multi-Agent architecture...");

  // Clean existing demo user to ensure clean state
  await prisma.user.deleteMany({
    where: { nearAccountId: "near_user.near" },
  });

  // 1. Create user
  const user = await prisma.user.create({
    data: {
      nearAccountId: "near_user.near",
      twoFactorEnabled: true,
      emailAlerts: true,
      sessionToken: "sess_demo_master_token",
    },
  });
  console.log("✅ User created:", user.nearAccountId);

  // 2. Register OutLayer TEE wallet for Agent 1: Research Agent
  console.log("⚡ Provisioning OutLayer TEE wallet for Research Agent...");
  const reg1 = await registerOutlayerWallet();
  const researchAgent = await prisma.agent.create({
    data: {
      name: "Research Agent",
      description: "Purchases approved research reports, indexing data, and market intelligence",
      purpose: "DeFi Research & Analytics",
      status: "ACTIVE",
      userId: user.id,
      wallet: {
        create: {
          walletId: reg1.wallet_id,
          apiKey: reg1.api_key,
          nearAccountId: reg1.near_account_id,
          handoffUrl: reg1.handoff_url,
          network: "testnet",
          balanceYocto: nearToYocto("5.000"), // Allocated funded balance
        },
      },
    },
    include: { wallet: true },
  });
  console.log("✅ Created Agent 1:", researchAgent.name, "Wallet:", researchAgent.wallet?.nearAccountId);

  // 3. Register OutLayer TEE wallet for Agent 2: Operations Agent
  console.log("⚡ Provisioning OutLayer TEE wallet for Operations Agent...");
  const reg2 = await registerOutlayerWallet();
  const operationsAgent = await prisma.agent.create({
    data: {
      name: "Operations Agent",
      description: "Pays approved dev services, RPC nodes, and CI verification providers",
      purpose: "Infrastructure Operations",
      status: "ACTIVE",
      userId: user.id,
      wallet: {
        create: {
          walletId: reg2.wallet_id,
          apiKey: reg2.api_key,
          nearAccountId: reg2.near_account_id,
          handoffUrl: reg2.handoff_url,
          network: "testnet",
          balanceYocto: nearToYocto("2.000"),
        },
      },
    },
    include: { wallet: true },
  });
  console.log("✅ Created Agent 2:", operationsAgent.name, "Wallet:", operationsAgent.wallet?.nearAccountId);

  // 4. Create Spending Mandates bound to their respective agents
  const mandateDefi = await prisma.mandate.create({
    data: {
      name: "DeFi Research",
      description: "Autonomous data access and indexing for NEAR DeFi protocols",
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("5.000"),
      spentYocto: nearToYocto("1.250"),
      reservedYocto: nearToYocto("0.080"),
      perTxLimitYocto: nearToYocto("0.100"),
      approvalThresholdYocto: nearToYocto("0.050"),
      allowedRecipientsJson: JSON.stringify(["researcher.near", "oracle.testnet"]),
      expiresAt: new Date("2026-11-14T23:59:00Z"),
      userId: user.id,
      agentId: researchAgent.id,
      walletId: researchAgent.wallet!.id,
    },
  });

  const mandateDev = await prisma.mandate.create({
    data: {
      name: "Development Tools",
      description: "Compute and micro-subscriptions for CI agent runners",
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("1.000"),
      spentYocto: nearToYocto("0.000"),
      reservedYocto: nearToYocto("0.000"),
      perTxLimitYocto: nearToYocto("0.200"),
      approvalThresholdYocto: nearToYocto("0.100"),
      allowedRecipientsJson: JSON.stringify(["dev.near", "infra.testnet"]),
      expiresAt: new Date("2026-11-14T23:59:00Z"),
      userId: user.id,
      agentId: operationsAgent.id,
      walletId: operationsAgent.wallet!.id,
    },
  });
  console.log("✅ Created Mandates:", mandateDefi.name, "&", mandateDev.name);

  // 5. Create Task and Approval
  const task1 = await prisma.task.create({
    data: {
      title: "Research Data Access",
      description: "Purchase approved research data indexing service",
      status: "COMPLETED",
      agentId: researchAgent.id,
      mandateId: mandateDefi.id,
      proposedRecipient: "researcher.near",
      proposedAmountYocto: nearToYocto("0.250"),
      idempotencyKey: "idem-seed-multi-01",
      planStepsJson: JSON.stringify([
        "1. Verify recipient and amount",
        "2. Check policy and budget",
        "3. Execute payment",
        "4. Confirm transaction",
      ]),
    },
  });

  await prisma.transactionRecord.create({
    data: {
      txHash: "4Kj39f2a87bc41d9e2a9",
      recipient: "researcher.near",
      amountYocto: nearToYocto("0.250"),
      status: "CONFIRMED",
      taskId: task1.id,
      mandateId: mandateDefi.id,
    },
  });

  const task2 = await prisma.task.create({
    data: {
      title: "DeFi Market Analysis",
      description: "Payment requested for deep liquidity pool metrics",
      status: "PENDING_APPROVAL",
      agentId: researchAgent.id,
      mandateId: mandateDefi.id,
      proposedRecipient: "researcher.near",
      proposedAmountYocto: nearToYocto("0.080"),
      idempotencyKey: "idem-seed-multi-02",
      planStepsJson: JSON.stringify([
        "1. Verify recipient and amount",
        "2. Exceeds approval threshold (> 0.050 NEAR)",
        "3. Awaiting human approval",
        "4. Execute OutLayer TEE signing",
      ]),
    },
  });

  await prisma.approvalRequest.create({
    data: {
      taskId: task2.id,
      mandateId: mandateDefi.id,
      recipient: "researcher.near",
      amountYocto: nearToYocto("0.080"),
      reason: "Amount 0.080 NEAR exceeds autonomous approval threshold (0.050 NEAR)",
      status: "PENDING",
    },
  });

  // 6. Record Audit
  await prisma.auditLog.create({
    data: {
      eventType: "AGENT_CREATED",
      verdict: "SUCCESS",
      detailsJson: JSON.stringify({
        agentId: researchAgent.id,
        name: researchAgent.name,
        wallet: researchAgent.wallet?.nearAccountId,
      }),
      userId: user.id,
    },
  });

  console.log("✅ Multi-Agent seeding finished successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
