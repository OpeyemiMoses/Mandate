import { NextResponse } from "next/server";
import { LivenessService } from "@/lib/resilience/livenessService";

export async function GET() {
  const liveness = LivenessService.getStatus();
  const statusCode = liveness.status === "ALIVE" ? 200 : 503;
  return NextResponse.json(liveness, { status: statusCode });
}

