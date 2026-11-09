/**
 * MANDATE — Smart Contract Call Allowlisting & Schema Validation Service
 * Milestone 15.3a.1: Contract-Call Authorization Hardening & Security Verification
 *
 * Enforces strict allowlisting and quote-bound authorization for OutLayer smart contract calls:
 * - Approved Contract: wnear.tidepool-sandbox.testnet
 * - Allowed Methods: near_deposit, ft_transfer, storage_deposit
 *
 * Core Invariant: "AI proposes. Mandate enforces. The user controls. OutLayer executes."
 * - ft_transfer: Strictly quote-bound. Arbitrary valid NEAR accounts are prohibited.
 * - storage_deposit: Dedicated provisioning context only. Target restricted to mandate wallet.
 * - near_deposit: Strict argument isolation and positive deposit.
 */

import { isValidNearAccountId } from "./validationService";
import { QuoteAuthorizationBinding, StorageProvisioningBinding } from "./contractCallTicket";

// Approved contract allowlist for M15.3a / M15.3a.1
export const APPROVED_CONTRACT_ALLOWLIST = Object.freeze([
  "wnear.tidepool-sandbox.testnet",
]);

// Configured gas bounds for contract calls (10 TGas to 300 TGas)
export const MIN_CONTRACT_CALL_GAS = "10000000000000"; // 10 TGas
export const MAX_CONTRACT_CALL_GAS = "300000000000000"; // 300 TGas
export const DEFAULT_CONTRACT_CALL_GAS = "30000000000000"; // 30 TGas

// NEP-145 storage deposit bounds for wnear (min 0.00125 NEAR, max 0.05 NEAR)
export const MIN_STORAGE_DEPOSIT_YOCTO = "1250000000000000000000"; // 0.00125 NEAR
export const MAX_STORAGE_DEPOSIT_YOCTO = "50000000000000000000000"; // 0.05 NEAR

export interface ContractCallValidationRequest {
  receiverId: string;
  methodName: string;
  args: Record<string, any>;
  depositYocto: string;
  gasLimit?: string;
  network?: string;
  quoteBinding?: QuoteAuthorizationBinding | null;
  storageProvisioning?: StorageProvisioningBinding | null;
  mandateWalletAccountId?: string;
}

export interface ContractCallValidationResult {
  valid: boolean;
  error?: string;
  normalizedReceiverId?: string;
  normalizedMethodName?: string;
  normalizedGas?: string;
  normalizedDeposit?: string;
}

export class ContractCallValidationService {
  /**
   * Validates that the requested contract call matches an approved contract,
   * an authorized method, and strict method-specific parameter schemas.
   */
  public static validateContractCall(
    request: ContractCallValidationRequest
  ): ContractCallValidationResult {
    const {
      receiverId,
      methodName,
      args,
      depositYocto,
      gasLimit,
      network = "testnet",
      quoteBinding,
      storageProvisioning,
      mandateWalletAccountId,
    } = request;

    // 1. Network check (Testnet-only enforcement)
    if (network.toLowerCase() !== "testnet") {
      return {
        valid: false,
        error: `MAINNET_EXECUTION_PROHIBITED: Contract calls are restricted to NEAR Testnet. Target network "${network}" rejected.`,
      };
    }

    if (!receiverId || typeof receiverId !== "string") {
      return { valid: false, error: "Contract receiverId is required and must be a string." };
    }

    if (!methodName || typeof methodName !== "string") {
      return { valid: false, error: "Contract methodName is required and must be a string." };
    }

    const normalizedReceiverId = receiverId.trim().toLowerCase();
    const normalizedMethodName = methodName.trim();

    // 2. Strict Contract Allowlist Enforcement
    if (!APPROVED_CONTRACT_ALLOWLIST.includes(normalizedReceiverId)) {
      return {
        valid: false,
        error: `UNAPPROVED_CONTRACT_REJECTED: Contract "${normalizedReceiverId}" is not in the approved contract allowlist. Only allowlisted contracts may be called.`,
      };
    }

    // 3. Deposit format validation
    if (typeof depositYocto !== "string" || !/^\d+$/.test(depositYocto)) {
      return {
        valid: false,
        error: `INVALID_DEPOSIT_YOCTO: Attached deposit must be an integer string of yoctoNEAR. Received "${depositYocto}".`,
      };
    }

    // 4. Gas validation
    const normalizedGas = gasLimit ? gasLimit.trim() : DEFAULT_CONTRACT_CALL_GAS;
    if (!/^\d+$/.test(normalizedGas)) {
      return {
        valid: false,
        error: `INVALID_GAS_LIMIT: Gas must be an integer string. Received "${normalizedGas}".`,
      };
    }

    const gasBig = BigInt(normalizedGas);
    if (gasBig < BigInt(MIN_CONTRACT_CALL_GAS) || gasBig > BigInt(MAX_CONTRACT_CALL_GAS)) {
      return {
        valid: false,
        error: `GAS_LIMIT_OUT_OF_BOUNDS: Gas must be between ${MIN_CONTRACT_CALL_GAS} (10 TGas) and ${MAX_CONTRACT_CALL_GAS} (300 TGas). Received "${normalizedGas}".`,
      };
    }

    // 5. Method-Specific Validation
    if (normalizedMethodName === "near_deposit") {
      return this.validateNearDeposit({
        receiverId: normalizedReceiverId,
        args,
        depositYocto,
        normalizedGas,
      });
    }

    if (normalizedMethodName === "ft_transfer") {
      return this.validateFtTransfer({
        receiverId: normalizedReceiverId,
        args,
        depositYocto,
        normalizedGas,
        quoteBinding,
        mandateWalletAccountId,
      });
    }

    if (normalizedMethodName === "storage_deposit") {
      return this.validateStorageDeposit({
        receiverId: normalizedReceiverId,
        args,
        depositYocto,
        normalizedGas,
        storageProvisioning,
        mandateWalletAccountId,
      });
    }

    return {
      valid: false,
      error: `UNAPPROVED_METHOD_REJECTED: Method "${normalizedMethodName}" is not approved for contract "${normalizedReceiverId}". Approved methods: near_deposit, ft_transfer, storage_deposit.`,
    };
  }

  /**
   * Method A: near_deposit
   * Wraps native NEAR into wNEAR on wnear.tidepool-sandbox.testnet.
   * Arguments must be strictly empty {}.
   * Attached deposit must be > 0.
   */
  private static validateNearDeposit(params: {
    receiverId: string;
    args: Record<string, any>;
    depositYocto: string;
    normalizedGas: string;
  }): ContractCallValidationResult {
    const { receiverId, args, depositYocto, normalizedGas } = params;

    if (!args || typeof args !== "object" || Object.keys(args).length > 0) {
      return {
        valid: false,
        error: `INVALID_METHOD_ARGUMENTS: Method "near_deposit" requires strictly empty arguments {}. Received ${JSON.stringify(args)}.`,
      };
    }

    if (depositYocto === "0" || !/^[1-9]\d*$/.test(depositYocto)) {
      return {
        valid: false,
        error: `INVALID_ATTACHED_DEPOSIT: Method "near_deposit" requires a positive attached deposit in yoctoNEAR representing the amount to wrap. Received "${depositYocto}".`,
      };
    }

    return {
      valid: true,
      normalizedReceiverId: receiverId,
      normalizedMethodName: "near_deposit",
      normalizedGas,
      normalizedDeposit: depositYocto,
    };
  }

  /**
   * Method B: ft_transfer
   * Hardened in M15.3a.1:
   * 1. Requires trusted server-side quote authorization binding (no arbitrary valid NEAR accounts).
   * 2. Recipient must match the verified quote's single-use deposit address.
   * 3. Amount must match the verified quote's source amount.
   * 4. Token contract must match the verified quote's source token contract.
   * 5. Quote must not be expired.
   * 6. Refund recipient must match the mandate custody wallet account ID.
   * 7. Attached deposit must be EXACTLY "1" yoctoNEAR (NEP-141 security standard).
   */
  private static validateFtTransfer(params: {
    receiverId: string;
    args: Record<string, any>;
    depositYocto: string;
    normalizedGas: string;
    quoteBinding?: QuoteAuthorizationBinding | null;
    mandateWalletAccountId?: string;
  }): ContractCallValidationResult {
    const { receiverId, args, depositYocto, normalizedGas, quoteBinding, mandateWalletAccountId } = params;

    // 1. Enforce Quote Authorization Binding (M15.3a.1 Core Invariant)
    if (!quoteBinding) {
      return {
        valid: false,
        error: "UNAUTHORIZED_RECIPIENT_BYPASS: ft_transfer requires verified quote authorization binding. Client-selected or arbitrary valid NEAR account IDs are prohibited.",
      };
    }

    if (!args || typeof args !== "object") {
      return {
        valid: false,
        error: 'INVALID_METHOD_ARGUMENTS: Method "ft_transfer" requires arguments object.',
      };
    }

    const { receiver_id, amount, memo, ...unexpectedKeys } = args;

    if (Object.keys(unexpectedKeys).length > 0) {
      return {
        valid: false,
        error: `INVALID_METHOD_ARGUMENTS: Method "ft_transfer" contains unexpected arguments: ${Object.keys(unexpectedKeys).join(", ")}.`,
      };
    }

    if (!receiver_id || typeof receiver_id !== "string") {
      return {
        valid: false,
        error: 'INVALID_RECIPIENT: Method "ft_transfer" requires a valid string "receiver_id".',
      };
    }

    const normalizedTokenRecipient = receiver_id.trim().toLowerCase();
    if (!isValidNearAccountId(normalizedTokenRecipient)) {
      return {
        valid: false,
        error: `INVALID_RECIPIENT: Recipient "${receiver_id}" is not a valid NEAR account ID.`,
      };
    }

    // 2. Validate recipient matches the verified quote single-use deposit address
    const quoteDepositAddress = quoteBinding.depositAddress.trim().toLowerCase();
    if (normalizedTokenRecipient !== quoteDepositAddress) {
      return {
        valid: false,
        error: `QUOTE_DEPOSIT_ADDRESS_MISMATCH: Method "ft_transfer" receiver "${normalizedTokenRecipient}" does not match verified quote deposit address "${quoteDepositAddress}".`,
      };
    }

    // 3. Validate transfer amount
    if (!amount || typeof amount !== "string" || !/^[1-9]\d*$/.test(amount)) {
      return {
        valid: false,
        error: `INVALID_TRANSFER_AMOUNT: Method "ft_transfer" requires positive integer string "amount". Received "${amount}".`,
      };
    }

    if (amount !== quoteBinding.sourceAmount) {
      return {
        valid: false,
        error: `QUOTE_AMOUNT_MISMATCH: Method "ft_transfer" transfer amount "${amount}" does not match verified quote source amount "${quoteBinding.sourceAmount}".`,
      };
    }

    // 4. Validate source token contract matches quote
    if (receiverId.toLowerCase() !== quoteBinding.sourceTokenContract.trim().toLowerCase()) {
      return {
        valid: false,
        error: `QUOTE_CONTRACT_MISMATCH: Contract "${receiverId}" does not match quote source token contract "${quoteBinding.sourceTokenContract}".`,
      };
    }

    // 5. Validate quote expiration
    if (Date.now() > quoteBinding.quoteExpiry) {
      return {
        valid: false,
        error: `EXPIRED_QUOTE: Provider quote expired at ${new Date(quoteBinding.quoteExpiry).toISOString()}.`,
      };
    }

    // 6. Validate refund recipient matches mandate custody wallet
    if (mandateWalletAccountId) {
      const normalizedWallet = mandateWalletAccountId.trim().toLowerCase();
      const normalizedRefund = quoteBinding.refundRecipient.trim().toLowerCase();
      if (normalizedRefund !== normalizedWallet) {
        return {
          valid: false,
          error: `QUOTE_REFUND_RECIPIENT_MISMATCH: Quote refund recipient must equal mandate custody wallet "${normalizedWallet}". Found "${normalizedRefund}".`,
        };
      }
    }

    if (memo !== undefined && typeof memo !== "string") {
      return {
        valid: false,
        error: 'INVALID_MEMO: If provided, "memo" must be a string.',
      };
    }

    // 7. NEP-141 security standard: attached deposit must be exactly 1 yoctoNEAR
    if (depositYocto !== "1") {
      return {
        valid: false,
        error: `INVALID_ATTACHED_DEPOSIT: Method "ft_transfer" strictly requires attached deposit of exactly "1" yoctoNEAR per NEP-141 security standard. Received "${depositYocto}".`,
      };
    }

    return {
      valid: true,
      normalizedReceiverId: receiverId,
      normalizedMethodName: "ft_transfer",
      normalizedGas,
      normalizedDeposit: "1",
    };
  }

  /**
   * Method C: storage_deposit
   * Hardened in M15.3a.1:
   * 1. Requires dedicated storage provisioning authorization context.
   * 2. Cannot be called arbitrarily as an open method.
   * 3. Target account restricted to caller's custody wallet or authorized target.
   * 4. Attached deposit bounded between 0.00125 NEAR and 0.05 NEAR and cannot exceed cap.
   */
  private static validateStorageDeposit(params: {
    receiverId: string;
    args: Record<string, any>;
    depositYocto: string;
    normalizedGas: string;
    storageProvisioning?: StorageProvisioningBinding | null;
    mandateWalletAccountId?: string;
  }): ContractCallValidationResult {
    const { receiverId, args, depositYocto, normalizedGas, storageProvisioning, mandateWalletAccountId } = params;

    // 1. Enforce dedicated storage provisioning context
    if (!storageProvisioning || !storageProvisioning.isDedicatedProvisioning) {
      return {
        valid: false,
        error: "UNAUTHORIZED_STORAGE_PROVISIONING: storage_deposit is disabled in the ordinary contract call path. It requires a dedicated, explicitly authorized provisioning context.",
      };
    }

    if (!args || typeof args !== "object") {
      return {
        valid: false,
        error: 'INVALID_METHOD_ARGUMENTS: Method "storage_deposit" requires arguments object.',
      };
    }

    const { account_id, registration_only, ...unexpectedKeys } = args;

    if (Object.keys(unexpectedKeys).length > 0) {
      return {
        valid: false,
        error: `INVALID_METHOD_ARGUMENTS: Method "storage_deposit" contains unexpected arguments: ${Object.keys(unexpectedKeys).join(", ")}.`,
      };
    }

    if (!account_id || typeof account_id !== "string") {
      return {
        valid: false,
        error: 'INVALID_STORAGE_ACCOUNT: Method "storage_deposit" requires a valid string "account_id".',
      };
    }

    const normalizedStorageAccount = account_id.trim().toLowerCase();
    if (!isValidNearAccountId(normalizedStorageAccount)) {
      return {
        valid: false,
        error: `INVALID_STORAGE_ACCOUNT: Account "${account_id}" is not a valid NEAR account ID.`,
      };
    }

    // 2. Target must match authorized target
    const authorizedTarget = storageProvisioning.targetAccountId.trim().toLowerCase();
    if (normalizedStorageAccount !== authorizedTarget) {
      return {
        valid: false,
        error: `UNAUTHORIZED_STORAGE_TARGET: Storage provisioning authorized for "${authorizedTarget}", but call requested for "${normalizedStorageAccount}".`,
      };
    }

    // 3. Restrict target to caller's custody wallet
    if (mandateWalletAccountId) {
      const normalizedWallet = mandateWalletAccountId.trim().toLowerCase();
      if (normalizedStorageAccount !== normalizedWallet) {
        return {
          valid: false,
          error: `UNAUTHORIZED_STORAGE_TARGET: storage_deposit may only target the mandate custody wallet "${normalizedWallet}".`,
        };
      }
    }

    if (registration_only !== undefined && typeof registration_only !== "boolean") {
      return {
        valid: false,
        error: 'INVALID_REGISTRATION_FLAG: If provided, "registration_only" must be a boolean.',
      };
    }

    const depositBig = BigInt(depositYocto);
    if (
      depositBig < BigInt(MIN_STORAGE_DEPOSIT_YOCTO) ||
      depositBig > BigInt(MAX_STORAGE_DEPOSIT_YOCTO)
    ) {
      return {
        valid: false,
        error: `STORAGE_DEPOSIT_OUT_OF_BOUNDS: Attached storage deposit must be between ${MIN_STORAGE_DEPOSIT_YOCTO} (0.00125 NEAR) and ${MAX_STORAGE_DEPOSIT_YOCTO} (0.05 NEAR). Received "${depositYocto}".`,
      };
    }

    // 4. Check against bounded provisioning cap
    if (depositBig > BigInt(storageProvisioning.maxDepositYocto)) {
      return {
        valid: false,
        error: `STORAGE_DEPOSIT_OUT_OF_BOUNDS: Attached deposit "${depositYocto}" exceeds authorized maxDepositYocto "${storageProvisioning.maxDepositYocto}".`,
      };
    }

    return {
      valid: true,
      normalizedReceiverId: receiverId,
      normalizedMethodName: "storage_deposit",
      normalizedGas,
      normalizedDeposit: depositYocto,
    };
  }
}
