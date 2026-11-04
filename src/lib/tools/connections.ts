import { prisma } from "@/lib/db";
import { encryptCredentials, decryptCredentials, validateSafeUrl } from "./security";

export interface CreateConnectionParams {
  userId: string;
  providerId: string;
  name: string;
  authType: "NONE" | "API_KEY" | "BEARER_TOKEN" | "BASIC" | "OAUTH";
  credentials?: Record<string, any>;
  config?: Record<string, any>;
  grantedScopes?: string[];
  expiresAt?: Date;
}

export interface VerifyConnectionResult {
  ok: boolean;
  status: "ACTIVE" | "DISCONNECTED" | "EXPIRED" | "ERROR";
  latencyMs?: number;
  error?: string;
  details?: Record<string, any>;
}

/**
 * Creates or updates an integration connection with encrypted credentials
 */
export async function createIntegrationConnection(
  params: CreateConnectionParams
) {
  const {
    userId,
    providerId,
    name,
    authType,
    credentials,
    config = {},
    grantedScopes = [],
    expiresAt,
  } = params;

  // Validate base URL if present in config
  if (config.baseUrl) {
    const urlCheck = validateSafeUrl(config.baseUrl);
    if (!urlCheck.valid) {
      throw new Error(`Invalid baseUrl: ${urlCheck.error}`);
    }
  }

  const encrypted = credentials ? encryptCredentials(credentials) : null;

  const connection = await prisma.integrationConnection.create({
    data: {
      userId,
      providerId,
      name,
      status: "ACTIVE",
      authType,
      encryptedCredentials: encrypted,
      configJson: JSON.stringify(config),
      grantedScopesJson: JSON.stringify(grantedScopes),
      lastVerifiedAt: new Date(),
      expiresAt: expiresAt || null,
    },
  });

  return sanitizeConnection(connection);
}

/**
 * Get active connection with decrypted credentials (FOR SERVER-SIDE EXECUTION ONLY)
 */
export async function getActiveConnectionWithCredentials(
  connectionId: string,
  userId: string
): Promise<{
  connection: any;
  credentials?: Record<string, any>;
  config: Record<string, any>;
}> {
  const connection = await prisma.integrationConnection.findFirst({
    where: { id: connectionId, userId },
  });

  if (!connection) {
    throw new Error(`Connection "${connectionId}" not found or unauthorized`);
  }

  if (connection.status !== "ACTIVE") {
    throw new Error(
      `Integration connection "${connection.name}" is ${connection.status.toLowerCase()} and cannot be used.`
    );
  }

  if (connection.expiresAt && new Date() > connection.expiresAt) {
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { status: "EXPIRED" },
    });
    throw new Error(`Integration connection "${connection.name}" has expired.`);
  }

  let credentials: Record<string, any> | undefined;
  if (connection.encryptedCredentials) {
    try {
      credentials = decryptCredentials(connection.encryptedCredentials);
    } catch (e: any) {
      throw new Error(`Failed to decrypt credentials: ${e.message}`);
    }
  }

  let config: Record<string, any> = {};
  try {
    config = JSON.parse(connection.configJson || "{}");
  } catch {}

  return {
    connection,
    credentials,
    config,
  };
}

/**
 * Test & verify a user connection
 */
export async function verifyConnection(
  connectionId: string,
  userId: string
): Promise<VerifyConnectionResult> {
  const start = Date.now();
  try {
    const { connection, config } = await getActiveConnectionWithCredentials(
      connectionId,
      userId
    );

    // Verification by provider type
    if (connection.providerId === "near_rpc") {
      const rpcUrl = config.baseUrl || "https://rpc.testnet.near.org";
      const checkRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "check",
          method: "status",
          params: [],
        }),
      });
      if (!checkRes.ok) throw new Error(`RPC status returned ${checkRes.status}`);
    } else if (connection.providerId === "rest_api" && config.baseUrl) {
      const urlCheck = validateSafeUrl(config.baseUrl);
      if (!urlCheck.valid) throw new Error(urlCheck.error);
    }

    const latencyMs = Date.now() - start;
    await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        lastVerifiedAt: new Date(),
        status: "ACTIVE",
      },
    });

    return {
      ok: true,
      status: "ACTIVE",
      latencyMs,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: "ERROR",
      latencyMs: Date.now() - start,
      error: err.message,
    };
  }
}

/**
 * Disconnect an integration
 */
export async function disconnectConnection(connectionId: string, userId: string) {
  const connection = await prisma.integrationConnection.findFirst({
    where: { id: connectionId, userId },
  });

  if (!connection) {
    throw new Error(`Connection "${connectionId}" not found or unauthorized`);
  }

  const updated = await prisma.integrationConnection.update({
    where: { id: connectionId },
    data: { status: "DISCONNECTED" },
  });

  return sanitizeConnection(updated);
}

/**
 * Revoke an integration connection and permanently wipe encrypted credentials
 */
export async function revokeConnection(connectionId: string, userId: string) {
  const connection = await prisma.integrationConnection.findFirst({
    where: { id: connectionId, userId },
  });

  if (!connection) {
    throw new Error(`Connection "${connectionId}" not found or unauthorized`);
  }

  const updated = await prisma.integrationConnection.update({
    where: { id: connectionId },
    data: {
      status: "REVOKED",
      encryptedCredentials: null,
    },
  });

  return sanitizeConnection(updated);
}

/**
 * List user integration connections without exposing secrets
 */
export async function listUserConnections(userId: string) {
  const connections = await prisma.integrationConnection.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return connections.map(sanitizeConnection);
}

function sanitizeConnection(conn: any) {
  let config = {};
  let grantedScopes = [];
  try {
    config = JSON.parse(conn.configJson || "{}");
  } catch {}
  try {
    grantedScopes = JSON.parse(conn.grantedScopesJson || "[]");
  } catch {}

  return {
    id: conn.id,
    userId: conn.userId,
    providerId: conn.providerId,
    name: conn.name,
    status: conn.status,
    authType: conn.authType,
    config,
    grantedScopes,
    hasCredentials: Boolean(conn.encryptedCredentials),
    lastVerifiedAt: conn.lastVerifiedAt?.toISOString() || null,
    expiresAt: conn.expiresAt?.toISOString() || null,
    createdAt: conn.createdAt.toISOString(),
  };
}

