/**
 * MANDATE — Tenant Access & Ownership Enforcement Service
 * Milestone 9.5: Final Production Certification
 * 
 * Enforces strict multi-tenant boundary isolation.
 * Prevents Insecure Direct Object References (IDOR) across all domain entities.
 */

import { prisma } from "@/lib/db";
import { AuthContext, ForbiddenError, NotFoundError } from "./authenticateRequest";

export class TenantAccessService {
  /**
   * Asserts that a resource is owned by the authenticated tenant.
   * Throws NotFoundError to prevent leaking resource existence to attackers.
   */
  public static assertOwnership(
    resource: { userId: string } | null | undefined,
    context: AuthContext,
    resourceName = "Resource"
  ): void {
    if (!resource) {
      throw new NotFoundError(`${resourceName} not found`);
    }

    if (resource.userId !== context.userId) {
      // In multi-tenant systems, returning 404 on cross-tenant access prevents resource ID enumeration
      throw new NotFoundError(`${resourceName} not found`);
    }
  }

  /**
   * Asserts agent ownership.
   */
  public static async assertAgentOwnership(agentId: string, context: AuthContext): Promise<any> {
    const agent = await prisma.agent.findFirst({
      where: {
        id: agentId,
        userId: context.userId,
      },
      include: { wallet: true },
    });

    if (!agent) {
      throw new NotFoundError(`Agent ${agentId} not found`);
    }
    return agent;
  }

  /**
   * Asserts mandate ownership.
   */
  public static async assertMandateOwnership(mandateId: string, context: AuthContext): Promise<any> {
    const mandate = await prisma.mandate.findFirst({
      where: {
        id: mandateId,
        userId: context.userId,
      },
    });

    if (!mandate) {
      throw new NotFoundError(`Mandate ${mandateId} not found`);
    }
    return mandate;
  }

  /**
   * Asserts wallet ownership via associated agent.
   */
  public static async assertWalletOwnership(walletId: string, context: AuthContext): Promise<any> {
    const wallet = await prisma.wallet.findFirst({
      where: {
        OR: [
          { id: walletId },
          { walletId: walletId },
        ],
        agent: context.isAdmin ? undefined : {
          userId: context.userId,
        },
      },
      include: { agent: true },
    });

    if (!wallet) {
      throw new NotFoundError(`Wallet ${walletId} not found`);
    }
    return wallet;
  }

  /**
   * Asserts objective ownership.
   */
  public static async assertObjectiveOwnership(objectiveId: string, context: AuthContext): Promise<any> {
    const objective = await prisma.objective.findFirst({
      where: {
        id: objectiveId,
        ...(context.isAdmin ? {} : { userId: context.userId }),
      },
    });

    if (!objective) {
      throw new NotFoundError(`Objective ${objectiveId} not found`);
    }
    return objective;
  }

  /**
   * Asserts background job ownership.
   */
  public static async assertJobOwnership(jobId: string, context: AuthContext): Promise<any> {
    const job = await prisma.backgroundJob.findFirst({
      where: {
        id: jobId,
        ...(context.isAdmin ? {} : { tenantId: context.userId }),
      },
    });

    if (!job) {
      throw new NotFoundError(`Job ${jobId} not found`);
    }
    return job;
  }

  /**
   * Asserts coordination run ownership.
   */
  public static async assertCoordinationOwnership(runId: string, context: AuthContext): Promise<any> {
    const run = await prisma.coordinationRun.findFirst({
      where: {
        id: runId,
        ...(context.isAdmin ? {} : { userId: context.userId }),
      },
    });

    if (!run) {
      throw new NotFoundError(`Coordination run ${runId} not found`);
    }
    return run;
  }

  /**
   * Asserts integration connection ownership.
   */
  public static async assertIntegrationOwnership(connectionId: string, context: AuthContext): Promise<any> {
    const connection = await prisma.integrationConnection.findFirst({
      where: {
        id: connectionId,
        ...(context.isAdmin ? {} : { userId: context.userId }),
      },
    });

    if (!connection) {
      throw new NotFoundError(`Integration connection ${connectionId} not found`);
    }
    return connection;
  }

  /**
   * Asserts task ownership via associated mandate.
   */
  public static async assertTaskOwnership(taskId: string, context: AuthContext): Promise<any> {
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        ...(context.isAdmin ? {} : { mandate: { userId: context.userId } }),
      },
      include: {
        mandate: true,
        agent: true,
        approval: true,
        transaction: true,
      },
    });

    if (!task) {
      throw new NotFoundError(`Task ${taskId} not found`);
    }
    return task;
  }

  /**
   * Asserts approval request ownership via associated mandate.
   */
  public static async assertApprovalOwnership(approvalId: string, context: AuthContext): Promise<any> {
    const approval = await prisma.approvalRequest.findFirst({
      where: {
        id: approvalId,
        ...(context.isAdmin ? {} : { mandate: { userId: context.userId } }),
      },
      include: {
        mandate: true,
        task: true,
      },
    });

    if (!approval) {
      throw new NotFoundError(`Approval request ${approvalId} not found`);
    }
    return approval;
  }

  /**
   * Asserts audit event / activity ownership.
   */
  public static async assertActivityOwnership(activityId: string, context: AuthContext): Promise<any> {
    const activity = await prisma.auditLog.findFirst({
      where: {
        id: activityId,
        ...(context.isAdmin
          ? {}
          : {
              OR: [
                { userId: context.userId },
                { mandate: { userId: context.userId } },
              ],
            }),
      },
    });

    if (!activity) {
      throw new NotFoundError(`Activity record ${activityId} not found`);
    }
    return activity;
  }

  /**
   * Asserts incident ownership or authorized operator access.
   */
  public static async assertIncidentAccess(incidentId: string, context: AuthContext): Promise<any> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundError(`Incident ${incidentId} not found`);
    }

    // Administrators and Operators can access all platform incidents
    if (context.isAdmin || context.isOperator) {
      return incident;
    }

    // Tenant-level access if assigned or bound to tenant
    if (incident.tenantId && incident.tenantId !== context.userId) {
      throw new NotFoundError(`Incident ${incidentId} not found`);
    }

    return incident;
  }

  /**
   * Helper to build a tenant-scoped where clause for Prisma queries.
   */
  public static tenantWhere<T extends Record<string, any>>(context: AuthContext, where: T = {} as T): T & { userId: string } {
    return {
      ...where,
      userId: context.userId,
    };
  }
}
