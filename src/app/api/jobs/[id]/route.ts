import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { JobQueueService } from "@/lib/jobs/queueService";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    const job = await JobQueueService.getJob(id, user.id);

    if (!job) {
      return NextResponse.json(
        { success: false, error: `Job not found or unauthorized: ${id}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch job" },
      { status: 500 }
    );
  }
}

