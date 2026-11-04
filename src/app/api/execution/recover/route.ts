import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { ExecutionRecoveryService } from "@/lib/execution/recoveryService";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    const { executionId } = body;

    if (!executionId) {
      return NextResponse.json(
        { success: false, error: "Missing executionId" },
        { status: 400 }
      );
    }

    const exec = await prisma.executionRecord.findUnique({
      where: { id: executionId },
    });

    if (!exec || exec.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Execution record not found or unauthorized" },
        { status: 404 }
      );
    }

    const recoveryResult = await ExecutionRecoveryService.recoverExecution(executionId);

    return NextResponse.json({
      success: true,
      ...recoveryResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Recovery attempt failed" },
      { status: 400 }
    );
  }
}

