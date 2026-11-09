/**
 * MANDATE — Intents Financial Accounting & Precision Rules
 * Milestone 15.3b.1: Intents Settlement Evidence, Accounting & Persistence Closure
 *
 * Enforces integer atomic math and precision safety:
 * 1. Strictly uses BigInt atomic units; never floating-point numbers.
 * 2. 1:1 24-decimal parity between native NEAR and wNEAR.
 * 3. Accounts for 1 yoctoNEAR attached deposit for NEP-141 ft_transfer.
 * 4. Explicitly accounts for gas fee reserve (2 x 10^21 yoctoNEAR = 0.002 NEAR) for wrap and transfer.
 * 5. Preserves mandate-level perTxLimitYocto and totalBudgetYocto limits (no global 0.1 NEAR cap).
 * 6. Strictly isolates token units (USDC, USDT, ETH atomic units are NEVER treated as yoctoNEAR).
 */

import { yoctoToNear } from "@/lib/yocto";

export const WNEAR_DECIMALS = 24;
export const NEP141_ATTACHED_DEPOSIT_YOCTO = "1"; // 1 yoctoNEAR protocol fee
// Estimated gas fee reserve for two function calls (near_deposit ~30-50 TGas + ft_transfer ~50-100 TGas)
// 0.002 NEAR = 2,000,000,000,000,000,000,000 yoctoNEAR
export const DEFAULT_GAS_RESERVE_YOCTO = "2000000000000000000000";

export interface IntentBudgetCalculation {
  sourceAmountYocto: string; // The principal to wrap and transfer
  equivalentWnearAtomic: string; // wNEAR atomic units (1:1 with native NEAR)
  attachedDepositYocto: string; // Protocol fee (1 yoctoNEAR)
  estimatedGasReserveYocto: string; // Gas fee reserve
  totalRequiredReservationYocto: string; // sourceAmount + attachedDeposit + estimatedGasReserve
  breakdown: {
    principalNear: string;
    attachedDepositYocto: string;
    gasReserveNear: string;
    totalReservationNear: string;
  };
}

export interface SettlementAccountingResult {
  sourceAmountYocto: string;
  attachedDepositYocto: string;
  actualGasBurnedYocto: string;
  totalSpentYocto: string;
  unburnedGasRefundYocto: string;
}

export interface RefundAccountingResult {
  refundedPrincipalYocto: string;
  attachedDepositReturnedYocto: string;
  actualGasBurnedYocto: string;
  netReleasedToAvailableYocto: string;
}

export class IntentsAccountingService {
  /**
   * Calculates the exact atomic reservation required for an Intents swap.
   * Total Reservation = sourceAmountYocto + 1 yoctoNEAR (NEP-141 fee) + gasReserveYocto.
   * If customGasReserveYocto is not provided, defaults to "0" (or use calculateFeeInclusiveReservation).
   */
  public static calculateRequiredReservation(
    sourceAmountYocto: string,
    customGasReserveYocto: string = "0"
  ): IntentBudgetCalculation {
    if (!sourceAmountYocto || !/^[1-9]\d*$/.test(sourceAmountYocto)) {
      throw new Error(
        `INVALID_SOURCE_AMOUNT: Source amount must be a positive integer atomic string. Received "${sourceAmountYocto}".`
      );
    }

    const principal = BigInt(sourceAmountYocto);
    const attachedDeposit = BigInt(NEP141_ATTACHED_DEPOSIT_YOCTO);
    const gasReserve = BigInt(customGasReserveYocto);

    const total = principal + attachedDeposit + gasReserve;

    return {
      sourceAmountYocto,
      equivalentWnearAtomic: sourceAmountYocto, // 1:1 24 decimals
      attachedDepositYocto: NEP141_ATTACHED_DEPOSIT_YOCTO,
      estimatedGasReserveYocto: gasReserve.toString(),
      totalRequiredReservationYocto: total.toString(),
      breakdown: {
        principalNear: yoctoToNear(sourceAmountYocto),
        attachedDepositYocto: NEP141_ATTACHED_DEPOSIT_YOCTO,
        gasReserveNear: yoctoToNear(gasReserve.toString()),
        totalReservationNear: yoctoToNear(total.toString()),
      },
    };
  }

  /**
   * Calculates fee-inclusive reservation explicitly accounting for transaction gas reserves.
   */
  public static calculateFeeInclusiveReservation(
    sourceAmountYocto: string,
    gasReserveYocto: string = DEFAULT_GAS_RESERVE_YOCTO
  ): IntentBudgetCalculation {
    return this.calculateRequiredReservation(sourceAmountYocto, gasReserveYocto);
  }

  /**
   * Computes the exact final spent amount upon verified destination settlement.
   * Total Spent = sourceAmountYocto + attachedDepositYocto + actualGasBurnedYocto.
   * Any unused gas reserve is returned back to the mandate's available budget.
   */
  public static calculateSettlementAccounting(params: {
    reservedTotalYocto: string;
    sourceAmountYocto: string;
    attachedDepositYocto?: string;
    actualGasBurnedYocto?: string;
  }): SettlementAccountingResult {
    const {
      reservedTotalYocto,
      sourceAmountYocto,
      attachedDepositYocto = NEP141_ATTACHED_DEPOSIT_YOCTO,
      actualGasBurnedYocto = "0",
    } = params;

    const reservedBig = BigInt(reservedTotalYocto);
    const principalBig = BigInt(sourceAmountYocto);
    const depositBig = BigInt(attachedDepositYocto);
    const gasBurnedBig = BigInt(actualGasBurnedYocto);

    const totalSpent = principalBig + depositBig + gasBurnedBig;
    const unburnedGas = reservedBig > totalSpent ? reservedBig - totalSpent : BigInt(0);

    return {
      sourceAmountYocto,
      attachedDepositYocto,
      actualGasBurnedYocto,
      totalSpentYocto: totalSpent.toString(),
      unburnedGasRefundYocto: unburnedGas.toString(),
    };
  }

  /**
   * Computes the exact released amount upon verified on-chain refund to custody wallet.
   * Net Released = refundedAmount + attachedDeposit + unused gas reserve.
   */
  public static calculateRefundAccounting(params: {
    reservedTotalYocto: string;
    refundedPrincipalYocto: string;
    actualGasBurnedYocto?: string;
  }): RefundAccountingResult {
    const { reservedTotalYocto, refundedPrincipalYocto, actualGasBurnedYocto = "0" } = params;

    const reservedBig = BigInt(reservedTotalYocto);
    const gasBurnedBig = BigInt(actualGasBurnedYocto);

    // Unburned gas returns to user
    const netReleased = reservedBig > gasBurnedBig ? reservedBig - gasBurnedBig : BigInt(0);

    return {
      refundedPrincipalYocto,
      attachedDepositReturnedYocto: NEP141_ATTACHED_DEPOSIT_YOCTO,
      actualGasBurnedYocto,
      netReleasedToAvailableYocto: netReleased.toString(),
    };
  }

  /**
   * Validates economic parity between the native NEAR wrap amount and the wNEAR token transfer amount.
   * In M15.3b.1, wNEAR uses 24 decimals and is 1:1 with native NEAR.
   */
  public static assertEconomicParity(wrapAmountYocto: string, transferAmountWnear: string): void {
    if (wrapAmountYocto !== transferAmountWnear) {
      throw new Error(
        `ECONOMIC_PARITY_VIOLATION: Native NEAR wrap amount (${wrapAmountYocto}) does not equal token transfer amount (${transferAmountWnear}).`
      );
    }
  }

  /**
   * Validates that the requested operation satisfies mandate-level spending limits.
   */
  public static validateMandateLimits(params: {
    totalRequiredReservationYocto: string;
    perTxLimitYocto?: string | null;
    totalBudgetYocto?: string | null;
    spentYocto?: string | null;
    reservedYocto?: string | null;
  }): void {
    const {
      totalRequiredReservationYocto,
      perTxLimitYocto,
      totalBudgetYocto,
      spentYocto,
      reservedYocto,
    } = params;

    const requestedBig = BigInt(totalRequiredReservationYocto);

    // Per-transaction limit check (if configured by user)
    if (perTxLimitYocto) {
      const perTxLimitBig = BigInt(perTxLimitYocto);
      if (requestedBig > perTxLimitBig) {
        throw new Error(
          `PER_TX_LIMIT_EXCEEDED: Requested swap amount of ${yoctoToNear(totalRequiredReservationYocto)} NEAR exceeds mandate per-transaction limit of ${yoctoToNear(perTxLimitYocto)} NEAR.`
        );
      }
    }

    // Available budget check
    if (totalBudgetYocto) {
      const totalBudgetBig = BigInt(totalBudgetYocto);
      const spentBig = BigInt(spentYocto || "0");
      const currentReservedBig = BigInt(reservedYocto || "0");
      const availableBudget = totalBudgetBig - (spentBig + currentReservedBig);

      if (requestedBig > availableBudget) {
        throw new Error(
          `MANDATE_BUDGET_EXCEEDED: Requested swap amount of ${yoctoToNear(totalRequiredReservationYocto)} NEAR exceeds remaining available mandate budget of ${yoctoToNear(availableBudget.toString())} NEAR.`
        );
      }
    }
  }
}
