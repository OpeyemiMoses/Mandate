import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CredentialVault } from "@/lib/integrations/credentialVault";
import { integrationRegistry } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/[id]/revoke
 * Permanently revokes an integration, immediately zeroing out all stored credentials.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const reason = body?.reason || "User requested permanent revocation";

    const connection = await prisma.integrationConnection.findFirst({
      where: { id, userId: user.id },
    });

    if (!connection) {
      return NextResponse.json({ success: false, error: "Connection not found" }, { status: 404 });
    }

    // Zero out credentials and update state
    await CredentialVault.revokeConnection(id, reason);

    // Deactivate in Tool Registry
    await integrationRegistry.deactivateConnectionTools(id);

    return NextResponse.json({
      success: true,
      connectionId: id,
      status: "REVOKED",
      message: "Integration permanently revoked and credentials purged",
      revokedAt: new Date(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to revoke integration" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

