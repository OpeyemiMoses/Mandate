import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { integrationRegistry } from "@/lib/integrations/registry";
import { CredentialVault, CURRENT_VAULT_VERSION } from "@/lib/integrations/credentialVault";
import { IntegrationHealthService } from "@/lib/integrations/healthService";
import { validateSafeUrlAsync } from "@/lib/tools/security";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/connect
 * Universal endpoint to establish a secure external integration connection.
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
      return NextResponse.json({ success: false, error: "Missing required field: providerId" }, { status: 400 });
    }

    if (!name || typeof name !== "string") {
      return NextResponse.json({ success: false, error: "Missing required field: name" }, { status: 400 });
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

    // Encrypt credentials in CredentialVault if present
    let encryptedCredentials: string | null = null;
    if (credentials && Object.keys(credentials).length > 0) {
      encryptedCredentials = CredentialVault.encrypt(credentials, CURRENT_VAULT_VERSION);
    }

    // Create integration connection in DB
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

    // Run initial health verification
    const healthReport = await IntegrationHealthService.checkConnectionHealth(connection.id, adapter);

    return NextResponse.json(
      {
        success: true,
        connection: {
          id: connection.id,
          providerId: connection.providerId,
          name: connection.name,
          adapterType: connection.adapterType,
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
    return NextResponse.json(
      { success: false, error: error.message || "Failed to establish integration connection" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

