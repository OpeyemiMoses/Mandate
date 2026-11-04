import { z } from "zod";
import { ToolDefinition } from "../types";
import { getNearAccountState, verifyNearTransaction } from "@/lib/nearRpc";
import { yoctoToNear } from "@/lib/yocto";
import { internalAdapter } from "../adapters/internalAdapter";

export const ViewAccountSchema = z.object({
  accountId: z.string().min(2, "NEAR Account ID is required"),
});

export const ViewAccountOutputSchema = z.object({
  accountId: z.string(),
  exists: z.boolean(),
  amountYocto: z.string().optional(),
  amountNear: z.string().optional(),
  blockHeight: z.number().optional(),
  blockHash: z.string().optional(),
  storageUsage: z.number().optional(),
});

export const GetBalanceSchema = z.object({
  accountId: z.string().min(2, "NEAR Account ID is required"),
});

export const GetBalanceOutputSchema = z.object({
  accountId: z.string(),
  amountYocto: z.string(),
  amountNear: z.string(),
  balanceYocto: z.string().optional(),
  balanceNear: z.string().optional(),
  exists: z.boolean(),
});

export const VerifyTransactionSchema = z.object({
  txHash: z.string().min(5, "Transaction Hash is required"),
  senderAccountId: z.string().min(2, "Sender Account ID is required"),
});

export const VerifyTransactionOutputSchema = z.object({
  txHash: z.string(),
  senderAccountId: z.string(),
  status: z.string(),
  blockHash: z.string().optional(),
  tokensBurnt: z.string().optional(),
  isTerminal: z.boolean(),
  error: z.string().optional(),
});

export const nearRpcTool: ToolDefinition = {
  id: "near_rpc_reader",
  name: "NEAR Blockchain RPC Reader",
  description:
    "Direct, read-only queries against NEAR Protocol testnet RPC for account balances, on-chain states, and transaction finality.",
  category: "BLOCKCHAIN",
  version: "1.0.0",
  executionType: "INTERNAL",
  authenticationRequirements: "NONE",
  timeoutMs: 10000,
  retryPolicy: {
    maxRetries: 3,
    backoffMs: 1000,
    retryableErrors: ["NETWORK_ERROR", "TIMEOUT_ERROR"],
  },
  rateLimits: {
    maxRequestsPerMinute: 60,
    maxConcurrent: 10,
  },
  availabilityStatus: "ACTIVE",
  supportedAgentTypes: ["*"],
  ownerOrProvider: "near_rpc",
  metadata: {
    network: "testnet",
    rpcEndpoint: "https://rpc.testnet.near.org",
  },
  operations: {
    view_account: {
      id: "view_account",
      name: "View Account State",
      description: "Queries account state, balance, block height, and storage usage on NEAR testnet.",
      inputSchema: ViewAccountSchema,
      outputSchema: ViewAccountOutputSchema,
      requiredPermission: "READ",
      riskClassification: "LOW",
      idempotent: true,
    },
    get_balance: {
      id: "get_balance",
      name: "Get Account Balance",
      description: "Retrieves the spendable yoctoNEAR and NEAR balance of any NEAR testnet address.",
      inputSchema: GetBalanceSchema,
      outputSchema: GetBalanceOutputSchema,
      requiredPermission: "READ",
      riskClassification: "LOW",
      idempotent: true,
    },
    verify_transaction: {
      id: "verify_transaction",
      name: "Verify Transaction Status",
      description: "Checks on-chain execution status, receipts, and block inclusion for a NEAR transaction hash.",
      inputSchema: VerifyTransactionSchema,
      outputSchema: VerifyTransactionOutputSchema,
      requiredPermission: "READ",
      riskClassification: "LOW",
      idempotent: true,
    },
  },
};

// Register internal handlers
export function registerNearRpcHandlers(): void {
  internalAdapter.registerHandler(
    "near_rpc_reader",
    "view_account",
    async (params: any) => {
      const { accountId } = ViewAccountSchema.parse(params);
      const state = await getNearAccountState(accountId);
      if (!state) {
        return {
          accountId,
          exists: false,
        };
      }
      return {
        accountId,
        exists: true,
        amountYocto: state.amountYocto,
        amountNear: yoctoToNear(state.amountYocto),
        blockHeight: state.blockHeight,
        blockHash: state.blockHash,
        storageUsage: state.storageUsage,
      };
    }
  );

  internalAdapter.registerHandler(
    "near_rpc_reader",
    "get_balance",
    async (params: any) => {
      const { accountId } = GetBalanceSchema.parse(params);
      const state = await getNearAccountState(accountId);
      if (!state) {
        return {
          accountId,
          amountYocto: "0",
          amountNear: "0.000",
          balanceYocto: "0",
          balanceNear: "0.000",
          exists: false,
        };
      }
      const nearVal = yoctoToNear(state.amountYocto);
      return {
        accountId,
        amountYocto: state.amountYocto,
        amountNear: nearVal,
        balanceYocto: state.amountYocto,
        balanceNear: nearVal,
        exists: true,
      };
    }
  );

  internalAdapter.registerHandler(
    "near_rpc_reader",
    "verify_transaction",
    async (params: any) => {
      const { txHash, senderAccountId } = VerifyTransactionSchema.parse(params);
      const txStatus = await verifyNearTransaction(txHash, senderAccountId);
      return {
        txHash,
        senderAccountId,
        status: txStatus.status,
        blockHash: txStatus.blockHash,
        tokensBurnt: txStatus.tokensBurnt,
        isTerminal: txStatus.isTerminal,
        error: txStatus.error,
      };
    }
  );
}
