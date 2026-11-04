import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { integrationRegistry } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/[id]/disconnect
 * Gracefully disconnects an integration and deactivates its tools in the registry.
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

    const adapter = integrationRegistry.getAdapter(connection.providerId);
    if (adapter) {
      await adapter.disconnect(id).catch(() => {});
    }

    await prisma.integrationConnection.update({
      where: { id },
      data: {
        status: "DISABLED",
        disconnectedAt: new Date(),
      },
    });

    await integrationRegistry.deactivateConnectionTools(id);

    return NextResponse.json({
      success: true,
      connectionId: id,
      status: "DISABLED",
      message: "Integration disconnected and tools deactivated",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to disconnect integration" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

