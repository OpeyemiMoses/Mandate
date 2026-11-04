import { prisma } from "@/lib/db";
import { toolRegistry, registerDefaultTools } from "@/lib/tools";
import { agentRegistry, registerDefaultAgents } from "@/lib/runtime/registry";
import { TaskType } from "@/lib/objectives/types";
import { recordAuditEvent } from "@/lib/auditLedger";

registerDefaultTools();
registerDefaultAgents();

export interface RegisterCapabilityProfileParams {
  agentId: string;
  userId: string;
  supportedTaskTypes?: TaskType[];
  supportedTools?: string[];
  supportedIntegrations?: string[];
  supportedNetworks?: string[];
  requiredPermissions?: string[];
  maxAuthorizedTaskRisk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  isAgentCaller?: boolean; // If true, agent is attempting self-modification -> MUST BE REJECTED
}

export interface CapabilityProfileData {
  id: string;
  agentId: string;
  userId: string;
  agentType: string;
  supportedTaskTypes: TaskType[];
  supportedTools: string[];
  supportedIntegrations: string[];
  supportedNetworks: string[];
  requiredPermissions: string[];
  financialEligibility: boolean;
  maxAuthorizedTaskRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "ACTIVE" | "PAUSED" | "REVOKED";
  capabilityVersion: number;
  registeredAt: Date;
  lastVerifiedAt: Date;
}

const DEFAULT_TYPE_MAPPINGS: Record<string, {
  taskTypes: TaskType[];
  tools: string[];
  maxRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}> = {
  research_procurement: {
    taskTypes: ["RESEARCH", "ANALYSIS", "EXECUTION", "PAYMENT"],
    tools: ["duckduckgo_search", "near_rpc_reader"],
    maxRisk: "HIGH",
  },
  finance_treasury: {
    taskTypes: ["RESEARCH", "ANALYSIS", "EXECUTION", "PAYMENT"],
    tools: ["near_rpc_reader"],
    maxRisk: "HIGH",
  },
  operations_execution: {
    taskTypes: ["RESEARCH", "EXECUTION", "VERIFICATION"],
    tools: ["generic_rest_client", "near_rpc_reader", "duckduckgo_search"],
    maxRisk: "MEDIUM",
  },
  security_auditor: {
    taskTypes: ["ANALYSIS", "VERIFICATION"],
    tools: ["near_rpc_reader", "duckduckgo_search", "generic_rest_client"],
    maxRisk: "MEDIUM",
  },
};

/**
 * Central Agent Capability Registry
 * Enforces server-controlled capability validation, tool existence checks,
 * financial eligibility boundaries, and immutable audit event recording.
 */
export class AgentCapabilityRegistry {
  /**
   * Register or verify a server-controlled capability profile for an agent
   */
  public static async registerOrVerifyProfile(
    params: RegisterCapabilityProfileParams
  ): Promise<CapabilityProfileData> {
    const {
      agentId,
      userId,
      supportedTaskTypes,
      supportedTools,
      supportedIntegrations = ["outlayer_tee", "near_testnet"],
      supportedNetworks = ["near:testnet"],
      requiredPermissions = [],
      maxAuthorizedTaskRisk,
      isAgentCaller = false,
    } = params;

    // 1. Anti-Tamper: Agents are strictly forbidden from modifying or self-declaring capabilities
    if (isAgentCaller) {
      throw new Error(
        `AGENT_ACTION_FORBIDDEN: AI agents are prohibited from modifying or self-declaring capability profiles. User or server authorization required.`
      );
    }

    // 2. Fetch Agent and Verify Ownership
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
      include: {
        wallet: true,
        mandates: { where: { status: "ACTIVE" } },
      },
    });

    if (!agent) {
      throw new Error(`Agent "${agentId}" not found or unauthorized for user "${userId}".`);
    }

    // 3. Verify Agent Implementation in Universal Agent Runtime
    const agentImpl = agentRegistry.get(agent.type, agent.version);
    if (!agentImpl) {
      throw new Error(
        `Agent type "${agent.type}" (v${agent.version}) is not registered in the Universal Agent Runtime.`
      );
    }

    // 4. Server-Controlled Defaults and Tool Verification
    const defaultMapping = DEFAULT_TYPE_MAPPINGS[agent.type] || {
      taskTypes: ["RESEARCH", "ANALYSIS"],
      tools: [],
      maxRisk: "LOW",
    };

    const taskTypesToSet: TaskType[] = supportedTaskTypes || defaultMapping.taskTypes;
    const toolsToSet: string[] = supportedTools !== undefined ? supportedTools : defaultMapping.tools;
    const maxRiskToSet = maxAuthorizedTaskRisk || defaultMapping.maxRisk;

    // Validate that every declared tool exists in toolRegistry
    for (const toolId of toolsToSet) {
      if (!toolRegistry.has(toolId)) {
        throw new Error(
          `UNREGISTERED_TOOL: Tool "${toolId}" does not exist in platform toolRegistry. Capability declaration rejected.`
        );
      }
    }

    // Validate that networks are strictly NEAR testnet
    for (const net of supportedNetworks) {
      if (!net.includes("testnet")) {
        throw new Error(
          `UNSUPPORTED_NETWORK: Network "${net}" is forbidden. Mandate operates strictly on NEAR Testnet.`
        );
      }
    }

    // 5. Evaluate Financial Eligibility
    // Agent must possess an OutLayer TEE custody wallet AND at least one active spending mandate
    const hasWallet = Boolean(agent.wallet && agent.wallet.nearAccountId);
    const hasActiveMandate = agent.mandates.length > 0;
    const financialEligibility = hasWallet && hasActiveMandate;

    // If PAYMENT task type is requested but agent is financially ineligible, reject
    if (taskTypesToSet.includes("PAYMENT") && !financialEligibility) {
      throw new Error(
        `FINANCIAL_INELIGIBILITY: Agent "${agent.name}" cannot declare PAYMENT capability without a provisioned OutLayer TEE custody wallet and an active spending mandate.`
      );
    }

    // 6. Upsert Capability Profile with Atomic Versioning
    const existing = await prisma.agentCapabilityProfile.findUnique({
      where: { agentId },
    });

    const nextVersion = existing ? existing.capabilityVersion + 1 : 1;
    const now = new Date();

    const profile = await prisma.agentCapabilityProfile.upsert({
      where: { agentId },
      update: {
        supportedTaskTypesJson: JSON.stringify(taskTypesToSet),
        supportedToolsJson: JSON.stringify(toolsToSet),
        supportedIntegrationsJson: JSON.stringify(supportedIntegrations),
        supportedNetworksJson: JSON.stringify(supportedNetworks),
        requiredPermissionsJson: JSON.stringify(requiredPermissions),
        financialEligibility,
        maxAuthorizedTaskRisk: maxRiskToSet,
        status: agent.status,
        capabilityVersion: nextVersion,
        lastVerifiedAt: now,
      },
      create: {
        agentId,
        userId,
        agentType: agent.type,
        supportedTaskTypesJson: JSON.stringify(taskTypesToSet),
        supportedToolsJson: JSON.stringify(toolsToSet),
        supportedIntegrationsJson: JSON.stringify(supportedIntegrations),
        supportedNetworksJson: JSON.stringify(supportedNetworks),
        requiredPermissionsJson: JSON.stringify(requiredPermissions),
        financialEligibility,
        maxAuthorizedTaskRisk: maxRiskToSet,
        status: agent.status,
        capabilityVersion: 1,
        registeredAt: now,
        lastVerifiedAt: now,
      },
    });

    // 7. Record Immutable Cryptographic Audit Event
    try {
      await recordAuditEvent({
        userId,
        eventType: existing ? "agent.capability_updated" : "agent.capability_registered",
        agentId,
        description: `Agent "${agent.name}" capability profile ${existing ? "updated to v" + nextVersion : "registered"}`,
        details: {
          agentId,
          agentType: agent.type,
          version: nextVersion,
          supportedTaskTypes: taskTypesToSet,
          supportedTools: toolsToSet,
          financialEligibility,
        },
      });
    } catch (auditErr) {
      console.warn("[AgentCapabilityRegistry] Audit record notice:", auditErr);
    }

    return this.formatProfile(profile);
  }

  /**
   * Fetch an agent's capability profile with strict tenant authorization
   */
  public static async getProfile(agentId: string, userId: string): Promise<CapabilityProfileData> {
    const profile = await prisma.agentCapabilityProfile.findFirst({
      where: { agentId, userId },
      include: { agent: true },
    });

    if (!profile) {
      // Auto-register default verified profile if agent exists and belongs to user
      const agent = await prisma.agent.findFirst({
        where: { id: agentId, userId },
      });
      if (!agent) {
        throw new Error(`Agent "${agentId}" not found or unauthorized for user "${userId}".`);
      }
      return await this.registerOrVerifyProfile({ agentId, userId });
    }

    return this.formatProfile(profile);
  }

  /**
   * Update capability profile (User-Only)
   */
  public static async updateProfile(params: {
    agentId: string;
    userId: string;
    supportedTaskTypes?: TaskType[];
    supportedTools?: string[];
    maxAuthorizedTaskRisk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    isAgentCaller?: boolean;
  }): Promise<CapabilityProfileData> {
    return await this.registerOrVerifyProfile({
      agentId: params.agentId,
      userId: params.userId,
      supportedTaskTypes: params.supportedTaskTypes,
      supportedTools: params.supportedTools,
      maxAuthorizedTaskRisk: params.maxAuthorizedTaskRisk,
      isAgentCaller: params.isAgentCaller,
    });
  }

  /**
   * Deactivate or pause an agent's capability profile
   */
  public static async deactivateProfile(
    agentId: string,
    userId: string,
    reason?: string
  ): Promise<CapabilityProfileData> {
    const profile = await prisma.agentCapabilityProfile.findFirst({
      where: { agentId, userId },
    });

    if (!profile) {
      throw new Error(`Capability profile for agent "${agentId}" not found or unauthorized.`);
    }

    const updated = await prisma.agentCapabilityProfile.update({
      where: { id: profile.id },
      data: {
        status: "PAUSED",
        capabilityVersion: { increment: 1 },
      },
    });

    await recordAuditEvent({
      userId,
      eventType: "agent.capability_deactivated",
      agentId,
      description: `Agent "${agentId}" capability profile deactivated: ${reason || "User paused"}`,
      details: { agentId, reason },
    });

    return this.formatProfile(updated);
  }

  /**
   * List all verified profiles belonging to a user
   */
  public static async listProfilesForUser(userId: string): Promise<CapabilityProfileData[]> {
    const profiles = await prisma.agentCapabilityProfile.findMany({
      where: { userId },
      orderBy: { registeredAt: "desc" },
    });

    return profiles.map((p) => this.formatProfile(p));
  }

  /**
   * Formats raw Prisma record into typed CapabilityProfileData
   */
  public static formatProfile(profile: any): CapabilityProfileData {
    let taskTypes: TaskType[] = [];
    let tools: string[] = [];
    let integrations: string[] = [];
    let networks: string[] = [];
    let permissions: string[] = [];

    try {
      if (profile.supportedTaskTypesJson) taskTypes = JSON.parse(profile.supportedTaskTypesJson);
    } catch {}
    try {
      if (profile.supportedToolsJson) tools = JSON.parse(profile.supportedToolsJson);
    } catch {}
    try {
      if (profile.supportedIntegrationsJson) integrations = JSON.parse(profile.supportedIntegrationsJson);
    } catch {}
    try {
      if (profile.supportedNetworksJson) networks = JSON.parse(profile.supportedNetworksJson);
    } catch {}
    try {
      if (profile.requiredPermissionsJson) permissions = JSON.parse(profile.requiredPermissionsJson);
    } catch {}

    return {
      id: profile.id,
      agentId: profile.agentId,
      userId: profile.userId,
      agentType: profile.agentType,
      supportedTaskTypes: taskTypes,
      supportedTools: tools,
      supportedIntegrations: integrations,
      supportedNetworks: networks,
      requiredPermissions: permissions,
      financialEligibility: Boolean(profile.financialEligibility),
      maxAuthorizedTaskRisk: (profile.maxAuthorizedTaskRisk || "MEDIUM") as any,
      status: (profile.status || "ACTIVE") as any,
      capabilityVersion: profile.capabilityVersion,
      registeredAt: profile.registeredAt,
      lastVerifiedAt: profile.lastVerifiedAt,
    };
  }
}
