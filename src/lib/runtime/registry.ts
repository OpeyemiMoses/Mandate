import { UniversalAgent, AgentCapability } from "./types";
import { ProcurementAgentAdapter } from "./agents/procurementAdapter";
import { TreasuryAgentAdapter } from "./agents/treasuryAdapter";
import { OperationsAgentAdapter } from "./agents/operationsAdapter";
import { SecurityAuditorAgentAdapter } from "./agents/auditorAdapter";

/**
 * Universal Agent Registry
 * Manages available agent types, capability discovery, and config validation.
 */
class UniversalAgentRegistry {
  private agents: Map<string, UniversalAgent> = new Map();

  /**
   * Register a new specialist agent implementation
   */
  public register(agent: UniversalAgent, allowOverride = false): void {
    if (!agent.type || typeof agent.type !== "string") {
      throw new Error("Cannot register agent without a valid type string identifier");
    }
    const key = this.getKey(agent.type, agent.version);
    if (!allowOverride && this.agents.has(key)) {
      throw new Error(`Agent type "${agent.type}" version "${agent.version}" is already registered`);
    }
    this.agents.set(key, agent);

    // Also register as default version for this type if none exists or matching major
    if (!this.agents.has(agent.type) || allowOverride) {
      this.agents.set(agent.type, agent);
    }
  }

  /**
   * Resolve an agent implementation by type and optional version
   */
  public get(type: string, version?: string): UniversalAgent | undefined {
    if (version) {
      const versioned = this.agents.get(this.getKey(type, version));
      if (versioned) return versioned;
    }
    return this.agents.get(type);
  }

  /**
   * Convenience alias for get
   */
  public getAgent(type: string, version?: string): UniversalAgent | undefined {
    return this.get(type, version);
  }

  /**
   * Convenience alias for listSupportedTypes
   */
  public getAllAgents() {
    return this.listSupportedTypes();
  }

  /**
   * Check if an agent type is supported
   */
  public has(type: string, version?: string): boolean {
    return Boolean(this.get(type, version));
  }

  /**
   * List all registered agent types with capabilities
   */
  public listSupportedTypes(): Array<{
    type: string;
    version: string;
    name: string;
    description: string;
    capabilities: AgentCapability[];
  }> {
    const seen = new Set<string>();
    const result: Array<{
      type: string;
      version: string;
      name: string;
      description: string;
      capabilities: AgentCapability[];
    }> = [];

    for (const [key, agent] of this.agents.entries()) {
      // Deduplicate shorthand aliases
      const canonicalKey = `${agent.type}:${agent.version}`;
      if (seen.has(canonicalKey)) continue;
      seen.add(canonicalKey);

      result.push({
        type: agent.type,
        version: agent.version,
        name: agent.name,
        description: agent.description,
        capabilities: agent.getCapabilities(),
      });
    }

    return result;
  }

  /**
   * Retrieve capabilities for a registered agent type
   */
  public getCapabilities(type: string, version?: string): AgentCapability[] {
    const agent = this.get(type, version);
    if (!agent) {
      throw new Error(`Agent type "${type}" is not registered in the Universal Agent Runtime`);
    }
    return agent.getCapabilities();
  }

  /**
   * Validate configuration for an agent instance against its registered schema
   */
  public validateConfig(
    type: string,
    config: Record<string, unknown>,
    version?: string
  ): { valid: boolean; errors?: string[] } {
    const agent = this.get(type, version);
    if (!agent) {
      return {
        valid: false,
        errors: [`Unregistered agent type "${type}". Supported types: ${this.getSupportedTypeNames().join(", ")}`],
      };
    }
    return agent.validateConfig(config);
  }

  /**
   * Helper to get list of registered type names
   */
  public getSupportedTypeNames(): string[] {
    const types = new Set<string>();
    for (const agent of this.agents.values()) {
      types.add(agent.type);
    }
    return Array.from(types);
  }

  /**
   * Clear registry (useful for clean test environments)
   */
  public clear(): void {
    this.agents.clear();
  }

  private getKey(type: string, version?: string): string {
    return version ? `${type}:${version}` : type;
  }
}

// Global Singleton Registry Instance
export const agentRegistry = new UniversalAgentRegistry();

// Register built-in specialist agent types
export function registerDefaultAgents(): void {
  if (!agentRegistry.has("research_procurement")) {
    agentRegistry.register(new ProcurementAgentAdapter());
  }
  if (!agentRegistry.has("finance_treasury")) {
    agentRegistry.register(new TreasuryAgentAdapter());
  }
  if (!agentRegistry.has("operations_execution")) {
    agentRegistry.register(new OperationsAgentAdapter());
  }
  if (!agentRegistry.has("security_auditor")) {
    agentRegistry.register(new SecurityAuditorAgentAdapter());
  }
}

// Auto-register on load
registerDefaultAgents();
