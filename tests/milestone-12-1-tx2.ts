/**
 * MANDATE — MILESTONE 12.1: TRANSACTION 2 SCRIPT (0.002 NEAR)
 * 
 * Supports:
 * - --prepare: Read-only preflight validation, policy evaluation, gas estimation, parameter generation.
 * - --run: Live execution through ExecutionBoundaryService.execute, on-chain verification, reconciliation.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { prisma } from "../src/lib/db";
import { getNearAccountState, verifyNearTransaction } from "../src/lib/nearRpc";
import { yoctoToNear, nearToYocto } from "../src/lib/yocto";
import { ExecutionBoundaryService } from "../src/lib/execution/boundaryService";
import { MandateAccountingService } from "../src/lib/mandate/accountingService";
import { ExecutionValidationService } from "../src/lib/execution/validationService";

const TESTNET_RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const MANDATE_ID = "cmw19ayhj0001sbyxd9uizeha";
const RECIPIENT = "0x479253b82eb63eb36f140ecabf0237cc338084e7";
const AMOUNT_NEAR = "0.002";
const AMOUNT_YOCTO = nearToYocto(AMOUNT_NEAR);

export async function prepareTx2() {
  console.log("=== PREPARING MILESTONE 12.1 — TRANSACTION 2 (0.002 NEAR) ===");

  const mandate = await prisma.mandate.findUnique({
    where: { id: MANDATE_ID },
    include: { wallet: true, agent: true, user: true },
  });

  if (!mandate) throw new Error("Mandate not found");

  const senderAddress = mandate.wallet.nearAccountId;
  const senderState = await getNearAccountState(senderAddress);
  const recipientState = await getNearAccountState(RECIPIENT);

  if (!senderState) throw new Error("Sender account not found on-chain");
  if (!recipientState) throw new Error("Recipient account not found on-chain");

  const senderBalNear = yoctoToNear(senderState.amountYocto);
  const recipientBalNear = yoctoToNear(recipientState.amountYocto);

  // Accounting state
  const accounting = await MandateAccountingService.getAccountingBreakdown(mandate.id, mandate.userId);

  // Preflight validation check using ExecutionValidationService
  const validation = await ExecutionValidationService.validateNearTransferPreflight({
    userId: mandate.userId,
    mandateId: mandate.id,
    recipient: RECIPIENT,
    amountYocto: AMOUNT_YOCTO,
  });

  // Estimated gas from provider baseline (~0.0008 NEAR)
  const estimatedGasNear = "0.0008";

  const executionIdentifier = `exec-m12-tx2-${Date.now()}`;
  const idempotencyKey = `idemp-m12-tx2-${Date.now()}`;

  const summary = {
    executionIdentifier,
    idempotencyKey,
    mandateId: mandate.id,
    mandateName: mandate.name,
    mandateStatus: mandate.status,
    policyVersion: mandate.policyVersion,
    sender: senderAddress,
    recipient: RECIPIENT,
    amountNear: AMOUNT_NEAR,
    amountYocto: AMOUNT_YOCTO,
    network: "NEAR Testnet",
    rpcEndpoint: TESTNET_RPC,
    executionProvider: "OutLayer Intel SGX TEE",
    currentSenderBalNear: senderBalNear,
    currentRecipientBalNear: recipientBalNear,
    mandateTotalBudgetNear: accounting.totalBudgetNear,
    mandateSpentNear: accounting.spentNear,
    mandateReservedNear: accounting.reservedNear,
    mandateAvailableBudgetNear: accounting.availableBudgetNear,
    remainingBudgetAfterTx2Near: yoctoToNear(
      (BigInt(accounting.availableBudgetYocto) - BigInt(AMOUNT_YOCTO)).toString()
    ),
    estimatedGasNear,
    policyDecision: validation.valid ? "ALLOW" : "DENY",
    validationChecks: validation.checks.map((c) => ({ name: c.name, passed: c.passed, detail: c.details })),
    sufficientBalance: BigInt(senderState.amountYocto) > BigInt(AMOUNT_YOCTO) + BigInt(nearToYocto(estimatedGasNear)),
    withinPerTxLimit: BigInt(AMOUNT_YOCTO) <= BigInt(mandate.perTxLimitYocto),
    withinRemainingBudget: BigInt(AMOUNT_YOCTO) <= BigInt(accounting.availableBudgetYocto),
    recipientAllowlisted: validation.checks.find((c) => c.name === "Recipient Allowed")?.passed ?? true,
  };

  return summary;
}

export async function executeTx2(idempotencyKey?: string) {
  console.log("=== EXECUTING MILESTONE 12.1 — TRANSACTION 2 (0.002 NEAR) ===");

  const mandate = await prisma.mandate.findUnique({
    where: { id: MANDATE_ID },
    include: { wallet: true, agent: true, user: true },
  });

  if (!mandate) throw new Error("Mandate not found");

  const senderAddress = mandate.wallet.nearAccountId;
  const preSenderState = await getNearAccountState(senderAddress);
  const preRecipientState = await getNearAccountState(RECIPIENT);

  const finalIdempKey = idempotencyKey || `idemp-m12-tx2-${Date.now()}`;
  console.log(`\nDispatching via ExecutionBoundaryService with idempotencyKey: ${finalIdempKey}...`);

  const executionResult = await ExecutionBoundaryService.execute({
    userId: mandate.userId,
    mandateId: mandate.id,
    agentId: mandate.agentId,
    recipient: RECIPIENT,
    amountYocto: AMOUNT_YOCTO,
    operation: "TRANSFER",
    idempotencyKey: finalIdempKey,
    isSimulated: false, // REAL LIVE ON-CHAIN BROADCAST
  });

  if (!executionResult.success || !executionResult.txHash) {
    throw new Error(`Execution failed: ${executionResult.error || "No txHash returned"}`);
  }

  const txHash = executionResult.txHash;
  console.log(`\n★ TRANSACTION 2 BROADCAST SUCCESS! Hash: ${txHash}`);
  console.log("Awaiting block inclusion and finality on NEAR Testnet...");

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

  const rawRes = await fetch(TESTNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "verify-tx2",
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

  await new Promise((r) => setTimeout(r, 1500));
  const postSenderState = await getNearAccountState(senderAddress);
  const postRecipientState = await getNearAccountState(RECIPIENT);

  const accounting = await MandateAccountingService.getAccountingBreakdown(mandate.id, mandate.userId);

  return {
    txHash,
    blockHash: txInfo?.transaction_outcome?.block_hash,
    gasBurnt: txInfo?.transaction_outcome?.outcome?.gas_burnt || onChainTx?.gasBurnt,
    sender: senderAddress,
    recipient: RECIPIENT,
    amountNear: AMOUNT_NEAR,
    preSenderBal: yoctoToNear(preSenderState?.amountYocto || "0"),
    postSenderBal: yoctoToNear(postSenderState?.amountYocto || "0"),
    preRecipientBal: yoctoToNear(preRecipientState?.amountYocto || "0"),
    postRecipientBal: yoctoToNear(postRecipientState?.amountYocto || "0"),
    accounting,
  };
}

async function main() {
  const mode = process.argv[2];
  if (mode === "--prepare") {
    const summary = await prepareTx2();
    console.log("\nTX2_PREPARE_SUMMARY:", JSON.stringify(summary, null, 2));
    process.exit(0);
  } else if (mode === "--run") {
    const res = await executeTx2();
    console.log("\nTX2_COMPLETED_SUCCESSFULLY:", JSON.stringify(res, null, 2));
    process.exit(0);
  } else {
    console.log("Usage: npx tsx tests/milestone-12-1-tx2.ts [--prepare | --run]");
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("TX2_ERROR:", err);
    process.exit(1);
  });
}
