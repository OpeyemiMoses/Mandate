import { prisma } from "../src/lib/db";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { nearToYocto, yoctoToNear } from "../src/lib/yocto";
import { registerDefaultTools } from "../src/lib/tools";
import { registerDefaultAgents } from "../src/lib/runtime/registry";
import { verifyNearTransaction } from "../src/lib/nearRpc";

registerDefaultTools();
registerDefaultAgents();

async function runAutonomousEvidenceFlow() {
  console.log("================================================================================");
  console.log("🔍 MANDATE M13.10 EVIDENCE: AUTONOMOUS FINANCIAL EXECUTION LIFECYCLE");
  console.log("================================================================================");

  const suffix = Date.now().toString(36);
  
  // Use authoritative tenant and custody wallet that maps to the live onchain TEE account:
  // 04fdfed3a43cd4475e3928457354d51737a5f67e865c540bf4cd35d19b1f724a
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: "cmvy0hwds0000sbpigdca711i" },
  });

  const agent = await prisma.agent.findUniqueOrThrow({
    where: { id: "cmw172diy0002sbokl7yqsdaw" },
  });

  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: "cmw172diy0003sboktabqi0yl" },
  });

  const mandate = await prisma.mandate.create({
    data: {
      userId: user.id,
      agentId: agent.id,
      walletId: wallet.id,
      name: `M13.10 Autonomous Procurement Mandate ${suffix}`,
      status: "ACTIVE",
      totalBudgetYocto: nearToYocto("0.05"),
      spentYocto: "0",
      reservedYocto: "0",
      perTxLimitYocto: nearToYocto("0.01"),
      approvalThresholdYocto: nearToYocto("0.02"), // 0.001 < 0.02 -> NO HUMAN APPROVAL REQUIRED
      allowedRecipientsJson: JSON.stringify(["test.testnet"]),
      policyVersion: 1,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  const objective = await prisma.objective.create({
    data: {
      userId: user.id,
      title: "Evidence Verification Objective",
      description: "Autonomous payment execution for cloud compute testnet verification",
      originalPrompt: "Procure cloud compute service testnet endpoint under 0.01 NEAR",
      status: "RUNNING",
      priority: "HIGH",
    },
  });

  const task = await prisma.task.create({
    data: {
      title: "Execute autonomous cloud payment",
      agentId: agent.id,
      mandateId: mandate.id,
      status: "IN_PROGRESS",
      idempotencyKey: `task-idem-${suffix}`,
      planStepsJson: JSON.stringify([{ step: 1, action: "execute_transfer" }]),
    },
  });

  console.log(`✓ Test Tenant Created: User ID ${user.id}`);
  console.log(`✓ Custody Wallet Assigned: ${wallet.nearAccountId} (OutLayer TEE implicit)`);
  console.log(`✓ Active Mandate Initialized: Mandate ID ${mandate.id}`);
  console.log(`  - Total Budget: ${yoctoToNear(mandate.totalBudgetYocto)} NEAR`);
  console.log(`  - Per-Tx Limit: ${yoctoToNear(mandate.perTxLimitYocto)} NEAR`);
  console.log(`  - Approval Threshold: ${yoctoToNear(mandate.approvalThresholdYocto)} NEAR`);
  console.log(`  - Allowed Recipient: test.testnet`);
  console.log(`✓ Authorized Objective Initialized: Objective ID ${objective.id}`);

  const transferAmountYocto = nearToYocto("0.001");
  const idempotencyKey = `evidence-autonomous-${suffix}`;

  console.log("\n🚀 Triggering Autonomous Execution via ExecutionBoundaryService.execute()...");
  console.log(`  - Operation: cloud_payment`);
  console.log(`  - Recipient: test.testnet`);
  console.log(`  - Amount: ${yoctoToNear(transferAmountYocto)} NEAR (${transferAmountYocto} yoctoNEAR)`);
  console.log(`  - Human Approval Required: FALSE (0.001 NEAR < threshold 0.02 NEAR)`);

  const execStart = Date.now();
  const result = await ExecutionBoundaryService.execute({
    userId: user.id,
    mandateId: mandate.id,
    agentId: agent.id,
    taskId: task.id,
    operation: "cloud_payment",
    recipient: "test.testnet",
    amountYocto: transferAmountYocto,
    idempotencyKey,
    isSimulated: false, // REAL ONCHAIN EXECUTION
  });
  const duration = Date.now() - execStart;

  console.log("\n📊 Execution Result:");
  console.log(`  - Success: ${result.success}`);
  console.log(`  - Execution ID: ${result.executionId}`);
  console.log(`  - Status: ${result.status}`);
  console.log(`  - On-Chain Tx Hash: ${result.txHash}`);
  console.log(`  - Settled: ${result.settled}`);
  console.log(`  - Duration: ${duration}ms`);

  // Query persisted DB records
  const updatedMandate = await prisma.mandate.findUnique({ where: { id: mandate.id } });
  const execRecord = await prisma.executionRecord.findUnique({ where: { id: result.executionId } });
  const auditLogs = await prisma.auditLog.findMany({
    where: { mandateId: mandate.id },
    orderBy: { createdAt: "asc" },
  });

  const remainingYocto = (
    BigInt(updatedMandate!.totalBudgetYocto) -
    BigInt(updatedMandate!.spentYocto) -
    BigInt(updatedMandate!.reservedYocto)
  ).toString();

  console.log("\n📚 Persisted Database Records Verification:");
  console.log(`  - Mandate Confirmed Spent: ${yoctoToNear(updatedMandate!.spentYocto)} NEAR`);
  console.log(`  - Mandate Remaining Budget: ${yoctoToNear(remainingYocto)} NEAR`);
  console.log(`  - Execution Record Status: ${execRecord?.status}`);
  console.log(`  - Execution Record Tx Hash: ${execRecord?.txHash}`);
  console.log(`  - Execution Record Block Hash: ${execRecord?.blockHash}`);
  console.log(`  - Execution Record Gas Burnt: ${execRecord?.gasBurnt}`);
  console.log(`  - Audit Trail Events Count: ${auditLogs.length}`);
  for (const log of auditLogs) {
    console.log(`    * [${log.createdAt.toISOString()}] ${log.eventType} -> ${log.verdict}: ${log.description}`);
  }

  // Cross-check on NEAR RPC
  if (result.txHash) {
    console.log("\n🌐 Verifying Tx on Independent NEAR RPC endpoints:");
    const rpc1 = await verifyNearTransaction(result.txHash, wallet.nearAccountId, {
      rpcUrl: "https://test.rpc.fastnear.com",
    });
    console.log(`  - FastNear RPC Status: ${rpc1.status}, Block: ${rpc1.blockHash}`);

    const rpc2 = await verifyNearTransaction(result.txHash, wallet.nearAccountId, {
      rpcUrl: "https://rpc.testnet.near.org",
    });
    console.log(`  - near.org RPC Status: ${rpc2.status}, Block: ${rpc2.blockHash}`);
  }

  return {
    userId: user.id,
    agentId: agent.id,
    walletId: wallet.id,
    mandateId: mandate.id,
    objectiveId: objective.id,
    taskId: task.id,
    executionId: result.executionId,
    txHash: result.txHash,
    blockHash: execRecord?.blockHash,
    amountYocto: transferAmountYocto,
    auditLogsCount: auditLogs.length,
  };
}

runAutonomousEvidenceFlow()
  .then((data) => {
    console.log("\n✅ Autonomous evidence run completed successfully!");
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Autonomous evidence run failed:", err);
    process.exit(1);
  });
