import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    const execution = await prisma.executionRecord.findUnique({
      where: { id },
      include: {
        mandate: true,
        agent: true,
        task: true,
      },
    });

    if (!execution || execution.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Execution record not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      execution,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch execution detail" },
      { status: 500 }
    );
  }
}

