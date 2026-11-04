import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UniversalMcpAdapter } from "@/lib/integrations/adapters/mcpAdapter";
import { CredentialVault } from "@/lib/integrations/credentialVault";
import { integrationRegistry } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/mcp/[id]/discover-tools
 * Re-queries tools/list from a connected MCP server and synchronizes newly discovered tools.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    const connection = await prisma.integrationConnection.findFirst({
      where: { id, userId: user.id },
    });

    if (!connection) {
      return NextResponse.json({ success: false, error: "Connection not found" }, { status: 404 });
    }

    let config: any = {};
    try {
      config = JSON.parse(connection.configJson || "{}");
    } catch {}

    const serverUrl = config.serverUrl;
    if (!serverUrl) {
      return NextResponse.json(
        { success: false, error: "Connection config missing serverUrl" },
        { status: 400 }
      );
    }

    let credentials;
    if (connection.encryptedCredentials) {
      try {
        credentials = CredentialVault.decrypt(connection.encryptedCredentials).credentials;
      } catch {}
    }

    const adapter = new UniversalMcpAdapter();
    const discovered = await adapter.discoverTools(serverUrl, credentials);

    // Update / upsert operation permissions
    for (const tool of discovered) {
      await prisma.integrationOperationPermission.upsert({
        where: {
          connectionId_operationId: {
            connectionId: id,
            operationId: tool.id,
          },
        },
        create: {
          connectionId: id,
          operationId: tool.id,
          permissionLevel: tool.defaultPermissionLevel,
          riskClassification: tool.riskClassification,
          isEnabled: true,
          requiresApproval: tool.defaultPermissionLevel === "PROPOSE",
          allowedAgentTypesJson: JSON.stringify(["*"]),
        },
        update: {
          riskClassification: tool.riskClassification,
        },
      });
    }

    // Synchronize tools into Mandate Tool Registry
    await integrationRegistry.syncConnectionTools(id);

    return NextResponse.json({
      success: true,
      connectionId: id,
      discoveredToolsCount: discovered.length,
      tools: discovered.map((t) => ({
        id: t.id,
        name: t.name,
        permissionLevel: t.defaultPermissionLevel,
        riskClassification: t.riskClassification,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to discover MCP tools" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

