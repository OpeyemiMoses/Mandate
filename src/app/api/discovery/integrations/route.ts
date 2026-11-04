import { NextResponse } from "next/server";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserIntegrationsState, SUPPORTED_INTEGRATIONS_CATALOG } from "@/lib/discovery";

export const dynamic = "force-dynamic";

/**
 * GET /api/discovery/integrations
 * Retrieves the integration catalog mapped to the user's connection states.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const states = await getUserIntegrationsState(user.id);

    return NextResponse.json({
      success: true,
      count: states.length,
      integrations: states,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * POST /api/discovery/integrations
 * Connects or updates an integration for the authenticated user.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { providerId, name, credentials, config } = body;

    if (!providerId) {
      return NextResponse.json(
        { success: false, error: "Missing required providerId" },
        { status: 400 }
      );
    }

    const catalogItem = SUPPORTED_INTEGRATIONS_CATALOG.find((i) => i.providerId === providerId);
    if (!catalogItem) {
      return NextResponse.json(
        { success: false, error: `Unsupported integration provider: "${providerId}"` },
        { status: 400 }
      );
    }

    const existing = await prisma.integrationConnection.findFirst({
      where: { userId: user.id, providerId },
    });

    let connection;
    if (existing) {
      connection = await prisma.integrationConnection.update({
        where: { id: existing.id },
        data: {
          name: name || existing.name,
          status: "ACTIVE",
          encryptedCredentials: credentials ? JSON.stringify(credentials) : existing.encryptedCredentials,
          configJson: config ? JSON.stringify(config) : existing.configJson,
          lastVerifiedAt: new Date(),
        },
      });
    } else {
      connection = await prisma.integrationConnection.create({
        data: {
          userId: user.id,
          providerId,
          name: name || catalogItem.name,
          status: "ACTIVE",
          authType: catalogItem.authType,
          encryptedCredentials: credentials ? JSON.stringify(credentials) : null,
          configJson: config ? JSON.stringify(config) : JSON.stringify(catalogItem.defaultConfig || {}),
          grantedScopesJson: JSON.stringify(catalogItem.requiredScopes || []),
          lastVerifiedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      connection: {
        id: connection.id,
        providerId: connection.providerId,
        name: connection.name,
        status: connection.status,
        lastVerifiedAt: connection.lastVerifiedAt?.toISOString(),
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

