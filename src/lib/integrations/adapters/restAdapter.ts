/**
 * Mandate Universal REST Integration Adapter
 * Milestone 5: Standardized REST adapter with strict SSRF protection,
 * credential stripping on redirect, rate limit handling, and schema validation.
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

export class UniversalRestAdapter implements UniversalIntegrationAdapter {
  public getMetadata(): IntegrationMetadata {
    return {
      providerId: "rest_api",
      name: "Universal REST Service",
      description: "Secure, authenticated HTTP integration with SSRF guards and rate limit protection",
      version: "1.0.0",
      category: "REST_API",
      authType: "BEARER_TOKEN",
      icon: "globe",
      supportedAuthTypes: ["NONE", "API_KEY", "BEARER_TOKEN", "BASIC", "CUSTOM"],
      supportsOAuth: false,
    };
  }

  public async getSupportedOperations(): Promise<IntegrationOperationDefinition[]> {
    return [
      {
        id: "http_request",
        name: "Execute HTTP Request",
        description: "Execute a parameterized HTTP call against the connected API base URL",
        category: "WRITE",
        defaultPermissionLevel: "PROPOSE",
        riskClassification: "MEDIUM",
        parameters: [
          {
            name: "method",
            type: "string",
            description: "HTTP method: GET, POST, PUT, PATCH, DELETE",
            required: true,
            default: "GET",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          },
          {
            name: "path",
            type: "string",
            description: "Relative URL path (e.g. /v1/items)",
            required: false,
            default: "",
          },
          {
            name: "queryParams",
            type: "object",
            description: "Query parameter key-value pairs",
            required: false,
          },
          {
            name: "body",
            type: "object",
            description: "Request body payload (for POST, PUT, PATCH)",
            required: false,
          },
        ],
        idempotent: false,
      },
      {
        id: "get_resource",
        name: "Get Resource",
        description: "Read a resource from the external API (GET request)",
        category: "READ",
        defaultPermissionLevel: "READ",
        riskClassification: "LOW",
        parameters: [
          {
            name: "path",
            type: "string",
            description: "Relative resource path (e.g. /v1/users/123)",
            required: true,
          },
          {
            name: "queryParams",
            type: "object",
            description: "Query parameters",
            required: false,
          },
        ],
        idempotent: true,
      },
      {
        id: "create_resource",
        name: "Create Resource",
        description: "Create a resource via external API (POST request)",
        category: "WRITE",
        defaultPermissionLevel: "PROPOSE",
        riskClassification: "MEDIUM",
        parameters: [
          {
            name: "path",
            type: "string",
            description: "Relative collection path (e.g. /v1/orders)",
            required: true,
          },
          {
            name: "body",
            type: "object",
            description: "Resource payload",
            required: true,
          },
        ],
        idempotent: false,
      },
    ];
  }

  public validateConfiguration(config: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    if (!config.baseUrl) {
      errors.push("Missing required configuration: baseUrl");
    } else {
      try {
        const parsed = new URL(config.baseUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          errors.push("Base URL must use HTTP or HTTPS protocol");
        }
      } catch (err: any) {
        errors.push(`Invalid baseUrl format: ${err.message}`);
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

    // SSRF validation check on base URL
    const urlValidation = await validateSafeUrlAsync(config.baseUrl);
    if (!urlValidation.valid) {
      return {
        success: false,
        status: "UNAVAILABLE",
        error: urlValidation.error,
      };
    }

    return {
      success: true,
      status: "ACTIVE",
      grantedScopes: ["api:read", "api:write"],
      metadata: { baseUrl: config.baseUrl, connectedAt: new Date().toISOString() },
    };
  }

  public async disconnect(connectionId: string): Promise<void> {
    // No-op
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

    const baseUrl = config.baseUrl;
    if (!baseUrl) {
      return {
        status: "UNAVAILABLE",
        isHealthy: false,
        latencyMs: 0,
        testedAt: new Date(),
        verifiedScopes: [],
        missingScopes: [],
        errorMessage: "Missing baseUrl in connection configuration",
      };
    }

    // Check safe URL
    const safeCheck = await validateSafeUrlAsync(baseUrl);
    if (!safeCheck.valid) {
      return {
        status: "UNAVAILABLE",
        isHealthy: false,
        latencyMs: 0,
        testedAt: new Date(),
        verifiedScopes: [],
        missingScopes: [],
        errorMessage: safeCheck.error,
      };
    }

    const healthPath = config.healthEndpoint || "";
    const testUrl = new URL(healthPath, baseUrl).toString();

    const headers = this.buildAuthHeaders(connection.authType, decryptedCredentials, config.customHeaders);

    try {
      const res = await safeFetch(testUrl, {
        method: "GET",
        headers,
        timeoutMs: 12000,
      });

      const latencyMs = Date.now() - startTime;

      if (res.status === 401 || res.status === 403) {
        return {
          status: "AUTH_EXPIRED",
          isHealthy: false,
          latencyMs,
          testedAt: new Date(),
          verifiedScopes: [],
          missingScopes: [],
          errorMessage: `Authentication failed [HTTP ${res.status}]`,
        };
      }

      if (res.status === 429) {
        return {
          status: "RATE_LIMITED",
          isHealthy: false,
          latencyMs,
          testedAt: new Date(),
          verifiedScopes: [],
          missingScopes: [],
          errorMessage: "External provider rate limit exceeded [HTTP 429]",
        };
      }

      if (res.ok || res.status === 404) {
        return {
          status: "ACTIVE",
          isHealthy: true,
          latencyMs,
          testedAt: new Date(),
          verifiedScopes: ["api:read"],
          missingScopes: [],
          details: { endpoint: testUrl, statusCode: res.status },
        };
      }

      return {
        status: "DEGRADED",
        isHealthy: false,
        latencyMs,
        testedAt: new Date(),
        verifiedScopes: [],
        missingScopes: [],
        errorMessage: `Provider returned HTTP ${res.status}`,
      };
    } catch (err: any) {
      return {
        status: "UNAVAILABLE",
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
      const baseUrl = config?.baseUrl;
      if (!baseUrl) {
        throw new Error("Missing baseUrl in execution config");
      }

      let method = "GET";
      let path = "";
      let queryParams: Record<string, any> = {};
      let body: any = null;

      if (operationId === "get_resource") {
        method = "GET";
        path = parameters.path || "";
        queryParams = parameters.queryParams || {};
      } else if (operationId === "create_resource") {
        method = "POST";
        path = parameters.path || "";
        body = parameters.body;
      } else if (operationId === "http_request") {
        method = (parameters.method || "GET").toUpperCase();
        path = parameters.path || "";
        queryParams = parameters.queryParams || {};
        body = parameters.body;
      } else {
        throw new Error(`Unsupported REST operation: ${operationId}`);
      }

      const targetUrl = new URL(path, baseUrl);
      if (queryParams) {
        for (const [k, v] of Object.entries(queryParams)) {
          if (v !== undefined && v !== null) {
            targetUrl.searchParams.set(k, String(v));
          }
        }
      }

      const headers = this.buildAuthHeaders(
        config?.authType || "NONE",
        credentials,
        config?.customHeaders
      );

      if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
        headers["Content-Type"] = "application/json";
      }

      const res = await safeFetch(targetUrl.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        timeoutMs: 15000,
      });

      const durationMs = Date.now() - startTime;

      let data: any;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          data = await res.text();
        }
      } else {
        data = await res.text();
      }

      if (!res.ok) {
        return {
          success: false,
          statusCode: res.status,
          error: `HTTP ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`,
          durationMs,
        };
      }

      return {
        success: true,
        statusCode: res.status,
        data,
        durationMs,
        rateLimitRemaining: res.headers.get("x-ratelimit-remaining")
          ? parseInt(res.headers.get("x-ratelimit-remaining")!, 10)
          : undefined,
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

  private buildAuthHeaders(
    authType: string,
    credentials?: Record<string, any>,
    customHeaders?: Record<string, string>
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(customHeaders || {}),
    };

    if (!credentials) return headers;

    if (authType === "BEARER_TOKEN" || credentials.accessToken || credentials.token) {
      const token = credentials.accessToken || credentials.token;
      headers["Authorization"] = `Bearer ${token}`;
    } else if (authType === "API_KEY" && credentials.apiKey) {
      const headerName = credentials.apiKeyHeader || "X-API-Key";
      headers[headerName] = credentials.apiKey;
    } else if (authType === "BASIC" && credentials.username && credentials.password) {
      const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
      headers["Authorization"] = `Basic ${encoded}`;
    }

    return headers;
  }
}
