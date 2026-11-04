import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { executionOrchestrator } from "@/lib/runtime/orchestrator";

export const dynamic = "force-dynamic";

/**
 * POST /api/executions/[id]/resume - Resume a paused execution
 */

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const result = await executionOrchestrator.resumeExecution(params.id, user.id);

    return NextResponse.json({
      success: true,
      execution: { id: params.id, status: result.status },
      ...result,
    });
  } catch (error: any) {
    const isNotFound = error.message.includes("not found") || error.message.includes("access denied");
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isNotFound ? 404 : 400 }
    );
  }
}
