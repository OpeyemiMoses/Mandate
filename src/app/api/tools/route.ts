import { NextResponse } from "next/server";
import { toolRegistry } from "@/lib/tools/registry";
import { registerDefaultTools } from "@/lib/tools";
import { ToolCategory } from "@/lib/tools/types";

registerDefaultTools();

export const dynamic = "force-dynamic";

/**
 * GET /api/tools
 * Lists all registered tools in Mandate's Universal Tool Registry.
 * Query params:
 *  - category: Filter by ToolCategory (e.g. search, near_rpc, rest_api, mcp)
 *  - agentType: Filter by supported agent type
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") as ToolCategory | null;
    const agentType = searchParams.get("agentType");

    const tools = toolRegistry.list({
      category: category || undefined,
      agentType: agentType || undefined,
    });

    const summaries = tools.map((t) => ({
      id: t.id,
      name: t.name,
      version: t.version,
      description: t.description,
      category: t.category,
      operations: t.operations,
      riskClassification: toolRegistry.getToolRisk(t),
      requiresAuthentication: t.authenticationRequirements !== "NONE",
      authType: t.authenticationRequirements,
      supportedAgentTypes: t.supportedAgentTypes,
      rateLimits: t.rateLimits,
      status: t.availabilityStatus,
    }));

    return NextResponse.json({
      success: true,
      count: summaries.length,
      tools: summaries,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to list tools" },
      { status: 500 }
    );
  }
}
