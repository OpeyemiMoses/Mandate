import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CredentialVault, CURRENT_VAULT_VERSION } from "@/lib/integrations/credentialVault";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/[id]/rotate-credentials
 * Re-encrypts stored credentials with a newer key version or updates credentials directly.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;
    const body = await req.json().catch(() => ({}));

    const connection = await prisma.integrationConnection.findFirst({
      where: { id, userId: user.id },
    });

    if (!connection) {
      return NextResponse.json({ success: false, error: "Connection not found" }, { status: 404 });
    }

    if (connection.status === "REVOKED") {
      return NextResponse.json(
        { success: false, error: "Cannot rotate credentials on a revoked connection" },
        { status: 400 }
      );
    }

    // If new credentials provided, encrypt and store them
    if (body.newCredentials) {
      const nextVersion = (connection.credentialVersion || CURRENT_VAULT_VERSION) + 1;
      const encrypted = CredentialVault.encrypt(body.newCredentials, nextVersion);

      await prisma.integrationConnection.update({
        where: { id },
        data: {
          encryptedCredentials: encrypted,
          credentialVersion: nextVersion,
          status: "ACTIVE",
        },
      });

      return NextResponse.json({
        success: true,
        connectionId: id,
        credentialVersion: nextVersion,
        message: "Credentials updated and re-encrypted successfully",
      });
    }

    // Otherwise re-encrypt existing credentials with next key version
    const nextVersion = (connection.credentialVersion || CURRENT_VAULT_VERSION) + 1;
    const rotateResult = await CredentialVault.rotateConnectionCredentials(id, nextVersion);

    return NextResponse.json({
      success: true,
      connectionId: id,
      credentialVersion: rotateResult.newVersion,
      message: "Stored credentials rotated to new encryption key version",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to rotate credentials" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

