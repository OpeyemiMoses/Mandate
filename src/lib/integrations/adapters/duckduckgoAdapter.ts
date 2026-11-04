/**
 * Mandate Universal DuckDuckGo Search Adapter
 * Milestone 5: Standardized integration adapter
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
import { safeFetch } from "../../tools/security";

export class DuckDuckGoIntegrationAdapter implements UniversalIntegrationAdapter {
  public getMetadata(): IntegrationMetadata {
    return {
      providerId: "duckduckgo",
      name: "DuckDuckGo Web Search",
      description: "Real-time web research, documentation lookups and market search",
      version: "1.0.0",
      category: "SEARCH",
      authType: "NONE",
      icon: "search",
      supportedAuthTypes: ["NONE"],
      supportsOAuth: false,
    };
  }

  public async getSupportedOperations(): Promise<IntegrationOperationDefinition[]> {
    return [
      {
        id: "web_search",
        name: "Web Search",
        description: "Search the web for query terms and retrieve top search snippets",
        category: "READ",
        defaultPermissionLevel: "READ",
        riskClassification: "LOW",
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Search keywords or question",
            required: true,
          },
          {
            name: "maxResults",
            type: "number",
            description: "Maximum number of results (default 5)",
            required: false,
            default: 5,
          },
        ],
        idempotent: true,
      },
    ];
  }

  public validateConfiguration(config: Record<string, any>): ValidationResult {
    return { valid: true, errors: [] };
  }

  public async connect(
    userId: string,
    credentials: any,
    config: any
  ): Promise<ConnectionResult> {
    return {
      success: true,
      status: "ACTIVE",
      grantedScopes: ["search:read"],
      metadata: { connectedAt: new Date().toISOString() },
    };
  }

  public async disconnect(connectionId: string): Promise<void> {
    // No-op for public search
  }

  public async testConnection(
    connection: any,
    decryptedCredentials?: Record<string, any>
  ): Promise<IntegrationHealthReport> {
    const startTime = Date.now();
    try {
      const url = `https://api.duckduckgo.com/?q=NEAR+protocol&format=json&no_html=1`;
      const res = await safeFetch(url, { timeoutMs: 5000 });
      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        return {
          status: "ACTIVE",
          isHealthy: true,
          latencyMs,
          testedAt: new Date(),
          verifiedScopes: ["search:read"],
          missingScopes: [],
          details: { sampleQuery: "NEAR protocol", status: res.status },
        };
      }

      return {
        status: "DEGRADED",
        isHealthy: false,
        latencyMs,
        testedAt: new Date(),
        verifiedScopes: [],
        missingScopes: ["search:read"],
        errorMessage: `DuckDuckGo returned HTTP ${res.status}`,
      };
    } catch (err: any) {
      return {
        status: "UNAVAILABLE",
        isHealthy: false,
        latencyMs: Date.now() - startTime,
        testedAt: new Date(),
        verifiedScopes: [],
        missingScopes: ["search:read"],
        errorMessage: err.message,
      };
    }
  }

  public async executeOperation(
    context: IntegrationExecutionContext
  ): Promise<IntegrationOperationResult> {
    const startTime = Date.now();
    const { operationId, parameters } = context;

    try {
      if (operationId === "web_search") {
        const query = parameters.query;
        if (!query) {
          throw new Error("Missing required parameter: query");
        }
        const maxResults = parameters.maxResults || 5;
        const encoded = encodeURIComponent(query);
        const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1`;

        const res = await safeFetch(url, { timeoutMs: 8000 });
        if (!res.ok) {
          throw new Error(`DuckDuckGo request failed [HTTP ${res.status}]`);
        }

        const json = (await res.json()) as any;
        const results = (json.RelatedTopics || [])
          .slice(0, maxResults)
          .map((t: any) => ({
            text: t.Text,
            url: t.FirstURL,
          }))
          .filter((t: any) => t.text);

        return {
          success: true,
          data: {
            query,
            heading: json.Heading,
            abstract: json.AbstractText,
            results,
          },
          durationMs: Date.now() - startTime,
        };
      }

      throw new Error(`Unsupported DuckDuckGo operation: ${operationId}`);
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

