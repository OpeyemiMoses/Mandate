import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { JobQueueService } from "@/lib/jobs/queueService";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const cancelledJob = await JobQueueService.cancelJob(
      id,
      user.id,
      body.reason || "Cancelled by tenant via API"
    );

    return NextResponse.json({
      success: true,
      job: cancelledJob,
    });
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : 400;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to cancel job" },
      { status }
    );
  }
}

