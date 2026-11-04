import { z } from "zod";
import { ToolDefinition } from "../types";
import { searchGenuineWeb } from "@/lib/agent/researchEngine";
import { internalAdapter } from "../adapters/internalAdapter";

export const DuckDuckGoSearchSchema = z.object({
  query: z.string().min(1, "Query string is required"),
  maxResults: z.number().min(1).max(10).optional().default(5),
  limit: z.number().min(1).max(10).optional(),
});

export const DuckDuckGoSearchOutputSchema = z.object({
  query: z.string(),
  resultsCount: z.number(),
  sources: z.array(
    z.object({
      url: z.string().url(),
      title: z.string(),
      snippet: z.string(),
      retrievedAt: z.string(),
      verified: z.boolean(),
    })
  ),
  results: z.array(z.any()).optional(),
});

export const ValidateDomainSchema = z.object({
  domainOrUrl: z.string().optional(),
  url: z.string().optional(),
});

export const ValidateDomainOutputSchema = z.object({
  isValid: z.boolean(),
  domain: z.string().optional(),
  protocol: z.string().optional(),
  normalizedUrl: z.string().optional(),
  error: z.string().optional(),
});

export const duckDuckGoTool: ToolDefinition = {
  id: "duckduckgo_search",
  name: "DuckDuckGo Web Discovery & Search",
  description:
    "Performs live, external web research and domain validation without storing tracking cookies or private data.",
  category: "DISCOVERY",
  version: "1.0.0",
  executionType: "INTERNAL",
  authenticationRequirements: "NONE",
  timeoutMs: 12000,
  retryPolicy: {
    maxRetries: 2,
    backoffMs: 1000,
    retryableErrors: ["NETWORK_ERROR", "TIMEOUT"],
  },
  rateLimits: {
    maxRequestsPerMinute: 30,
    maxConcurrent: 5,
  },
  availabilityStatus: "ACTIVE",
  supportedAgentTypes: ["*"],
  ownerOrProvider: "duckduckgo",
  metadata: {
    providerName: "DuckDuckGo",
    engine: "html-parser",
  },
  operations: {
    search: {
      id: "search",
      name: "Search Live Web",
      description: "Queries DuckDuckGo for genuine external web sources, pricing evidence, and vendor pages.",
      inputSchema: DuckDuckGoSearchSchema,
      outputSchema: DuckDuckGoSearchOutputSchema,
      requiredPermission: "READ",
      riskClassification: "LOW",
      idempotent: true,
    },
    validate_domain: {
      id: "validate_domain",
      name: "Validate Domain and URL",
      description: "Checks whether a target URL/domain is valid, well-formed, and uses secure protocols.",
      inputSchema: ValidateDomainSchema,
      outputSchema: ValidateDomainOutputSchema,
      requiredPermission: "READ",
      riskClassification: "LOW",
      idempotent: true,
    },
  },
};

// Register internal handlers
export function registerDuckDuckGoHandlers(): void {
  internalAdapter.registerHandler(
    "duckduckgo_search",
    "search",
    async (params: any) => {
      const validated = DuckDuckGoSearchSchema.parse(params);
      const effectiveLimit = validated.limit || validated.maxResults || 5;
      const sources = await searchGenuineWeb(validated.query, effectiveLimit);
      return {
        query: validated.query,
        resultsCount: sources.length,
        sources,
        results: sources,
      };
    }
  );

  internalAdapter.registerHandler(
    "duckduckgo_search",
    "validate_domain",
    async (params: any) => {
      const parsedParams = ValidateDomainSchema.parse(params);
      const target = (parsedParams.domainOrUrl || parsedParams.url || "").trim();
      if (!target) {
        return {
          isValid: false,
          error: "Either domainOrUrl or url parameter is required",
        };
      }
      try {
        let testUrl = target;
        if (!testUrl.startsWith("http://") && !testUrl.startsWith("https://")) {
          testUrl = `https://${testUrl}`;
        }
        const parsed = new URL(testUrl);
        return {
          isValid: Boolean(parsed.hostname && parsed.hostname.includes(".")),
          domain: parsed.hostname,
          protocol: parsed.protocol,
          normalizedUrl: parsed.toString(),
        };
      } catch (err: any) {
        return {
          isValid: false,
          error: err.message,
        };
      }
    }
  );
}
