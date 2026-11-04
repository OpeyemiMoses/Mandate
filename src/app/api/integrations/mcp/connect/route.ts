import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { integrationRegistry } from "@/lib/integrations/registry";
import { UniversalMcpAdapter } from "@/lib/integrations/adapters/mcpAdapter";
import { CredentialVault, CURRENT_VAULT_VERSION } from "@/lib/integrations/credentialVault";
import { validateSafeUrlAsync } from "@/lib/tools/security";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/mcp/connect
 * Connects an external Model Context Protocol (MCP) server, validates SSRF security,
 * queries tools/list, encrypts credentials, and registers tools into Mandate.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    const { serverUrl, name, authToken } = body;

    if (!serverUrl || typeof serverUrl !== "string") {
      return NextResponse.json({ success: false, error: "Missing required field: serverUrl" }, { status: 400 });
    }

    // SSRF & DNS rebinding check
    const safeCheck = await validateSafeUrlAsync(serverUrl);
    if (!safeCheck.valid) {
      return NextResponse.json(
        { success: false, error: `SSRF Blocked: ${safeCheck.error}` },
        { status: 400 }
      );
    }

    const mcpAdapter = new UniversalMcpAdapter();
    const credentials = authToken ? { token: authToken } : undefined;

    // Discover tools from server
    let discoveredTools;
    try {
      discoveredTools = await mcpAdapter.discoverTools(serverUrl, credentials);
    } catch (discErr: any) {
      return NextResponse.json(
        { success: false, error: `Failed to discover tools from MCP server: ${discErr.message}` },
        { status: 400 }
      );
    }

    let encryptedCredentials: string | null = null;
    if (credentials) {
      encryptedCredentials = CredentialVault.encrypt(credentials, CURRENT_VAULT_VERSION);
    }

    const connectionName = name || `MCP Server (${new URL(serverUrl).hostname})`;

    const connection = await prisma.integrationConnection.create({
      data: {
        userId: user.id,
        providerId: "mcp_server",
        adapterType: "mcp",
        name: connectionName,
        status: "ACTIVE",
        authType: authToken ? "BEARER_TOKEN" : "NONE",
        encryptedCredentials,
        credentialVersion: CURRENT_VAULT_VERSION,
        configJson: JSON.stringify({ serverUrl }),
        grantedScopesJson: JSON.stringify(["mcp:tools:list", "mcp:tools:call"]),
        verifiedScopesJson: JSON.stringify(["mcp:tools:list", "mcp:tools:call"]),
        lastVerifiedAt: new Date(),
        healthMetadataJson: JSON.stringify({
          discoveredToolsCount: discoveredTools.length,
          serverUrl,
        }),
      },
    });

    // Populate operation permissions for discovered tools
    for (const tool of discoveredTools) {
      await prisma.integrationOperationPermission.create({
        data: {
          connectionId: connection.id,
          operationId: tool.id,
          permissionLevel: tool.defaultPermissionLevel,
          riskClassification: tool.riskClassification,
          isEnabled: true,
          requiresApproval: tool.defaultPermissionLevel === "PROPOSE",
          allowedAgentTypesJson: JSON.stringify(["*"]),
        },
      });
    }

    // Synchronize tools into Mandate Tool Registry
    await integrationRegistry.syncConnectionTools(connection.id);

    return NextResponse.json(
      {
        success: true,
        connection: {
          id: connection.id,
          name: connection.name,
          providerId: "mcp_server",
          adapterType: "mcp",
          status: "ACTIVE",
          serverUrl,
          discoveredToolsCount: discoveredTools.length,
          tools: discoveredTools.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            permissionLevel: t.defaultPermissionLevel,
            riskClassification: t.riskClassification,
          })),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to connect MCP server" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

