/**
 * OutLayer TEE Client
 * Interacts with OutLayer Testnet/Mainnet API for wallet registration,
 * status check, and onchain NEAR settlement.
 */

import {
  BoundaryExecutionTicket,
  validateBoundaryExecutionTicket,
} from "./execution/boundaryTicket";
import {
  ContractCallExecutionTicket,
  validateContractCallExecutionTicket,
} from "./execution/contractCallTicket";

const OUTLAYER_BASE_URL =
  process.env.OUTLAYER_API_BASE_URL || "https://testnet-api.outlayer.ai";

export interface OutlayerRegisterResponse {
  wallet_id: string;
  api_key: string;
  near_account_id: string;
  handoff_url: string;
  trial?: {
    available: boolean;
    calls: number;
    days: number;
  };
}

export interface OutlayerTransferParams {
  apiKey: string;
  to: string;
  amountYocto: string;
  idempotencyKey?: string;
  ticket?: BoundaryExecutionTicket; // Milestone 13.10: Unforgeable cryptographic capability ticket
  chain?: string;
  authorizedBoundaryContext?: never; // Explicitly deprecated & forbidden
}

export interface OutlayerTransferResponse {
  status: "success" | "processing" | "failed";
  tx_hash?: string;
  request_id?: string;
  error?: string;
  message?: string;
}

export async function registerOutlayerWallet(): Promise<OutlayerRegisterResponse> {
  const res = await fetch(`${OUTLAYER_BASE_URL}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OutLayer registration failed (${res.status}): ${errorText}`);
  }

  return (await res.json()) as OutlayerRegisterResponse;
}

export async function getOutlayerWalletPolicy(apiKey: string) {
  const res = await fetch(`${OUTLAYER_BASE_URL}/wallet/v1/policy`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OutLayer policy readback failed: ${errorText}`);
  }

  return await res.json();
}

export async function getOutlayerWalletBalance(apiKey: string, chain = "near") {
  const res = await fetch(`${OUTLAYER_BASE_URL}/wallet/v1/balance?chain=${chain}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OutLayer balance check failed: ${errorText}`);
  }

  return await res.json();
}

export async function executeOutlayerTransfer(
  params: OutlayerTransferParams
): Promise<OutlayerTransferResponse> {
  // Milestone 13.10: Unforgeable execution boundary validation
  // Direct adapter calls or manufactured contexts are strictly rejected
  const validation = validateBoundaryExecutionTicket(params.ticket, {
    to: params.to,
    amountYocto: params.amountYocto,
    idempotencyKey: params.idempotencyKey,
    chain: params.chain,
  });

  if (!validation.valid) {
    throw new Error(
      `UNAUTHORIZED_EXECUTION_BOUNDARY_BYPASS: Direct calls to executeOutlayerTransfer are prohibited. ${validation.reason || "Missing or invalid unforgeable BoundaryExecutionTicket."}`
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.apiKey}`,
  };

  if (params.idempotencyKey) {
    headers["X-Idempotency-Key"] = params.idempotencyKey;
  }

  const res = await fetch(`${OUTLAYER_BASE_URL}/wallet/v1/transfer`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      to: params.to,
      amount: params.amountYocto,
      chain: "near",
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    return {
      status: "failed",
      error: data.error || `HTTP ${res.status}`,
      message: data.message || "Transfer refused",
      request_id: data.request_id,
    };
  }

  return {
    status: data.status || "success",
    tx_hash: data.tx_hash || data.result?.tx_hash,
    request_id: data.request_id,
  };
}

export interface OutlayerContractCallParams {
  apiKey: string;
  receiver_id: string;
  method_name: string;
  args: Record<string, any>;
  deposit: string;
  gas?: string;
  idempotencyKey?: string;
  ticket?: ContractCallExecutionTicket;
  chain?: string;
  mandateWalletAccountId?: string;
  authorizedBoundaryContext?: never;
}

export interface OutlayerContractCallResponse {
  status: "success" | "processing" | "failed";
  tx_hash?: string;
  request_id?: string;
  error?: string;
  message?: string;
  result?: any;
}

export async function executeOutlayerContractCall(
  params: OutlayerContractCallParams
): Promise<OutlayerContractCallResponse> {
  // Milestone 15.3a / 15.3a.1: Unforgeable contract-call execution boundary validation
  // Direct adapter calls without sealed ContractCallExecutionTicket are strictly rejected
  const validation = validateContractCallExecutionTicket(params.ticket, {
    receiverId: params.receiver_id,
    methodName: params.method_name,
    args: params.args,
    depositYocto: params.deposit,
    gasLimit: params.gas,
    idempotencyKey: params.idempotencyKey,
    chain: params.chain,
    mandateWalletAccountId: params.mandateWalletAccountId,
  });

  if (!validation.valid) {
    throw new Error(
      `UNAUTHORIZED_EXECUTION_BOUNDARY_BYPASS: Direct calls to executeOutlayerContractCall are prohibited. ${validation.reason || "Missing or invalid unforgeable ContractCallExecutionTicket."}`
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.apiKey}`,
  };

  if (params.idempotencyKey) {
    headers["X-Idempotency-Key"] = params.idempotencyKey;
  }

  const res = await fetch(`${OUTLAYER_BASE_URL}/wallet/v1/call`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      receiver_id: params.receiver_id,
      method_name: params.method_name,
      args: params.args,
      gas: params.gas || "30000000000000",
      deposit: params.deposit,
    }),
  });

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    // Non-JSON response
    data = { error: `HTTP ${res.status}: Failed to parse JSON response` };
  }

  // Handle on-chain execution failures (OutLayer HTTP 422 preserves tx_hash!)
  if (res.status === 422 || data.error === "onchain_tx_failed") {
    return {
      status: "failed",
      error: data.error || "onchain_tx_failed",
      message: data.message || "Smart contract execution reverted or panicked on-chain",
      tx_hash: data.tx_hash || data.result?.tx_hash,
      request_id: data.request_id,
      result: data.result,
    };
  }

  if (!res.ok || data.error) {
    return {
      status: "failed",
      error: data.error || `HTTP ${res.status}`,
      message: data.message || "Contract call refused",
      tx_hash: data.tx_hash || data.result?.tx_hash,
      request_id: data.request_id,
      result: data.result,
    };
  }

  return {
    status: data.status || "success",
    tx_hash: data.tx_hash || data.result?.tx_hash,
    request_id: data.request_id,
    result: data.result,
  };
}

