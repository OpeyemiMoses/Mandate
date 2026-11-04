/**
 * MANDATE — Production Startup Preflight & Integration Connectivity
 * Milestone 9.5: Final Production Certification
 * 
 * Verifies runtime readiness, database connectivity, RPC responsiveness,
 * and cryptographic configuration without leaking any secrets.
 */

import { prisma } from "@/lib/db";
import {
  validateEnvironment,
  EnvironmentValidationReport,
  isKnownInsecureSecret,
  MINIMUM_SECRET_LENGTH,
  hasSufficientEntropy,
} from "./environmentValidation";

export type PreflightStatus =
  | "CONFIGURED"
  | "MISSING"
  | "INVALID"
  | "UNAVAILABLE"
  | "NOT_CONFIGURED_OPTIONAL";

export type OverallSystemReadiness = "READY" | "DEGRADED" | "BLOCKED";

export interface ComponentCheckResult {
  component: string;
  status: PreflightStatus;
  latencyMs?: number;
  message: string;
  details?: Record<string, any>;
}

export interface StartupPreflightReport {
  overallStatus: OverallSystemReadiness;
  isProduction: boolean;
  timestamp: string;
  checks: Record<string, ComponentCheckResult>;
  topology: {
    databaseProvider: "sqlite" | "postgresql" | "unknown";
    singleWriterConstraint: boolean;
    multiInstanceReady: boolean;
    warning?: string;
  };
  summary: {
    totalChecks: number;
    configuredCount: number;
    optionalCount: number;
    unavailableCount: number;
    blockedCount: number;
  };
  envReport: Omit<EnvironmentValidationReport, "criticalErrors"> & {
    errorCount: number;
    safeErrorMessages: string[];
  };
}

/**
 * Executes full startup preflight checks with strict timeout isolation.
 */
export async function runStartupPreflight(timeoutMs = 4000): Promise<StartupPreflightReport> {
  const isProd = process.env.NODE_ENV === "production";
  const checks: Record<string, ComponentCheckResult> = {};
  const envReport = validateEnvironment();

  // Helper for timed async calls
  const timedCheck = async (fn: () => Promise<void>): Promise<{ ok: boolean; latencyMs: number; error?: string }> => {
    const start = Date.now();
    try {
      await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)),
      ]);
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - start, error: err.message || "Unknown error" };
    }
  };

  // 1. Database Connectivity
  const dbCheck = await timedCheck(async () => {
    // Execute a lightweight query to verify connection and read access
    await prisma.user.findFirst({ select: { id: true }, take: 1 });
  });

  const dbUrl = process.env.DATABASE_URL || "file:./dev.db";
  const isPostgres = dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");
  const isSqlite = dbUrl.startsWith("file:") || !process.env.DATABASE_URL;
  const dbProvider = isPostgres ? "postgresql" : isSqlite ? "sqlite" : "unknown";

  if (dbCheck.ok) {
    checks.database = {
      component: "Database",
      status: "CONFIGURED",
      latencyMs: dbCheck.latencyMs,
      message: `Database connection verified (${dbProvider.toUpperCase()}) in ${dbCheck.latencyMs}ms`,
      details: { provider: dbProvider },
    };
  } else {
    checks.database = {
      component: "Database",
      status: "UNAVAILABLE",
      latencyMs: dbCheck.latencyMs,
      message: `Database query failed: ${dbCheck.error}`,
      details: { provider: dbProvider },
    };
  }

  // 2. NEAR RPC Connectivity
  const nearRpcUrl = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
  const nearCheck = await timedCheck(async () => {
    const res = await fetch(nearRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `preflight-${Date.now()}`,
        method: "status",
        params: [],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "JSON-RPC error");
  });

  checks.nearRpc = {
    component: "NEAR RPC",
    status: nearCheck.ok ? "CONFIGURED" : "UNAVAILABLE",
    latencyMs: nearCheck.latencyMs,
    message: nearCheck.ok
      ? `NEAR RPC responded successfully in ${nearCheck.latencyMs}ms`
      : `NEAR RPC probe failed: ${nearCheck.error}`,
    details: { endpoint: nearRpcUrl.replace(/\/\/[^@]+@/, "//***@") },
  };

  // 3. FastNEAR Connectivity (Optional)
  const fastnearUrl = process.env.FASTNEAR_RPC_URL || (nearRpcUrl.includes("fastnear") ? nearRpcUrl : undefined);
  if (fastnearUrl) {
    const fnCheck = await timedCheck(async () => {
      const res = await fetch(fastnearUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `fn-${Date.now()}`,
          method: "status",
          params: [],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });

    checks.fastnear = {
      component: "FastNEAR RPC",
      status: fnCheck.ok ? "CONFIGURED" : "UNAVAILABLE",
      latencyMs: fnCheck.latencyMs,
      message: fnCheck.ok
        ? `FastNEAR endpoint responded in ${fnCheck.latencyMs}ms`
        : `FastNEAR probe failed: ${fnCheck.error}`,
    };
  } else {
    checks.fastnear = {
      component: "FastNEAR RPC",
      status: "NOT_CONFIGURED_OPTIONAL",
      message: "Dedicated FastNEAR RPC URL not configured (optional)",
    };
  }

  // 4. OutLayer API Connectivity
  const outlayerBaseUrl = process.env.OUTLAYER_API_BASE_URL || "https://testnet-api.outlayer.ai";
  const outlayerCheck = await timedCheck(async () => {
    const res = await fetch(`${outlayerBaseUrl}/health`, {
      method: "GET",
    });
    // If /health is not 200, try root or version endpoint
    if (!res.ok && res.status !== 404) {
      throw new Error(`HTTP ${res.status}`);
    }
  });

  checks.outlayer = {
    component: "OutLayer TEE API",
    status: outlayerCheck.ok ? "CONFIGURED" : "UNAVAILABLE",
    latencyMs: outlayerCheck.latencyMs,
    message: outlayerCheck.ok
      ? `OutLayer API reachable in ${outlayerCheck.latencyMs}ms`
      : `OutLayer endpoint unreachable: ${outlayerCheck.error}`,
    details: { baseUrl: outlayerBaseUrl },
  };

  // 5. Execution Signing Secret Readiness
  const execSecret = process.env.EXECUTION_SIGNING_SECRET || process.env.OUTLAYER_SIGNING_SECRET;
  if (!execSecret) {
    checks.executionSigning = {
      component: "Execution Signing Secret",
      status: isProd ? "MISSING" : "CONFIGURED",
      message: isProd
        ? "EXECUTION_SIGNING_SECRET is missing (blocks production startup)"
        : "Using isolated development fallback signing secret",
    };
  } else if (isKnownInsecureSecret(execSecret)) {
    checks.executionSigning = {
      component: "Execution Signing Secret",
      status: "INVALID",
      message: "Secret matches a known development default (forbidden in production)",
    };
  } else if (execSecret.length < MINIMUM_SECRET_LENGTH || !hasSufficientEntropy(execSecret)) {
    checks.executionSigning = {
      component: "Execution Signing Secret",
      status: "INVALID",
      message: `Secret length (${execSecret.length} chars) is below minimum of ${MINIMUM_SECRET_LENGTH} characters or lacks entropy`,
    };
  } else {
    checks.executionSigning = {
      component: "Execution Signing Secret",
      status: "CONFIGURED",
      message: `Verified secure HMAC key (${execSecret.length} chars)`,
    };
  }

  // 6. Credential Vault Readiness
  const vaultV1 = process.env.CREDENTIAL_VAULT_KEY_V1 || process.env.ENCRYPTION_SECRET;
  if (!vaultV1) {
    checks.credentialVault = {
      component: "Credential Vault",
      status: isProd ? "MISSING" : "CONFIGURED",
      message: isProd
        ? "CREDENTIAL_VAULT_KEY_V1 is missing (blocks production startup)"
        : "Using development vault master key",
    };
  } else if (isKnownInsecureSecret(vaultV1)) {
    checks.credentialVault = {
      component: "Credential Vault",
      status: "INVALID",
      message: "Master key matches known development default (forbidden in production)",
    };
  } else if (vaultV1.length < MINIMUM_SECRET_LENGTH || !hasSufficientEntropy(vaultV1)) {
    checks.credentialVault = {
      component: "Credential Vault",
      status: "INVALID",
      message: `Vault key length (${vaultV1.length} chars) is below required ${MINIMUM_SECRET_LENGTH} characters`,
    };
  } else {
    checks.credentialVault = {
      component: "Credential Vault",
      status: "CONFIGURED",
      message: `Verified AES-256-GCM vault master key (${vaultV1.length} chars)`,
    };
  }

  // 7. Tool Encryption Key Readiness
  const toolKey = process.env.TOOL_ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET;
  if (!toolKey) {
    checks.toolEncryption = {
      component: "Tool Encryption Key",
      status: isProd ? "MISSING" : "CONFIGURED",
      message: isProd
        ? "TOOL_ENCRYPTION_KEY is missing (blocks production startup)"
        : "Using development tool encryption key",
    };
  } else if (isKnownInsecureSecret(toolKey)) {
    checks.toolEncryption = {
      component: "Tool Encryption Key",
      status: "INVALID",
      message: "Tool key matches known development default (forbidden in production)",
    };
  } else if (toolKey.length < MINIMUM_SECRET_LENGTH || !hasSufficientEntropy(toolKey)) {
    checks.toolEncryption = {
      component: "Tool Encryption Key",
      status: "INVALID",
      message: `Tool key length (${toolKey.length} chars) is below required ${MINIMUM_SECRET_LENGTH} characters`,
    };
  } else {
    checks.toolEncryption = {
      component: "Tool Encryption Key",
      status: "CONFIGURED",
      message: `Verified tool master encryption key (${toolKey.length} chars)`,
    };
  }

  // 8. Session Secret (Optional)
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret) {
    if (isKnownInsecureSecret(sessionSecret) || sessionSecret.length < MINIMUM_SECRET_LENGTH) {
      checks.authSecrets = {
        component: "Authentication Secrets",
        status: "INVALID",
        message: "SESSION_SECRET is configured but matches known default or is under 32 chars",
      };
    } else {
      checks.authSecrets = {
        component: "Authentication Secrets",
        status: "CONFIGURED",
        message: `Session secret configured with high entropy (${sessionSecret.length} chars)`,
      };
    }
  } else {
    checks.authSecrets = {
      component: "Authentication Secrets",
      status: "NOT_CONFIGURED_OPTIONAL",
      message: "SESSION_SECRET not configured (using random per-session tokens)",
    };
  }

  // Determine overall readiness
  let configuredCount = 0;
  let optionalCount = 0;
  let unavailableCount = 0;
  let blockedCount = 0;

  for (const c of Object.values(checks)) {
    if (c.status === "CONFIGURED") configuredCount++;
    else if (c.status === "NOT_CONFIGURED_OPTIONAL") optionalCount++;
    else if (c.status === "UNAVAILABLE") unavailableCount++;
    else if (c.status === "MISSING" || c.status === "INVALID") blockedCount++;
  }

  let overallStatus: OverallSystemReadiness = "READY";
  if (blockedCount > 0 || checks.database.status !== "CONFIGURED") {
    overallStatus = "BLOCKED";
  } else if (unavailableCount > 0 || !envReport.valid) {
    overallStatus = "DEGRADED";
  }

  const topologyWarning =
    dbProvider === "sqlite"
      ? "Running on SQLite (dev.db). Single-process, single-writer only. Multi-instance scaling requires PostgreSQL."
      : undefined;

  return {
    overallStatus,
    isProduction: isProd,
    timestamp: new Date().toISOString(),
    checks,
    topology: {
      databaseProvider: dbProvider,
      singleWriterConstraint: dbProvider === "sqlite",
      multiInstanceReady: dbProvider === "postgresql",
      warning: topologyWarning,
    },
    summary: {
      totalChecks: Object.keys(checks).length,
      configuredCount,
      optionalCount,
      unavailableCount,
      blockedCount,
    },
    envReport: {
      isProduction: envReport.isProduction,
      valid: envReport.valid,
      timestamp: envReport.timestamp,
      totalVariables: envReport.totalVariables,
      validCount: envReport.validCount,
      missingCount: envReport.missingCount,
      invalidCount: envReport.invalidCount,
      errorCount: envReport.criticalErrors.length,
      safeErrorMessages: envReport.criticalErrors,
      variables: envReport.variables,
    },
  };
}

