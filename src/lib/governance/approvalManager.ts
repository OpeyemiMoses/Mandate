import crypto from "crypto";
import { prisma } from "@/lib/db";
import { canonicalize } from "@/lib/auditLedger";

export interface ActionPayloadForApproval {
  operation?: string;
  recipient?: string;
  amountYocto?: string;
  toolId?: string;
  mandateId?: string;
  taskId?: string;
  executionId?: string;
  coordinationRunId?: string;
  objectiveId?: string;
  parameters?: Record<string, unknown>;
  policyId?: string;
  policyVersion?: number;
  mandateVersion?: number;
}

/**
 * Computes a deterministic SHA-256 canonical hash of the action payload.
 * Any mutation in recipient, amount, operation, parameters, policy version,
 * or mandate version produces a completely different hash, immediately
 * invalidating previous approvals.
 */
export function computeActionPayloadHash(payload: ActionPayloadForApproval): string {
  const canonical = canonicalize({
    operation: payload.operation?.toLowerCase().trim() || "",
    recipient: payload.recipient?.toLowerCase().trim() || "",
    amountYocto: payload.amountYocto || "0",
    toolId: payload.toolId?.toLowerCase().trim() || "",
    mandateId: payload.mandateId || "",
    parameters: payload.parameters || {},
    policyId: payload.policyId || "",
    policyVersion: payload.policyVersion || 1,
    mandateVersion: payload.mandateVersion || 1,
  });

  return crypto.createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

export interface ValidateApprovalResult {
  valid: boolean;
  reason?: string;
  approval?: any;
}

/**
 * Verifies that an approval request is valid, unexpired, unrevoked, and matches
 * the exact action-payload hash, policy version, and mandate version.
 */
export async function validateApprovalIntegrity(
  approvalId: string,
  currentPayload: ActionPayloadForApproval,
  userId: string
): Promise<ValidateApprovalResult> {
  const approval = await prisma.approvalRequest.findFirst({
    where: {
      id: approvalId,
      mandate: { userId },
    },
    include: {
      mandate: true,
      task: true,
    },
  });

  if (!approval) {
    return { valid: false, reason: "Approval request not found or unauthorized" };
  }

  // 1. Status Check
  if (approval.status !== "APPROVED") {
    return { valid: false, reason: `Approval status is "${approval.status}", expected "APPROVED"` };
  }

  // 1b. One-Time Consumption Check (Milestone 13.9)
  if (approval.executionId) {
    return { valid: false, reason: `Approval ${approvalId} has already been consumed by execution ${approval.executionId}` };
  }

  // 2. Revocation Check
  if (approval.revokedAt || (approval.status as string) === "REVOKED") {
    return {
      valid: false,
      reason: `Approval was revoked: ${approval.revocationReason || "Revoked by administrator"}`,
    };
  }

  // 3. Expiration Check
  if (approval.expiresAt && new Date() > new Date(approval.expiresAt)) {
    return { valid: false, reason: `Approval expired at ${approval.expiresAt.toISOString()}` };
  }

  // 4. Policy Version Binding Check
  if (
    approval.policyVersion !== null &&
    currentPayload.policyVersion !== undefined &&
    approval.policyVersion !== currentPayload.policyVersion
  ) {
    return {
      valid: false,
      reason: `Policy version changed from v${approval.policyVersion} to v${currentPayload.policyVersion}. Re-approval required.`,
    };
  }

  // 5. Mandate Version Binding Check
  if (
    approval.mandateVersion !== null &&
    currentPayload.mandateVersion !== undefined &&
    approval.mandateVersion !== currentPayload.mandateVersion
  ) {
    return {
      valid: false,
      reason: `Mandate version changed from v${approval.mandateVersion} to v${currentPayload.mandateVersion}. Re-approval required.`,
    };
  }

  // 6. Action Payload Hash Tamper Check
  const expectedHash = computeActionPayloadHash(currentPayload);
  if (approval.actionPayloadHash && approval.actionPayloadHash !== expectedHash) {
    return {
      valid: false,
      reason: "Approval payload hash mismatch: action parameters have been modified since approval was granted",
    };
  }

  return { valid: true, approval };
}

/**
 * Atomically consumes an approved approval request for a specific execution.
 * Enforces one-time authorization semantics and prevents concurrent duplicate execution.
 */
export async function consumeApprovalAtomic(
  approvalId: string,
  executionId: string,
  userId: string
): Promise<boolean> {
  try {
    const res = await prisma.approvalRequest.updateMany({
      where: {
        id: approvalId,
        status: "APPROVED",
        executionId: null,
        mandate: { userId },
      },
      data: {
        status: "CONSUMED",
        executionId,
        decidedAt: new Date(),
      },
    });
    return res.count > 0;
  } catch (err) {
    console.error("Failed to atomically consume approval:", err);
    return false;
  }
}

/**
 * Revokes an existing approval request
 */
export async function revokeApproval(
  approvalId: string,
  userId: string,
  reason: string
): Promise<boolean> {
  const approval = await prisma.approvalRequest.findFirst({
    where: { id: approvalId, mandate: { userId } },
  });

  if (!approval) return false;

  await prisma.approvalRequest.update({
    where: { id: approvalId },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revocationReason: reason,
    },
  });

  return true;
}
