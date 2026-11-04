import { ToolDefinition, ToolOperation } from "../types";
import { ToolAdapter, AdapterContext } from "./types";
import { safeFetch, validateSafeUrlAsync } from "../security";

export interface McpServerConfig {
  serverUrl: string;
  protocolVersion?: string;
  authToken?: string;
}

export class McpToolAdapter implements ToolAdapter {
  public async execute(
    tool: ToolDefinition,
    operation: ToolOperation,
    params: Record<string, unknown>,
    context: AdapterContext
  ): Promise<any> {
    const config: McpServerConfig =
      context.connectionConfig || (tool.metadata as any)?.mcpConfig;

    if (!config || !config.serverUrl) {
      throw new Error(`MCP tool "${tool.id}" requires a valid serverUrl`);
    }

    // Async SSRF & DNS Rebinding Validation
    const urlValidation = await validateSafeUrlAsync(config.serverUrl);
    if (!urlValidation.valid) {
      throw new Error(`SSRF Blocked on MCP server: ${urlValidation.error}`);
    }

    const timeoutMs = tool.timeoutMs || 15000;

    const rpcPayload = {
      jsonrpc: "2.0",
      id: context.invocationId,
      method: "tools/call",
      params: {
        name: operation.id,
        arguments: params,
      },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mandate-MCP-Client/1.0",
    };

    if (config.authToken || context.credentials?.authToken) {
      headers["Authorization"] = `Bearer ${config.authToken || context.credentials?.authToken}`;
    }

    try {
      const res = await safeFetch(config.serverUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(rpcPayload),
        timeoutMs,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`MCP Server Error (${res.status}): ${text.slice(0, 200)}`);
      }

      const json = (await res.json()) as any;

      if (json.error) {
        throw new Error(
          `MCP Error [${json.error.code}]: ${json.error.message || "Unknown error"}`
        );
      }

      // Normalize MCP output
      return this.normalizeMcpResult(json.result);
    } catch (err: any) {
      throw err;
    }
  }

  /**
   * Discover available tools from an MCP server
   */
  public async discoverTools(serverUrl: string, authToken?: string): Promise<any[]> {
    const urlValidation = await validateSafeUrlAsync(serverUrl);
    if (!urlValidation.valid) {
      throw new Error(`SSRF Blocked: ${urlValidation.error}`);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const payload = {
      jsonrpc: "2.0",
      id: `disc-${Date.now()}`,
      method: "tools/list",
      params: {},
    };

    const res = await safeFetch(serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      timeoutMs: 10000,
    });

    if (!res.ok) {
      throw new Error(`MCP tool discovery failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`MCP discovery error: ${data.error.message}`);
    }

    return data.result?.tools || [];
  }

  /**
   * Normalizes MCP tool response and sanitizes untrusted content
   */
  private normalizeMcpResult(result: any): any {
    if (!result) return {};

    // Standard MCP tool content array: [{ type: "text", text: "..." }, { type: "image", data: "..." }]
    if (Array.isArray(result.content)) {
      const textParts = result.content
        .filter((c: any) => c.type === "text" && typeof c.text === "string")
        .map((c: any) => c.text);

      let parsedJson: any = null;
      if (textParts.length === 1) {
        try {
          parsedJson = JSON.parse(textParts[0]);
        } catch {}
      }

      return {
        isError: Boolean(result.isError),
        text: textParts.join("\n"),
        data: parsedJson || undefined,
        rawContent: result.content,
      };
    }

    return result;
  }
}

export const mcpAdapter = new McpToolAdapter();

