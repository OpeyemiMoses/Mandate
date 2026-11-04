import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { ExecutionBoundaryService } from "@/lib/execution/boundaryService";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    const {
      mandateId,
      agentId,
      taskId,
      operation = "near_transfer",
      recipient,
      amountYocto,
      parameters,
      idempotencyKey,
      approvalId,
      isSimulated = false,
    } = body;

    if (!mandateId || !recipient || !amountYocto || !idempotencyKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: mandateId, recipient, amountYocto, idempotencyKey",
        },
        { status: 400 }
      );
    }

    const result = await ExecutionBoundaryService.execute({
      userId: user.id,
      mandateId,
      agentId,
      taskId,
      operation,
      recipient,
      amountYocto,
      parameters,
      idempotencyKey,
      approvalId,
      isSimulated,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Execution failed",
      },
      { status: 400 }
    );
  }
}

