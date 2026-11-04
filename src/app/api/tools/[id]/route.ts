import { NextResponse } from "next/server";
import { toolRegistry } from "@/lib/tools/registry";
import { registerDefaultTools } from "@/lib/tools";

registerDefaultTools();

export const dynamic = "force-dynamic";

/**
 * GET /api/tools/[id]
 * Retrieves detailed definition and operations schema for a specific registered tool.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const tool = toolRegistry.get(id);

    if (!tool) {
      return NextResponse.json(
        { success: false, error: `Tool "${id}" not found in registry` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      tool: {
        id: tool.id,
        name: tool.name,
        version: tool.version,
        description: tool.description,
        category: tool.category,
        operations: tool.operations,
        riskClassification: toolRegistry.getToolRisk(tool),
        requiresAuthentication: tool.authenticationRequirements !== "NONE",
        authType: tool.authenticationRequirements,
        supportedAgentTypes: tool.supportedAgentTypes,
        rateLimits: tool.rateLimits,
        timeoutMs: tool.timeoutMs,
        retryPolicy: tool.retryPolicy,
        status: tool.availabilityStatus,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve tool" },
      { status: 500 }
    );
  }
}
