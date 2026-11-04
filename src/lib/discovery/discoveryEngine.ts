import { prisma } from "@/lib/db";
import { toolRegistry } from "@/lib/tools/registry";
import { registerDefaultTools } from "@/lib/tools";
import { agentRegistry, registerDefaultAgents } from "@/lib/runtime/registry";
import {
  UniversalCapability,
  CapabilityCategory,
  CapabilityStatus,
  OperationSchema,
  PermissionLevel,
  RiskClassification,
} from "./types";
import { SUPPORTED_INTEGRATIONS_CATALOG } from "./integrationCatalog";

// Ensure tools and agents are registered
registerDefaultTools();
registerDefaultAgents();

function mapToolCategoryToCapability(category: string): CapabilityCategory {
  switch (category) {
    case "DISCOVERY":
    case "RESEARCH":
      return "INFORMATION_DISCOVERY";
    case "BLOCKCHAIN":
      return "FINANCIAL_EXECUTION";
    case "COMMUNICATION":
      return "COMMUNICATION";
    case "MONITORING":
      return "SYSTEM_AUTOMATION";
    case "EXTERNAL_APIS":
    case "MCP":
    default:
      return "EXTERNAL_INTEGRATION";
  }
}

function mapToolStatusToCapability(status: string): CapabilityStatus {
  switch (status) {
    case "ACTIVE":
      return "AVAILABLE";
    case "DEPRECATED":
      return "DEGRADED";
    case "DISABLED":
      return "DISABLED";
    case "MAINTENANCE":
    default:
      return "UNAVAILABLE";
  }
}

/**
 * Universal Capability Discovery Engine.
 *
 * Core Principle:
 * Discovers real tools, agents, and user-configured connections without fabricating capabilities.
 */
export async function discoverUniversalCapabilities(params?: {
  userId?: string;
  category?: CapabilityCategory;
  agentType?: string;
}): Promise<UniversalCapability[]> {
  const { userId, category, agentType } = params || {};

  // 1. Fetch user integration connections if userId provided
  const userConnections = userId
    ? await prisma.integrationConnection.findMany({
        where: { userId },
      })
    : [];

  const connectionByProvider = new Map<string, typeof userConnections[0]>();
  for (const conn of userConnections) {
    connectionByProvider.set(conn.providerId, conn);
  }

  const capabilities: UniversalCapability[] = [];

  // 2. Discover from ToolRegistry
  const registeredTools = toolRegistry.list({
    agentType: agentType,
  });

  for (const tool of registeredTools) {
    const capCategory = mapToolCategoryToCapability(tool.category);
    if (category && capCategory !== category) continue;

    // Check health
    const health = toolRegistry.getHealth(tool.id);
    let status = mapToolStatusToCapability(tool.availabilityStatus);

    // Check if tool requires user connection/auth
    const matchedConnection = connectionByProvider.get(tool.id);
    const requiresUserAuth =
      tool.authenticationRequirements !== "NONE" &&
      tool.authenticationRequirements !== "USER_CONNECTION" &&
      !matchedConnection?.encryptedCredentials;

    if (requiresUserAuth && !matchedConnection) {
      status = "AUTH_REQUIRED";
    }

    if (health && !health.isHealthy) {
      status = "DEGRADED";
    }

    const operations: OperationSchema[] = Object.values(tool.operations).map((op) => ({
      name: op.id,
      description: op.description || op.name,
      permissionLevel: (op.requiredPermission as PermissionLevel) || "READ",
      riskClassification: (op.riskClassification as RiskClassification) || "LOW",
    }));

    capabilities.push({
      id: `tool:${tool.id}`,
      name: tool.name,
      description: tool.description,
      category: capCategory,
      status,
      providerId: tool.id,
      toolId: tool.id,
      operations,
      requiredAuthType: (tool.authenticationRequirements === "USER_CONNECTION"
        ? "API_KEY"
        : (tool.authenticationRequirements as any)) || "NONE",
      isHealthy: health ? health.isHealthy : true,
      lastCheckedAt: health?.lastCheckedAt || new Date().toISOString(),
      healthMessage: health?.lastError || "Operational",
      integrationConnectionId: matchedConnection?.id,
    });
  }

  // 3. Discover from UniversalAgentRegistry (Specialist Agents)
  const agentTypes = agentRegistry.listSupportedTypes();
  for (const a of agentTypes) {
    if (agentType && a.type !== agentType) continue;

    const agentOps: OperationSchema[] = a.capabilities.map((cap) => ({
      name: cap.name,
      description: cap.description,
      permissionLevel: (cap.requiresMandate ? "RESTRICTED_EXECUTION" : "PROPOSE") as PermissionLevel,
      riskClassification: (cap.requiresMandate ? "MEDIUM" : "LOW") as RiskClassification,
    }));

    capabilities.push({
      id: `agent:${a.type}`,
      name: `${a.name} Specialist Engine`,
      description: a.description,
      category: "COMPUTE_ANALYSIS",
      status: "AVAILABLE",
      agentType: a.type,
      operations: agentOps,
      requiredAuthType: "NONE",
      isHealthy: true,
      lastCheckedAt: new Date().toISOString(),
      healthMessage: "Registered in Universal Agent Runtime",
    });
  }

  // 4. Discover connected User Integrations that may not be built-in tools (e.g. Slack/Discord webhooks)
  for (const conn of userConnections) {
    const catalogItem = SUPPORTED_INTEGRATIONS_CATALOG.find(
      (item) => item.providerId === conn.providerId
    );
    if (!catalogItem) continue;

    const exists = capabilities.some((c) => c.providerId === conn.providerId);
    if (!exists) {
      const capCat = catalogItem.category;
      if (category && capCat !== category) continue;

      const ops: OperationSchema[] = catalogItem.supportedOperations.map((opName) => ({
        name: opName,
        description: `Perform ${opName} via ${conn.name}`,
        permissionLevel: "RESTRICTED_EXECUTION",
        riskClassification: "MEDIUM",
      }));

      capabilities.push({
        id: `integration:${conn.providerId}:${conn.id}`,
        name: conn.name,
        description: catalogItem.description,
        category: capCat,
        status: conn.status === "ACTIVE" ? "AVAILABLE" : "DISABLED",
        providerId: conn.providerId,
        operations: ops,
        requiredAuthType: catalogItem.authType,
        isHealthy: conn.status === "ACTIVE",
        lastCheckedAt: conn.lastVerifiedAt?.toISOString(),
        healthMessage: conn.status === "ACTIVE" ? "Integration connected and verified" : "Disconnected",
        integrationConnectionId: conn.id,
      });
    }
  }

  return capabilities;
}
