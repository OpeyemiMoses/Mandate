import { NextResponse } from "next/server";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { discoverUniversalCapabilities, CapabilityCategory } from "@/lib/discovery";

export const dynamic = "force-dynamic";

/**
 * GET /api/discovery/capabilities
 * Lists all registered, available, and discoverable capabilities across tools, agents, and integrations.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const category = (searchParams.get("category") as CapabilityCategory) || undefined;
    const agentType = searchParams.get("agentType") || undefined;

    const capabilities = await discoverUniversalCapabilities({
      userId: user.id,
      category,
      agentType,
    });

    return NextResponse.json({
      success: true,
      count: capabilities.length,
      capabilities,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

