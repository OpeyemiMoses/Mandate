/**
 * Queue Backpressure & Overload Protection Service (Milestone 9.4)
 * Protects worker infrastructure from queue floods, guarantees financial job durability,
 * enforces per-tenant admission limits, and prioritizes recovery/security jobs.
 */

import { prisma } from "@/lib/db";
import { JobRegistry } from "@/lib/jobs/registry";

export interface BackpressureConfig {
  maxPendingQueueDepth: number; // e.g. 1000
  highWatermarkRatio: number;   // 0.8 (80%)
  maxTenantPendingJobs: number; // 50 per tenant
}

export const DEFAULT_BACKPRESSURE_CONFIG: BackpressureConfig = {
  maxPendingQueueDepth: 1000,
  highWatermarkRatio: 0.8,
  maxTenantPendingJobs: 50,
};

export type AdmissionState = "NORMAL" | "DEGRADED" | "SATURATED";

export interface BackpressureEvaluation {
  allowed: boolean;
  admissionState: AdmissionState;
  reason?: string;
  currentPendingDepth: number;
  tenantPendingCount: number;
}

export class BackpressureService {
  private static config: BackpressureConfig = { ...DEFAULT_BACKPRESSURE_CONFIG };

  public static configure(overrides: Partial<BackpressureConfig>): void {
    this.config = { ...this.config, ...overrides };
  }

  public static getConfig(): BackpressureConfig {
    return { ...this.config };
  }

  /**
   * Evaluates job admission against queue capacity and tenant quotas.
   * Invariant: Financial jobs are NEVER rejected due to backpressure (durability guarantee).
   */
  public static async evaluateAdmission(params: {
    tenantId: string;
    jobType: string;
    priority?: number;
  }): Promise<BackpressureEvaluation> {
    const jobDef = JobRegistry.get(params.jobType);
    const isFinancial = jobDef ? jobDef.isFinancial || jobDef.category === "FINANCIAL" : false;
    const priority = params.priority ?? 0;

    // INVARIANT 1: Financial jobs have an absolute durability guarantee.
    // They must never be dropped or rejected due to queue saturation.
    if (isFinancial) {
      return {
        allowed: true,
        admissionState: "NORMAL",
        reason: "FINANCIAL_DURABILITY_GUARANTEE: Financial operations are guaranteed queue admission",
        currentPendingDepth: 0,
        tenantPendingCount: 0,
      };
    }

    // INVARIANT 2: Critical recovery and security tasks bypass backpressure limits
    if (priority >= 100 || (jobDef && (jobDef.requiresRecovery || jobDef.category === "GOVERNANCE"))) {
      return {
        allowed: true,
        admissionState: "NORMAL",
        reason: "CRITICAL_PRIORITY_ADMISSION: High priority recovery task",
        currentPendingDepth: 0,
        tenantPendingCount: 0,
      };
    }

    // 1. Measure total pending queue depth
    const currentPendingDepth = await prisma.backgroundJob.count({
      where: { status: "PENDING" },
    });

    // 2. Measure tenant's active pending jobs
    const tenantPendingCount = await prisma.backgroundJob.count({
      where: {
        tenantId: params.tenantId,
        status: { in: ["PENDING", "CLAIMED"] },
      },
    });

    // Determine saturation state
    let admissionState: AdmissionState = "NORMAL";
    if (currentPendingDepth >= this.config.maxPendingQueueDepth) {
      admissionState = "SATURATED";
    } else if (currentPendingDepth >= this.config.maxPendingQueueDepth * this.config.highWatermarkRatio) {
      admissionState = "DEGRADED";
    }

    // 3. Global queue depth check
    if (admissionState === "SATURATED") {
      return {
        allowed: false,
        admissionState,
        reason: `QUEUE_SATURATED: Background job queue depth (${currentPendingDepth}) has reached capacity limit (${this.config.maxPendingQueueDepth})`,
        currentPendingDepth,
        tenantPendingCount,
      };
    }

    // 4. Per-tenant quota check
    if (tenantPendingCount >= this.config.maxTenantPendingJobs) {
      return {
        allowed: false,
        admissionState,
        reason: `TENANT_LIMIT_EXCEEDED: Tenant ${params.tenantId} has reached maximum pending jobs limit (${tenantPendingCount}/${this.config.maxTenantPendingJobs})`,
        currentPendingDepth,
        tenantPendingCount,
      };
    }

    return {
      allowed: true,
      admissionState,
      currentPendingDepth,
      tenantPendingCount,
    };
  }

  /**
   * Asserts admission; throws an error if queue backpressure rejects the job.
   */
  public static async assertAdmission(params: {
    tenantId: string;
    jobType: string;
    priority?: number;
  }): Promise<void> {
    const evalResult = await this.evaluateAdmission(params);
    if (!evalResult.allowed) {
      throw new Error(`BACKPRESSURE_REJECTED: ${evalResult.reason}`);
    }
  }

  /**
   * Returns current queue telemetry and saturation status.
   */
  public static async getStatus(): Promise<{
    config: BackpressureConfig;
    admissionState: AdmissionState;
    pendingQueueDepth: number;
    runningQueueDepth: number;
    saturationPercentage: number;
  }> {
    const pendingQueueDepth = await prisma.backgroundJob.count({
      where: { status: "PENDING" },
    });
    const runningQueueDepth = await prisma.backgroundJob.count({
      where: { status: "CLAIMED" },
    });

    const saturationPercentage = Math.min(
      100,
      Math.round((pendingQueueDepth / this.config.maxPendingQueueDepth) * 100)
    );

    let admissionState: AdmissionState = "NORMAL";
    if (pendingQueueDepth >= this.config.maxPendingQueueDepth) {
      admissionState = "SATURATED";
    } else if (pendingQueueDepth >= this.config.maxPendingQueueDepth * this.config.highWatermarkRatio) {
      admissionState = "DEGRADED";
    }

    return {
      config: this.getConfig(),
      admissionState,
      pendingQueueDepth,
      runningQueueDepth,
      saturationPercentage,
    };
  }
}
