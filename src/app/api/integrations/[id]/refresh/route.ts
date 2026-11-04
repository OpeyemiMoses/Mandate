import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { integrationRegistry } from "@/lib/integrations/registry";
import { OAuthManager } from "@/lib/integrations/oauth/oauthManager";
import { IntegrationHealthService } from "@/lib/integrations/healthService";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/[id]/refresh
 * Refreshes an expired or expiring OAuth token or triggers credential re-verification.
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

    if (connection.status === "REVOKED") {
      return NextResponse.json(
        { success: false, error: "Cannot refresh credentials on a revoked connection" },
        { status: 400 }
      );
    }

    const adapter = integrationRegistry.getAdapter(connection.providerId);
    if (!adapter) {
      return NextResponse.json(
        { success: false, error: `No adapter available for provider "${connection.providerId}"` },
        { status: 400 }
      );
    }

    const meta = adapter.getMetadata();

    // If OAuth provider and has refresh token
    if (meta.supportsOAuth && meta.oauthConfig) {
      try {
        const refreshResult = await OAuthManager.refreshAccessToken(id, {
          providerId: connection.providerId,
          clientId: process.env[`${connection.providerId.toUpperCase()}_CLIENT_ID`] || "",
          clientSecret: process.env[`${connection.providerId.toUpperCase()}_CLIENT_SECRET`],
          authorizationUrl: meta.oauthConfig.authorizationUrl,
          tokenUrl: meta.oauthConfig.tokenUrl,
          redirectUri: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/integrations/oauth/${connection.providerId}/callback`,
          scopes: meta.oauthConfig.defaultScopes,
        });

        // Run health test after refresh
        const health = await IntegrationHealthService.checkConnectionHealth(id, adapter);

        return NextResponse.json({
          success: true,
          connectionId: id,
          status: health.status,
          refreshed: true,
          expiresIn: refreshResult.expiresIn,
          health,
        });
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: `OAuth token refresh failed: ${err.message}` },
          { status: 400 }
        );
      }
    }

    // Non-OAuth: re-verify and test health
    const health = await IntegrationHealthService.checkConnectionHealth(id, adapter);
    return NextResponse.json({
      success: true,
      connectionId: id,
      status: health.status,
      refreshed: false,
      health,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to refresh integration" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

