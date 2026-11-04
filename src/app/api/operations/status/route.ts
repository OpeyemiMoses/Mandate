import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { OperationalControlService } from "@/lib/operations/operationalControlService";
import { prisma } from "@/lib/db";
import { ProviderResilienceService } from "@/lib/resilience/providerResilienceService";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const currentState = await OperationalControlService.getState();
    const recentAudits = await OperationalControlService.getRecentAudits(10);
    const activeIncidents = await prisma.incident.findMany({
      where: { status: { in: ["TRIGGERED", "INVESTIGATING", "IDENTIFIED"] } },
      orderBy: { detectedAt: "desc" },
      take: 5,
    });
    const breakers = await ProviderResilienceService.listBreakers();

    return NextResponse.json({
      success: true,
      state: currentState,
      activeIncidents,
      recentAudits,
      circuitBreakers: breakers,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
