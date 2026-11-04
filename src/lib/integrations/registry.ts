/**
 * Mandate Universal Integration Adapter Registry
 * Milestone 5: Central registry for integration adapters, catalog discovery,
 * and dynamic synchronization with Mandate Tool Registry.
 */

import { z } from "zod";
import { UniversalIntegrationAdapter, IntegrationMetadata, IntegrationOperationDefinition } from "./types";
import { NearIntegrationAdapter } from "./adapters/nearAdapter";
import { DuckDuckGoIntegrationAdapter } from "./adapters/duckduckgoAdapter";
import { UniversalRestAdapter } from "./adapters/restAdapter";
import { UniversalMcpAdapter } from "./adapters/mcpAdapter";
import { SlackIntegrationAdapter } from "./adapters/slackAdapter";
import { toolRegistry } from "../tools/registry";
import { ToolDefinition, ToolCategory, ToolOperation } from "../tools/types";
import { prisma } from "../db";
import { OperationPermissionService } from "./permissionService";

export class IntegrationAdapterRegistry {
  private adapters: Map<string, UniversalIntegrationAdapter> = new Map();

  constructor() {
    this.registerDefaultAdapters();
  }

  /**
   * Registers default built-in platform adapters
   */
  public registerDefaultAdapters(): void {
    this.register(new NearIntegrationAdapter());
    this.register(new DuckDuckGoIntegrationAdapter());
    this.register(new UniversalRestAdapter());
    this.register(new UniversalMcpAdapter());
    this.register(new SlackIntegrationAdapter());
  }

  /**
   * Registers an integration adapter
   */
  public register(adapter: UniversalIntegrationAdapter): void {
    const meta = adapter.getMetadata();
    this.adapters.set(meta.providerId, adapter);
  }

  /**
   * Resolves an adapter by provider ID
   */
  public getAdapter(providerId: string): UniversalIntegrationAdapter | undefined {
    return this.adapters.get(providerId);
  }

  /**
   * Checks if an adapter is registered
   */
  public hasAdapter(providerId: string): boolean {
    return this.adapters.has(providerId);
  }

  /**
   * Lists catalog metadata of all registered adapters
   */
  public listCatalog(): IntegrationMetadata[] {
    return Array.from(this.adapters.values()).map((a) => a.getMetadata());
  }

  /**
   * Synchronizes an IntegrationConnection with the Mandate Universal Tool Registry.
   * Discovered and approved operations become discoverable and executable by authorized agents.
   */
  public async syncConnectionTools(connectionId: string): Promise<void> {
    const connection = await prisma.integrationConnection.findUnique({
      where: { id: connectionId },
      include: { operationPermissions: true },
    });

    if (!connection) {
      return;
    }

    const toolId = `conn_${connection.id}`;

    // If connection is not ACTIVE, ensure tools are disabled or deactivated
    if (connection.status !== "ACTIVE" && connection.status !== "CONNECTED") {
      if (toolRegistry.has(toolId)) {
        toolRegistry.setStatus(toolId, "DISABLED");
      }
      return;
    }

    const adapter = this.getAdapter(connection.providerId);
    if (!adapter) {
      return;
    }

    const operations = await adapter.getSupportedOperations();

    // Sync default permissions in DB
    await OperationPermissionService.syncOperationPermissions(connection.id, operations);

    // Refresh connection with synced permissions
    const refreshed = await prisma.integrationConnection.findUnique({
      where: { id: connectionId },
      include: { operationPermissions: true },
    });

    const permMap = new Map(
      (refreshed?.operationPermissions || []).map((p) => [p.operationId, p])
    );

    // Map operations to ToolDefinition format
    const opsRecord: Record<string, ToolOperation> = {};
    for (const op of operations) {
      const perm = permMap.get(op.id);
      if (perm && !perm.isEnabled) continue; // Skip disabled operations

      opsRecord[op.id] = {
        id: op.id,
        name: op.name,
        description: op.description,
        requiredPermission: (perm?.permissionLevel || op.defaultPermissionLevel) as any,
        riskClassification: (perm?.riskClassification || op.riskClassification) as any,
        inputSchema: z.record(z.any()),
        outputSchema: z.any(),
        idempotent: Boolean(op.idempotent),
      };
    }

    const categoryMap: Record<string, ToolCategory> = {
      BLOCKCHAIN: "BLOCKCHAIN",
      SEARCH: "RESEARCH",
      REST_API: "EXTERNAL_APIS",
      MCP_SERVER: "MCP",
      COMMUNICATION: "COMMUNICATION",
      FINANCE: "BLOCKCHAIN",
      PRODUCTIVITY: "RESEARCH",
    };

    const meta = adapter.getMetadata();
    const toolDef: ToolDefinition = {
      id: toolId,
      name: `${connection.name} (${meta.name})`,
      description: meta.description,
      category: categoryMap[meta.category] || "EXTERNAL_APIS",
      version: meta.version || "1.0.0",
      executionType: connection.adapterType === "mcp" ? "MCP" : "REST",
      authenticationRequirements: (connection.authType as any) || "NONE",
      timeoutMs: 15000,
      retryPolicy: { maxRetries: 2, backoffMs: 500 },
      rateLimits: { maxRequestsPerMinute: 60, maxConcurrent: 5 },
      availabilityStatus: "ACTIVE",
      operations: opsRecord,
      supportedAgentTypes: ["*"],
      ownerOrProvider: connection.providerId,
    };

    toolRegistry.register(toolDef, true); // Allow override to update dynamic schemas
  }

  /**
   * Deactivates or removes a connection's tools from the Tool Registry upon revocation or disconnection.
   */
  public async deactivateConnectionTools(connectionId: string): Promise<void> {
    const toolId = `conn_${connectionId}`;
    if (toolRegistry.has(toolId)) {
      toolRegistry.setStatus(toolId, "DISABLED");
    }
  }
}

export const integrationRegistry = new IntegrationAdapterRegistry();
