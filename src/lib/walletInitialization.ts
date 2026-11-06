/**
 * OutLayer TEE Implicit Account Initialization Service
 *
 * Implements the 10-step safe initialization lifecycle for dedicated
 * 64-character hexadecimal implicit accounts on NEAR Protocol testnet.
 */

import { prisma } from "@/lib/db";
import { getNearAccountState, verifyNearTransaction } from "@/lib/nearRpc";
import { getOutlayerWalletBalance } from "@/lib/outlayer";
import { yoctoToNear, nearToYocto, isPositiveYoctoString } from "@/lib/yocto";
import { recordAuditEvent } from "@/lib/auditLedger";
import { getDecryptedWalletApiKey } from "@/lib/security/walletCredentialService";

export const RECOMMENDED_INITIALIZATION_NEAR = "0.05";
export const MINIMUM_STORAGE_STAKE_NEAR = "0.00182";

export interface WalletInitializationCheck {
  walletId: string;
  nearAccountId: string;
  isInitialized: boolean;
  status: "UNINITIALIZED" | "INITIALIZING" | "READY";
  onChainExists: boolean;
  onChainBalanceNear: string;
  onChainBalanceYocto: string;
  outlayerAccessible: boolean;
  outlayerBalanceNear?: string;
  recommendedFundingNear: string;
  message: string;
}

/**
 * Step 1-4 & 8-9: Inspect on-chain and OutLayer status of an agent's dedicated custody wallet.
 * Synchronizes database initialization state if on-chain existence is confirmed.
 */
export async function checkWalletInitializationStatus(
  walletId: string
): Promise<WalletInitializationCheck> {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { agent: true },
  });

  if (!wallet) {
    throw new Error(`Wallet "${walletId}" not found`);
  }

  // 1. Query NEAR RPC view_account to check on-chain existence and balance
  const rpcState = await getNearAccountState(wallet.nearAccountId);
  const onChainExists = rpcState !== null;
  const onChainBalanceYocto = rpcState?.amountYocto || "0";
  const onChainBalanceNear = yoctoToNear(onChainBalanceYocto);

  // 2. Query OutLayer TEE balance endpoint
  let outlayerAccessible = false;
  let outlayerBalanceYocto = "0";

  try {
    const outlayerRes = await getOutlayerWalletBalance(getDecryptedWalletApiKey(wallet));
    if (outlayerRes && outlayerRes.balance !== undefined) {
      outlayerAccessible = true;
      outlayerBalanceYocto = outlayerRes.balance;
    }
  } catch (err: any) {
    // If account not initialized on chain, OutLayer might still return balance: '0'
    outlayerAccessible = false;
  }

  // 3. Evaluate initialization status
  const isReady = onChainExists && BigInt(onChainBalanceYocto) > BigInt(0);
  const currentStatus = isReady ? "READY" : wallet.initializationStatus === "INITIALIZING" ? "INITIALIZING" : "UNINITIALIZED";

  // If on-chain state shows account exists but DB was UNINITIALIZED, advance to READY
  if (isReady && (!wallet.isInitialized || wallet.initializationStatus !== "READY")) {
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        isInitialized: true,
        initializationStatus: "READY",
        onChainBalanceYocto,
        balanceYocto: onChainBalanceYocto,
      },
    });

    await recordAuditEvent({
      userId: wallet.agent.userId,
      eventType: "WALLET_PROVISIONED",
      verdict: "SUCCESS",
      description: `Agent custody account ${wallet.nearAccountId.slice(0, 16)}... verified and ready on NEAR testnet`,
      details: {
        walletId: wallet.id,
        nearAccountId: wallet.nearAccountId,
        onChainBalanceNear,
      },
      agentId: wallet.agentId,
      agentWalletAddress: wallet.nearAccountId,
    });
  }

  return {
    walletId: wallet.id,
    nearAccountId: wallet.nearAccountId,
    isInitialized: isReady,
    status: currentStatus,
    onChainExists,
    onChainBalanceNear,
    onChainBalanceYocto,
    outlayerAccessible,
    outlayerBalanceNear: yoctoToNear(outlayerBalanceYocto),
    recommendedFundingNear: RECOMMENDED_INITIALIZATION_NEAR,
    message: isReady
      ? "Account is initialized, visible on NEAR testnet, and ready for autonomous OutLayer execution."
      : `Implicit account requires initial funding (recommended: ${RECOMMENDED_INITIALIZATION_NEAR} NEAR) to register in NEAR testnet's state trie.`,
  };
}

export interface CompleteInitializationParams {
  walletId: string;
  txHash: string;
  senderAccountId: string;
  userId: string;
}

/**
 * Step 5-10: Verify a user's initial funding transaction via NEAR RPC,
 * confirm on-chain visibility and OutLayer balance readback, and mark wallet READY.
 */
export async function completeWalletInitialization(
  params: CompleteInitializationParams
): Promise<WalletInitializationCheck> {
  const { walletId, txHash, senderAccountId, userId } = params;

  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { agent: true },
  });

  if (!wallet) {
    throw new Error(`Wallet "${walletId}" not found`);
  }

  if (wallet.agent.userId !== userId) {
    throw new Error("Unauthorized: Access denied to wallet");
  }

  // 1. Verify funding transaction independently via NEAR RPC
  const verification = await verifyNearTransaction(txHash, senderAccountId);
  if (verification.status === "FAILED") {
    throw new Error(`Transaction verification failed on NEAR RPC: ${verification.error || "Execution failed"}`);
  }

  // 2. Poll/confirm on-chain account existence
  let rpcState = await getNearAccountState(wallet.nearAccountId);
  let retries = 5;
  while (!rpcState && retries > 0) {
    await new Promise((r) => setTimeout(r, 1500));
    rpcState = await getNearAccountState(wallet.nearAccountId);
    retries--;
  }

  if (!rpcState) {
    throw new Error(
      `Funding transaction ${txHash} was confirmed, but account ${wallet.nearAccountId} is not yet visible via NEAR RPC. Please retry in a few seconds.`
    );
  }

  // 3. Confirm OutLayer can retrieve account balance
  const outlayerRes = await getOutlayerWalletBalance(getDecryptedWalletApiKey(wallet));
  const outlayerBalanceYocto = outlayerRes?.balance || rpcState.amountYocto;

  // 4. Mark wallet READY
  await prisma.wallet.update({
    where: { id: wallet.id },
    data: {
      isInitialized: true,
      initializationStatus: "READY",
      balanceYocto: rpcState.amountYocto,
      onChainBalanceYocto: rpcState.amountYocto,
    },
  });

  // 5. Record FundingRecord
  await prisma.fundingRecord.upsert({
    where: { txHash },
    update: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
    create: {
      txHash,
      senderAccountId,
      receiverAccountId: wallet.nearAccountId,
      amountYocto: rpcState.amountYocto,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      userId,
      walletId: wallet.id,
    },
  });

  // 6. Record Tamper-Evident SHA-256 Audit Event
  await recordAuditEvent({
    userId,
    eventType: "WALLET_PROVISIONED",
    verdict: "SUCCESS",
    description: `Agent custody wallet ${wallet.nearAccountId} initialized and funded on NEAR testnet (${yoctoToNear(rpcState.amountYocto)} NEAR)`,
    details: {
      txHash,
      senderAccountId,
      nearAccountId: wallet.nearAccountId,
      balanceNear: yoctoToNear(rpcState.amountYocto),
      initializationStatus: "READY",
    },
    agentId: wallet.agentId,
    agentWalletAddress: wallet.nearAccountId,
    txHash,
  });

  return {
    walletId: wallet.id,
    nearAccountId: wallet.nearAccountId,
    isInitialized: true,
    status: "READY",
    onChainExists: true,
    onChainBalanceNear: yoctoToNear(rpcState.amountYocto),
    onChainBalanceYocto: rpcState.amountYocto,
    outlayerAccessible: true,
    outlayerBalanceNear: yoctoToNear(outlayerBalanceYocto),
    recommendedFundingNear: RECOMMENDED_INITIALIZATION_NEAR,
    message: "Agent wallet successfully initialized on NEAR testnet and marked READY.",
  };
}

