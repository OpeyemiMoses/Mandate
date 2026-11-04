import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { executionOrchestrator } from "@/lib/runtime/orchestrator";

export const dynamic = "force-dynamic";

/**
 * GET /api/executions/[id] - Retrieve detailed execution session and event history
 */

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const execution = await executionOrchestrator.getExecution(params.id, user.id);

    return NextResponse.json({ success: true, execution });
  } catch (error: any) {
    const isNotFound = error.message.includes("not found") || error.message.includes("unauthorized");
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isNotFound ? 404 : 500 }
    );
  }
}

