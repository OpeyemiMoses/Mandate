import { prisma } from "@/lib/db";
import { nearToYocto, yoctoToNear } from "@/lib/yocto";
import { ObjectiveConstraints } from "./types";

export interface AuthorityValidationResult {
  hasMandate: boolean;
  isValid: boolean;
  mandate?: {
    id: string;
    name: string;
    totalBudgetNear: string;
    availableBudgetNear: string;
    perTxLimitNear: string;
    approvalThresholdNear: string;
    allowedRecipients: string[];
    status: string;
  };
  mismatches: string[];
  warnings: string[];
}

/**
 * Validates Objective Constraints against Financial Mandate Authority.
 * The Objective Engine must NEVER create or modify a financial mandate automatically.
 * Any mismatch between requested objective budget and mandate authority is explicitly flagged.
 */
export async function validateObjectiveAuthority(params: {
  userId: string;
  mandateId?: string | null;
  constraints: ObjectiveConstraints;
  requestedRecipients?: string[];
}): Promise<AuthorityValidationResult> {
  const { userId, mandateId, constraints, requestedRecipients = [] } = params;

  if (!mandateId) {
    return {
      hasMandate: false,
      isValid: true, // Non-financial objectives or draft objectives can exist without mandate
      mismatches: [],
      warnings: constraints.maxBudgetNear
        ? [`Objective requests ${constraints.maxBudgetNear} NEAR but no financial mandate is bound.`]
        : [],
    };
  }

  // 1. Fetch Mandate and verify user ownership
  const mandate = await prisma.mandate.findFirst({
    where: { id: mandateId, userId },
  });

  if (!mandate) {
    return {
      hasMandate: false,
      isValid: false,
      mismatches: [`Mandate "${mandateId}" not found or unauthorized for this user.`],
      warnings: [],
    };
  }

  const mismatches: string[] = [];
  const warnings: string[] = [];

  if (mandate.status !== "ACTIVE") {
    mismatches.push(`Mandate "${mandate.name}" is ${mandate.status.toLowerCase()} and cannot authorize new spending.`);
  }

  // 1b. Expiration Check
  if (mandate.expiresAt && new Date() > mandate.expiresAt) {
    mismatches.push(`Mandate "${mandate.name}" expired on ${mandate.expiresAt.toISOString()}.`);
  }

  let allowedRecipients: string[] = [];
  try {
    allowedRecipients = JSON.parse(mandate.allowedRecipientsJson || "[]");
  } catch {}

  const totalBudgetYocto = BigInt(mandate.totalBudgetYocto);
  const spentYocto = BigInt(mandate.spentYocto || "0");
  const reservedYocto = BigInt(mandate.reservedYocto || "0");
  const availableYocto = totalBudgetYocto > spentYocto + reservedYocto
    ? totalBudgetYocto - (spentYocto + reservedYocto)
    : BigInt(0);

  if (availableYocto <= BigInt(0)) {
    mismatches.push(`Mandate "${mandate.name}" budget is fully exhausted (0 yoctoNEAR available).`);
  }

  // 2. Budget Mismatch Check (supports exact integer yoctoNEAR strings)
  if (constraints.maxBudgetYocto) {
    const requestedYocto = BigInt(constraints.maxBudgetYocto);
    if (requestedYocto > availableYocto) {
      mismatches.push(
        `Requested objective budget (${yoctoToNear(requestedYocto.toString())} NEAR) exceeds available mandate budget (${yoctoToNear(availableYocto.toString())} NEAR). Mandate budgets cannot be expanded by objectives.`
      );
    }
  } else if (constraints.maxBudgetNear) {
    const requestedYocto = BigInt(nearToYocto(constraints.maxBudgetNear));
    if (requestedYocto > availableYocto) {
      mismatches.push(
        `Requested objective budget (${constraints.maxBudgetNear} NEAR) exceeds available mandate budget (${yoctoToNear(availableYocto.toString())} NEAR). Mandate budgets cannot be expanded by objectives.`
      );
    }
  }

  // 3. Recipient Allowlist Check
  if (requestedRecipients.length > 0 && !allowedRecipients.includes("*")) {
    for (const r of requestedRecipients) {
      if (!allowedRecipients.includes(r)) {
        mismatches.push(
          `Target recipient "${r}" is not included in mandate allowed recipients: [${allowedRecipients.join(", ")}]. Mandates cannot be modified by the Objective Engine.`
        );
      }
    }
  }

  return {
    hasMandate: true,
    isValid: mismatches.length === 0,
    mandate: {
      id: mandate.id,
      name: mandate.name,
      totalBudgetNear: yoctoToNear(mandate.totalBudgetYocto),
      availableBudgetNear: yoctoToNear(availableYocto.toString()),
      perTxLimitNear: yoctoToNear(mandate.perTxLimitYocto),
      approvalThresholdNear: yoctoToNear(mandate.approvalThresholdYocto),
      allowedRecipients,
      status: mandate.status,
    },
    mismatches,
    warnings,
  };
}

// In-memory mutex chain per mandate ID to serialize concurrent reservation requests
const mandateLocks = new Map<string, Promise<void>>();

async function acquireMandateLock<T>(mandateId: string, fn: () => Promise<T>): Promise<T> {
  while (mandateLocks.has(mandateId)) {
    try {
      await mandateLocks.get(mandateId);
    } catch {}
  }

  let resolveLock!: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  mandateLocks.set(mandateId, lockPromise);

  try {
    return await fn();
  } finally {
    mandateLocks.delete(mandateId);
    resolveLock();
  }
}

/**
 * Atomically reserve budget on a shared mandate.
 * Guarantees that concurrent objectives competing for the same mandate cannot over-reserve or double-spend,
 * both in-process via mutex and across distributed server instances via CAS (Compare-And-Swap) optimistic concurrency.
 */
export async function reserveMandateBudgetAtomic(params: {
  mandateId: string;
  amountYocto: string;
  objectiveId?: string;
  taskId?: string;
}): Promise<{
  success: boolean;
  reservedAmountYocto?: string;
  remainingAvailableYocto?: string;
  reason?: string;
}> {
  const { mandateId, amountYocto } = params;
  const MAX_CAS_RETRIES = 5;

  return acquireMandateLock(mandateId, async () => {
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const result = await prisma.$transaction(async (tx) => {
        const mandate = await tx.mandate.findUnique({
          where: { id: mandateId },
        });

        if (!mandate) {
          return { success: false, reason: "Mandate not found", terminal: true };
        }

        if (mandate.status !== "ACTIVE" && mandate.status !== "active") {
          return {
            success: false,
            reason: `Mandate is not ACTIVE (current status: ${mandate.status})`,
            terminal: true,
          };
        }

        const totalBudgetYocto = BigInt(mandate.totalBudgetYocto);
        const spentYocto = BigInt(mandate.spentYocto || "0");
        const currentReservedYocto = BigInt(mandate.reservedYocto || "0");
        const requestedYocto = BigInt(amountYocto);

        const availableYocto =
          totalBudgetYocto > spentYocto + currentReservedYocto
            ? totalBudgetYocto - (spentYocto + currentReservedYocto)
            : BigInt(0);

        if (requestedYocto > availableYocto) {
          return {
            success: false,
            reason: `Concurrent budget exhaustion: Requested ${yoctoToNear(amountYocto)} NEAR exceeds current available unreserved budget (${yoctoToNear(availableYocto.toString())} NEAR)`,
            terminal: true,
          };
        }

        const nextReservedYocto = (currentReservedYocto + requestedYocto).toString();
        const currentPolicyVersion = mandate.policyVersion || 1;

        // Optimistic Concurrency Control (CAS) verification across multi-instance nodes
        const updateResult = await tx.mandate.updateMany({
          where: {
            id: mandateId,
            policyVersion: currentPolicyVersion,
            reservedYocto: mandate.reservedYocto || "0",
          },
          data: {
            reservedYocto: nextReservedYocto,
            policyVersion: currentPolicyVersion + 1,
          },
        });

        if (updateResult.count === 0) {
          // Concurrent update detected from another node/instance, trigger CAS retry
          return { success: false, retryNeeded: true };
        }

        const remainingAvailableYocto = (availableYocto - requestedYocto).toString();

        return {
          success: true,
          reservedAmountYocto: amountYocto,
          remainingAvailableYocto,
          terminal: true,
        };
      });

      if (result.terminal) {
        return {
          success: result.success,
          reservedAmountYocto: result.reservedAmountYocto,
          remainingAvailableYocto: result.remainingAvailableYocto,
          reason: result.reason,
        };
      }

      // Brief jitter before retry
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
    }

    return {
      success: false,
      reason: "High concurrency contention: Failed to atomically reserve budget after multiple retries.",
    };
  });
}

/**
 * Atomically releases reserved budget back to available balance,
 * safe across distributed server instances using CAS.
 */
export async function releaseMandateBudgetAtomic(params: {
  mandateId: string;
  amountYocto: string;
}): Promise<{
  success: boolean;
  remainingReservedYocto?: string;
}> {
  const { mandateId, amountYocto } = params;
  const MAX_CAS_RETRIES = 5;

  return acquireMandateLock(mandateId, async () => {
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const result = await prisma.$transaction(async (tx) => {
        const mandate = await tx.mandate.findUnique({
          where: { id: mandateId },
        });

        if (!mandate) return { success: false, terminal: true };

        const currentReserved = BigInt(mandate.reservedYocto || "0");
        const releaseAmount = BigInt(amountYocto);
        const nextReserved =
          currentReserved > releaseAmount ? currentReserved - releaseAmount : BigInt(0);
        const currentPolicyVersion = mandate.policyVersion || 1;

        const updateResult = await tx.mandate.updateMany({
          where: {
            id: mandateId,
            policyVersion: currentPolicyVersion,
            reservedYocto: mandate.reservedYocto || "0",
          },
          data: {
            reservedYocto: nextReserved.toString(),
            policyVersion: currentPolicyVersion + 1,
          },
        });

        if (updateResult.count === 0) {
          return { success: false, retryNeeded: true };
        }

        return {
          success: true,
          remainingReservedYocto: nextReserved.toString(),
          terminal: true,
        };
      });

      if (result.terminal) {
        return {
          success: result.success,
          remainingReservedYocto: result.remainingReservedYocto,
        };
      }

      await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
    }

    return { success: false };
  });
}

/**
 * Atomically settle spending on a mandate upon confirmed transaction.
 * Converts reserved budget into confirmed spent balance, or directly increments spent if unreserved,
 * using CAS optimistic concurrency across multi-instance nodes.
 */
export async function settleMandateBudgetAtomic(params: {
  mandateId: string;
  amountYocto: string;
  wasReserved?: boolean;
}): Promise<{
  success: boolean;
  settledAmountYocto?: string;
  newSpentYocto?: string;
  newReservedYocto?: string;
  policyVersion?: number;
  reason?: string;
}> {
  const { mandateId, amountYocto, wasReserved = true } = params;
  const MAX_CAS_RETRIES = 5;
  const amount = BigInt(amountYocto);

  return acquireMandateLock(mandateId, async () => {
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const result = await prisma.$transaction(async (tx) => {
        const mandate = await tx.mandate.findUnique({
          where: { id: mandateId },
        });

        if (!mandate) {
          return { success: false, reason: "Mandate not found", terminal: true };
        }

        const currentSpent = BigInt(mandate.spentYocto || "0");
        const currentReserved = BigInt(mandate.reservedYocto || "0");
        const nextSpent = currentSpent + amount;
        const nextReserved = wasReserved
          ? (currentReserved >= amount ? currentReserved - amount : BigInt(0))
          : currentReserved;
        const currentPolicyVersion = mandate.policyVersion || 1;

        const updateResult = await tx.mandate.updateMany({
          where: {
            id: mandateId,
            policyVersion: currentPolicyVersion,
            spentYocto: mandate.spentYocto || "0",
            reservedYocto: mandate.reservedYocto || "0",
          },
          data: {
            spentYocto: nextSpent.toString(),
            reservedYocto: nextReserved.toString(),
            policyVersion: currentPolicyVersion + 1,
          },
        });

        if (updateResult.count === 0) {
          return { success: false, retryNeeded: true };
        }

        return {
          success: true,
          settledAmountYocto: amountYocto,
          newSpentYocto: nextSpent.toString(),
          newReservedYocto: nextReserved.toString(),
          policyVersion: currentPolicyVersion + 1,
          terminal: true,
        };
      });

      if (result.terminal) {
        return {
          success: result.success,
          settledAmountYocto: result.settledAmountYocto,
          newSpentYocto: result.newSpentYocto,
          newReservedYocto: result.newReservedYocto,
          policyVersion: result.policyVersion,
          reason: result.reason,
        };
      }

      await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
    }

    return {
      success: false,
      reason: "Failed to settle mandate budget atomically due to high concurrency contention",
    };
  });
}

/**
 * Atomically refund or reverse budget on a mandate upon failure, cancellation, or rejection,
 * updating reserved and/or spent balances using CAS optimistic concurrency across multi-instance nodes.
 */
export async function refundMandateBudgetAtomic(params: {
  mandateId: string;
  amountYocto: string;
  refundFromReserved?: boolean;
  refundFromSpent?: boolean;
}): Promise<{
  success: boolean;
  refundedAmountYocto?: string;
  newSpentYocto?: string;
  newReservedYocto?: string;
  policyVersion?: number;
  reason?: string;
}> {
  const { mandateId, amountYocto, refundFromReserved = true, refundFromSpent = false } = params;
  const MAX_CAS_RETRIES = 5;
  const amount = BigInt(amountYocto);

  return acquireMandateLock(mandateId, async () => {
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const result = await prisma.$transaction(async (tx) => {
        const mandate = await tx.mandate.findUnique({
          where: { id: mandateId },
        });

        if (!mandate) {
          return { success: false, reason: "Mandate not found", terminal: true };
        }

        const currentSpent = BigInt(mandate.spentYocto || "0");
        const currentReserved = BigInt(mandate.reservedYocto || "0");

        const nextReserved = refundFromReserved
          ? (currentReserved >= amount ? currentReserved - amount : BigInt(0))
          : currentReserved;
        const nextSpent = refundFromSpent
          ? (currentSpent >= amount ? currentSpent - amount : BigInt(0))
          : currentSpent;
        const currentPolicyVersion = mandate.policyVersion || 1;

        const updateResult = await tx.mandate.updateMany({
          where: {
            id: mandateId,
            policyVersion: currentPolicyVersion,
            spentYocto: mandate.spentYocto || "0",
            reservedYocto: mandate.reservedYocto || "0",
          },
          data: {
            spentYocto: nextSpent.toString(),
            reservedYocto: nextReserved.toString(),
            policyVersion: currentPolicyVersion + 1,
          },
        });

        if (updateResult.count === 0) {
          return { success: false, retryNeeded: true };
        }

        return {
          success: true,
          refundedAmountYocto: amountYocto,
          newSpentYocto: nextSpent.toString(),
          newReservedYocto: nextReserved.toString(),
          policyVersion: currentPolicyVersion + 1,
          terminal: true,
        };
      });

      if (result.terminal) {
        return {
          success: result.success,
          refundedAmountYocto: result.refundedAmountYocto,
          newSpentYocto: result.newSpentYocto,
          newReservedYocto: result.newReservedYocto,
          policyVersion: result.policyVersion,
          reason: result.reason,
        };
      }

      await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
    }

    return {
      success: false,
      reason: "Failed to refund mandate budget atomically due to high concurrency contention",
    };
  });
}

/**
 * Asserts that a mandate is valid, active, unexpired, and has sufficient budget for an objective.
 * Throws deterministic error if invalid.
 */
export async function assertObjectiveMandateValid(params: {
  userId: string;
  mandateId: string;
  constraints?: ObjectiveConstraints;
  requestedRecipients?: string[];
}): Promise<void> {
  const result = await validateObjectiveAuthority({
    userId: params.userId,
    mandateId: params.mandateId,
    constraints: params.constraints || {},
    requestedRecipients: params.requestedRecipients,
  });

  if (!result.isValid) {
    const errorMsg = result.mismatches.join("; ") || "Mandate authority validation failed";
    throw new Error(`MANDATE_AUTHORITY_INVALID: ${errorMsg}`);
  }
}


