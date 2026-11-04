import { prisma } from "@/lib/db";
import { PermissionLevel, RiskClassification } from "./types";

export interface PermissionCheckResult {
  isAuthorized: boolean;
  grantedLevel?: PermissionLevel;
  requiredLevel: PermissionLevel;
  status: "GRANTED" | "ELEVATION_REQUIRED" | "USER_APPROVAL_REQUIRED" | "DENIED";
  reason: string;
  requiresUserApproval: boolean;
}

const PERMISSION_HIERARCHY: Record<PermissionLevel, number> = {
  READ: 1,
  PROPOSE: 2,
  RESTRICTED_EXECUTION: 3,
  USER_ONLY: 4,
};

/**
 * Maps and validates permissions strictly in READ-ONLY mode.
 * Crucial Security Rule:
 * The Discovery and Capability Matching Engine MUST NEVER grant permissions,
 * elevate privileges, or mutate financial mandates automatically.
 */
export async function evaluateCapabilityPermission(params: {
  userId: string;
  agentId?: string;
  toolId?: string;
  requiredPermission: PermissionLevel;
  riskClassification?: RiskClassification;
  hasActiveMandate?: boolean;
}): Promise<PermissionCheckResult> {
  const {
    userId,
    agentId,
    toolId,
    requiredPermission,
    riskClassification = "LOW",
    hasActiveMandate = false,
  } = params;

  // 1. Critical actions or USER_ONLY operations always demand user sign-off
  if (requiredPermission === "USER_ONLY" || riskClassification === "CRITICAL") {
    return {
      isAuthorized: false,
      grantedLevel: "USER_ONLY",
      requiredLevel: requiredPermission,
      status: "USER_APPROVAL_REQUIRED",
      reason: "This operation carries critical authority risk and requires explicit human-in-the-loop approval.",
      requiresUserApproval: true,
    };
  }

  // 2. If no specific agent is bound yet (e.g. preliminary objective planning)
  if (!agentId || !toolId) {
    const requiresApproval =
      requiredPermission === "RESTRICTED_EXECUTION" || riskClassification === "HIGH";
    return {
      isAuthorized: true,
      grantedLevel: requiredPermission,
      requiredLevel: requiredPermission,
      status: requiresApproval ? "USER_APPROVAL_REQUIRED" : "GRANTED",
      reason: requiresApproval
        ? "Operation will require explicit authorization before executing."
        : "Standard capability match within normal permission boundaries.",
      requiresUserApproval: requiresApproval,
    };
  }

  // 3. Inspect agent-tool permission in database
  const toolAccess = await prisma.agentToolAccess.findUnique({
    where: {
      agentId_toolId: {
        agentId,
        toolId,
      },
    },
    include: {
      agent: true,
    },
  });

  // Verify ownership
  if (toolAccess && toolAccess.agent.userId !== userId) {
    return {
      isAuthorized: false,
      requiredLevel: requiredPermission,
      status: "DENIED",
      reason: "Unauthorized agent access across user boundary.",
      requiresUserApproval: false,
    };
  }

  if (!toolAccess || !toolAccess.isEnabled) {
    // Agent has not been granted this tool
    return {
      isAuthorized: false,
      requiredLevel: requiredPermission,
      status: "DENIED",
      reason: `Agent has not been granted access to tool "${toolId}". Explicit access grant required in Agent Settings.`,
      requiresUserApproval: false,
    };
  }

  const grantedLevel = toolAccess.permissionLevel as PermissionLevel;
  const grantedRank = PERMISSION_HIERARCHY[grantedLevel] || 0;
  const requiredRank = PERMISSION_HIERARCHY[requiredPermission] || 1;

  if (grantedRank < requiredRank) {
    return {
      isAuthorized: false,
      grantedLevel,
      requiredLevel: requiredPermission,
      status: "ELEVATION_REQUIRED",
      reason: `Agent possesses "${grantedLevel}" permission, but operation requires "${requiredPermission}". Privileges cannot be elevated automatically.`,
      requiresUserApproval: true,
    };
  }

  // 4. Financial execution requires active financial mandate
  if (requiredPermission === "RESTRICTED_EXECUTION" && !hasActiveMandate) {
    return {
      isAuthorized: false,
      grantedLevel,
      requiredLevel: requiredPermission,
      status: "USER_APPROVAL_REQUIRED",
      reason: "Operation involves restricted financial execution, but no active financial mandate is bound to this objective.",
      requiresUserApproval: true,
    };
  }

  // 5. High risk actions require approval even if granted
  const requiresUserApproval = riskClassification === "HIGH";

  return {
    isAuthorized: true,
    grantedLevel,
    requiredLevel: requiredPermission,
    status: requiresUserApproval ? "USER_APPROVAL_REQUIRED" : "GRANTED",
    reason: requiresUserApproval
      ? "Permission granted, but elevated risk classification requires explicit approval gate."
      : "Permission fully granted and validated.",
    requiresUserApproval,
  };
}

