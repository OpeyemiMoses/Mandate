import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { testIntegrationHealth } from "@/lib/discovery";

export const dynamic = "force-dynamic";

/**
 * POST /api/discovery/integrations/[id]/test
 * Executes a live health check on the specified integration connection.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    const result = await testIntegrationHealth({
      connectionId: id,
      userId: user.id,
    });

    return NextResponse.json({
      success: result.success,
      health: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to test integration health" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

