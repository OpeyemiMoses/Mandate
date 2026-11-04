import { NextResponse } from "next/server";
import { ReadinessService } from "@/lib/resilience/readinessService";

export async function GET() {
  const readiness = await ReadinessService.getStatus();
  const statusCode = readiness.status === "READY" ? 200 : 503;
  return NextResponse.json(readiness, { status: statusCode });
}

