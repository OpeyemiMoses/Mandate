/**
 * Mandate Universal MCP (Model Context Protocol) Server Adapter
 * Milestone 5: Standardized MCP integration adapter with dynamic tool discovery,
 * SSRF guard, JSON-RPC 2.0 transport, and Mandate permission controls.
 */

import {
  UniversalIntegrationAdapter,
  IntegrationMetadata,
  IntegrationOperationDefinition,
  ValidationResult,
  ConnectionResult,
  IntegrationHealthReport,
  IntegrationExecutionContext,
  IntegrationOperationResult,
} from "../types";
import { safeFetch, validateSafeUrlAsync } from "../../tools/security";

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export class UniversalMcpAdapter implements UniversalIntegrationAdapter {
  public getMetadata(): IntegrationMetadata {
    return {
      providerId: "mcp_server",
      name: "Model Context Protocol (MCP) Server",
      description: "Standardized tool discovery and execution via external MCP server endpoints",
      version: "1.0.0",
      category: "MCP_SERVER",
      authType: "BEARER_TOKEN",
      icon: "cpu",
      supportedAuthTypes: ["NONE", "BEARER_TOKEN", "API_KEY", "CUSTOM"],
      supportsOAuth: false,
    };
  }

  public async getSupportedOperations(): Promise<IntegrationOperationDefinition[]> {
    // Built-in standard protocol operations; dynamic tools are discovered via discoverTools()
    return [
      {
        id: "mcp_list_tools",
        name: "List MCP Tools",
        description: "Query the MCP server tools/list endpoint to discover exposed tools",
        category: "READ",
        defaultPermissionLevel: "READ",
        riskClassification: "LOW",
        parameters: [],
        idempotent: true,
      },
      {
        id: "mcp_call_tool",
        name: "Call MCP Tool",
        description: "Invoke a discovered tool via the MCP server tools/call endpoint",
        category: "WRITE",
        defaultPermissionLevel: "PROPOSE",
        riskClassification: "MEDIUM",
        parameters: [
          {
            name: "toolName",
            type: "string",
            description: "Name of the target MCP tool",
            required: true,
          },
          {
            name: "arguments",
            type: "object",
            description: "Tool input parameters dictionary",
            required: false,
          },
        ],
        idempotent: false,
      },
    ];
  }

  public validateConfiguration(config: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    if (!config.serverUrl) {
      errors.push("Missing required configuration: serverUrl");
    } else {
      try {
        const parsed = new URL(config.serverUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          errors.push("Server URL must use HTTP or HTTPS protocol");
        }
      } catch (err: any) {
        errors.push(`Invalid serverUrl format: ${err.message}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  public async connect(
    userId: string,
    credentials: any,
    config: any
  ): Promise<ConnectionResult> {
    const validation = this.validateConfiguration(config);
    if (!validation.valid) {
      return {
        success: false,
        status: "UNAVAILABLE",
        error: validation.errors.join("; "),
      };
    }

    const safeCheck = await validateSafeUrlAsync(config.serverUrl);
    if (!safeCheck.valid) {
      return {
        success: false,
        status: "UNAVAILABLE",
        error: safeCheck.error,
      };
    }

    return {
      success: true,
      status: "ACTIVE",
      grantedScopes: ["mcp:tools:list", "mcp:tools:call"],
      metadata: { serverUrl: config.serverUrl, connectedAt: new Date().toISOString() },
    };
  }

  public async disconnect(connectionId: string): Promise<void> {
    // No-op
  }

  /**
   * Discovers tools from the MCP server using tools/list JSON-RPC request.
   */
  public async discoverTools(
    serverUrl: string,
    credentials?: Record<string, any>
  ): Promise<IntegrationOperationDefinition[]> {
    const safeCheck = await validateSafeUrlAsync(serverUrl);
    if (!safeCheck.valid) {
      throw new Error(`SSRF blocked: ${safeCheck.error}`);
    }

    const payload = {
      jsonrpc: "2.0",
      id: "mcp-list-1",
      method: "tools/list",
      params: {},
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (credentials?.token || credentials?.accessToken) {
      headers["Authorization"] = `Bearer ${credentials.token || credentials.accessToken}`;
    } else if (credentials?.apiKey) {
      headers["X-API-Key"] = credentials.apiKey;
    }

    const res = await safeFetch(serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      timeoutMs: 10000,
    });

    if (!res.ok) {
      throw new Error(`MCP tools/list failed with HTTP ${res.status}`);
    }

    const json = (await res.json()) as any;
    if (json.error) {
      throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
    }

    const tools: McpToolSchema[] = json.result?.tools || [];
    return tools.map((t) => {
      const properties = t.inputSchema?.properties || {};
      const requiredList = t.inputSchema?.required || [];

      const params = Object.entries(properties).map(([name, prop]: [string, any]) => ({
        name,
        type: (prop.type || "string") as any,
        description: prop.description || `Parameter ${name}`,
        required: requiredList.includes(name),
      }));

      // Infer risk and permission level
      const isReadOnly =
        t.name.startsWith("read_") ||
        t.name.startsWith("get_") ||
        t.name.startsWith("list_") ||
        t.name.startsWith("search_") ||
        t.description?.toLowerCase().includes("read");

      return {
        id: `mcp_${t.name}`,
        name: t.name,
        description: t.description || `MCP discovered tool ${t.name}`,
        category: isReadOnly ? "READ" : "WRITE",
        defaultPermissionLevel: isReadOnly ? "READ" : "PROPOSE",
        riskClassification: isReadOnly ? "LOW" : "MEDIUM",
        parameters: params,
        idempotent: isReadOnly,
      };
    });
  }

  public async testConnection(
    connection: any,
    decryptedCredentials?: Record<string, any>
  ): Promise<IntegrationHealthReport> {
    const startTime = Date.now();
    let config: Record<string, any> = {};
    try {
      config = typeof connection.configJson === "string" ? JSON.parse(connection.configJson) : connection.configJson || {};
    } catch (e) {
      config = {};
    }

    const serverUrl = config.serverUrl;
    if (!serverUrl) {
      return {
        status: "UNAVAILABLE",
        isHealthy: false,
        latencyMs: 0,
        testedAt: new Date(),
        verifiedScopes: [],
        missingScopes: [],
        errorMessage: "Missing serverUrl in connection configuration",
      };
    }

    try {
      const tools = await this.discoverTools(serverUrl, decryptedCredentials);
      const latencyMs = Date.now() - startTime;

      return {
        status: "ACTIVE",
        isHealthy: true,
        latencyMs,
        testedAt: new Date(),
        verifiedScopes: ["mcp:tools:list", "mcp:tools:call"],
        missingScopes: [],
        details: {
          serverUrl,
          discoveredToolsCount: tools.length,
          toolNames: tools.map((t) => t.name),
        },
      };
    } catch (err: any) {
      const isAuth = err.message?.includes("401") || err.message?.includes("403");
      return {
        status: isAuth ? "AUTH_EXPIRED" : "DEGRADED",
        isHealthy: false,
        latencyMs: Date.now() - startTime,
        testedAt: new Date(),
        verifiedScopes: [],
        missingScopes: [],
        errorMessage: err.message,
      };
    }
  }

  public async executeOperation(
    context: IntegrationExecutionContext
  ): Promise<IntegrationOperationResult> {
    const startTime = Date.now();
    const { operationId, parameters, config, credentials } = context;

    try {
      const serverUrl = config?.serverUrl;
      if (!serverUrl) {
        throw new Error("Missing serverUrl in MCP execution config");
      }

      let toolName = "";
      let toolArgs: Record<string, any> = {};

      if (operationId === "mcp_call_tool") {
        toolName = parameters.toolName;
        toolArgs = parameters.arguments || {};
      } else if (operationId.startsWith("mcp_")) {
        toolName = operationId.replace(/^mcp_/, "");
        toolArgs = parameters;
      } else {
        throw new Error(`Unsupported MCP operation: ${operationId}`);
      }

      const payload = {
        jsonrpc: "2.0",
        id: `mcp-call-${Date.now()}`,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: toolArgs,
        },
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      if (credentials?.token || credentials?.accessToken) {
        headers["Authorization"] = `Bearer ${credentials.token || credentials.accessToken}`;
      } else if (credentials?.apiKey) {
        headers["X-API-Key"] = credentials.apiKey;
      }

      const res = await safeFetch(serverUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        timeoutMs: 20000,
      });

      const durationMs = Date.now() - startTime;

      if (!res.ok) {
        return {
          success: false,
          statusCode: res.status,
          error: `MCP server HTTP error ${res.status}`,
          durationMs,
        };
      }

      const json = (await res.json()) as any;
      if (json.error) {
        return {
          success: false,
          error: `MCP error ${json.error.code}: ${json.error.message}`,
          durationMs,
        };
      }

      return {
        success: true,
        data: json.result,
        durationMs,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  public async getHealth(
    connection: any,
    decryptedCredentials?: Record<string, any>
  ): Promise<IntegrationHealthReport> {
    return this.testConnection(connection, decryptedCredentials);
  }
}

