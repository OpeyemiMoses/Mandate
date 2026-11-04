import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { executionOrchestrator } from "@/lib/runtime/orchestrator";

export const dynamic = "force-dynamic";

/**
 * GET /api/executions - List executions for authenticated user
 * POST /api/executions - Start a new execution
 */

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const url = new URL(req.url);
    const agentId = url.searchParams.get("agentId") || undefined;
    const status = url.searchParams.get("status") as any;

    const executions = await executionOrchestrator.listExecutions({
      userId: user.id,
      agentId,
      status,
    });

    return NextResponse.json({ success: true, executions });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { agentId, mandateId, idempotencyKey } = body;
    const input = body.input !== undefined ? body.input : (body.prompt ? { prompt: body.prompt } : undefined);

    if (!agentId || !input) {
      return NextResponse.json(
        { success: false, error: "Missing required 'agentId' or 'input' parameter" },
        { status: 400 }
      );
    }

    const execResult = await executionOrchestrator.startExecution({
      agentId,
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
    const isAuth = error.message.includes("not found") || error.message.includes("unauthorized");
    const isRateLimit = error.message.includes("concurrency limit");
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isRateLimit ? 429 : isAuth ? 404 : 400 }
    );
  }
}
