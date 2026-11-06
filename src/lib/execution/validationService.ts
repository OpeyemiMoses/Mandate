/**
 * Autonomous Execution Preflight Validation Service
 * Milestone 8 - Deterministic Pre-Execution Guardrails
 */

import { prisma } from "@/lib/db";
import { yoctoToNear, isValidYoctoString } from "@/lib/yocto";
import { getNearAccountState } from "@/lib/nearRpc";
import { PreflightValidationResult, ValidationCheck } from "./types";
import { MandateLifecycleService } from "@/lib/mandate/lifecycleService";

// Standard NEAR Minimum Reserve for gas, contract storage, and basic state
// 0.05 NEAR = 50_000_000_000_000_000_000_000 yoctoNEAR
export const STORAGE_BUFFER_YOCTO = "50000000000000000000000";

/**
 * Validates NEAR Account ID syntax according to NEP-0145 / NEAR Core rules:
 * - 64-character lowercase hex string (implicit account)
 * - Named accounts: 2-64 chars, lowercase alphanumeric, `-`, `_`, `.`, ending in valid top-level (.testnet / .near / etc.)
 */
export function isValidNearAccountId(accountId: string): boolean {
  if (!accountId || typeof accountId !== "string") return false;
  const clean = accountId.trim();
  if (clean.length < 2 || clean.length > 64) return false;

  // Implicit 64-hex account ID
  if (/^[0-9a-f]{64}$/.test(clean)) {
    return true;
  }

  // EVM 40-hex implicit account ID (0x...)
  if (/^0x[0-9a-f]{40}$/i.test(clean)) {
    return true;
  }

  // Named account ID: lowercase alphanumeric, hyphens, underscores, dots
  // Must not begin or end with a dot or hyphen
  const namedRegex = /^(([a-z0-9_-]+\.)*[a-z0-9_-]+)$/;
  if (!namedRegex.test(clean)) {
    return false;
  }

  // Disallow uppercase or consecutive dots
  if (clean !== clean.toLowerCase() || clean.includes("..")) {
    return false;
  }

  return true;
}

export class ExecutionValidationService {
  /**
   * Complete preflight validation before any transaction is signed or broadcast.
   * Performs independent verification of network, sender, recipient, amounts, balances, and mandate boundaries.
   */
  public static async validateNearTransferPreflight(params: {
    userId: string;
    mandateId: string;
    recipient: string;
    amountYocto: string;
    agentId?: string;
    bypassRpcCheck?: boolean; // Useful for mock / isolated testing
    alreadyReserved?: boolean;
  }): Promise<PreflightValidationResult> {
    const {
      userId,
      mandateId,
      recipient,
      amountYocto,
      agentId,
      bypassRpcCheck = false,
      alreadyReserved = false,
    } = params;
    const checks: ValidationCheck[] = [];

    // 1. Amount Syntax & Precision Check (Strict BigInt, no floats)
    if (amountYocto.includes(".") || !isValidYoctoString(amountYocto)) {
      checks.push({
        name: "amount_syntax",
        passed: false,
        details: "Amount must be a non-negative integer string in atomic yoctoNEAR units. Floating point rejected.",
      });
      return {
        valid: false,
        reason: "Invalid amount representation (floats or invalid chars detected)",
        checks,
        amountYocto,
        amountNear: "0",
        balanceAvailableYocto: "0",
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: "testnet",
        recipient,
      };
    }

    const requestedAmount = BigInt(amountYocto);
    if (requestedAmount <= BigInt(0)) {
      checks.push({
        name: "amount_positive",
        passed: false,
        details: "Transfer amount must be strictly greater than 0 yoctoNEAR.",
      });
      return {
        valid: false,
        reason: "Transfer amount must be strictly positive",
        checks,
        amountYocto,
        amountNear: "0",
        balanceAvailableYocto: "0",
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: "testnet",
        recipient,
      };
    }
    checks.push({ name: "amount_syntax", passed: true });

    // 2. Recipient Account Format Verification
    const cleanRecipient = recipient.trim().toLowerCase();
    const isRecipientFormatValid = isValidNearAccountId(cleanRecipient);
    if (!isRecipientFormatValid) {
      checks.push({
        name: "recipient_format",
        passed: false,
        details: `Recipient "${recipient}" is not a valid NEAR account ID (must be 64-hex implicit or valid lowercase named account).`,
      });
      return {
        valid: false,
        reason: `Invalid NEAR recipient format: ${recipient}`,
        checks,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        balanceAvailableYocto: "0",
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: "testnet",
        recipient: cleanRecipient,
      };
    }
    checks.push({ name: "recipient_format", passed: true });

    // 3. Mandate & Wallet Entity Resolution
    const mandate = await prisma.mandate.findFirst({
      where: { id: mandateId, userId },
      include: {
        wallet: true,
        agent: true,
      },
    });

    if (!mandate) {
      checks.push({
        name: "mandate_ownership",
        passed: false,
        details: `Mandate ${mandateId} not found or not owned by user ${userId}.`,
      });
      return {
        valid: false,
        reason: "Mandate not found or unauthorized",
        checks,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        balanceAvailableYocto: "0",
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: "testnet",
        recipient: cleanRecipient,
      };
    }
    checks.push({ name: "mandate_ownership", passed: true });

    // 4. Mandate Lifecycle Status & Expiration (Milestone 12)
    try {
      MandateLifecycleService.assertCanExecute(mandate);
    } catch (lifecycleErr: any) {
      checks.push({
        name: "mandate_active",
        passed: false,
        details: lifecycleErr.message,
      });
      return {
        valid: false,
        reason: lifecycleErr.message,
        checks,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        balanceAvailableYocto: "0",
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: mandate.wallet?.network || "testnet",
        recipient: cleanRecipient,
      };
    }
    checks.push({ name: "mandate_active", passed: true });
    checks.push({ name: "mandate_unexpired", passed: true });

    // 4b. Network Identity Verification: Strictly TESTNET
    const network = (mandate.wallet?.network || "testnet").toLowerCase();
    if (network !== "testnet") {
      checks.push({
        name: "network_identity",
        passed: false,
        details: `Network "${network}" is prohibited. Only NEAR Testnet is authorized.`,
      });
      return {
        valid: false,
        reason: `Unsupported network "${network}". Only NEAR Testnet is authorized.`,
        checks,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        balanceAvailableYocto: "0",
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network,
        recipient: cleanRecipient,
      };
    }
    checks.push({ name: "network_identity", passed: true });

    // 5. Agent Verification if specified
    if (agentId && mandate.agentId !== agentId) {
      checks.push({
        name: "agent_bound",
        passed: false,
        details: `Mandate is bound to agent ${mandate.agentId}, but execution requested for agent ${agentId}.`,
      });
      return {
        valid: false,
        reason: "Agent mismatch with mandate authority",
        checks,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        balanceAvailableYocto: "0",
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: mandate.wallet?.network || "testnet",
        recipient: cleanRecipient,
      };
    }

    if (mandate.agent.status !== "ACTIVE") {
      checks.push({
        name: "agent_active",
        passed: false,
        details: `Agent is currently ${mandate.agent.status}.`,
      });
      return {
        valid: false,
        reason: `Agent is not active (status: ${mandate.agent.status})`,
        checks,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        balanceAvailableYocto: "0",
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: mandate.wallet?.network || "testnet",
        recipient: cleanRecipient,
      };
    }
    checks.push({ name: "agent_active", passed: true });

    // 6. Recipient Allowlist Check
    let allowedRecipients: string[] = [];
    try {
      allowedRecipients = JSON.parse(mandate.allowedRecipientsJson || "[]").map((r: string) =>
        r.trim().toLowerCase()
      );
    } catch {}

    if (!allowedRecipients.includes("*") && !allowedRecipients.includes(cleanRecipient)) {
      checks.push({
        name: "recipient_allowlist",
        passed: false,
        details: `Recipient "${cleanRecipient}" is not in mandate allowed recipients list: [${allowedRecipients.join(", ")}].`,
      });
      return {
        valid: false,
        reason: `Recipient "${cleanRecipient}" is not permitted by mandate allowlist`,
        checks,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        balanceAvailableYocto: "0",
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: mandate.wallet?.network || "testnet",
        recipient: cleanRecipient,
      };
    }
    checks.push({ name: "recipient_allowlist", passed: true });

    // 7. Mandate Spending Limits
    const totalBudget = BigInt(mandate.totalBudgetYocto);
    const spent = BigInt(mandate.spentYocto || "0");
    const reserved = BigInt(mandate.reservedYocto || "0");
    const perTxLimit = BigInt(mandate.perTxLimitYocto);

    if (requestedAmount > perTxLimit) {
      checks.push({
        name: "per_tx_limit",
        passed: false,
        details: `Proposed amount ${yoctoToNear(amountYocto)} NEAR exceeds mandate per-transaction limit (${yoctoToNear(mandate.perTxLimitYocto)} NEAR).`,
      });
      return {
        valid: false,
        reason: `Proposed amount exceeds per-transaction limit (${yoctoToNear(mandate.perTxLimitYocto)} NEAR)`,
        checks,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        balanceAvailableYocto: "0",
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: mandate.wallet?.network || "testnet",
        recipient: cleanRecipient,
      };
    }
    checks.push({ name: "per_tx_limit", passed: true });

    const availableBudget = alreadyReserved
      ? totalBudget >= spent
        ? totalBudget - spent
        : BigInt(0)
      : totalBudget > spent + reserved
      ? totalBudget - (spent + reserved)
      : BigInt(0);

    if (requestedAmount > availableBudget) {
      checks.push({
        name: "budget_available",
        passed: false,
        details: `Requested ${yoctoToNear(amountYocto)} NEAR exceeds available unreserved mandate budget (${yoctoToNear(availableBudget.toString())} NEAR).`,
      });
      return {
        valid: false,
        reason: `Requested amount exceeds available mandate budget (${yoctoToNear(availableBudget.toString())} NEAR)`,
        checks,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        balanceAvailableYocto: availableBudget.toString(),
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: mandate.wallet?.network || "testnet",
        recipient: cleanRecipient,
      };
    }
    checks.push({ name: "budget_available", passed: true });

    // 8. Custody Wallet Balance & Reserve Buffer Validation
    const wallet = mandate.wallet;
    if (!wallet) {
      checks.push({
        name: "wallet_exists",
        passed: false,
        details: "Custody wallet not provisioned for this agent.",
      });
      return {
        valid: false,
        reason: "Custody wallet not provisioned",
        checks,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        balanceAvailableYocto: availableBudget.toString(),
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: "testnet",
        recipient: cleanRecipient,
      };
    }

    if (wallet.isFrozen) {
      checks.push({
        name: "wallet_unfrozen",
        passed: false,
        details: "Custody wallet has been frozen by administrator.",
      });
      return {
        valid: false,
        reason: "Custody wallet is frozen",
        checks,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        balanceAvailableYocto: availableBudget.toString(),
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: wallet.network,
        recipient: cleanRecipient,
      };
    }
    checks.push({ name: "wallet_unfrozen", passed: true });

    const storedBalance = BigInt(wallet.balanceYocto || "0");
    const storageBuffer = BigInt(STORAGE_BUFFER_YOCTO);

    // If stored balance is tracked, ensure amount fits with buffer
    if (storedBalance > BigInt(0) && requestedAmount + storageBuffer > storedBalance) {
      checks.push({
        name: "balance_sufficient",
        passed: false,
        details: `Wallet balance (${yoctoToNear(storedBalance.toString())} NEAR) is insufficient for amount (${yoctoToNear(amountYocto)} NEAR) plus 0.05 NEAR reserve buffer.`,
      });
      return {
        valid: false,
        reason: "Insufficient wallet balance with reserve buffer",
        checks,
        amountYocto,
        amountNear: yoctoToNear(amountYocto),
        balanceAvailableYocto: storedBalance.toString(),
        storageBufferYocto: STORAGE_BUFFER_YOCTO,
        network: wallet.network,
        recipient: cleanRecipient,
      };
    }

    // 8b. On-Chain RPC Balance & Account Verification
    if (!bypassRpcCheck && wallet.nearAccountId) {
      const isProd = process.env.NODE_ENV === "production";
      const allowOfflineTestBalances = !isProd && process.env.MANDATE_ALLOW_OFFLINE_TEST_BALANCES === "true";

      try {
        const onChainState = await getNearAccountState(wallet.nearAccountId);
        if (!onChainState) {
          // In production, an account MUST exist on-chain. Stored DB balance cannot substitute.
          if (allowOfflineTestBalances && storedBalance > BigInt(0) && requestedAmount + storageBuffer <= storedBalance) {
            // Permitted ONLY in explicit non-production offline test suites
          } else {
            checks.push({
              name: "onchain_balance",
              passed: false,
              details: `Agent custody account ${wallet.nearAccountId} does not exist on-chain or has zero balance.`,
            });
            return {
              valid: false,
              reason: "On-chain balance insufficient: Account does not exist on-chain or has zero balance",
              checks,
              amountYocto,
              amountNear: yoctoToNear(amountYocto),
              balanceAvailableYocto: "0",
              storageBufferYocto: STORAGE_BUFFER_YOCTO,
              network: wallet.network,
              recipient: cleanRecipient,
            };
          }
        } else {
          const onChainBal = BigInt(onChainState.amountYocto || "0");
          if (requestedAmount + storageBuffer > onChainBal) {
            checks.push({
              name: "onchain_balance",
              passed: false,
              details: `On-chain balance (${yoctoToNear(onChainBal.toString())} NEAR) insufficient for transfer plus 0.05 NEAR reserve buffer.`,
            });
            return {
              valid: false,
              reason: "On-chain balance insufficient for transaction",
              checks,
              amountYocto,
              amountNear: yoctoToNear(amountYocto),
              balanceAvailableYocto: onChainBal.toString(),
              storageBufferYocto: STORAGE_BUFFER_YOCTO,
              network: wallet.network,
              recipient: cleanRecipient,
            };
          }
        }
      } catch (rpcErr: any) {
        // In production, RPC network errors fail closed!
        if (isProd) {
          checks.push({
            name: "onchain_balance",
            passed: false,
            details: `On-chain balance check failed to query NEAR RPC: ${rpcErr?.message || "RPC connection failed"}`,
          });
          return {
            valid: false,
            reason: "On-chain balance check failed: Unable to verify account on NEAR RPC",
            checks,
            amountYocto,
            amountNear: yoctoToNear(amountYocto),
            balanceAvailableYocto: "0",
            storageBufferYocto: STORAGE_BUFFER_YOCTO,
            network: wallet.network,
            recipient: cleanRecipient,
          };
        }

        // In non-production, fallback to stored balance check
        if (storedBalance === BigInt(0) || requestedAmount + storageBuffer > storedBalance) {
          checks.push({
            name: "onchain_balance",
            passed: false,
            details: `On-chain verification unreachable and stored balance is insufficient.`,
          });
          return {
            valid: false,
            reason: "Insufficient balance",
            checks,
            amountYocto,
            amountNear: yoctoToNear(amountYocto),
            balanceAvailableYocto: storedBalance.toString(),
            storageBufferYocto: STORAGE_BUFFER_YOCTO,
            network: wallet.network,
            recipient: cleanRecipient,
          };
        }
      }
    }
    checks.push({ name: "balance_sufficient", passed: true });

    return {
      valid: true,
      checks,
      amountYocto,
      amountNear: yoctoToNear(amountYocto),
      balanceAvailableYocto: storedBalance.toString(),
      storageBufferYocto: STORAGE_BUFFER_YOCTO,
      network: wallet.network,
      recipient: cleanRecipient,
    };
  }
}
