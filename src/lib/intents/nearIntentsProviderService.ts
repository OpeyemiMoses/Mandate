/**
 * MANDATE — Tidepool Testnet Sandbox Provider Client & Dynamic Token Registry
 * Milestone 15.3b: Provider Integration & Two-Phase Execution Pipeline
 *
 * Implements a typed, validated client for Tidepool's 1Click-compatible Testnet Sandbox API:
 * - Dynamic Token Registry: GET /v0/tokens (Cached with strict freshness rules)
 * - Swap Quote Request: POST /v0/quote (ORIGIN_CHAIN single-use deposit address)
 * - Deposit Notification: POST /v0/deposit/submit
 * - Execution Status Tracking: GET /v0/status
 *
 * Fail-Closed Guardrails:
 * - Executable source asset strictly restricted to wNEAR (nep141:wnear.tidepool-sandbox.testnet)
 * - Integrated circuit breaker protection via ProviderResilienceService
 */

import { ProviderResilienceService } from "@/lib/resilience/providerResilienceService";
import {
  TidepoolToken,
  TokenRegistryCache,
  TidepoolQuoteRequest,
  TidepoolQuoteResponse,
  TidepoolSubmitDepositRequest,
  TidepoolSubmitDepositResponse,
  TidepoolExecutionStatusResponse,
} from "./types";

export const DEFAULT_TIDEPOOL_BASE_URL = "https://tidepool.fastnear.com";
export const FALLBACK_TIDEPOOL_BASE_URL = "https://www.usetidepool.tech";
export const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache TTL
export const APPROVED_SOURCE_ASSET = "nep141:wnear.tidepool-sandbox.testnet";

export class NearIntentsProviderService {
  private static registryCache: TokenRegistryCache | null = null;

  public static getBaseUrl(): string {
    return process.env.TIDEPOOL_API_BASE_URL || DEFAULT_TIDEPOOL_BASE_URL;
  }

  /**
   * Helper to execute resilient fetch against Tidepool with circuit breaking and fallback.
   */
  private static async resilientFetch(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const primaryBase = this.getBaseUrl();
    const fallbackBase = FALLBACK_TIDEPOOL_BASE_URL;

    return ProviderResilienceService.executeWithBreaker("tidepool_sandbox", async () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };

      if (process.env.TIDEPOOL_API_KEY) {
        headers["X-API-Key"] = process.env.TIDEPOOL_API_KEY;
      }

      const urlsToTry = [
        `${primaryBase}${endpoint}`,
        ...(primaryBase !== fallbackBase ? [`${fallbackBase}${endpoint}`] : []),
      ];

      let lastError: any = null;

      for (const url of urlsToTry) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 12000);

          const res = await fetch(url, {
            ...options,
            headers,
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (res.ok) {
            return res;
          }

          // If HTTP 400 Bad Request, return response for client error parsing without tripping circuit
          if (res.status === 400 || res.status === 404 || res.status === 422) {
            return res;
          }

          lastError = new Error(`HTTP ${res.status}: ${res.statusText}`);
        } catch (err: any) {
          lastError = err;
        }
      }

      throw new Error(`TIDEPOOL_PROVIDER_UNAVAILABLE: Failed to reach Tidepool API: ${lastError?.message}`);
    });
  }

  /**
   * Dynamically retrieves and caches the supported token registry from Tidepool /v0/tokens.
   */
  public static async getSupportedTokens(forceRefresh: boolean = false): Promise<TidepoolToken[]> {
    const now = Date.now();

    if (!forceRefresh && this.registryCache && now < this.registryCache.expiresAt) {
      return this.registryCache.tokens;
    }

    try {
      const res = await this.resilientFetch("/v0/tokens", { method: "GET" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} retrieving tokens`);
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error("MALFORMED_TOKEN_REGISTRY: Expected array of tokens from /v0/tokens");
      }

      // Validate each token entry
      const validatedTokens: TidepoolToken[] = [];
      for (const item of data) {
        if (
          !item.assetId ||
          typeof item.assetId !== "string" ||
          typeof item.decimals !== "number" ||
          item.decimals < 0 ||
          !item.symbol ||
          !item.blockchain
        ) {
          continue; // skip invalid or malformed tokens
        }

        validatedTokens.push({
          assetId: item.assetId.trim(),
          decimals: item.decimals,
          blockchain: item.blockchain.trim().toLowerCase(),
          symbol: item.symbol.trim(),
          price: typeof item.price === "number" ? item.price : undefined,
          priceUpdatedAt: item.priceUpdatedAt,
          contractAddress: item.contractAddress,
          coingeckoId: item.coingeckoId,
        });
      }

      // Verify that approved source asset wNEAR is present in the registry
      const hasWnear = validatedTokens.some((t) => t.assetId.toLowerCase() === APPROVED_SOURCE_ASSET.toLowerCase());
      if (!hasWnear) {
        throw new Error(
          `REGISTRY_MISSING_SOURCE_ASSET: Required source asset "${APPROVED_SOURCE_ASSET}" was not found in active Tidepool token registry.`
        );
      }

      this.registryCache = {
        tokens: validatedTokens,
        fetchedAt: now,
        expiresAt: now + TOKEN_CACHE_TTL_MS,
      };

      return validatedTokens;
    } catch (err: any) {
      // If cached copy exists and not forcing refresh, we may serve stale cache during network degradation
      if (this.registryCache) {
        return this.registryCache.tokens;
      }
      throw new Error(`FAIL_CLOSED_REGISTRY_ERROR: Cannot initialize supported token registry: ${err.message}`);
    }
  }

  /**
   * Finds a validated token by assetId in the registry.
   */
  public static async findToken(assetId: string): Promise<TidepoolToken | null> {
    const tokens = await this.getSupportedTokens();
    const normalized = assetId.trim().toLowerCase();
    return tokens.find((t) => t.assetId.toLowerCase() === normalized) || null;
  }

  /**
   * Requests a swap quote from Tidepool /v0/quote.
   * Strictly enforces ORIGIN_CHAIN deposit mode and wNEAR source asset.
   */
  public static async requestQuote(request: TidepoolQuoteRequest): Promise<TidepoolQuoteResponse> {
    // 1. Enforce Source Asset Restriction (wNEAR ONLY in M15.3b)
    if (request.originAsset.toLowerCase() !== APPROVED_SOURCE_ASSET.toLowerCase()) {
      throw new Error(
        `UNSUPPORTED_SOURCE_ASSET: M15.3b strictly restricts source asset to "${APPROVED_SOURCE_ASSET}". Received "${request.originAsset}".`
      );
    }

    // 2. Enforce ORIGIN_CHAIN Deposit Mode
    if (request.depositType !== "ORIGIN_CHAIN") {
      throw new Error(
        `UNSUPPORTED_DEPOSIT_TYPE: M15.3b requires depositType "ORIGIN_CHAIN". Received "${request.depositType}".`
      );
    }

    // 3. Validate Destination Asset in Registry
    const destToken = await this.findToken(request.destinationAsset);
    if (!destToken) {
      throw new Error(
        `UNSUPPORTED_DESTINATION_ASSET: Destination asset "${request.destinationAsset}" is not found in the supported token registry.`
      );
    }

    // 4. Validate Amount Format (strictly positive integer string)
    if (!request.amount || !/^[1-9]\d*$/.test(request.amount)) {
      throw new Error(`INVALID_SWAP_AMOUNT: Quote amount must be a positive integer atomic string. Received "${request.amount}".`);
    }

    // 5. Validate Slippage Bounds (1 to 2000 bps, i.e. 0.01% to 20%)
    if (request.slippageTolerance < 1 || request.slippageTolerance > 2000) {
      throw new Error(
        `INVALID_SLIPPAGE_TOLERANCE: Slippage tolerance must be between 1 and 2000 basis points. Received ${request.slippageTolerance}.`
      );
    }

    const payload = {
      dry: request.dry ?? false,
      swapType: request.swapType || "EXACT_INPUT",
      slippageTolerance: request.slippageTolerance,
      originAsset: request.originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: request.destinationAsset,
      amount: request.amount,
      refundTo: request.refundTo,
      refundType: request.refundType || "ORIGIN_CHAIN",
      recipient: request.recipient,
      recipientType: request.recipientType || "DESTINATION_CHAIN",
      deadline: request.deadline,
      depositMode: request.depositMode || "SIMPLE",
      referral: request.referral,
      quoteWaitingTimeMs: request.quoteWaitingTimeMs || 0,
    };

    const res = await this.resilientFetch("/v0/quote", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const data: any = await res.json();

    if (!res.ok) {
      throw new Error(
        `TIDEPOOL_QUOTE_REJECTED: HTTP ${res.status} - ${data.message || data.error || JSON.stringify(data)}`
      );
    }

    // Strict Response Schema Validation
    if (!data.correlationId || !data.signature || !data.quote) {
      throw new Error("MALFORMED_QUOTE_RESPONSE: Tidepool quote response is missing correlationId, signature, or quote details.");
    }

    if (!data.quote.amountIn || !data.quote.amountOut || !data.quote.minAmountOut) {
      throw new Error("MALFORMED_QUOTE_RESPONSE: Tidepool quote details are missing amountIn, amountOut, or minAmountOut.");
    }

    if (!payload.dry && !data.quote.depositAddress) {
      throw new Error("MALFORMED_QUOTE_RESPONSE: Live Tidepool quote response missing depositAddress.");
    }

    return data as TidepoolQuoteResponse;
  }

  /**
   * Submits a transaction hash to Tidepool /v0/deposit/submit to notify the service of deposit broadcast.
   */
  public static async submitDeposit(
    params: TidepoolSubmitDepositRequest
  ): Promise<TidepoolSubmitDepositResponse> {
    if (!params.txHash || !params.depositAddress) {
      throw new Error("INVALID_DEPOSIT_SUBMISSION: Both txHash and depositAddress are required.");
    }

    const res = await this.resilientFetch("/v0/deposit/submit", {
      method: "POST",
      body: JSON.stringify({
        txHash: params.txHash,
        depositAddress: params.depositAddress,
        depositMemo: params.depositMemo,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        message: err.message || `HTTP ${res.status}`,
      };
    }

    return { success: true };
  }

  /**
   * Queries the swap execution status from Tidepool GET /v0/status.
   */
  public static async getExecutionStatus(
    depositAddress: string,
    depositMemo?: string
  ): Promise<TidepoolExecutionStatusResponse> {
    if (!depositAddress) {
      throw new Error("INVALID_STATUS_QUERY: depositAddress is required to query execution status.");
    }

    const queryParams = new URLSearchParams({ depositAddress });
    if (depositMemo) {
      queryParams.set("depositMemo", depositMemo);
    }

    const res = await this.resilientFetch(`/v0/status?${queryParams.toString()}`, {
      method: "GET",
    });

    const data: any = await res.json();

    if (!res.ok) {
      throw new Error(
        `TIDEPOOL_STATUS_QUERY_FAILED: HTTP ${res.status} - ${data.message || data.error || JSON.stringify(data)}`
      );
    }

    if (!data.status || !data.correlationId) {
      throw new Error("MALFORMED_STATUS_RESPONSE: Tidepool status response missing status or correlationId.");
    }

    return data as TidepoolExecutionStatusResponse;
  }

  /**
   * Reset in-memory cache for deterministic testing.
   */
  public static clearCache(): void {
    this.registryCache = null;
  }
}
