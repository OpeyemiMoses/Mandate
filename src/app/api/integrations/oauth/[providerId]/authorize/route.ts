import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { integrationRegistry } from "@/lib/integrations/registry";
import { OAuthManager } from "@/lib/integrations/oauth/oauthManager";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/oauth/[providerId]/authorize
 * Starts an OAuth 2.0 PKCE authorization flow and returns the provider authorization URL.
 */
export async function POST(
  req: Request,
  { params }: { params: { providerId: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { providerId } = params;
    const body = await req.json().catch(() => ({}));

    const adapter = integrationRegistry.getAdapter(providerId);
    if (!adapter) {
      return NextResponse.json({ success: false, error: `Provider "${providerId}" not found` }, { status: 404 });
    }

    const meta = adapter.getMetadata();
    if (!meta.supportsOAuth || !meta.oauthConfig) {
      return NextResponse.json(
        { success: false, error: `Provider "${providerId}" does not support OAuth authentication` },
        { status: 400 }
      );
    }

    const redirectUri =
      body.redirectUri ||
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/integrations/oauth/${providerId}/callback`;

    const clientId =
      body.clientId ||
      process.env[`${providerId.toUpperCase()}_CLIENT_ID`] ||
      "mandate-client-id";

    const scopes = body.scopes || meta.oauthConfig.defaultScopes;

    const authSession = await OAuthManager.createAuthorizationSession(user.id, {
      providerId,
      clientId,
      authorizationUrl: meta.oauthConfig.authorizationUrl,
      tokenUrl: meta.oauthConfig.tokenUrl,
      redirectUri,
      scopes,
      supportsPkce: meta.oauthConfig.supportsPkce,
    });

    return NextResponse.json({
      success: true,
      providerId,
      authorizationUrl: authSession.url,
      state: authSession.state,
      expiresAt: authSession.expiresAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to initiate OAuth authorization" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

