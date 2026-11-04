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

    // Verify tenant ownership of parent job
    const job = await prisma.backgroundJob.findFirst({
      where: { id, tenantId: user.id },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: `Job not found or unauthorized: ${id}` },
        { status: 404 }
      );
    }

    const attempts = await prisma.jobAttempt.findMany({
      where: { jobId: id },
      orderBy: { attemptNumber: "asc" },
      include: {
        worker: {
          select: { id: true, workerName: true, instanceId: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      jobId: id,
      attempts,
      count: attempts.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch job attempts" },
      { status: 500 }
    );
  }
}

