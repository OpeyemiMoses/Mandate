import { NextResponse } from "next/server";
import { runStartupPreflight } from "@/lib/production/startupPreflight";

export const dynamic = "force-dynamic";

/**
 * GET /api/production/readiness
 * Returns comprehensive system readiness, component connectivity, and topology inspection.
 * Strictly redacts all cryptographic secrets and sensitive material.
 */
export async function GET() {
  try {
    const report = await runStartupPreflight(5000);
    const statusCode = report.overallStatus === "BLOCKED" ? 503 : report.overallStatus === "DEGRADED" ? 200 : 200;
    return NextResponse.json(report, { status: statusCode });
  } catch (error: any) {
    return NextResponse.json(
      {
        overallStatus: "BLOCKED",
        error: error.message || "Failed to execute startup preflight",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

