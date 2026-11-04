/**
 * NEAR RPC Client
 * Native JSON-RPC queries for account balances, keys, and transaction tracking.
 * Never requests or stores user private keys or seed phrases.
 */

const TESTNET_RPC_URL =
  process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const ARCHIVAL_RPC_URL = "https://archival-rpc.testnet.near.org";

export interface NearAccountState {
  amountYocto: string;
  blockHeight: number;
  blockHash: string;
  storageUsage: number;
}

export async function getNearAccountState(
  accountId: string
): Promise<NearAccountState | null> {
  try {
    const cleanId = accountId.trim().toLowerCase();

    // 1. Authoritative NEAR RPC query (supports named accounts, 64-hex implicit, and 0x EVM implicit accounts)
    let data: any = null;
    const endpoints = [
      TESTNET_RPC_URL,
      "https://test.rpc.fastnear.com",
      "https://rpc.testnet.near.org",
    ].filter((v, i, a) => a.indexOf(v) === i);

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: `rpc-${Date.now()}`,
            method: "query",
            params: {
              request_type: "view_account",
              finality: "final",
              account_id: cleanId,
            },
          }),
        });
        const json = await res.json();
        if (json.result && json.result.amount) {
          data = json;
          break;
        }
      } catch (err) {
        // try next endpoint
      }
    }

    if (data && data.result && data.result.amount) {
      return {
        amountYocto: data.result.amount,
        blockHeight: data.result.block_height,
        blockHash: data.result.block_hash,
        storageUsage: data.result.storage_usage,
      };
    }

    // 2. Fallback: If not found on NEAR core and address is an EVM address, check Aurora Testnet
    if (cleanId.startsWith("0x")) {
      const auroraRes = await fetch("https://testnet.aurora.dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `aurora-${Date.now()}`,
          method: "eth_getBalance",
          params: [cleanId, "latest"],
        }),
      });
      const auroraData = await auroraRes.json();
      if (auroraData.result && auroraData.result !== "0x0" && auroraData.result !== "0x") {
        // Convert wei (10^18) to yoctoNEAR scale (10^24) by multiplying by 10^6
        const weiBigInt = BigInt(auroraData.result);
        const yoctoEquivalent = (weiBigInt * BigInt(1000000)).toString();
        return {
          amountYocto: yoctoEquivalent,
          blockHeight: 0,
          blockHash: "aurora-testnet",
          storageUsage: 0,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("NEAR RPC query error:", error);
    return null;
  }
}

export type NearVerificationStatus =
  | "SUCCESS"
  | "FAILED"
  | "PENDING"
  | "TIMEOUT"
  | "NETWORK_ERROR";

export interface NearTxStatus {
  status: NearVerificationStatus;
  blockHash?: string;
  blockHeight?: number;
  gasBurnt?: number;
  tokensBurnt?: string;
  error?: string;
  isTerminal: boolean;
}

export async function verifyNearTransaction(
  txHash: string,
  senderAccountId: string,
  options?: { timeoutMs?: number; rpcUrl?: string }
): Promise<NearTxStatus> {
  const rpcUrl = options?.rpcUrl || TESTNET_RPC_URL;
  const timeoutMs = options?.timeoutMs || 8000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `tx-check-${Date.now()}`,
        method: "tx",
        params: [txHash, senderAccountId],
      }),
    });
    clearTimeout(timer);

    const data = await res.json();
    if (data.error) {
      const errName = data.error.cause?.name || data.error.name || "";
      const errData = String(data.error.data || "");
      const errCauseInfo = data.error.cause?.info?.cause || "";

      // In NEAR RPC, UNKNOWN_TRANSACTION, TIMEOUT_ERROR, or NOT_OBSERVED means
      // the transaction is still propagating in the mempool or awaiting block inclusion.
      // Attempt archival query fallback if transaction might be in an older block
      try {
        const archRes = await fetch(ARCHIVAL_RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(6000),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: `arch-${Date.now()}`,
            method: "EXPERIMENTAL_tx_status",
            params: [txHash, senderAccountId],
          }),
        });
        const archData = await archRes.json();
        if (archData.result?.status?.SuccessValue !== undefined) {
          const outcome = archData.result?.transaction_outcome?.outcome;
          return {
            status: "SUCCESS",
            blockHash: archData.result.transaction_outcome?.block_hash,
            gasBurnt: outcome?.gas_burnt,
            tokensBurnt: outcome?.tokens_burnt || "0",
            isTerminal: true,
          };
        }
      } catch {}

      if (
        errName === "TIMEOUT_ERROR" ||
        errName === "UNKNOWN_TRANSACTION" ||
        errCauseInfo === "NOT_OBSERVED" ||
        errData.toLowerCase().includes("timeout") ||
        errData.toLowerCase().includes("doesn't exist")
      ) {
        return {
          status: "PENDING",
          error: "Transaction in flight or awaiting block inclusion on NEAR network",
          isTerminal: false,
        };
      }

      return {
        status: "FAILED",
        error: data.error.message || "Tx query failed",
        isTerminal: true,
      };
    }

    const outcome = data.result?.transaction_outcome?.outcome;
    const executionStatus = data.result?.status;

    if (executionStatus?.SuccessValue !== undefined) {
      return {
        status: "SUCCESS",
        blockHash: data.result.transaction_outcome?.block_hash,
        gasBurnt: outcome?.gas_burnt,
        tokensBurnt: outcome?.tokens_burnt || "0",
        isTerminal: true,
      };
    }

    if (executionStatus?.Failure) {
      return {
        status: "FAILED",
        error: JSON.stringify(executionStatus.Failure),
        isTerminal: true,
      };
    }

    return { status: "PENDING", isTerminal: false };
  } catch (err: any) {
    if (err.name === "AbortError" || err.message?.includes("aborted")) {
      return {
        status: "TIMEOUT",
        error: "NEAR RPC query timed out; outcome remains unresolved",
        isTerminal: false,
      };
    }
    return {
      status: "NETWORK_ERROR",
      error: `Network error contacting NEAR RPC: ${err.message}`,
      isTerminal: false,
    };
  }
}

