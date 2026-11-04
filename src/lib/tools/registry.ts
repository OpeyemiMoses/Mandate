import {
  ToolDefinition,
  ToolSummary,
  ToolCategory,
  AvailabilityStatus,
  RiskClassification,
} from "./types";

export interface ToolHealthStatus {
  toolId: string;
  isHealthy: boolean;
  lastCheckedAt: string;
  latencyMs?: number;
  consecutiveFailures: number;
  lastError?: string;
}

/**
 * Universal Tool Registry
 * Central catalog of all registered tools, their capabilities, and runtime schemas.
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private healthMap: Map<string, ToolHealthStatus> = new Map();

  /**
   * Register a new tool definition
   */
  public register(tool: ToolDefinition, allowOverride: boolean = false): void {
    this.validateToolDefinition(tool);

    const versionKey = this.getKey(tool.id, tool.version);
    if (!allowOverride && this.tools.has(versionKey)) {
      throw new Error(
        `Tool "${tool.id}" version "${tool.version}" is already registered. Duplicate registration rejected.`
      );
    }

    this.tools.set(versionKey, tool);

    // Set as default unversioned alias if none exists or overridden
    if (!this.tools.has(tool.id) || allowOverride) {
      this.tools.set(tool.id, tool);
    }

    // Initialize health tracking
    if (!this.healthMap.has(tool.id)) {
      this.healthMap.set(tool.id, {
        toolId: tool.id,
        isHealthy: tool.availabilityStatus === "ACTIVE",
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
      });
    }
  }

  /**
   * Resolve a tool by ID and optional version
   */
  public get(id: string, version?: string): ToolDefinition | undefined {
    if (version) {
      return this.tools.get(this.getKey(id, version));
    }
    return this.tools.get(id);
  }

  /**
   * Check if tool exists
   */
  public has(id: string, version?: string): boolean {
    return Boolean(this.get(id, version));
  }

  /**
   * Get single tool machine-readable summary
   */
  public getSummary(id: string, version?: string): ToolSummary | undefined {
    const t = this.get(id, version);
    if (!t) return undefined;
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      version: t.version,
      executionType: t.executionType,
      availabilityStatus: t.availabilityStatus,
      operations: Object.values(t.operations).map((op) => ({
        id: op.id,
        name: op.name,
        description: op.description,
        requiredPermission: op.requiredPermission,
        riskClassification: op.riskClassification,
      })),
    };
  }

  /**
   * Compute overall risk level of a tool based on its operations
   */
  public getToolRisk(tool: ToolDefinition): RiskClassification {
    const ops = Object.values(tool.operations);
    if (ops.some((o) => o.riskClassification === "CRITICAL")) return "CRITICAL";
    if (ops.some((o) => o.riskClassification === "HIGH")) return "HIGH";
    if (ops.some((o) => o.riskClassification === "MEDIUM")) return "MEDIUM";
    return "LOW";
  }

  /**
   * List all unique registered tools with optional filters
   */
  public list(filters?: {
    category?: ToolCategory;
    status?: AvailabilityStatus;
    agentType?: string;
  }): ToolDefinition[] {
    const seen = new Set<string>();
    const results: ToolDefinition[] = [];

    for (const [key, tool] of this.tools.entries()) {
      const canonicalKey = `${tool.id}:${tool.version}`;
      if (seen.has(canonicalKey)) continue;
      seen.add(canonicalKey);

      if (filters?.category && tool.category !== filters.category) continue;
      if (filters?.status && tool.availabilityStatus !== filters.status) continue;
      if (
        filters?.agentType &&
        !tool.supportedAgentTypes.includes("*") &&
        !tool.supportedAgentTypes.includes(filters.agentType)
      ) {
        continue;
      }

      results.push(tool);
    }

    return results;
  }

  /**
   * Convert tools to machine-readable summaries for agent context
   */
  public getSummaries(filters?: {
    category?: ToolCategory;
    agentType?: string;
  }): ToolSummary[] {
    const list = this.list({ ...filters, status: "ACTIVE" });
    return list.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      version: t.version,
      executionType: t.executionType,
      availabilityStatus: t.availabilityStatus,
      operations: Object.values(t.operations).map((op) => ({
        id: op.id,
        name: op.name,
        description: op.description,
        requiredPermission: op.requiredPermission,
        riskClassification: op.riskClassification,
      })),
    }));
  }

  /**
   * Enable or disable a tool dynamically
   */
  public setStatus(id: string, status: AvailabilityStatus, version?: string): void {
    const tool = this.get(id, version);
    if (!tool) {
      throw new Error(`Tool "${id}" not found`);
    }
    tool.availabilityStatus = status;

    const health = this.healthMap.get(id);
    if (health) {
      health.isHealthy = status === "ACTIVE";
      health.lastCheckedAt = new Date().toISOString();
    }
  }

  /**
   * Record health check / invocation result
   */
  public recordHealth(id: string, success: boolean, latencyMs?: number, error?: string): void {
    let health = this.healthMap.get(id);
    if (!health) {
      health = {
        toolId: id,
        isHealthy: success,
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: success ? 0 : 1,
      };
      this.healthMap.set(id, health);
    } else {
      health.lastCheckedAt = new Date().toISOString();
      health.latencyMs = latencyMs;
      if (success) {
        health.consecutiveFailures = 0;
        health.isHealthy = true;
        health.lastError = undefined;
      } else {
        health.consecutiveFailures++;
        health.lastError = error;
        if (health.consecutiveFailures >= 5) {
          health.isHealthy = false;
        }
      }
    }
  }

  public getHealth(id: string): ToolHealthStatus | undefined {
    return this.healthMap.get(id);
  }

  public clear(): void {
    this.tools.clear();
    this.healthMap.clear();
  }

  private getKey(id: string, version?: string): string {
    return version ? `${id}:${version}` : id;
  }

  private validateToolDefinition(tool: ToolDefinition): void {
    if (!tool.id || typeof tool.id !== "string" || !/^[a-z0-9_-]+$/i.test(tool.id)) {
      throw new Error(`Invalid tool ID "${tool.id}". Must be non-empty alphanumeric with _ or -`);
    }
    if (!tool.name || typeof tool.name !== "string") {
      throw new Error(`Tool "${tool.id}" missing valid name`);
    }
    if (!tool.version || typeof tool.version !== "string") {
      throw new Error(`Tool "${tool.id}" missing version string`);
    }
    if (!tool.operations || Object.keys(tool.operations).length === 0) {
      throw new Error(`Tool "${tool.id}" must declare at least one operation`);
    }
    for (const [opId, op] of Object.entries(tool.operations)) {
      if (!op.id || op.id !== opId) {
        throw new Error(`Operation ID mismatch: declared "${opId}" but has id "${op.id}"`);
      }
      if (!op.requiredPermission) {
        throw new Error(`Operation "${opId}" in tool "${tool.id}" must declare requiredPermission`);
      }
      if (!op.riskClassification) {
        throw new Error(`Operation "${opId}" in tool "${tool.id}" must declare riskClassification`);
      }
    }
  }
}

// Global Singleton Instance
export const toolRegistry = new ToolRegistry();
