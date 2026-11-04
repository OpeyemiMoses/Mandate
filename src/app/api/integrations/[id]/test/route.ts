import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { integrationRegistry } from "@/lib/integrations/registry";
import { IntegrationHealthService } from "@/lib/integrations/healthService";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/[id]/test
 * Executes an active, live diagnostic health check on an integration connection.
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
    if (!adapter) {
      return NextResponse.json(
        { success: false, error: `No adapter available for provider "${connection.providerId}"` },
        { status: 400 }
      );
    }

    const report = await IntegrationHealthService.checkConnectionHealth(id, adapter);

    return NextResponse.json({
      success: true,
      connectionId: id,
      providerId: connection.providerId,
      report,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to test integration health" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

