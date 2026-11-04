/**
 * Mandate Connection Health & Recovery Service
 * Tracks 10 connection lifecycle states, executes live operation diagnostics,
 * verifies granted vs required scopes, and manages error degradation.
 */

import { prisma } from "../db";
import {
  IntegrationStatus,
  IntegrationHealthReport,
  UniversalIntegrationAdapter,
} from "./types";
import { CredentialVault } from "./credentialVault";

export interface HealthStateDetails {
  consecutiveFailures: number;
  lastTestedAt?: string;
  latencyMs?: number;
  lastError?: string;
  verifiedScopes: string[];
  missingScopes: string[];
}

export class IntegrationHealthService {
  /**
   * Performs an end-to-end health check on an integration connection.
   */
  public static async checkConnectionHealth(
    connectionId: string,
    adapter: UniversalIntegrationAdapter
  ): Promise<IntegrationHealthReport> {
    const connection = await prisma.integrationConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    if (connection.status === "REVOKED") {
      return {
        status: "REVOKED",
        isHealthy: false,
        testedAt: new Date(),
        verifiedScopes: [],
        missingScopes: [],
        errorMessage: "Connection has been permanently revoked",
      };
    }

    if (connection.status === "DISABLED") {
      return {
        status: "DISABLED",
        isHealthy: false,
        testedAt: new Date(),
        verifiedScopes: [],
        missingScopes: [],
        errorMessage: "Connection is currently disabled",
      };
    }

    // Decrypt credentials if present
    let decryptedCredentials: Record<string, any> | undefined;
    if (connection.encryptedCredentials) {
      try {
        decryptedCredentials = CredentialVault.decrypt(connection.encryptedCredentials).credentials;
      } catch (err: any) {
        await this.updateStatus(connectionId, "AUTH_EXPIRED", {
          lastError: `Failed to decrypt credentials: ${err.message}`,
        });
        return {
          status: "AUTH_EXPIRED",
          isHealthy: false,
          testedAt: new Date(),
          verifiedScopes: [],
          missingScopes: [],
          errorMessage: "Stored credentials cannot be decrypted",
        };
      }
    }

    const startTime = Date.now();
    try {
      const report = await adapter.testConnection(connection, decryptedCredentials);
      const latencyMs = report.latencyMs || Date.now() - startTime;

      let newStatus: IntegrationStatus = report.status;
      if (report.isHealthy && newStatus !== "ACTIVE") {
        newStatus = "ACTIVE";
      } else if (!report.isHealthy && report.status === "AUTH_EXPIRED") {
        newStatus = "AUTH_EXPIRED";
      } else if (!report.isHealthy && report.status === "RATE_LIMITED") {
        newStatus = "RATE_LIMITED";
      } else if (report.missingScopes && report.missingScopes.length > 0) {
        newStatus = "SCOPE_MISSING";
      }

      await this.updateStatus(connectionId, newStatus, {
        consecutiveFailures: report.isHealthy ? 0 : 1,
        lastTestedAt: new Date().toISOString(),
        latencyMs,
        lastError: report.errorMessage,
        verifiedScopes: report.verifiedScopes || [],
        missingScopes: report.missingScopes || [],
      });

      return {
        ...report,
        status: newStatus,
        latencyMs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const isAuthError = err.message?.includes("401") || err.message?.includes("403") || err.message?.includes("auth");
      const isRateLimited = err.message?.includes("429") || err.message?.includes("rate limit");

      let resolvedStatus: IntegrationStatus = "UNAVAILABLE";
      if (isAuthError) resolvedStatus = "AUTH_EXPIRED";
      else if (isRateLimited) resolvedStatus = "RATE_LIMITED";
      else resolvedStatus = "DEGRADED";

      await this.updateStatus(connectionId, resolvedStatus, {
        consecutiveFailures: 1,
        lastTestedAt: new Date().toISOString(),
        latencyMs: durationMs,
        lastError: err.message,
        verifiedScopes: [],
        missingScopes: [],
      });

      return {
        status: resolvedStatus,
        isHealthy: false,
        latencyMs: durationMs,
        testedAt: new Date(),
        verifiedScopes: [],
        missingScopes: [],
        errorMessage: err.message,
      };
    }
  }

  /**
   * Updates status and health metadata in the database.
   */
  public static async updateStatus(
    connectionId: string,
    status: IntegrationStatus,
    metadata: Partial<HealthStateDetails>
  ): Promise<void> {
    const existing = await prisma.integrationConnection.findUnique({
      where: { id: connectionId },
      select: { healthMetadataJson: true },
    });

    let currentMeta: Record<string, any> = {};
    try {
      currentMeta = JSON.parse(existing?.healthMetadataJson || "{}");
    } catch (e) {
      currentMeta = {};
    }

    const updatedMeta = {
      ...currentMeta,
      ...metadata,
      lastUpdatedAt: new Date().toISOString(),
    };

    await prisma.integrationConnection.update({
      where: { id: connectionId },
      data: {
        status,
        healthMetadataJson: JSON.stringify(updatedMeta),
        lastVerifiedAt: metadata.lastTestedAt ? new Date(metadata.lastTestedAt) : new Date(),
        verifiedScopesJson: metadata.verifiedScopes ? JSON.stringify(metadata.verifiedScopes) : undefined,
      },
    });
  }
}
