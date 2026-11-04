/**
 * Mandate Operation Permission Service
 * Enforces fine-grained operation-level access controls, agent authorization,
 * risk classification gates, and financial authority boundaries.
 */

import { prisma } from "../db";
import {
  OperationPermissionLevel,
  OperationRiskClassification,
  IntegrationOperationDefinition,
} from "./types";
import {
  reserveMandateBudgetAtomic,
  settleMandateBudgetAtomic,
  releaseMandateBudgetAtomic,
} from "../objectives/authority";
import crypto from "crypto";
import { PolicyEngine } from "../governance";

export interface PermissionCheckRequest {
  connectionId: string;
  operationId: string;
  agentId?: string;
  agentType?: string;
  userId: string;
  mandateId?: string;
  amountYocto?: string;
}

export interface PermissionCheckResult {
  authorized: boolean;
  permissionLevel: OperationPermissionLevel;
  riskClassification: OperationRiskClassification;
  requiresApproval: boolean;
  reason?: string;
  errorCode?: "PERMISSION_DENIED" | "OPERATION_DISABLED" | "CONNECTION_REVOKED" | "AGENT_UNAUTHORIZED" | "MANDATE_REQUIRED" | "INSUFFICIENT_FUNDS" | "USER_ONLY_BLOCKED";
}

export class OperationPermissionService {
  /**
   * Initializes or synchronizes default permissions for all operations supported by a connection.
   */
  public static async syncOperationPermissions(
    connectionId: string,
    operations: IntegrationOperationDefinition[]
  ): Promise<void> {
    for (const op of operations) {
      await prisma.integrationOperationPermission.upsert({
        where: {
          connectionId_operationId: {
            connectionId,
            operationId: op.id,
          },
        },
        create: {
          connectionId,
          operationId: op.id,
          permissionLevel: op.defaultPermissionLevel,
          riskClassification: op.riskClassification,
          isEnabled: true,
          requiresApproval: op.defaultPermissionLevel === "PROPOSE" || op.riskClassification === "CRITICAL",
          allowedAgentTypesJson: JSON.stringify(["*"]),
        },
        update: {
          riskClassification: op.riskClassification,
        },
      });
    }
  }

  /**
   * Evaluates if an execution request is authorized to proceed.
   */
  public static async evaluateAccess(
    req: PermissionCheckRequest,
    operationDef?: IntegrationOperationDefinition
  ): Promise<PermissionCheckResult> {
    // 1. Verify Connection exists and is ACTIVE
    const connection = await prisma.integrationConnection.findUnique({
      where: { id: req.connectionId },
      include: {
        operationPermissions: {
          where: { operationId: req.operationId },
        },
      },
    });

    if (!connection) {
      return {
        authorized: false,
        permissionLevel: "USER_ONLY",
        riskClassification: "CRITICAL",
        requiresApproval: true,
        reason: "Integration connection not found",
        errorCode: "CONNECTION_REVOKED",
      };
    }

    if (connection.userId !== req.userId) {
      return {
        authorized: false,
        permissionLevel: "USER_ONLY",
        riskClassification: "CRITICAL",
        requiresApproval: true,
        reason: "Integration connection does not belong to user",
        errorCode: "PERMISSION_DENIED",
      };
    }

    if (connection.status === "REVOKED" || connection.status === "DISABLED") {
      return {
        authorized: false,
        permissionLevel: "USER_ONLY",
        riskClassification: "CRITICAL",
        requiresApproval: true,
        reason: `Integration is currently ${connection.status}`,
        errorCode: "CONNECTION_REVOKED",
      };
    }

    // 2. Fetch or create operation permission record
    let perm = connection.operationPermissions[0];
    if (!perm) {
      const defaultLevel = operationDef?.defaultPermissionLevel || "READ";
      const defaultRisk = operationDef?.riskClassification || "LOW";
      perm = await prisma.integrationOperationPermission.create({
        data: {
          connectionId: req.connectionId,
          operationId: req.operationId,
          permissionLevel: defaultLevel,
          riskClassification: defaultRisk,
          isEnabled: true,
          requiresApproval: defaultLevel === "PROPOSE" || defaultRisk === "CRITICAL",
          allowedAgentTypesJson: JSON.stringify(["*"]),
        },
      });
    }

    // 3. Check if operation is enabled
    if (!perm.isEnabled) {
      return {
        authorized: false,
        permissionLevel: perm.permissionLevel as OperationPermissionLevel,
        riskClassification: perm.riskClassification as OperationRiskClassification,
        requiresApproval: perm.requiresApproval,
        reason: `Operation "${req.operationId}" is disabled for this integration connection`,
        errorCode: "OPERATION_DISABLED",
      };
    }

    // 4. Check USER_ONLY gate (agents cannot execute USER_ONLY operations)
    if (perm.permissionLevel === "USER_ONLY" && req.agentId) {
      return {
        authorized: false,
        permissionLevel: "USER_ONLY",
        riskClassification: perm.riskClassification as OperationRiskClassification,
        requiresApproval: true,
        reason: `Operation "${req.operationId}" is designated USER_ONLY and cannot be executed by autonomous agents`,
        errorCode: "USER_ONLY_BLOCKED",
      };
    }

    // 5. Agent Type filtering if invoked by an agent
    if (req.agentId) {
      let allowedAgentTypes: string[] = ["*"];
      try {
        allowedAgentTypes = JSON.parse(perm.allowedAgentTypesJson);
      } catch (err) {
        allowedAgentTypes = ["*"];
      }

      if (!allowedAgentTypes.includes("*")) {
        const agentType = req.agentType || "unknown";
        if (!allowedAgentTypes.includes(agentType) && !allowedAgentTypes.includes(req.agentId)) {
          return {
            authorized: false,
            permissionLevel: perm.permissionLevel as OperationPermissionLevel,
            riskClassification: perm.riskClassification as OperationRiskClassification,
            requiresApproval: perm.requiresApproval,
            reason: `Agent type "${agentType}" is not permitted to execute operation "${req.operationId}"`,
            errorCode: "AGENT_UNAUTHORIZED",
          };
        }
      }
    }

    // 6. Financial Authority Verification for RESTRICTED_EXECUTION or FINANCIAL operations
    const isFinancial =
      operationDef?.category === "FINANCIAL" ||
      perm.permissionLevel === "RESTRICTED_EXECUTION" ||
      (req.amountYocto && BigInt(req.amountYocto) > BigInt(0));

    if (isFinancial && req.agentId) {
      if (!req.mandateId) {
        return {
          authorized: false,
          permissionLevel: perm.permissionLevel as OperationPermissionLevel,
          riskClassification: perm.riskClassification as OperationRiskClassification,
          requiresApproval: true,
          reason: "Executing financial operation requires an active mandate",
          errorCode: "MANDATE_REQUIRED",
        };
      }

      const mandate = await prisma.mandate.findUnique({
        where: { id: req.mandateId },
      });

      if (!mandate || mandate.status !== "ACTIVE") {
        return {
          authorized: false,
          permissionLevel: perm.permissionLevel as OperationPermissionLevel,
          riskClassification: perm.riskClassification as OperationRiskClassification,
          requiresApproval: true,
          reason: `Associated mandate is not active (status: ${mandate?.status || "NOT_FOUND"})`,
          errorCode: "MANDATE_REQUIRED",
        };
      }

      // Check available budget if an amount is specified
      if (req.amountYocto) {
        const totalBudget = BigInt(mandate.totalBudgetYocto);
        const spent = BigInt(mandate.spentYocto);
        const reserved = BigInt(mandate.reservedYocto);
        const available = totalBudget - (spent + reserved);
        const requested = BigInt(req.amountYocto);

        if (available < requested) {
          return {
            authorized: false,
            permissionLevel: perm.permissionLevel as OperationPermissionLevel,
            riskClassification: perm.riskClassification as OperationRiskClassification,
            requiresApproval: true,
            reason: `Insufficient mandate budget: available ${available.toString()} yoctoNEAR, requested ${requested.toString()}`,
            errorCode: "INSUFFICIENT_FUNDS",
          };
        }
      }
    }

    // 7. Milestone 7 Governance: Centralized Policy Evaluation
    const govEval = await PolicyEngine.evaluate({
      userId: req.userId,
      agentId: req.agentId,
      agentType: req.agentType,
      operation: req.operationId,
      resource: connection.providerId || req.connectionId,
      mandateId: req.mandateId,
      amountYocto: req.amountYocto,
    });

    if (!govEval.allowed) {
      return {
        authorized: false,
        permissionLevel: perm.permissionLevel as OperationPermissionLevel,
        riskClassification: (govEval.riskLevel as OperationRiskClassification) || "HIGH",
        requiresApproval: govEval.requiresApproval,
        reason: `Governance Policy Blocked: ${govEval.humanExplanation}`,
        errorCode: "PERMISSION_DENIED",
      };
    }

    return {
      authorized: true,
      permissionLevel: perm.permissionLevel as OperationPermissionLevel,
      riskClassification: perm.riskClassification as OperationRiskClassification,
      requiresApproval: perm.requiresApproval || govEval.requiresApproval,
    };
  }

  /**
   * Records an auditable integration operation execution log.
   */
  public static async recordExecution(record: {
    connectionId: string;
    operationId: string;
    agentId?: string;
    status: "SUCCESS" | "FAILED" | "BLOCKED" | "TIMEOUT" | "RATE_LIMITED";
    durationMs: number;
    requestMetadata?: Record<string, any>;
    resultMetadata?: Record<string, any>;
    errorCode?: string;
    errorMessage?: string;
  }): Promise<string> {
    const executionId = crypto.randomUUID();
    await prisma.integrationOperationExecution.create({
      data: {
        executionId,
        connectionId: record.connectionId,
        operationId: record.operationId,
        agentId: record.agentId,
        status: record.status,
        durationMs: record.durationMs,
        requestMetadataJson: JSON.stringify(record.requestMetadata || {}),
        resultMetadataJson: record.resultMetadata ? JSON.stringify(record.resultMetadata) : null,
        errorCode: record.errorCode,
        errorMessage: record.errorMessage,
      },
    });
    return executionId;
  }

  /**
   * Executes an integration operation under strict financial control.
   * If the operation is financial (category === "FINANCIAL" or amountYocto > 0):
   * 1. Evaluates access permissions.
   * 2. Atomically reserves the required budget via reserveObjectiveBudgetAtomic using CAS optimistic locking.
   * 3. Executes the operation.
   * 4. On success: Atomically settles the reservation via settleMandateBudgetAtomic.
   * 5. On failure: Atomically releases the reservation via releaseMandateBudgetAtomic.
   */
  public static async executeWithFinancialAuthority<T>(params: {
    connectionId: string;
    operationId: string;
    userId: string;
    agentId?: string;
    agentType?: string;
    mandateId?: string;
    amountYocto?: string;
    operationDef?: IntegrationOperationDefinition;
    executor: () => Promise<T>;
  }): Promise<{
    success: boolean;
    data?: T;
    error?: string;
    errorCode?: string;
    reservationDetails?: {
      reservedYocto?: string;
      settledYocto?: string;
      releasedYocto?: string;
    };
  }> {
    const { connectionId, operationId, userId, agentId, agentType, mandateId, amountYocto, operationDef, executor } = params;
    const startTime = Date.now();

    // 1. Evaluate Permission Gates
    const accessCheck = await this.evaluateAccess(
      { connectionId, operationId, agentId, agentType, userId, mandateId, amountYocto },
      operationDef
    );

    if (!accessCheck.authorized) {
      await this.recordExecution({
        connectionId,
        operationId,
        agentId,
        status: "BLOCKED",
        durationMs: Date.now() - startTime,
        errorCode: accessCheck.errorCode,
        errorMessage: accessCheck.reason,
      });

      return {
        success: false,
        error: accessCheck.reason,
        errorCode: accessCheck.errorCode,
      };
    }

    const isFinancial =
      operationDef?.category === "FINANCIAL" ||
      accessCheck.permissionLevel === "RESTRICTED_EXECUTION" ||
      (amountYocto && BigInt(amountYocto) > BigInt(0));

    let reservationActive = false;

    // 2. Obtain Atomic Budget Reservation before execution
    if (isFinancial && mandateId && amountYocto && BigInt(amountYocto) > BigInt(0)) {
      const reservation = await reserveMandateBudgetAtomic({
        mandateId,
        amountYocto,
      });

      if (!reservation.success) {
        await this.recordExecution({
          connectionId,
          operationId,
          agentId,
          status: "BLOCKED",
          durationMs: Date.now() - startTime,
          errorCode: "INSUFFICIENT_FUNDS",
          errorMessage: reservation.reason || "Failed to obtain atomic budget reservation",
        });

        return {
          success: false,
          error: reservation.reason || "Failed to obtain atomic budget reservation",
          errorCode: "INSUFFICIENT_FUNDS",
        };
      }

      reservationActive = true;
    }

    // 3. Execute Operation
    try {
      const result = await executor();

      // 4. On Success: Settle reservation atomically
      if (reservationActive && mandateId && amountYocto) {
        await settleMandateBudgetAtomic({
          mandateId,
          amountYocto,
          wasReserved: true,
        });
      }

      await this.recordExecution({
        connectionId,
        operationId,
        agentId,
        status: "SUCCESS",
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        data: result,
        reservationDetails: reservationActive
          ? { settledYocto: amountYocto }
          : undefined,
      };
    } catch (err: any) {
      // 5. On Failure: Release reservation atomically
      if (reservationActive && mandateId && amountYocto) {
        await releaseMandateBudgetAtomic({
          mandateId,
          amountYocto,
        });
      }

      await this.recordExecution({
        connectionId,
        operationId,
        agentId,
        status: "FAILED",
        durationMs: Date.now() - startTime,
        errorCode: "EXECUTION_FAILED",
        errorMessage: err.message,
      });

      return {
        success: false,
        error: err.message,
        errorCode: "EXECUTION_FAILED",
        reservationDetails: reservationActive
          ? { releasedYocto: amountYocto }
          : undefined,
      };
    }
  }
}

