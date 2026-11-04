/**
 * Mandate Universal Job Registry
 * Milestone 9.1 - Explicit Job Definition Allowlisting & Payload Validation
 */

import { JobDefinition, DEFAULT_RETRY_POLICY } from "./types";
import { ExecutionBoundaryService } from "@/lib/execution/boundaryService";
import { ReconciliationService } from "@/lib/reconciliation/reconciliationService";
import { IncidentDetectionService } from "@/lib/incidents/incidentDetectionService";
import { IncidentEscalationService } from "@/lib/incidents/incidentEscalationService";
import { RecoveryExecutor } from "@/lib/recovery/recoveryExecutor";
import { RecoveryVerificationService } from "@/lib/recovery/recoveryVerificationService";

class JobRegistryImpl {
  private definitions: Map<string, JobDefinition> = new Map();

  constructor() {
    this.registerBuiltinJobs();
  }

  public register(definition: JobDefinition): void {
    if (this.definitions.has(definition.jobType)) {
      // Overwrite or preserve definition
    }
    this.definitions.set(definition.jobType, definition);
  }

  public get(jobType: string): JobDefinition | undefined {
    return this.definitions.get(jobType);
  }

  public has(jobType: string): boolean {
    return this.definitions.has(jobType);
  }

  public list(): JobDefinition[] {
    return Array.from(this.definitions.values());
  }

  public validatePayload(jobType: string, payload: any): { valid: boolean; error?: string } {
    const def = this.get(jobType);
    if (!def) {
      return {
        valid: false,
        error: `Unrecognized job type "${jobType}". Execution of unregistered job types is prohibited.`,
      };
    }
    return def.schema(payload);
  }

  private registerBuiltinJobs(): void {
    // 1. Mandate Disbursement Job (FINANCIAL)
    this.register({
      jobType: "MANDATE_DISBURSEMENT",
      category: "FINANCIAL",
      requiredCapability: "financial_execution",
      timeoutMs: 30000,
      isFinancial: true,
      requiresApproval: true,
      requiresRecovery: true,
      retryPolicy: {
        maxAttempts: 3,
        initialBackoffMs: 15000,
        backoffMultiplier: 2,
        maxBackoffMs: 120000,
        jitter: true,
      },
      schema: (payload: any) => {
        if (!payload || typeof payload !== "object") {
          return { valid: false, error: "Payload must be a non-empty object" };
        }
        if (!payload.mandateId || typeof payload.mandateId !== "string") {
          return { valid: false, error: "mandateId is required and must be a string" };
        }
        if (!payload.recipient || typeof payload.recipient !== "string") {
          return { valid: false, error: "recipient is required and must be a string" };
        }
        if (!payload.amountYocto || typeof payload.amountYocto !== "string") {
          return { valid: false, error: "amountYocto is required and must be an integer string" };
        }
        return { valid: true };
      },
      handler: async (ctx) => {
        const { mandateId, recipient, amountYocto, purpose, agentId, approvalId, isSimulated } = ctx.payload;
        
        try {
          // Pre-execution fencing check: Verify worker still holds active lease before financial side effect
          if (ctx.verifyOwnership) {
            const isLeaseActive = await ctx.verifyOwnership();
            if (!isLeaseActive) {
              return {
                success: false,
                error: "STALE_LEASE_REJECTED: Worker lost lease before financial execution boundary",
                retryable: false,
              };
            }
          }

          // Execute through Authoritative Execution Boundary (Milestone 8 & Milestone 9.5 Stage 5)
          // Invariant: Tenant identity is bound immutably from ctx.job.tenantId (ignoring any payload override)
          // Invariant: Stable idempotency identity across retries (ctx.job.idempotencyKey || `job_tx_${ctx.job.id}`)
          // Invariant: Monotonic fencing generation passed to enforce boundary check right before dispatch
          const execResult = await ExecutionBoundaryService.execute({
            userId: ctx.job.tenantId,
            mandateId,
            agentId: agentId || undefined,
            recipient,
            amountYocto,
            operation: "TRANSFER",
            parameters: { purpose: purpose || `Background disbursement job ${ctx.job.id}` },
            idempotencyKey: ctx.job.idempotencyKey || `job_tx_${ctx.job.id}`,
            approvalId: approvalId || undefined,
            isSimulated: isSimulated ?? false,
            jobId: ctx.job.id,
            leaseGeneration: ctx.leaseGeneration,
          });

          if (execResult.success) {
            return {
              success: true,
              txHash: execResult.txHash,
              result: execResult,
            };
          }

          // Check if ambiguous post-broadcast failure requiring recovery
          if (execResult.status === "REQUIRES_RECOVERY" || execResult.recoveryStatus === "PENDING_RECOVERY") {
            return {
              success: false,
              error: execResult.error || "Ambiguous execution state requiring recovery",
              requiresRecovery: true,
              retryable: false, // Never blindly retry ambiguous transactions!
            };
          }

          return {
            success: false,
            error: execResult.error || "Execution failed",
            retryable: false, // Governance or threshold rejections are non-retryable
          };
        } catch (execErr: any) {
          return {
            success: false,
            error: execErr.message || "Execution Boundary Error",
            retryable: false,
          };
        }
      },
    });

    // 2. Integration Synchronization Job
    this.register({
      jobType: "INTEGRATION_SYNC",
      category: "INTEGRATION",
      requiredCapability: "integration_sync",
      timeoutMs: 20000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: DEFAULT_RETRY_POLICY,
      schema: (payload: any) => {
        if (!payload || !payload.integrationId) {
          return { valid: false, error: "integrationId is required" };
        }
        return { valid: true };
      },
      handler: async (ctx) => {
        await ctx.heartbeat();
        return {
          success: true,
          result: {
            syncedAt: new Date().toISOString(),
            integrationId: ctx.payload.integrationId,
            status: "SYNCHRONIZED",
          },
        };
      },
    });

    // 3. Governance Policy Re-evaluation Job
    this.register({
      jobType: "POLICY_REEVALUATION",
      category: "GOVERNANCE",
      requiredCapability: "governance_evaluation",
      timeoutMs: 15000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: DEFAULT_RETRY_POLICY,
      schema: (payload: any) => {
        return { valid: true };
      },
      handler: async (ctx) => {
        await ctx.heartbeat();
        return {
          success: true,
          result: { reevaluated: true, timestamp: new Date().toISOString() },
        };
      },
    });

    // 4. Coordination Task Execution Job
    this.register({
      jobType: "COORDINATION_TASK_EXECUTE",
      category: "COORDINATION",
      requiredCapability: "coordination_execution",
      timeoutMs: 45000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: DEFAULT_RETRY_POLICY,
      schema: (payload: any) => {
        if (!payload || !payload.runId || !payload.taskId) {
          return { valid: false, error: "runId and taskId are required" };
        }
        return { valid: true };
      },
      handler: async (ctx) => {
        await ctx.heartbeat();
        return {
          success: true,
          result: { runId: ctx.payload.runId, taskId: ctx.payload.taskId, processed: true },
        };
      },
    });

    // 4.1 Objective Plan Task Execution Job (Milestone 13.5)
    this.register({
      jobType: "OBJECTIVE_TASK_EXECUTE",
      category: "COORDINATION",
      requiredCapability: "objective_task_execution",
      timeoutMs: 60000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: {
        maxAttempts: 3,
        initialBackoffMs: 2000,
        backoffMultiplier: 2,
        maxBackoffMs: 10000,
        jitter: false,
      },
      schema: (payload: any) => {
        if (!payload || !payload.objectiveId || !payload.planId || !payload.stepId || !payload.userId) {
          return { valid: false, error: "objectiveId, planId, stepId, and userId are required" };
        }
        return { valid: true };
      },
      handler: async (ctx) => {
        await ctx.heartbeat();
        const { AgentDispatchService } = await import("@/lib/orchestration/dispatchService");
        const res = await AgentDispatchService.dispatchTask({
          objectiveId: ctx.payload.objectiveId,
          planId: ctx.payload.planId,
          stepId: ctx.payload.stepId,
          userId: ctx.payload.userId,
          idempotencyKey: ctx.job.idempotencyKey || `obj_task_${ctx.payload.stepId}_${ctx.job.id}`,
        });

        if (!res.success) {
          return {
            success: false,
            error: res.error || "Task execution failed",
            retryable: true,
          };
        }

        return {
          success: true,
          result: res,
        };
      },
    });

    // 4.2 Objective Multi-Agent Orchestration Round Job (Milestone 13.5)
    this.register({
      jobType: "OBJECTIVE_ORCHESTRATE",
      category: "COORDINATION",
      requiredCapability: "objective_orchestration",
      timeoutMs: 120000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: {
        maxAttempts: 2,
        initialBackoffMs: 3000,
        backoffMultiplier: 2,
        maxBackoffMs: 15000,
        jitter: false,
      },
      schema: (payload: any) => {
        if (!payload || !payload.objectiveId || !payload.userId) {
          return { valid: false, error: "objectiveId and userId are required" };
        }
        return { valid: true };
      },
      handler: async (ctx) => {
        await ctx.heartbeat();
        const { ObjectiveOrchestrationService } = await import("@/lib/orchestration/orchestrationService");
        const res = await ObjectiveOrchestrationService.orchestrate({
          objectiveId: ctx.payload.objectiveId,
          userId: ctx.payload.userId,
          maxIterations: ctx.payload.maxIterations || 10,
        });

        return {
          success: true,
          result: res,
        };
      },
    });

    // 5. System Health Check Diagnostic Job
    this.register({
      jobType: "SYSTEM_HEALTH_CHECK",
      category: "GENERAL",
      requiredCapability: "system_diagnostic",
      timeoutMs: 5000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: {
        maxAttempts: 2,
        initialBackoffMs: 2000,
        backoffMultiplier: 1.5,
        maxBackoffMs: 5000,
        jitter: false,
      },
      schema: (payload: any) => {
        if (!payload || typeof payload !== "object") {
          return { valid: false, error: "Payload must be an object" };
        }
        return { valid: true };
      },
      handler: async (ctx) => {
        await ctx.heartbeat();
        return {
          success: true,
          result: {
            echo: ctx.payload.ping || "pong",
            workerId: ctx.workerId,
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // 6. Automated Reconciliation Run Job (Milestone 9.3)
    this.register({
      jobType: "RECONCILIATION_RUN",
      category: "GENERAL",
      requiredCapability: "reconciliation",
      timeoutMs: 60000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: DEFAULT_RETRY_POLICY,
      schema: (payload: any) => {
        return { valid: true };
      },
      handler: async (ctx) => {
        await ctx.heartbeat();
        const result = await ReconciliationService.executeRun(ctx.payload?.options);
        return {
          success: result.status === "COMPLETED",
          result: {
            runId: result.runId,
            totalEvaluated: result.totalEvaluated,
            matchedCount: result.matchedCount,
            mismatchCount: result.mismatchCount,
            ambiguousCount: result.ambiguousCount,
            findingsCount: result.findingsCount,
          },
        };
      },
    });

    // 7. Incident Escalation Sweep Job (Milestone 9.3)
    this.register({
      jobType: "INCIDENT_ESCALATION",
      category: "GENERAL",
      requiredCapability: "incident_management",
      timeoutMs: 30000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: DEFAULT_RETRY_POLICY,
      schema: (payload: any) => {
        return { valid: true };
      },
      handler: async (ctx) => {
        await ctx.heartbeat();
        const result = await IncidentEscalationService.evaluateAndEscalateOpenIncidents();
        return {
          success: true,
          result,
        };
      },
    });

    // 8. Recovery Execution Job (Milestone 9.3)
    this.register({
      jobType: "RECOVERY_EXECUTION",
      category: "GENERAL",
      requiredCapability: "recovery_orchestration",
      timeoutMs: 45000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: true,
      retryPolicy: DEFAULT_RETRY_POLICY,
      schema: (payload: any) => {
        if (!payload || !payload.planId) {
          return { valid: false, error: "planId is required" };
        }
        return { valid: true };
      },
      handler: async (ctx) => {
        await ctx.heartbeat();
        const result = await RecoveryExecutor.executePlan({
          planId: ctx.payload.planId,
          executedBy: ctx.payload.executedBy || `WORKER_${ctx.workerId}`,
          dryRun: ctx.payload.dryRun,
        });
        return {
          success: result.status === "EXECUTED",
          result,
        };
      },
    });

    // 9. Deterministic Stage 4 Test Jobs
    this.register({
      jobType: "TEST_ECHO_JOB",
      category: "GENERAL",
      requiredCapability: "TEST_ECHO_JOB",
      timeoutMs: 10000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: DEFAULT_RETRY_POLICY,
      schema: () => ({ valid: true }),
      handler: async (ctx) => ({ success: true, result: ctx.payload }),
    });

    this.register({
      jobType: "TEST_SLEEP_JOB",
      category: "GENERAL",
      requiredCapability: "TEST_SLEEP_JOB",
      timeoutMs: 30000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: DEFAULT_RETRY_POLICY,
      schema: () => ({ valid: true }),
      handler: async (ctx) => {
        const duration = ctx.payload?.durationMs || 3000;
        if (process.send) {
          process.send({
            type: "TEST_SLEEP_JOB_STARTED",
            jobId: ctx.job.id,
            workerId: ctx.workerId,
            pid: process.pid,
            durationMs: duration,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, duration));
        return { success: true, result: { duration } };
      },
    });

    this.register({
      jobType: "TEST_CRASH_ON_RUN_JOB",
      category: "GENERAL",
      requiredCapability: "TEST_CRASH_ON_RUN_JOB",
      timeoutMs: 10000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: DEFAULT_RETRY_POLICY,
      schema: () => ({ valid: true }),
      handler: async (ctx) => {
        if (process.send) {
          process.send({
            type: "TEST_SCENARIO_MID_EXECUTION_CRASH",
            jobId: ctx.job.id,
            workerId: ctx.workerId,
            pid: process.pid,
          });
        }
        process.exit(137);
      },
    });

    this.register({
      jobType: "TEST_POST_PROVIDER_CRASH_JOB",
      category: "FINANCIAL",
      requiredCapability: "TEST_POST_PROVIDER_CRASH_JOB",
      timeoutMs: 10000,
      isFinancial: true,
      requiresApproval: false,
      requiresRecovery: true,
      retryPolicy: { maxAttempts: 1, initialBackoffMs: 1000, backoffMultiplier: 2, maxBackoffMs: 5000, jitter: false },
      schema: () => ({ valid: true }),
      handler: async (ctx) => {
        const mockTxHash = `mock_tx_${Date.now()}`;
        if (process.send) {
          process.send({
            type: "TEST_SCENARIO_POST_PROVIDER_CRASH",
            jobId: ctx.job.id,
            workerId: ctx.workerId,
            pid: process.pid,
            mockTxHash,
          });
        }
        process.exit(137);
      },
    });

    this.register({
      jobType: "TEST_CONCURRENT_LOCK_JOB",
      category: "GENERAL",
      requiredCapability: "TEST_CONCURRENT_LOCK_JOB",
      timeoutMs: 30000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: DEFAULT_RETRY_POLICY,
      schema: () => ({ valid: true }),
      handler: async () => ({ success: true }),
    });

    this.register({
      jobType: "TEST_STALE_RECLAIM_JOB",
      category: "GENERAL",
      requiredCapability: "TEST_STALE_RECLAIM_JOB",
      timeoutMs: 30000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: DEFAULT_RETRY_POLICY,
      schema: () => ({ valid: true }),
      handler: async () => ({ success: true }),
    });

    this.register({
      jobType: "TEST_RESTART_JOB",
      category: "GENERAL",
      requiredCapability: "TEST_RESTART_JOB",
      timeoutMs: 30000,
      isFinancial: false,
      requiresApproval: false,
      requiresRecovery: false,
      retryPolicy: DEFAULT_RETRY_POLICY,
      schema: () => ({ valid: true }),
      handler: async () => ({ success: true }),
    });
  }
}

export const JobRegistry = new JobRegistryImpl();
