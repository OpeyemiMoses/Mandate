import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { AgentCapabilityRegistry } from "@/lib/agents/capabilityRegistry";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/[id]/capabilities
 * Retrieves the validated capability profile for an agent.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: agentId } = params;

    const profile = await AgentCapabilityRegistry.getProfile(agentId, user.id);

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve capability profile" },
      { status: error.message?.includes("unauthorized") || error.message?.includes("not found") ? 404 : 500 }
    );
  }
}

/**
 * POST /api/agents/[id]/capabilities
 * Updates or registers the agent's capability profile with server-side validation.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: agentId } = params;
    const body = await req.json().catch(() => ({}));

    // Server-side anti-tamper: Agents cannot self-modify capabilities
    const profile = await AgentCapabilityRegistry.updateProfile({
      agentId,
      userId: user.id,
      supportedTaskTypes: body.supportedTaskTypes,
      supportedTools: body.supportedTools,
      maxAuthorizedTaskRisk: body.maxAuthorizedTaskRisk,
      isAgentCaller: Boolean(body.isAgentCaller),
    });

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update capability profile" },
      { status: error.message?.includes("AGENT_ACTION_FORBIDDEN") ? 403 : 400 }
    );
  }
}

