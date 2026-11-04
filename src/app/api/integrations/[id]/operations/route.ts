import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { integrationRegistry } from "@/lib/integrations/registry";
import { OperationPermissionService } from "@/lib/integrations/permissionService";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/[id]/operations
 * Lists supported operations for this connection with permission levels, risk classification,
 * enabled status, and agent type access rules.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    const connection = await prisma.integrationConnection.findFirst({
      where: { id, userId: user.id },
      include: { operationPermissions: true },
    });

    if (!connection) {
      return NextResponse.json({ success: false, error: "Connection not found" }, { status: 404 });
    }

    const adapter = integrationRegistry.getAdapter(connection.providerId);
    if (!adapter) {
      return NextResponse.json(
        { success: false, error: `No adapter available for provider "${connection.providerId}"` },
        { status: 400 }
      );
    }

    const operations = await adapter.getSupportedOperations();

    // Ensure permissions are synced
    await OperationPermissionService.syncOperationPermissions(id, operations);

    const refreshed = await prisma.integrationConnection.findUnique({
      where: { id },
      include: { operationPermissions: true },
    });

    const permMap = new Map((refreshed?.operationPermissions || []).map((p) => [p.operationId, p]));

    const result = operations.map((op) => {
      const perm = permMap.get(op.id);
      let allowedAgentTypes: string[] = ["*"];
      try {
        allowedAgentTypes = JSON.parse(perm?.allowedAgentTypesJson || "[\"*\"]");
      } catch (e) {
        allowedAgentTypes = ["*"];
      }

      return {
        id: op.id,
        name: op.name,
        description: op.description,
        category: op.category,
        defaultPermissionLevel: op.defaultPermissionLevel,
        currentPermissionLevel: perm?.permissionLevel || op.defaultPermissionLevel,
        riskClassification: perm?.riskClassification || op.riskClassification,
        isEnabled: perm ? perm.isEnabled : true,
        requiresApproval: perm ? perm.requiresApproval : false,
        allowedAgentTypes,
        parameters: op.parameters,
      };
    });

    return NextResponse.json({
      success: true,
      connectionId: id,
      providerId: connection.providerId,
      operations: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch operations" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

