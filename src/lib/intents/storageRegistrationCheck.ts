/**
 * MANDATE — NEP-145 Storage Registration Prerequisite Verification
 * Milestone 15.3b: Provider Integration & Two-Phase Execution Pipeline
 *
 * Checks storage balance on wnear.tidepool-sandbox.testnet via read-only NEAR RPC query:
 * - Custody Wallet Storage: Must be registered before wrapping / transferring wNEAR.
 * - Ephemeral Deposit Address Storage: Evaluated and reported without executing writes.
 *
 * Strict Invariant: Does NOT execute live storage_deposit or mutate blockchain state.
 */

import { StorageBalanceResult } from "./types";

const TESTNET_RPC_URL = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const WNEAR_CONTRACT = "wnear.tidepool-sandbox.testnet";

export class StorageRegistrationService {
  /**
   * Queries NEP-145 storage_balance_of for a given account on wnear.tidepool-sandbox.testnet
   * using read-only JSON-RPC query.
   */
  public static async checkWnearStorageBalance(
    accountId: string,
    rpcUrl: string = TESTNET_RPC_URL
  ): Promise<StorageBalanceResult> {
    const cleanId = accountId.trim().toLowerCase();
    const argsBase64 = Buffer.from(JSON.stringify({ account_id: cleanId })).toString("base64");

    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `storage-check-${Date.now()}`,
          method: "query",
          params: {
            request_type: "call_function",
            finality: "final",
            account_id: WNEAR_CONTRACT,
            method_name: "storage_balance_of",
            args_base64: argsBase64,
          },
        }),
      });

      const json = await res.json();

      if (json.error) {
        return {
          isRegistered: false,
          totalYocto: "0",
          availableYocto: "0",
        };
      }

      const rawBytes = json.result?.result;
      if (!rawBytes || !Array.isArray(rawBytes)) {
        return {
          isRegistered: false,
          totalYocto: "0",
          availableYocto: "0",
        };
      }

      const decoded = Buffer.from(rawBytes).toString("utf8");
      if (!decoded || decoded === "null") {
        return {
          isRegistered: false,
          totalYocto: "0",
          availableYocto: "0",
        };
      }

      const parsed = JSON.parse(decoded);
      return {
        isRegistered: true,
        totalYocto: parsed.total || "0",
        availableYocto: parsed.available || "0",
      };
    } catch (err: any) {
      console.warn(`Storage balance query failed for ${accountId}:`, err.message);
      return {
        isRegistered: false,
        totalYocto: "0",
        availableYocto: "0",
      };
    }
  }

  /**
   * Verifies that the mandate custody wallet is registered for storage.
   * Throws deterministic fail-closed error if unregistered.
   */
  public static async assertCustodyWalletRegistered(
    walletAccountId: string,
    rpcUrl: string = TESTNET_RPC_URL
  ): Promise<void> {
    const status = await this.checkWnearStorageBalance(walletAccountId, rpcUrl);
    if (!status.isRegistered) {
      throw new Error(
        `STORAGE_REGISTRATION_REQUIRED: Mandate custody wallet "${walletAccountId}" has not registered NEP-145 storage on "${WNEAR_CONTRACT}". Please complete dedicated storage provisioning before initiating Intents swaps.`
      );
    }
  }
}

