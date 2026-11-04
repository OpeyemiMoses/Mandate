import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { testIntegrationHealth } from "@/lib/discovery";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/discovery/integrations/[id]/refresh
 * Refreshes an integration's connection state and live status.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    const conn = await prisma.integrationConnection.findFirst({
      where: { id, userId: user.id },
    });

    if (!conn) {
      return NextResponse.json(
        { success: false, error: "Integration connection not found" },
        { status: 404 }
      );
    }

    const testResult = await testIntegrationHealth({
      connectionId: id,
      userId: user.id,
    });

    const updated = await prisma.integrationConnection.findUnique({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      connection: {
        id: updated?.id,
        providerId: updated?.providerId,
        name: updated?.name,
        status: updated?.status,
        lastVerifiedAt: updated?.lastVerifiedAt?.toISOString(),
      },
      health: testResult,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to refresh integration" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

