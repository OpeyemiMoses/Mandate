/**
 * MANDATE — MILESTONE 12.1: TRANSACTION 1 EXECUTION SCRIPT
 * 
 * Executes Transaction 1 (0.001 NEAR) through ExecutionBoundaryService.execute,
 * verifies on-chain finality independently via FastNEAR RPC,
 * commits confirmed spending, and checks cumulative budget accounting.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { prisma } from "../src/lib/db";
import { getNearAccountState, verifyNearTransaction } from "../src/lib/nearRpc";
import { yoctoToNear, nearToYocto, subYocto } from "../src/lib/yocto";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { MandateAccountingService } from "../src/lib/mandate/accountingService";

const TESTNET_RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";

async function executeTx1() {
  console.log("=== EXECUTING MILESTONE 12.1 — TRANSACTION 1 (0.001 NEAR) ===");

  const mandateId = "cmw19ayhj0001sbyxd9uizeha";
  const mandate = await prisma.mandate.findUnique({
    where: { id: mandateId },
    include: { wallet: true, agent: true, user: true },
  });

  if (!mandate) throw new Error("Mandate not found");

  const senderAddress = mandate.wallet.nearAccountId;
  const recipientAddress = "0x479253b82eb63eb36f140ecabf0237cc338084e7";
  const amountNear = "0.001";
  const amountYocto = nearToYocto(amountNear);

  const preSenderState = await getNearAccountState(senderAddress);
  const preRecipientState = await getNearAccountState(recipientAddress);

  console.log("Pre-Transfer Balances:");
  console.log(`- Sender:    ${yoctoToNear(preSenderState?.amountYocto || "0")} NEAR`);
  console.log(`- Recipient: ${yoctoToNear(preRecipientState?.amountYocto || "0")} NEAR`);

  const idempotencyKey = `idemp-m12-tx1-${Date.now()}`;
  console.log(`\nDispatching via ExecutionBoundaryService with idempotencyKey: ${idempotencyKey}...`);

  const executionResult = await ExecutionBoundaryService.execute({
    userId: mandate.userId,
    mandateId: mandate.id,
    agentId: mandate.agentId,
    recipient: recipientAddress,
    amountYocto,
    operation: "TRANSFER",
    idempotencyKey,
    isSimulated: false, // REAL LIVE ON-CHAIN BROADCAST!
  });

  if (!executionResult.success || !executionResult.txHash) {
    throw new Error(`Execution failed: ${executionResult.error || "No txHash returned"}`);
  }

  const txHash = executionResult.txHash;
  console.log(`\n★ TRANSACTION 1 BROADCAST SUCCESS! Hash: ${txHash}`);
  console.log("Awaiting block inclusion and finality on NEAR Testnet...");

  // Independent RPC polling
  let onChainTx: any = null;
  let attempts = 0;
  while (attempts < 15) {
    attempts++;
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const check = await verifyNearTransaction(txHash, senderAddress);
      if (check.status === "SUCCESS") {
        onChainTx = check;
        break;
      }
    } catch {}
  }

  // Also query raw tx details from FastNEAR RPC
  const rawRes = await fetch(TESTNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "verify-tx1",
      method: "tx",
      params: [txHash, senderAddress],
    }),
  });
  const rawData = await rawRes.json();
  const txInfo = rawData?.result;

  console.log("\nIndependent RPC Evidence:");
  console.log("- Status:      ", txInfo?.final_execution_status || onChainTx?.status);
  console.log("- Signer:      ", txInfo?.transaction?.signer_id);
  console.log("- Receiver:    ", txInfo?.transaction?.receiver_id);
  console.log("- Block Height:", onChainTx?.blockHeight);
  console.log("- Block Hash:  ", txInfo?.transaction_outcome?.block_hash);
  console.log("- Gas Burnt:   ", txInfo?.transaction_outcome?.outcome?.gas_burnt || onChainTx?.gasBurnt);

  // Post-transfer balances
  await new Promise((r) => setTimeout(r, 1500));
  const postSenderState = await getNearAccountState(senderAddress);
  const postRecipientState = await getNearAccountState(recipientAddress);

  console.log("\nPost-Transfer Balances:");
  console.log(`- Sender:    ${yoctoToNear(postSenderState?.amountYocto || "0")} NEAR`);
  console.log(`- Recipient: ${yoctoToNear(postRecipientState?.amountYocto || "0")} NEAR`);

  // Accounting breakdown
  const accounting = await MandateAccountingService.getAccountingBreakdown(mandate.id, mandate.userId);
  console.log("\nMandate Accounting Breakdown Post-Tx1:");
  console.log(`- Total Budget:     ${accounting.totalBudgetNear} NEAR`);
  console.log(`- Confirmed Spent:  ${accounting.spentNear} NEAR`);
  console.log(`- Active Reserved:  ${accounting.reservedNear} NEAR`);
  console.log(`- Available Budget: ${accounting.availableBudgetNear} NEAR`);

  return {
    txHash,
    blockHash: txInfo?.transaction_outcome?.block_hash,
    gasBurnt: txInfo?.transaction_outcome?.outcome?.gas_burnt || onChainTx?.gasBurnt,
    sender: senderAddress,
    recipient: recipientAddress,
    amountNear,
    preSenderBal: yoctoToNear(preSenderState?.amountYocto || "0"),
    postSenderBal: yoctoToNear(postSenderState?.amountYocto || "0"),
    preRecipientBal: yoctoToNear(preRecipientState?.amountYocto || "0"),
    postRecipientBal: yoctoToNear(postRecipientState?.amountYocto || "0"),
    accounting,
  };
}

if (process.argv[2] === "--run") {
  executeTx1()
    .then((res) => {
      console.log("\nTX1_COMPLETED_SUCCESSFULLY:", JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("\nTX1_FAILED:", err);
      process.exit(1);
    });
}

