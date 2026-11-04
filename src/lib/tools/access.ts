import { prisma } from "@/lib/db";
import { toolRegistry } from "./registry";
import { ToolDefinition, ToolPermissionLevel, ToolSummary } from "./types";

const PERMISSION_HIERARCHY: Record<ToolPermissionLevel, number> = {
  READ: 1,
  PROPOSE: 2,
  RESTRICTED_EXECUTION: 3,
  USER_ONLY: 99,
};

/**
 * Checks whether an agent's assigned permission level meets the required permission
 */
export function isPermissionSufficient(
  agentLevel: ToolPermissionLevel,
  requiredLevel: ToolPermissionLevel
): boolean {
  if (requiredLevel === "USER_ONLY") {
    // Agents can NEVER execute USER_ONLY operations
    return false;
  }
  return PERMISSION_HIERARCHY[agentLevel] >= PERMISSION_HIERARCHY[requiredLevel];
}

/**
 * Grant or update tool access for an agent
 */
export async function grantAgentToolAccess(params: {
  agentId: string;
  userId: string;
  toolId: string;
  permissionLevel?: ToolPermissionLevel;
  isEnabled?: boolean;
  allowedOperations?: string[];
  maxCallsPerExecution?: number;
}) {
  const {
    agentId,
    userId,
    toolId,
    permissionLevel = "READ",
    isEnabled = true,
    allowedOperations = ["*"],
    maxCallsPerExecution,
  } = params;

  // Verify agent ownership
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
  });
  if (!agent) {
    throw new Error(`Agent "${agentId}" not found or unauthorized`);
  }

  // Verify tool exists in registry
  if (!toolRegistry.has(toolId)) {
    throw new Error(`Tool "${toolId}" is not registered in the system`);
  }

  const access = await prisma.agentToolAccess.upsert({
    where: {
      agentId_toolId: { agentId, toolId },
    },
    update: {
      permissionLevel,
      isEnabled,
      allowedOperationsJson: JSON.stringify(allowedOperations),
      maxCallsPerExecution: maxCallsPerExecution || null,
    },
    create: {
      agentId,
      toolId,
      permissionLevel,
      isEnabled,
      allowedOperationsJson: JSON.stringify(allowedOperations),
      maxCallsPerExecution: maxCallsPerExecution || null,
    },
  });

  return access;
}

/**
 * Revoke tool access from an agent
 */
export async function revokeAgentToolAccess(
  agentId: string,
  userId: string,
  toolId: string
) {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
  });
  if (!agent) {
    throw new Error(`Agent "${agentId}" not found or unauthorized`);
  }

  await prisma.agentToolAccess.deleteMany({
    where: { agentId, toolId },
  });

  return { success: true };
}

/**
 * Get machine-readable tool summaries available to an agent
 */
export async function getPermittedToolsForAgent(
  agentId: string,
  userId: string
): Promise<ToolSummary[]> {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
    include: {
      toolAccess: {
        where: { isEnabled: true },
      },
    },
  });

  if (!agent) {
    return [];
  }

  const summaries: ToolSummary[] = [];

  for (const access of agent.toolAccess) {
    const tool = toolRegistry.get(access.toolId);
    if (!tool || tool.availabilityStatus !== "ACTIVE") continue;

    let allowedOps = ["*"];
    try {
      allowedOps = JSON.parse(access.allowedOperationsJson || "[\"*\"]");
    } catch {}

    const permittedOperations = Object.values(tool.operations).filter((op) => {
      // Must match allowed operations list
      if (!allowedOps.includes("*") && !allowedOps.includes(op.id)) return false;
      // Agent's assigned permission level must satisfy the operation's required level
      return isPermissionSufficient(
        access.permissionLevel as ToolPermissionLevel,
        op.requiredPermission
      );
    });

    if (permittedOperations.length > 0) {
      summaries.push({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        version: tool.version,
        executionType: tool.executionType,
        availabilityStatus: tool.availabilityStatus,
        operations: permittedOperations.map((op) => ({
          id: op.id,
          name: op.name,
          description: op.description,
          requiredPermission: op.requiredPermission,
          riskClassification: op.riskClassification,
        })),
      });
    }
  }

  return summaries;
}

/**
 * Validates whether an agent has authorization to invoke a specific tool operation
 */
export async function verifyAgentToolPermission(params: {
  agentId: string;
  userId: string;
  toolId: string;
  operationId: string;
}): Promise<{
  allowed: boolean;
  reason?: string;
  tool?: ToolDefinition;
  assignedAccess?: any;
}> {
  const { agentId, userId, toolId, operationId } = params;

  // 1. Verify Agent Ownership
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
  });
  if (!agent) {
    return { allowed: false, reason: "Agent not found or unauthorized" };
  }

  if (agent.status !== "ACTIVE") {
    return { allowed: false, reason: `Agent is ${agent.status.toLowerCase()}` };
  }

  // 2. Resolve Registered Tool
  const tool = toolRegistry.get(toolId);
  if (!tool) {
    return { allowed: false, reason: `Tool "${toolId}" is not registered in the system` };
  }

  if (tool.availabilityStatus !== "ACTIVE") {
    return { allowed: false, reason: `Tool "${toolId}" is currently ${tool.availabilityStatus.toLowerCase()}` };
  }

  // 3. Resolve Registered Operation
  const operation = tool.operations[operationId];
  if (!operation) {
    return {
      allowed: false,
      reason: `Operation "${operationId}" not found on tool "${toolId}"`,
      tool,
    };
  }

  if (operation.requiredPermission === "USER_ONLY") {
    return {
      allowed: false,
      reason: `Operation "${operationId}" is classified as USER_ONLY and cannot be executed by an autonomous agent.`,
      tool,
    };
  }

  // 4. Check Agent Tool Access in Database
  const access = await prisma.agentToolAccess.findUnique({
    where: {
      agentId_toolId: { agentId, toolId },
    },
  });

  if (!access || !access.isEnabled) {
    return {
      allowed: false,
      reason: `Agent does not have assigned access to tool "${toolId}"`,
      tool,
    };
  }

  // 5. Check allowed operations list
  let allowedOps = ["*"];
  try {
    allowedOps = JSON.parse(access.allowedOperationsJson || "[\"*\"]");
  } catch {}

  if (!allowedOps.includes("*") && !allowedOps.includes(operationId)) {
    return {
      allowed: false,
      reason: `Operation "${operationId}" is not in the allowed operations list for this agent`,
      tool,
      assignedAccess: access,
    };
  }

  // 6. Check permission hierarchy
  if (
    !isPermissionSufficient(
      access.permissionLevel as ToolPermissionLevel,
      operation.requiredPermission
    )
  ) {
    return {
      allowed: false,
      reason: `Insufficient permission: Agent has "${access.permissionLevel}", but operation requires "${operation.requiredPermission}"`,
      tool,
      assignedAccess: access,
    };
  }

  return {
    allowed: true,
    tool,
    assignedAccess: access,
  };
}
