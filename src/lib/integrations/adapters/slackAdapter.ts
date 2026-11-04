/**
 * Mandate Slack Universal Integration Adapter
 * Milestone 5: Standardized SaaS communication integration with OAuth 2.0 & Webhook support
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

export class SlackIntegrationAdapter implements UniversalIntegrationAdapter {
  public getMetadata(): IntegrationMetadata {
    return {
      providerId: "slack",
      name: "Slack Team Communication",
      description: "Send automated notifications, post execution alerts, and read channel feeds",
      version: "1.0.0",
      category: "COMMUNICATION",
      authType: "OAUTH",
      icon: "message-square",
      supportedAuthTypes: ["OAUTH", "BEARER_TOKEN", "API_KEY"],
      supportsOAuth: true,
      oauthConfig: {
        authorizationUrl: "https://slack.com/oauth/v2/authorize",
        tokenUrl: "https://slack.com/api/oauth.v2.access",
        defaultScopes: ["chat:write", "channels:read", "incoming-webhook"],
        supportsPkce: true,
      },
    };
  }

  public async getSupportedOperations(): Promise<IntegrationOperationDefinition[]> {
    return [
      {
        id: "post_message",
        name: "Post Slack Message",
        description: "Post a message or financial notification to a designated Slack channel",
        category: "COMMUNICATION",
        defaultPermissionLevel: "PROPOSE",
        riskClassification: "MEDIUM",
        requiredScopes: ["chat:write"],
        parameters: [
          {
            name: "channel",
            type: "string",
            description: "Channel ID or channel name (e.g. #general, C1234567)",
            required: true,
          },
          {
            name: "text",
            type: "string",
            description: "Message content or markdown formatted text",
            required: true,
          },
        ],
        idempotent: false,
      },
      {
        id: "read_channel",
        name: "Read Slack Channel History",
        description: "Fetch recent messages from a permitted Slack channel",
        category: "READ",
        defaultPermissionLevel: "READ",
        riskClassification: "LOW",
        requiredScopes: ["channels:read"],
        parameters: [
          {
            name: "channel",
            type: "string",
            description: "Target channel ID",
            required: true,
          },
          {
            name: "limit",
            type: "number",
            description: "Maximum messages to retrieve (default 10)",
            required: false,
            default: 10,
          },
        ],
        idempotent: true,
      },
      {
        id: "webhook_notify",
        name: "Send Webhook Alert",
        description: "Post notification payload to configured incoming webhook URL",
        category: "COMMUNICATION",
        defaultPermissionLevel: "PROPOSE",
        riskClassification: "LOW",
        requiredScopes: ["incoming-webhook"],
        parameters: [
          {
            name: "text",
            type: "string",
            description: "Alert message text",
            required: true,
          },
        ],
        idempotent: false,
      },
    ];
  }

  public validateConfiguration(config: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    if (config.webhookUrl) {
      try {
        const url = new URL(config.webhookUrl);
        if (!url.hostname.includes("slack.com") && !url.hostname.includes("hooks.slack.com")) {
          errors.push("Webhook URL must point to slack.com");
        }
      } catch (err: any) {
        errors.push(`Invalid webhookUrl format: ${err.message}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  public async connect(
    userId: string,
    credentials: any,
    config: any
  ): Promise<ConnectionResult> {
    const scopes = credentials?.scopes || ["chat:write", "channels:read"];
    return {
      success: true,
      status: "ACTIVE",
      grantedScopes: scopes,
      metadata: { connectedAt: new Date().toISOString() },
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
    const token = decryptedCredentials?.accessToken || decryptedCredentials?.token || decryptedCredentials?.apiKey;

    if (!token && !connection.configJson?.includes("webhookUrl")) {
      return {
        status: "AUTH_EXPIRED",
        isHealthy: false,
        latencyMs: 0,
        testedAt: new Date(),
        verifiedScopes: [],
        missingScopes: ["chat:write"],
        errorMessage: "No access token or webhook URL configured",
      };
    }

    try {
      // If we have an access token, call Slack auth.test
      if (token) {
        const res = await safeFetch("https://slack.com/api/auth.test", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeoutMs: 8000,
        });

        const latencyMs = Date.now() - startTime;
        const json = (await res.json()) as any;

        if (json.ok) {
          return {
            status: "ACTIVE",
            isHealthy: true,
            latencyMs,
            testedAt: new Date(),
            verifiedScopes: ["chat:write", "channels:read"],
            missingScopes: [],
            details: {
              team: json.team,
              user: json.user,
              teamId: json.team_id,
            },
          };
        }

        if (json.error === "invalid_auth" || json.error === "token_revoked" || json.error === "account_inactive") {
          return {
            status: "AUTH_EXPIRED",
            isHealthy: false,
            latencyMs,
            testedAt: new Date(),
            verifiedScopes: [],
            missingScopes: ["chat:write"],
            errorMessage: `Slack authentication failed: ${json.error}`,
          };
        }

        if (json.error === "missing_scope") {
          return {
            status: "SCOPE_MISSING",
            isHealthy: false,
            latencyMs,
            testedAt: new Date(),
            verifiedScopes: [],
            missingScopes: [json.needed || "chat:write"],
            errorMessage: `Slack scope missing: ${json.needed}`,
          };
        }

        return {
          status: "DEGRADED",
          isHealthy: false,
          latencyMs,
          testedAt: new Date(),
          verifiedScopes: [],
          missingScopes: [],
          errorMessage: `Slack API error: ${json.error}`,
        };
      }

      // If webhook only
      return {
        status: "ACTIVE",
        isHealthy: true,
        latencyMs: Date.now() - startTime,
        testedAt: new Date(),
        verifiedScopes: ["incoming-webhook"],
        missingScopes: [],
        details: { mode: "webhook_only" },
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
    const { operationId, parameters, credentials, config } = context;

    try {
      const token = credentials?.accessToken || credentials?.token || credentials?.apiKey;

      if (operationId === "post_message") {
        if (!token) {
          throw new Error("Missing Slack API token for post_message");
        }
        const { channel, text } = parameters;
        if (!channel || !text) {
          throw new Error("Missing required parameters: channel and text");
        }

        const res = await safeFetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ channel, text }),
          timeoutMs: 10000,
        });

        const json = (await res.json()) as any;
        if (!json.ok) {
          throw new Error(`Slack postMessage failed: ${json.error}`);
        }

        return {
          success: true,
          data: {
            channel: json.channel,
            ts: json.ts,
            message: json.message,
          },
          durationMs: Date.now() - startTime,
        };
      }

      if (operationId === "read_channel") {
        if (!token) {
          throw new Error("Missing Slack API token for read_channel");
        }
        const { channel, limit } = parameters;
        const url = `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel)}&limit=${limit || 10}`;

        const res = await safeFetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeoutMs: 10000,
        });

        const json = (await res.json()) as any;
        if (!json.ok) {
          throw new Error(`Slack conversations.history failed: ${json.error}`);
        }

        return {
          success: true,
          data: {
            messages: json.messages || [],
            hasMore: json.has_more,
          },
          durationMs: Date.now() - startTime,
        };
      }

      if (operationId === "webhook_notify") {
        let webhookUrl = config?.webhookUrl;
        if (!webhookUrl && credentials?.webhookUrl) {
          webhookUrl = credentials.webhookUrl;
        }

        if (!webhookUrl) {
          throw new Error("Missing Slack webhookUrl in config or credentials");
        }

        const res = await safeFetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: parameters.text }),
          timeoutMs: 8000,
        });

        if (!res.ok) {
          throw new Error(`Slack webhook post failed with HTTP ${res.status}`);
        }

        return {
          success: true,
          data: { delivered: true },
          durationMs: Date.now() - startTime,
        };
      }

      throw new Error(`Unsupported Slack operation: ${operationId}`);
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

