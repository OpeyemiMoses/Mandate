/**
 * MANDATE — NEAR Intents Type Definitions & Contracts
 * Milestone 15.3b: Provider Integration & Two-Phase Execution Pipeline
 *
 * Adheres strictly to the authoritative Tidepool OpenAPI v0.1.10 specification
 * and Mandate institutional financial governance rules.
 */

import { QuoteAuthorizationBinding } from "@/lib/execution/contractCallTicket";

// =============================================================================
// PROVIDER ASSET & REGISTRY SCHEMAS
// =============================================================================

export interface TidepoolToken {
  assetId: string; // e.g. "nep141:wnear.tidepool-sandbox.testnet"
  decimals: number; // e.g. 24
  blockchain: string; // e.g. "near", "base", "arb", "eth", "sol"
  symbol: string; // e.g. "wNEAR"
  price?: number;
  priceUpdatedAt?: string;
  contractAddress?: string;
  coingeckoId?: string;
}

export interface TokenRegistryCache {
  tokens: TidepoolToken[];
  fetchedAt: number;
  expiresAt: number;
}

// =============================================================================
// PROVIDER QUOTE REQUEST & RESPONSE SCHEMAS
// =============================================================================

export type SwapType = "EXACT_INPUT" | "EXACT_OUTPUT" | "FLEX_INPUT" | "ANY_INPUT";
export type DepositType = "ORIGIN_CHAIN" | "INTENTS" | "CONFIDENTIAL_INTENTS";
export type DepositMode = "SIMPLE" | "MEMO";
export type RecipientType = "DESTINATION_CHAIN" | "INTENTS";

export interface TidepoolQuoteRequest {
  dry?: boolean;
  swapType: SwapType;
  slippageTolerance: number; // in basis points (e.g. 100 = 1%)
  originAsset: string;
  depositType: DepositType;
  destinationAsset: string;
  amount: string; // integer atomic units string
  refundTo: string;
  refundType: DepositType;
  recipient: string;
  recipientType: RecipientType;
  deadline: string; // ISO 8601 date string
  depositMode?: DepositMode;
  referral?: string;
  quoteWaitingTimeMs?: number;
}

export interface TidepoolQuoteDetails {
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  minAmountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountOut: string;
  deadline?: string;
  timeWhenInactive?: string;
  timeEstimate: number;
  refundFee?: string;
  withdrawFee?: string;
}

export interface TidepoolQuoteResponse {
  correlationId: string;
  timestamp: string;
  signature: string; // ed25519:...
  quoteRequest: TidepoolQuoteRequest;
  quote: TidepoolQuoteDetails;
}

// =============================================================================
// DEPOSIT SUBMISSION & EXECUTION STATUS SCHEMAS
// =============================================================================

export interface TidepoolSubmitDepositRequest {
  txHash: string;
  depositAddress: string;
  depositMemo?: string;
}

export interface TidepoolSubmitDepositResponse {
  success: boolean;
  message?: string;
}

export type TidepoolSwapStatus =
  | "KNOWN_DEPOSIT_TX"
  | "PENDING_DEPOSIT"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export interface TidepoolTransactionDetails {
  hash: string;
  explorerUrl?: string;
}

export interface TidepoolSwapDetails {
  intentHashes: string[];
  nearTxHashes: string[];
  originChainTxHashes: TidepoolTransactionDetails[];
  destinationChainTxHashes: TidepoolTransactionDetails[];
  amountIn?: string;
  amountInFormatted?: string;
  amountInUsd?: string;
  amountOut?: string;
  amountOutFormatted?: string;
  amountOutUsd?: string;
  slippage?: number;
  refundedAmount?: string;
  refundedAmountFormatted?: string;
  refundedAmountUsd?: string;
  refundReason?: string;
  depositedAmount?: string;
  depositedAmountFormatted?: string;
  depositedAmountUsd?: string;
  withdrawFee?: string;
  referral?: string;
}

export interface TidepoolExecutionStatusResponse {
  correlationId: string;
  quoteResponse: TidepoolQuoteResponse;
  status: TidepoolSwapStatus;
  updatedAt: string;
  swapDetails: TidepoolSwapDetails;
}

// =============================================================================
// MANDATE INTENT LIFECYCLE STATE MACHINE (20 STATES)
// =============================================================================

export type IntentLifecycleState =
  | "PROPOSED"
  | "QUOTE_PENDING"
  | "QUOTE_VERIFIED"
  | "AWAITING_APPROVAL"
  | "AUTHORIZED"
  | "BUDGET_RESERVED"
  | "WRAP_PENDING"
  | "WRAP_BROADCAST"
  | "WRAP_CONFIRMED"
  | "DEPOSIT_PENDING"
  | "DEPOSIT_BROADCAST"
  | "DEPOSIT_CONFIRMED"
  | "PROCESSING"
  | "SETTLEMENT_PENDING"
  | "SETTLED"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "REQUIRES_RECOVERY"
  | "FAILED"
  | "EXPIRED";

// =============================================================================
// EXECUTION & AUTHORIZATION TYPES
// =============================================================================

export interface IntentProposalParams {
  userId: string;
  mandateId: string;
  objectiveId?: string;
  sourceAsset: string;
  destinationAsset: string;
  amountYocto: string; // wNEAR atomic units
  destinationRecipient: string; // final beneficiary
  slippageToleranceBps?: number; // default 100 (1%)
  deadlineMinutes?: number; // default 30 min
  idempotencyKey: string;
}

export interface IntentAuthorizationResult {
  valid: boolean;
  intentId: string;
  quoteBinding?: QuoteAuthorizationBinding;
  reason?: string;
}

export interface StorageBalanceResult {
  isRegistered: boolean;
  totalYocto: string;
  availableYocto: string;
}

