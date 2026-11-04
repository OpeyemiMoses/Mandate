import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { integrationRegistry } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/integrations/[id]/operations/[operationId]/permissions
 * Configures granular permissions for an operation on an integration connection.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; operationId: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: connectionId, operationId } = params;
    const body = await req.json();

    const connection = await prisma.integrationConnection.findFirst({
      where: { id: connectionId, userId: user.id },
    });

    if (!connection) {
      return NextResponse.json({ success: false, error: "Connection not found" }, { status: 404 });
    }

    const {
      permissionLevel,
      riskClassification,
      isEnabled,
      requiresApproval,
      allowedAgentTypes,
    } = body;

    const validLevels = ["READ", "PROPOSE", "RESTRICTED_EXECUTION", "USER_ONLY"];
    if (permissionLevel && !validLevels.includes(permissionLevel)) {
      return NextResponse.json(
        { success: false, error: `Invalid permissionLevel. Must be one of: ${validLevels.join(", ")}` },
        { status: 400 }
      );
    }

    const validRisks = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    if (riskClassification && !validRisks.includes(riskClassification)) {
      return NextResponse.json(
        { success: false, error: `Invalid riskClassification. Must be one of: ${validRisks.join(", ")}` },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (permissionLevel) updateData.permissionLevel = permissionLevel;
    if (riskClassification) updateData.riskClassification = riskClassification;
    if (typeof isEnabled === "boolean") updateData.isEnabled = isEnabled;
    if (typeof requiresApproval === "boolean") updateData.requiresApproval = requiresApproval;
    if (Array.isArray(allowedAgentTypes)) {
      updateData.allowedAgentTypesJson = JSON.stringify(allowedAgentTypes);
    }

    const updated = await prisma.integrationOperationPermission.upsert({
      where: {
        connectionId_operationId: {
          connectionId,
          operationId,
        },
      },
      create: {
        connectionId,
        operationId,
        permissionLevel: permissionLevel || "READ",
        riskClassification: riskClassification || "LOW",
        isEnabled: isEnabled !== undefined ? isEnabled : true,
        requiresApproval: requiresApproval !== undefined ? requiresApproval : false,
        allowedAgentTypesJson: JSON.stringify(allowedAgentTypes || ["*"]),
      },
      update: updateData,
    });

    // Re-sync tools with Tool Registry to reflect changes
    await integrationRegistry.syncConnectionTools(connectionId);

    return NextResponse.json({
      success: true,
      permission: {
        id: updated.id,
        connectionId: updated.connectionId,
        operationId: updated.operationId,
        permissionLevel: updated.permissionLevel,
        riskClassification: updated.riskClassification,
        isEnabled: updated.isEnabled,
        requiresApproval: updated.requiresApproval,
        allowedAgentTypes: JSON.parse(updated.allowedAgentTypesJson),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update operation permissions" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

