import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyConnection } from "@/lib/tools/connections";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/[id]/verify
 * Tests connectivity and verifies credentials for an integration connection.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    const result = await verifyConnection(id, user.id);

    return NextResponse.json({
      success: result.ok,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to verify connection" },
      { status: 500 }
    );
  }
}

