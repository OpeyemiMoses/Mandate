import { NextResponse } from "next/server";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { integrationRegistry } from "@/lib/integrations/registry";
import { CredentialVault, CURRENT_VAULT_VERSION } from "@/lib/integrations/credentialVault";
import { IntegrationHealthService } from "@/lib/integrations/healthService";
import { validateSafeUrlAsync } from "@/lib/tools/security";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations
 * Lists all integration connections for the authenticated user with redacted credentials and live health metadata.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const connections = await prisma.integrationConnection.findMany({
      where: { userId: user.id },
      include: {
        operationPermissions: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const sanitized = connections.map((c) => {
      let config: any = {};
      let grantedScopes: string[] = [];
      let verifiedScopes: string[] = [];
      let healthMeta: any = {};

      try {
        config = JSON.parse(c.configJson || "{}");
      } catch {}
      try {
        grantedScopes = JSON.parse(c.grantedScopesJson || "[]");
      } catch {}
      try {
        verifiedScopes = JSON.parse(c.verifiedScopesJson || "[]");
      } catch {}
      try {
        healthMeta = JSON.parse(c.healthMetadataJson || "{}");
      } catch {}

      return {
        id: c.id,
        userId: c.userId,
        providerId: c.providerId,
        adapterType: c.adapterType,
        name: c.name,
        status: c.status,
        authType: c.authType,
        credentialVersion: c.credentialVersion,
        hasCredentials: Boolean(c.encryptedCredentials),
        config: CredentialVault.redactSecrets(config),
        grantedScopes,
        verifiedScopes,
        health: healthMeta,
        operationsCount: c.operationPermissions.length,
        enabledOperationsCount: c.operationPermissions.filter((p) => p.isEnabled).length,
        lastVerifiedAt: c.lastVerifiedAt?.toISOString() || null,
        expiresAt: c.expiresAt?.toISOString() || null,
        revokedAt: c.revokedAt?.toISOString() || null,
        createdAt: c.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      count: sanitized.length,
      connections: sanitized,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * POST /api/integrations
 * Creates a new user integration connection with AES-256-GCM encrypted credentials.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    const {
      providerId,
      name,
      adapterType,
      authType = "NONE",
      credentials,
      config = {},
      grantedScopes = [],
      expiresAt,
    } = body;

    if (!providerId || typeof providerId !== "string") {
      return NextResponse.json({ success: false, error: "Missing or invalid providerId" }, { status: 400 });
    }

    if (!name || typeof name !== "string") {
      return NextResponse.json({ success: false, error: "Missing or invalid connection name" }, { status: 400 });
    }

    const adapter = integrationRegistry.getAdapter(providerId);
    if (!adapter) {
      return NextResponse.json(
        { success: false, error: `Unrecognized integration provider: "${providerId}"` },
        { status: 400 }
      );
    }

    // Validate configuration
    const validation = adapter.validateConfiguration(config);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: `Invalid configuration: ${validation.errors.join("; ")}` },
        { status: 400 }
      );
    }

    // Connection-time SSRF and DNS rebinding validation
    const targetUrl = config.baseUrl || config.serverUrl || config.webhookUrl;
    if (targetUrl && typeof targetUrl === "string") {
      const safeCheck = await validateSafeUrlAsync(targetUrl);
      if (!safeCheck.valid) {
        return NextResponse.json(
          { success: false, error: `SSRF connection rejected: ${safeCheck.error}` },
          { status: 400 }
        );
      }
    }

    let encryptedCredentials: string | null = null;
    if (credentials && Object.keys(credentials).length > 0) {
      encryptedCredentials = CredentialVault.encrypt(credentials, CURRENT_VAULT_VERSION);
    }

    const connection = await prisma.integrationConnection.create({
      data: {
        userId: user.id,
        providerId,
        adapterType: adapterType || (providerId === "mcp_server" ? "mcp" : "rest"),
        name,
        status: "CONNECTED",
        authType,
        encryptedCredentials,
        credentialVersion: CURRENT_VAULT_VERSION,
        configJson: JSON.stringify(config),
        grantedScopesJson: JSON.stringify(grantedScopes),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    // Synchronize tools into Mandate Tool Registry
    await integrationRegistry.syncConnectionTools(connection.id);

    // Initial health check
    const healthReport = await IntegrationHealthService.checkConnectionHealth(connection.id, adapter);

    return NextResponse.json(
      {
        success: true,
        connection: {
          id: connection.id,
          providerId: connection.providerId,
          adapterType: connection.adapterType,
          name: connection.name,
          status: healthReport.status,
          authType: connection.authType,
          credentialVersion: connection.credentialVersion,
          hasCredentials: Boolean(encryptedCredentials),
          grantedScopes,
          lastVerifiedAt: healthReport.testedAt,
          health: healthReport,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
