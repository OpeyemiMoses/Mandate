import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { PolicySimulationService } from "@/lib/governance";

export const dynamic = "force-dynamic";

/**
 * POST /api/governance/policies/simulate - Simulate policy evaluation without side effects
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    const {
      agentId,
      agentType,
      capabilities,
      objectiveId,
      coordinationRunId,
      mandateId,
      toolId,
      operation,
      recipient,
      amountYocto,
      resource,
      parameters,
    } = body;

    const report = await PolicySimulationService.simulate({
      userId: user.id,
      agentId,
      agentType,
      capabilities,
      objectiveId,
      coordinationRunId,
      mandateId,
      toolId,
      operation,
      recipient,
      amountYocto,
      resource,
      parameters,
    });

    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

