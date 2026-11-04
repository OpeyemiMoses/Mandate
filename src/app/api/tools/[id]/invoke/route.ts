import { NextResponse } from "next/server";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { toolExecutor } from "@/lib/tools/executor";
import { registerDefaultTools } from "@/lib/tools";

registerDefaultTools();

export const dynamic = "force-dynamic";

/**
 * POST /api/tools/[id]/invoke
 * Direct or test invocation of a tool operation.
 * Body: {
 *   agentId: string;
 *   operation: string;
 *   params: Record<string, unknown>;
 *   connectionId?: string;
 *   idempotencyKey?: string;
 * }
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: toolId } = params;
    const body = await req.json();

    const { agentId, operation, params: toolParams = {}, connectionId, idempotencyKey } = body;

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: "agentId is required for tool invocation" },
        { status: 400 }
      );
    }

    if (!operation) {
      return NextResponse.json(
        { success: false, error: "operation is required for tool invocation" },
        { status: 400 }
      );
    }

    const result = await toolExecutor.execute({
      agentId,
      userId: user.id,
      toolId,
      operation,
      params: toolParams,
      connectionId,
      idempotencyKey,
    });

    const httpStatus = result.success ? 200 : result.error?.includes("Rate limit") ? 429 : 400;

    return NextResponse.json(result, { status: httpStatus });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}
