import { z } from "zod";
import { ToolDefinition } from "../types";

export const RestHttpInputSchema = z.object({
  path: z.string().optional().default("/"),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().default("GET"),
  queryParams: z.record(z.string()).optional(),
  body: z.record(z.any()).optional(),
  headers: z.record(z.string()).optional(),
});

export const RestHttpOutputSchema = z.any();

export const genericRestTool: ToolDefinition = {
  id: "generic_rest_client",
  name: "Generic REST API Client",
  description:
    "Executes outbound HTTP/REST queries and webhooks to authorized external service endpoints with SSRF protection and credentials management.",
  category: "EXTERNAL_APIS",
  version: "1.0.0",
  executionType: "REST",
  authenticationRequirements: "USER_CONNECTION",
  timeoutMs: 15000,
  retryPolicy: {
    maxRetries: 2,
    backoffMs: 1500,
    retryableErrors: ["502", "503", "504", "TIMEOUT"],
  },
  rateLimits: {
    maxRequestsPerMinute: 60,
    maxConcurrent: 5,
  },
  availabilityStatus: "ACTIVE",
  supportedAgentTypes: ["*"],
  ownerOrProvider: "rest_generic",
  metadata: {
    protocol: "REST",
    requiresConnection: true,
  },
  operations: {
    http_request: {
      id: "http_request",
      name: "Execute REST Request",
      description: "Sends an authenticated REST HTTP request to the connected endpoint.",
      inputSchema: RestHttpInputSchema,
      outputSchema: RestHttpOutputSchema,
      requiredPermission: "RESTRICTED_EXECUTION",
      riskClassification: "MEDIUM",
      idempotent: false,
    },
  },
};

