import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { integrationRegistry } from "@/lib/integrations/registry";
import { OAuthManager } from "@/lib/integrations/oauth/oauthManager";
import { CredentialVault, CURRENT_VAULT_VERSION } from "@/lib/integrations/credentialVault";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/oauth/[providerId]/callback
 * Receives the authorization code and state parameter, validates CSRF, exchanges code for tokens,
 * encrypts credentials into the CredentialVault, and provisions the IntegrationConnection.
 */
export async function GET(
  req: Request,
  { params }: { params: { providerId: string } }
) {
  try {
    const { providerId } = params;
    const { searchParams } = new URL(req.url);

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");

    if (errorParam) {
      return NextResponse.redirect(
        new URL(`/integrations?error=${encodeURIComponent(errorDesc || errorParam)}`, req.url)
      );
    }

    if (!code || !state) {
      return NextResponse.json(
        { success: false, error: "Missing required callback parameters: code or state" },
        { status: 400 }
      );
    }

    // 1. Validate & consume OAuth session state (CSRF / Replay protection)
    const validation = await OAuthManager.validateAndConsumeSession(state, providerId);
    if (!validation.valid || !validation.session) {
      return NextResponse.json(
        { success: false, error: validation.error || "Invalid OAuth state" },
        { status: 403 }
      );
    }

    const session = validation.session;
    const adapter = integrationRegistry.getAdapter(providerId);
    if (!adapter) {
      return NextResponse.json({ success: false, error: `Provider "${providerId}" not found` }, { status: 404 });
    }

    const meta = adapter.getMetadata();
    const tokenUrl = meta.oauthConfig?.tokenUrl;
    if (!tokenUrl) {
      return NextResponse.json({ success: false, error: "Provider missing tokenUrl" }, { status: 500 });
    }

    const clientId = process.env[`${providerId.toUpperCase()}_CLIENT_ID`] || "mandate-client-id";
    const clientSecret = process.env[`${providerId.toUpperCase()}_CLIENT_SECRET`];

    // 2. Token Exchange using PKCE verifier
    const tokenResponse = await OAuthManager.exchangeCodeForTokens(code, session, {
      providerId,
      clientId,
      clientSecret,
      authorizationUrl: meta.oauthConfig!.authorizationUrl,
      tokenUrl,
      redirectUri: session.redirectUri,
      scopes: meta.oauthConfig!.defaultScopes,
    });

    // 3. Encrypt retrieved credentials
    const credentialsToStore = {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      tokenType: tokenResponse.tokenType,
      receivedAt: new Date().toISOString(),
    };

    const encryptedCredentials = CredentialVault.encrypt(credentialsToStore, CURRENT_VAULT_VERSION);
    const expiresAt = tokenResponse.expiresIn
      ? new Date(Date.now() + tokenResponse.expiresIn * 1000)
      : null;

    const grantedScopes = tokenResponse.scope
      ? tokenResponse.scope.split(/[\s,]+/)
      : meta.oauthConfig!.defaultScopes;

    // 4. Create or update connection
    const connection = await prisma.integrationConnection.create({
      data: {
        userId: session.userId,
        providerId,
        adapterType: "oauth",
        name: `${meta.name} (OAuth)`,
        status: "ACTIVE",
        authType: "OAUTH",
        encryptedCredentials,
        credentialVersion: CURRENT_VAULT_VERSION,
        grantedScopesJson: JSON.stringify(grantedScopes),
        verifiedScopesJson: JSON.stringify(grantedScopes),
        lastVerifiedAt: new Date(),
        expiresAt,
      },
    });

    // 5. Synchronize tools
    await integrationRegistry.syncConnectionTools(connection.id);

    // If request accepts HTML, redirect to UI
    const acceptHeader = req.headers.get("accept") || "";
    if (acceptHeader.includes("text/html")) {
      return NextResponse.redirect(
        new URL(`/integrations?connected=${connection.id}&provider=${providerId}`, req.url)
      );
    }

    return NextResponse.json({
      success: true,
      connectionId: connection.id,
      providerId,
      status: "ACTIVE",
      grantedScopes,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process OAuth callback" },
      { status: 500 }
    );
  }
}

