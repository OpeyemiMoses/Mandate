import { NextResponse } from "next/server";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CredentialVault } from "@/lib/integrations/credentialVault";
import { integrationRegistry } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/[id]
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
      include: {
        operationPermissions: true,
      },
    });

    if (!connection) {
      return NextResponse.json({ success: false, error: "Connection not found" }, { status: 404 });
    }

    let config = {};
    let grantedScopes = [];
    let verifiedScopes = [];
    let healthMeta = {};

    try {
      config = JSON.parse(connection.configJson || "{}");
    } catch {}
    try {
      grantedScopes = JSON.parse(connection.grantedScopesJson || "[]");
    } catch {}
    try {
      verifiedScopes = JSON.parse(connection.verifiedScopesJson || "[]");
    } catch {}
    try {
      healthMeta = JSON.parse(connection.healthMetadataJson || "{}");
    } catch {}

    return NextResponse.json({
      success: true,
      connection: {
        id: connection.id,
        userId: connection.userId,
        providerId: connection.providerId,
        adapterType: connection.adapterType,
        name: connection.name,
        status: connection.status,
        authType: connection.authType,
        credentialVersion: connection.credentialVersion,
        config: CredentialVault.redactSecrets(config),
        grantedScopes,
        verifiedScopes,
        health: healthMeta,
        hasCredentials: Boolean(connection.encryptedCredentials),
        operations: connection.operationPermissions.map((op) => ({
          id: op.id,
          operationId: op.operationId,
          permissionLevel: op.permissionLevel,
          riskClassification: op.riskClassification,
          isEnabled: op.isEnabled,
          requiresApproval: op.requiresApproval,
          allowedAgentTypes: JSON.parse(op.allowedAgentTypesJson || "[\"*\"]"),
        })),
        lastVerifiedAt: connection.lastVerifiedAt?.toISOString() || null,
        expiresAt: connection.expiresAt?.toISOString() || null,
        revokedAt: connection.revokedAt?.toISOString() || null,
        createdAt: connection.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * PATCH /api/integrations/[id]
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;
    const body = await req.json();

    const connection = await prisma.integrationConnection.findFirst({
      where: { id, userId: user.id },
    });

    if (!connection) {
      return NextResponse.json({ success: false, error: "Connection not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (typeof body.name === "string") updateData.name = body.name;
    if (body.config && typeof body.config === "object") {
      updateData.configJson = JSON.stringify(body.config);
    }
    if (body.status) {
      updateData.status = body.status;
    }

    const updated = await prisma.integrationConnection.update({
      where: { id },
      data: updateData,
    });

    if (body.status === "ACTIVE") {
      await integrationRegistry.syncConnectionTools(id);
    } else if (body.status === "DISABLED" || body.status === "REVOKED") {
      await integrationRegistry.deactivateConnectionTools(id);
    }

    return NextResponse.json({
      success: true,
      connection: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * DELETE /api/integrations/[id]
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;
    const { searchParams } = new URL(req.url);
    const permanent = searchParams.get("action") === "revoke";

    const connection = await prisma.integrationConnection.findFirst({
      where: { id, userId: user.id },
    });

    if (!connection) {
      return NextResponse.json({ success: false, error: "Connection not found" }, { status: 404 });
    }

    if (permanent) {
      await CredentialVault.revokeConnection(id, "User requested permanent revocation");
      await integrationRegistry.deactivateConnectionTools(id);
      return NextResponse.json({
        success: true,
        connectionId: id,
        status: "REVOKED",
        message: "Integration permanently revoked and credentials purged",
      });
    } else {
      await prisma.integrationConnection.update({
        where: { id },
        data: { status: "DISABLED", disconnectedAt: new Date() },
      });
      await integrationRegistry.deactivateConnectionTools(id);
      return NextResponse.json({
        success: true,
        connectionId: id,
        status: "DISABLED",
        message: "Integration disconnected",
      });
    }
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
