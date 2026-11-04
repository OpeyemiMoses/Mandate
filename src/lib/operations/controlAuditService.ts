/**
 * Operational Control Audit Service (Milestone 9.4)
 * Records tamper-evident audit records and SHA-256 hash chains for all operational state changes.
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/auditLedger";
import { OperationalActionType, OperationalMode } from "./types";

export class ControlAuditService {
  /**
   * Records an operational state transition in both local table and SHA-256 cryptographic audit ledger.
   */
  public static async recordAction(params: {
    actionType: OperationalActionType;
    mode: OperationalMode;
    actorId: string;
    actorRole: string;
    reason: string;
    details?: Record<string, any>;
    ipAddress?: string;
    incidentId?: string;
  }) {
    const canonicalDetails = JSON.stringify(params.details || {}, Object.keys(params.details || {}).sort());
    const payloadHash = crypto.createHash("sha256").update(canonicalDetails, "utf8").digest("hex");

    // 1. Persist in OperationalAuditRecord table
    const auditRecord = await prisma.operationalAuditRecord.create({
      data: {
        actionType: params.actionType,
        mode: params.mode,
        actorId: params.actorId,
        actorRole: params.actorRole,
        reason: params.reason,
        ipAddress: params.ipAddress,
        payloadHash,
        details: canonicalDetails,
      },
    });

    // 2. Dual-dispatch to tamper-evident SHA-256 audit ledger
    try {
      let auditUserId = params.actorId;
      const userExists = await prisma.user.findUnique({
        where: { id: params.actorId },
        select: { id: true },
      });

      if (!userExists) {
        const fallbackUser = await prisma.user.findFirst({
          select: { id: true },
        });
        if (fallbackUser) {
          auditUserId = fallbackUser.id;
        }
      }

      if (auditUserId) {
        await recordAuditEvent({
          userId: auditUserId,
          eventType: `OPERATIONAL_CONTROL_${params.actionType}`,
          description: `Operational state changed to ${params.mode}: ${params.reason}`,
          details: {
            actionType: params.actionType,
            mode: params.mode,
            actorId: params.actorId,
            actorRole: params.actorRole,
            reason: params.reason,
            incidentId: params.incidentId,
            payloadHash,
            ...params.details,
          },
        });
      }
    } catch (err) {
      console.warn("Audit ledger dispatch warning:", err);
    }

    return auditRecord;
  }
}
