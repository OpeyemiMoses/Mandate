import { NextResponse } from "next/server";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  grantAgentToolAccess,
  revokeAgentToolAccess,
} from "@/lib/tools/access";
import { toolRegistry } from "@/lib/tools/registry";
import { registerDefaultTools } from "@/lib/tools";

registerDefaultTools();

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/[id]/tools
 * Lists assigned tool permissions for the agent, as well as unassigned available tools.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: agentId } = params;

    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId: user.id },
      include: {
        toolAccess: true,
      },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    const assignedTools = agent.toolAccess.map((access) => {
      const toolDef = toolRegistry.get(access.toolId);
      let allowedOperations: string[] = ["*"];
      try {
        allowedOperations = JSON.parse(access.allowedOperationsJson || "[\"*\"]");
      } catch {}

      return {
        id: access.id,
        toolId: access.toolId,
        toolName: toolDef?.name || access.toolId,
        toolCategory: toolDef?.category || "custom",
        permissionLevel: access.permissionLevel,
        isEnabled: access.isEnabled,
        allowedOperations,
        maxCallsPerExecution: access.maxCallsPerExecution,
        riskClassification: toolDef ? toolRegistry.getToolRisk(toolDef) : "LOW",
        updatedAt: access.updatedAt.toISOString(),
      };
    });

    const allRegisteredTools = toolRegistry.list().map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      riskClassification: toolRegistry.getToolRisk(t),
      requiresAuthentication: t.authenticationRequirements !== "NONE",
      authType: t.authenticationRequirements,
      operations: Object.values(t.operations).map((op) => ({
        id: op.id,
        name: op.name,
        requiredPermission: op.requiredPermission,
        riskClassification: op.riskClassification,
      })),
      isAssigned: agent.toolAccess.some((a) => a.toolId === t.id),
    }));

    return NextResponse.json({
      success: true,
      agentId: agent.id,
      assignedTools,
      availableTools: allRegisteredTools,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * POST /api/agents/[id]/tools
 * Grants or updates tool access for the agent.
 * Body: {
 *   toolId: string;
 *   permissionLevel?: "READ" | "PROPOSE" | "RESTRICTED_EXECUTION" | "USER_ONLY";
 *   isEnabled?: boolean;
 *   allowedOperations?: string[];
 *   maxCallsPerExecution?: number;
 * }
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: agentId } = params;
    const body = await req.json();

    const {
      toolId,
      permissionLevel = "READ",
      isEnabled = true,
      allowedOperations = ["*"],
      maxCallsPerExecution,
    } = body;

    if (!toolId) {
      return NextResponse.json(
        { success: false, error: "toolId is required" },
        { status: 400 }
      );
    }

    const access = await grantAgentToolAccess({
      agentId,
      userId: user.id,
      toolId,
      permissionLevel,
      isEnabled,
      allowedOperations,
      maxCallsPerExecution,
    });

    return NextResponse.json({
      success: true,
      access,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * DELETE /api/agents/[id]/tools
 * Revokes tool access from the agent.
 * Accepts toolId via query param or JSON body.
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: agentId } = params;
    const { searchParams } = new URL(req.url);
    let toolId = searchParams.get("toolId");

    if (!toolId) {
      try {
        const body = await req.json();
        toolId = body.toolId;
      } catch {}
    }

    if (!toolId) {
      return NextResponse.json(
        { success: false, error: "toolId is required" },
        { status: 400 }
      );
    }

    await revokeAgentToolAccess(agentId, user.id, toolId);

    return NextResponse.json({
      success: true,
      revokedToolId: toolId,
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
