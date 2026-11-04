import crypto from "crypto";
import { prisma } from "@/lib/db";
import { toolRegistry } from "./registry";
import {
  ToolInvocationParams,
  ToolExecutionResult,
  RiskClassification,
} from "./types";
import { verifyAgentToolPermission } from "./access";
import { getActiveConnectionWithCredentials } from "./connections";
import { redactSensitiveData } from "./security";
import { internalAdapter } from "./adapters/internalAdapter";
import { restAdapter } from "./adapters/restAdapter";
import { mcpAdapter } from "./adapters/mcpAdapter";
import { emitRuntimeEvent } from "@/lib/runtime/events";
import { recordAuditEvent } from "@/lib/auditLedger";
import { toolInvocationCounter } from "@/lib/observability";
import { PolicyEngine } from "@/lib/governance";
import { ExecutionGateService } from "@/lib/operations/executionGateService";

// In-memory rate-limiter tracker: toolId:userId -> timestamps[]
const rateLimitMap = new Map<string, number[]>();

export class ToolExecutor {
  /**
   * Reset in-memory rate limits (used during test harnesses and administrative resets)
   */
  public static resetRateLimits(): void {
    rateLimitMap.clear();
  }

  /**
   * Main entrypoint for executing any registered tool operation
   */
  public async execute(params: ToolInvocationParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    // 0. OPERATIONAL CONTROL PLANE CHECK (Milestone 9.4)
    // Fail-closed gate: halts execution immediately if agent executions are paused or in lockdown
    const gateCheck = await ExecutionGateService.checkAgentExecutionAllowed();
    if (!gateCheck.allowed) {
      return {
        success: false,
        invocationId: params.invocationId || `inv-${Date.now()}`,
        toolId: params.toolId,
        operation: params.operation,
        permissionDecision: "BLOCKED",
        error: `OPERATIONAL_CONTROL_BLOCKED: Tool execution halted (${gateCheck.mode}). ${gateCheck.reason}`,
        durationMs: Date.now() - startTime,
      };
    }

    const invocationId = params.invocationId || `inv-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const {
      agentId,
      userId,
      executionId,
      toolId,
      operation: operationId,
      params: rawParams,
      connectionId,
      idempotencyKey,
      signal,
    } = params;

    // 1. Idempotency Check (if key provided and already executed successfully)
    if (idempotencyKey) {
      const existing = await prisma.toolInvocation.findFirst({
        where: {
          agentId,
          toolId,
          operation: operationId,
          idempotencyKey,
          status: "SUCCESS",
        },
      });
      if (existing && existing.outputJson) {
        let cachedData: any = {};
        try {
          cachedData = JSON.parse(existing.outputJson);
        } catch {}
        return {
          success: true,
          invocationId: existing.invocationId,
          toolId,
          operation: operationId,
          data: cachedData,
          durationMs: existing.durationMs,
          cached: true,
        };
      }
    }

    // Emit invocation requested
    await emitRuntimeEvent({
      executionId: executionId || `exec-${agentId}`,
      agentId,
      userId,
      eventType: "tool.invocation_requested",
      metadata: {
        invocationId,
        toolId,
        operation: operationId,
        hasIdempotencyKey: Boolean(idempotencyKey),
      },
    });

    // 2. Permission & Access Verification
    const permCheck = await verifyAgentToolPermission({
      agentId,
      userId,
      toolId,
      operationId,
    });

    if (!permCheck.allowed || !permCheck.tool) {
      const errorMsg = permCheck.reason || "Tool permission denied";

      await this.persistInvocationRecord({
        invocationId,
        executionId,
        agentId,
        userId,
        connectionId,
        toolId,
        toolVersion: permCheck.tool?.version || "1.0.0",
        operation: operationId,
        permissionLevel: "READ",
        riskClassification: "LOW",
        status: "BLOCKED",
        durationMs: Date.now() - startTime,
        inputJson: JSON.stringify(redactSensitiveData(rawParams)),
        outputJson: null,
        errorDetails: errorMsg,
        idempotencyKey,
      });

      await emitRuntimeEvent({
        executionId: executionId || `exec-${agentId}`,
        agentId,
        userId,
        eventType: "tool.invocation_blocked",
        metadata: { invocationId, toolId, operation: operationId, reason: errorMsg },
      });

      return {
        success: false,
        invocationId,
        toolId,
        operation: operationId,
        error: errorMsg,
        durationMs: Date.now() - startTime,
        permissionDecision: "BLOCKED",
      };
    }

    const tool = permCheck.tool;
    const operation = tool.operations[operationId];

    // 2.5 Milestone 7 Governance: Centralized Policy Evaluation
    const govEval = await PolicyEngine.evaluate({
      userId,
      agentId,
      toolId,
      operation: operationId,
      parameters: rawParams,
      recipient: typeof rawParams?.recipient === "string" ? rawParams.recipient : undefined,
      amountYocto: typeof rawParams?.amountYocto === "string" ? rawParams.amountYocto : undefined,
      idempotencyKey,
    });

    if (!govEval.allowed) {
      const errorMsg = `Governance Policy Blocked: ${govEval.humanExplanation}`;
      await this.persistInvocationRecord({
        invocationId,
        executionId,
        agentId,
        userId,
        connectionId,
        toolId,
        toolVersion: tool.version,
        operation: operationId,
        permissionLevel: operation.requiredPermission,
        riskClassification: (govEval.riskLevel as RiskClassification) || "HIGH",
        status: "BLOCKED",
        durationMs: Date.now() - startTime,
        inputJson: JSON.stringify(redactSensitiveData(rawParams)),
        outputJson: null,
        errorDetails: errorMsg,
        idempotencyKey,
      });

      await emitRuntimeEvent({
        executionId: executionId || `exec-${agentId}`,
        agentId,
        userId,
        eventType: "tool.invocation_blocked",
        metadata: { invocationId, toolId, operation: operationId, reason: errorMsg },
      });

      return {
        success: false,
        invocationId,
        toolId,
        operation: operationId,
        error: errorMsg,
        durationMs: Date.now() - startTime,
        permissionDecision: "BLOCKED",
      };
    }

    await emitRuntimeEvent({
      executionId: executionId || `exec-${agentId}`,
      agentId,
      userId,
      eventType: "tool.permission_checked",
      metadata: {
        invocationId,
        toolId,
        operation: operationId,
        permissionLevel: operation.requiredPermission,
        riskClassification: operation.riskClassification,
      },
    });

    // 3. Input Schema Validation
    let validatedInput: any;
    try {
      validatedInput = operation.inputSchema.parse(rawParams);
    } catch (valErr: any) {
      const errorMsg = `Invalid input for ${toolId}.${operationId}: ${valErr.message}`;

      await this.persistInvocationRecord({
        invocationId,
        executionId,
        agentId,
        userId,
        connectionId,
        toolId,
        toolVersion: tool.version,
        operation: operationId,
        permissionLevel: operation.requiredPermission,
        riskClassification: operation.riskClassification,
        status: "FAILED",
        durationMs: Date.now() - startTime,
        inputJson: JSON.stringify(redactSensitiveData(rawParams)),
        outputJson: null,
        errorDetails: errorMsg,
        idempotencyKey,
      });

      return {
        success: false,
        invocationId,
        toolId,
        operation: operationId,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }

    // 4. Rate Limiting Check
    const rateLimitKey = `${toolId}:${userId}`;
    const now = Date.now();
    const timestamps = rateLimitMap.get(rateLimitKey) || [];
    const windowStart = now - 60000;
    const recent = timestamps.filter((t) => t > windowStart);
    if (recent.length >= tool.rateLimits.maxRequestsPerMinute) {
      const errorMsg = `Rate limit exceeded for tool "${toolId}" (${tool.rateLimits.maxRequestsPerMinute} req/min)`;
      return {
        success: false,
        invocationId,
        toolId,
        operation: operationId,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }
    recent.push(now);
    rateLimitMap.set(rateLimitKey, recent);

    // 5. User Integration Connection Resolution (if required)
    let connectionConfig: Record<string, any> | undefined;
    let credentials: Record<string, any> | undefined;

    if (tool.authenticationRequirements !== "NONE") {
      let activeConnId = connectionId;
      if (!activeConnId) {
        // Find user's active connection for this provider
        const userConn = await prisma.integrationConnection.findFirst({
          where: { userId, providerId: tool.ownerOrProvider, status: "ACTIVE" },
        });
        activeConnId = userConn?.id;
      }

      if (!activeConnId) {
        const errorMsg = `Tool "${tool.id}" requires an active user integration connection for provider "${tool.ownerOrProvider}"`;
        return {
          success: false,
          invocationId,
          toolId,
          operation: operationId,
          error: errorMsg,
          durationMs: Date.now() - startTime,
        };
      }

      try {
        const connData = await getActiveConnectionWithCredentials(activeConnId, userId);
        connectionConfig = connData.config;
        credentials = connData.credentials;
      } catch (connErr: any) {
        return {
          success: false,
          invocationId,
          toolId,
          operation: operationId,
          error: `Connection authorization failed: ${connErr.message}`,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // 6. Execution via Adapter with Retry Rules
    await emitRuntimeEvent({
      executionId: executionId || `exec-${agentId}`,
      agentId,
      userId,
      eventType: "tool.invocation_started",
      metadata: { invocationId, toolId, operation: operationId },
    });

    const maxRetries = operation.idempotent ? (tool.retryPolicy.maxRetries || 0) : 0;
    let attempt = 0;
    let lastError: any = null;
    let resultData: any = null;

    while (attempt <= maxRetries) {
      try {
        attempt++;
        const adapter = this.resolveAdapter(tool.executionType);
        resultData = await adapter.execute(tool, operation, validatedInput, {
          agentId,
          userId,
          executionId,
          invocationId,
          connectionConfig,
          credentials,
          signal,
        });

        // 7. Validate Output Schema if defined
        if (operation.outputSchema) {
          resultData = operation.outputSchema.parse(resultData);
        }
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        if (attempt <= maxRetries && operation.idempotent) {
          await new Promise((resolve) =>
            setTimeout(resolve, tool.retryPolicy.backoffMs * attempt)
          );
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const isSuccess = lastError === null;

    // 8. Record Health in Registry and Emit Telemetry Metric
    toolRegistry.recordHealth(tool.id, isSuccess, durationMs, lastError?.message);
    try {
      toolInvocationCounter.add(1, {
        toolName: tool.id,
        status: isSuccess ? "SUCCESS" : "FAILED",
      });
    } catch {
      // Telemetry error cannot fail execution
    }

    // 9. Persist Invocation Record with Redacted Metadata
    await this.persistInvocationRecord({
      invocationId,
      executionId,
      agentId,
      userId,
      connectionId,
      toolId,
      toolVersion: tool.version,
      operation: operationId,
      permissionLevel: operation.requiredPermission,
      riskClassification: operation.riskClassification,
      status: isSuccess ? "SUCCESS" : "FAILED",
      durationMs,
      inputJson: JSON.stringify(redactSensitiveData(validatedInput)),
      outputJson: isSuccess ? JSON.stringify(redactSensitiveData(resultData)) : null,
      errorDetails: lastError?.message || null,
      idempotencyKey,
    });

    // 10. Audit Ledger Integration for Significant / High-Risk Operations
    if (
      operation.riskClassification === "HIGH" ||
      operation.riskClassification === "CRITICAL" ||
      !isSuccess
    ) {
      await recordAuditEvent({
        userId,
        eventType: isSuccess ? "TOOL_EXECUTION_COMPLETED" : "TOOL_EXECUTION_FAILED",
        verdict: isSuccess ? "SUCCESS" : "FAILED",
        reasonCode: lastError?.message ? "TOOL_ERROR" : undefined,
        description: `Agent executed tool ${tool.id}.${operationId} (${operation.riskClassification} risk)`,
        details: {
          invocationId,
          toolId: tool.id,
          operation: operationId,
          durationMs,
          risk: operation.riskClassification,
        },
        agentId,
      });
    }

    await emitRuntimeEvent({
      executionId: executionId || `exec-${agentId}`,
      agentId,
      userId,
      eventType: isSuccess ? "tool.invocation_completed" : "tool.invocation_failed",
      metadata: {
        invocationId,
        toolId,
        operation: operationId,
        durationMs,
        error: lastError?.message,
      },
    });

    return {
      success: isSuccess,
      invocationId,
      toolId,
      operation: operationId,
      data: resultData,
      error: lastError?.message,
      durationMs,
      riskClassification: operation.riskClassification,
    };
  }

  private resolveAdapter(executionType: string) {
    switch (executionType) {
      case "INTERNAL":
        return internalAdapter;
      case "REST":
        return restAdapter;
      case "MCP":
        return mcpAdapter;
      default:
        throw new Error(`Unsupported execution type "${executionType}"`);
    }
  }

  private async persistInvocationRecord(data: {
    invocationId: string;
    executionId?: string;
    agentId: string;
    userId: string;
    connectionId?: string;
    toolId: string;
    toolVersion: string;
    operation: string;
    permissionLevel: string;
    riskClassification: string;
    status: string;
    durationMs: number;
    inputJson: string;
    outputJson: string | null;
    errorDetails: string | null;
    idempotencyKey?: string;
  }) {
    try {
      await prisma.toolInvocation.create({
        data: {
          invocationId: data.invocationId,
          executionId: data.executionId || null,
          agentId: data.agentId,
          userId: data.userId,
          connectionId: data.connectionId || null,
          toolId: data.toolId,
          toolVersion: data.toolVersion,
          operation: data.operation,
          permissionLevel: data.permissionLevel,
          riskClassification: data.riskClassification,
          status: data.status,
          durationMs: data.durationMs,
          inputJson: data.inputJson,
          outputJson: data.outputJson,
          errorDetails: data.errorDetails,
          idempotencyKey: data.idempotencyKey || null,
        },
      });
    } catch (err: any) {
      console.error("Failed to persist ToolInvocation record:", err);
    }
  }
}

export const toolExecutor = new ToolExecutor();

