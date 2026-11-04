import { NextResponse } from "next/server";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { executionOrchestrator } from "@/lib/runtime/orchestrator";

export const dynamic = "force-dynamic";

/**
 * POST /api/agents/[id]/executions - Start an execution instance for this agent
 * GET /api/agents/[id]/executions - List execution history for this agent
 */

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { mandateId, idempotencyKey } = body;
    const input = body.input !== undefined ? body.input : (body.prompt ? { prompt: body.prompt } : undefined);

    if (!input) {
      return NextResponse.json(
        { success: false, error: "Missing required 'input' or 'prompt' parameter" },
        { status: 400 }
      );
    }

    const execResult = await executionOrchestrator.startExecution({
      agentId: params.id,
      userId: user.id,
      input,
      mandateId,
      idempotencyKey,
    });

    return NextResponse.json(
      {
        success: true,
        execution: {
          id: execResult.executionId,
          status: execResult.status,
          result: execResult.result,
          error: execResult.error,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.statusCode === 401 || error.name === "AuthenticationError" || error.message?.includes("Unauthorized")) {
      return toAuthErrorResponse(error);
    }
    const isAuth = error.message.includes("not found") || error.message.includes("unauthorized");
    const isRateLimit = error.message.includes("concurrency limit");
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isRateLimit ? 429 : isAuth ? 404 : 400 }
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as any;

    const executions = await executionOrchestrator.listExecutions({
      agentId: params.id,
      userId: user.id,
      status,
    });

    return NextResponse.json({ success: true, executions });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
