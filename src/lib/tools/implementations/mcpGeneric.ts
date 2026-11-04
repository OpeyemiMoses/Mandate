import { z } from "zod";
import { ToolDefinition } from "../types";

export const McpCallInputSchema = z.object({
  toolName: z.string().min(1, "Target MCP tool name is required"),
  arguments: z.record(z.any()).default({}),
});

export const McpCallOutputSchema = z.object({
  isError: z.boolean(),
  text: z.string().optional(),
  data: z.any().optional(),
  rawContent: z.array(z.any()).optional(),
});

export const genericMcpTool: ToolDefinition = {
  id: "generic_mcp_client",
  name: "Model Context Protocol (MCP) Client",
  description:
    "Discovers and invokes standardized external capabilities hosted on Model Context Protocol servers.",
  category: "MCP",
  version: "1.0.0",
  executionType: "MCP",
  authenticationRequirements: "USER_CONNECTION",
  timeoutMs: 20000,
  retryPolicy: {
    maxRetries: 2,
    backoffMs: 2000,
    retryableErrors: ["MCP_TIMEOUT", "MCP_SERVER_ERROR"],
  },
  rateLimits: {
    maxRequestsPerMinute: 45,
    maxConcurrent: 4,
  },
  availabilityStatus: "ACTIVE",
  supportedAgentTypes: ["*"],
  ownerOrProvider: "mcp_client",
  metadata: {
    protocol: "MCP-JSONRPC-2.0",
    requiresConnection: true,
  },
  operations: {
    call_mcp_tool: {
      id: "call_mcp_tool",
      name: "Invoke Remote MCP Tool",
      description: "Executes an operation on the connected external MCP server.",
      inputSchema: McpCallInputSchema,
      outputSchema: McpCallOutputSchema,
      requiredPermission: "RESTRICTED_EXECUTION",
      riskClassification: "MEDIUM",
      idempotent: false,
    },
  },
};

