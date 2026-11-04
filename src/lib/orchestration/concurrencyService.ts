/**
 * MANDATE — Milestone 13.6: Multi-Tenant Concurrency & Quota Service
 * 
 * Enforces per-tenant objective concurrency quotas, per-agent workload limits,
 * provider rate-limit coordination, and duplicate orchestration prevention.
 */

import { prisma } from "@/lib/db";

export interface TenantQuotaOptions {
  maxConcurrentObjectives?: number;
  maxConcurrentTasks?: number;
}

export interface AgentWorkloadOptions {
  maxConcurrentTasks?: number;
}

export class ConcurrencyControlService {
  // In-memory orchestration locks for anti-race conditions
  private static activeOrchestrations: Map<
    string,
    { workerId: string; acquiredAt: Date; expiresAt: Date }
  > = new Map();

  /**
   * Asserts that a tenant has not exceeded their active running objective quota.
   */
  public static async assertTenantQuota(
    userId: string,
    options: TenantQuotaOptions = {}
  ): Promise<{ runningObjectivesCount: number; maxAllowed: number }> {
    const maxAllowed = options.maxConcurrentObjectives ?? 5;

    const runningCount = await prisma.objective.count({
      where: {
        userId,
        status: "RUNNING",
      },
    });

    if (runningCount >= maxAllowed) {
      throw new Error(
        `TENANT_CONCURRENCY_EXCEEDED: Tenant "${userId}" has reached the maximum concurrent running objectives quota (${runningCount}/${maxAllowed}).`
      );
    }

    return { runningObjectivesCount: runningCount, maxAllowed };
  }

  /**
   * Asserts that an agent has available execution capacity.
   */
  public static async checkAgentWorkload(
    agentId: string,
    options: AgentWorkloadOptions = {}
  ): Promise<{ isAvailable: boolean; activeTaskCount: number; maxAllowed: number; reason?: string }> {
    const maxAllowed = options.maxConcurrentTasks ?? 3;

    // Count active assignments for this agent where status is ACTIVE
    const activeAssignments = await prisma.agentAssignment.count({
      where: {
        agentId,
        status: { in: ["ACTIVE", "ASSIGNED"] },
        task: {
          status: "RUNNING",
        },
      },
    });

    if (activeAssignments >= maxAllowed) {
      return {
        isAvailable: false,
        activeTaskCount: activeAssignments,
        maxAllowed,
        reason: `AGENT_CAPACITY_EXHAUSTED: Agent "${agentId}" has ${activeAssignments} active tasks (max: ${maxAllowed}).`,
      };
    }

    return {
      isAvailable: true,
      activeTaskCount: activeAssignments,
      maxAllowed,
    };
  }

  /**
   * Acquires a mutual exclusion lock on an objective to prevent duplicate orchestration rounds.
   */
  public static async acquireOrchestrationLock(
    objectiveId: string,
    workerId: string,
    ttlSeconds: number = 60
  ): Promise<{ acquired: boolean; lockOwner?: string; expiresAt?: Date }> {
    const now = new Date();
    const existing = this.activeOrchestrations.get(objectiveId);

    if (existing && existing.expiresAt > now && existing.workerId !== workerId) {
      return {
        acquired: false,
        lockOwner: existing.workerId,
        expiresAt: existing.expiresAt,
      };
    }

    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    this.activeOrchestrations.set(objectiveId, {
      workerId,
      acquiredAt: now,
      expiresAt,
    });

    return { acquired: true, lockOwner: workerId, expiresAt };
  }

  /**
   * Releases an objective orchestration lock.
   */
  public static async releaseOrchestrationLock(objectiveId: string, workerId: string): Promise<boolean> {
    const existing = this.activeOrchestrations.get(objectiveId);
    if (!existing || existing.workerId === workerId) {
      this.activeOrchestrations.delete(objectiveId);
      return true;
    }
    return false;
  }

  /**
   * Cleans expired orchestration locks.
   */
  public static pruneExpiredLocks(): number {
    const now = new Date();
    let pruned = 0;
    for (const [key, lock] of this.activeOrchestrations.entries()) {
      if (lock.expiresAt <= now) {
        this.activeOrchestrations.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}

