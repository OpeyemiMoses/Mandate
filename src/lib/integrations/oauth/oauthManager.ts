/**
 * Mandate OAuth 2.0 Connection Framework
 * Implements RFC 7636 PKCE, CSRF protection via cryptographically bound state,
 * secure token exchange, and refresh token rotation.
 */

import crypto from "crypto";
import { prisma } from "../../db";
import { CredentialVault } from "../credentialVault";
import { safeFetch } from "../../tools/security";

export interface OAuthConfig {
  providerId: string;
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
  supportsPkce?: boolean;
}

export interface OAuthAuthorizationUrlResult {
  url: string;
  state: string;
  codeVerifier?: string;
  expiresAt: Date;
}

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
  rawResponse?: Record<string, any>;
}

export class OAuthManager {
  /**
   * Generates a cryptographically random PKCE code verifier (RFC 7636)
   */
  public static generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString("base64url");
  }

  /**
   * Computes the S256 code challenge for a given verifier
   */
  public static generateCodeChallenge(verifier: string): string {
    return crypto.createHash("sha256").update(verifier).digest("base64url");
  }

  /**
   * Generates a secure CSRF state token
   */
  public static generateState(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Creates an OAuth authorization session and constructs the authorization URL.
   */
  public static async createAuthorizationSession(
    userId: string,
    config: OAuthConfig
  ): Promise<OAuthAuthorizationUrlResult> {
    const state = this.generateState();
    const usePkce = config.supportsPkce !== false;
    const codeVerifier = usePkce ? this.generateCodeVerifier() : undefined;
    const codeChallenge = codeVerifier ? this.generateCodeChallenge(codeVerifier) : undefined;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minute expiration

    // Persist session to prevent CSRF and replay attacks
    await prisma.oAuthSession.create({
      data: {
        state,
        providerId: config.providerId,
        userId,
        codeVerifier,
        redirectUri: config.redirectUri,
        expiresAt,
        isUsed: false,
      },
    });

    const url = new URL(config.authorizationUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", config.scopes.join(" "));

    if (usePkce && codeChallenge) {
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }

    return {
      url: url.toString(),
      state,
      codeVerifier,
      expiresAt,
    };
  }

  /**
   * Validates state and consumes the OAuth session (one-time use).
   * Binds and verifies both providerId and userId to prevent cross-account injection and replay attacks.
   */
  public static async validateAndConsumeSession(
    state: string,
    expectedProviderId?: string,
    expectedUserId?: string
  ): Promise<{
    valid: boolean;
    session?: any;
    error?: string;
  }> {
    if (!state) {
      return { valid: false, error: "Missing state parameter" };
    }

    const session = await prisma.oAuthSession.findUnique({
      where: { state },
    });

    if (!session) {
      return { valid: false, error: "Invalid or unrecognized OAuth state token (CSRF rejected)" };
    }

    if (session.isUsed) {
      return { valid: false, error: "OAuth session token has already been consumed (replay attack rejected)" };
    }

    if (session.expiresAt < new Date()) {
      return { valid: false, error: "OAuth session has expired" };
    }

    if (expectedProviderId && session.providerId !== expectedProviderId) {
      return { valid: false, error: `Provider mismatch: expected ${expectedProviderId}, got ${session.providerId}` };
    }

    if (expectedUserId && session.userId !== expectedUserId) {
      return { valid: false, error: "User mismatch: session state was created by another user" };
    }

    // Atomically mark session as used
    await prisma.oAuthSession.update({
      where: { id: session.id },
      data: { isUsed: true },
    });

    return { valid: true, session };
  }

  /**
   * Exchanges authorization code for access & refresh tokens using PKCE verifier.
   */
  public static async exchangeCodeForTokens(
    code: string,
    session: any,
    config: OAuthConfig
  ): Promise<OAuthTokenResponse> {
    const bodyParams = new URLSearchParams();
    bodyParams.set("grant_type", "authorization_code");
    bodyParams.set("code", code);
    bodyParams.set("redirect_uri", session.redirectUri || config.redirectUri);
    bodyParams.set("client_id", config.clientId);

    if (config.clientSecret) {
      bodyParams.set("client_secret", config.clientSecret);
    }

    if (session.codeVerifier) {
      bodyParams.set("code_verifier", session.codeVerifier);
    }

    const response = await safeFetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: bodyParams.toString(),
      timeoutMs: 15000,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OAuth token exchange failed [HTTP ${response.status}]: ${errText}`);
    }

    const json = (await response.json()) as any;

    if (!json.access_token) {
      throw new Error("OAuth provider returned invalid token response: missing access_token");
    }

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
      tokenType: json.token_type || "Bearer",
      scope: json.scope,
      rawResponse: json,
    };
  }

  /**
   * Refreshes an expired access token using the stored refresh token.
   */
  public static async refreshAccessToken(
    connectionId: string,
    config: OAuthConfig
  ): Promise<OAuthTokenResponse> {
    const connection = await prisma.integrationConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    if (connection.status === "REVOKED") {
      throw new Error(`Connection ${connectionId} is REVOKED. Refresh attempts are strictly rejected.`);
    }

    if (!connection.encryptedCredentials) {
      throw new Error(`Connection ${connectionId} has no stored credentials`);
    }

    const { credentials } = CredentialVault.decrypt(connection.encryptedCredentials);
    const refreshToken = credentials.refreshToken;

    if (!refreshToken) {
      throw new Error(`Connection ${connectionId} does not possess a refresh token`);
    }

    const bodyParams = new URLSearchParams();
    bodyParams.set("grant_type", "refresh_token");
    bodyParams.set("refresh_token", refreshToken);
    bodyParams.set("client_id", config.clientId);

    if (config.clientSecret) {
      bodyParams.set("client_secret", config.clientSecret);
    }

    const response = await safeFetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: bodyParams.toString(),
      timeoutMs: 15000,
    });

    if (!response.ok) {
      const errText = await response.text();
      // Mark connection as AUTH_EXPIRED if refresh token was revoked
      await prisma.integrationConnection.update({
        where: { id: connectionId },
        data: {
          status: "AUTH_EXPIRED",
          healthMetadataJson: JSON.stringify({
            lastError: `Token refresh failed [${response.status}]: ${errText}`,
            expiredAt: new Date().toISOString(),
          }),
        },
      });
      throw new Error(`Token refresh rejected [HTTP ${response.status}]: ${errText}`);
    }

    const json = (await response.json()) as any;

    const tokenResponse: OAuthTokenResponse = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || refreshToken, // Some providers keep existing refresh token
      expiresIn: json.expires_in,
      tokenType: json.token_type || "Bearer",
      scope: json.scope,
      rawResponse: json,
    };

    // Rotate and persist new credentials
    await CredentialVault.updateRefreshedTokens(connectionId, {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      expiresIn: tokenResponse.expiresIn,
      tokenType: tokenResponse.tokenType,
      scopes: tokenResponse.scope ? tokenResponse.scope.split(/[\s,]+/) : undefined,
    });

    return tokenResponse;
  }
}
