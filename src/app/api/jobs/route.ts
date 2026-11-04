import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { JobQueueService } from "@/lib/jobs/queueService";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { jobType, payload, priority, scheduledAt, idempotencyKey, correlationId, parentJobId, maxAttempts } = body;

    if (!jobType) {
      return NextResponse.json(
        { success: false, error: "jobType is required" },
        { status: 400 }
      );
    }

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { success: false, error: "payload must be an object" },
        { status: 400 }
      );
    }

    const job = await JobQueueService.submitJob({
      tenantId: user.id,
      jobType,
      payload,
      priority: priority !== undefined ? parseInt(priority, 10) : 0,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      idempotencyKey,
      correlationId,
      parentJobId,
      maxAttempts: maxAttempts ? parseInt(maxAttempts, 10) : undefined,
    });

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (err: any) {
    const status = err.message?.includes("not found") ? 404 : err.message?.includes("Idempotency") ? 409 : 400;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to submit job" },
      { status }
    );
  }
}

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);

    const status = searchParams.get("status") as any;
    const jobType = searchParams.get("jobType") || undefined;
    const search = searchParams.get("search") || undefined;
    const priority = searchParams.get("priority") ? parseInt(searchParams.get("priority")!, 10) : undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const result = await JobQueueService.listJobs({
      tenantId: user.id,
      status,
      jobType,
      priority,
      search,
      limit,
      offset,
    });

    const metrics = await JobQueueService.getQueueMetrics(user.id);

    return NextResponse.json({
      success: true,
      jobs: result.jobs,
      total: result.total,
      metrics,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to list jobs" },
      { status: 500 }
    );
  }
}

