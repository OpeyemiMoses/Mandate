import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/objectives/[id]/discovery
 * Fetches discovery audit history for the given objective.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id } = params;

    const objective = await prisma.objective.findFirst({
      where: { id, userId: user.id },
    });

    if (!objective) {
      return NextResponse.json(
        { success: false, error: "Objective not found or unauthorized" },
        { status: 404 }
      );
    }

    const discoveries = await prisma.capabilityDiscovery.findMany({
      where: { objectiveId: id, userId: user.id },
      include: {
        matches: {
          orderBy: { matchScore: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const formatted = discoveries.map((d) => {
      let readinessDetails = {};
      let coverageDetails = {};
      let missingCapabilities = [];
      let blockedCapabilities = [];
      let authRequired = [];

      try {
        if (d.readinessDetailsJson) readinessDetails = JSON.parse(d.readinessDetailsJson);
      } catch {}
      try {
        if (d.coverageDetailsJson) coverageDetails = JSON.parse(d.coverageDetailsJson);
      } catch {}
      try {
        if (d.missingCapabilitiesJson) missingCapabilities = JSON.parse(d.missingCapabilitiesJson);
      } catch {}
      try {
        if (d.blockedCapabilitiesJson) blockedCapabilities = JSON.parse(d.blockedCapabilitiesJson);
      } catch {}
      try {
        if (d.authRequiredJson) authRequired = JSON.parse(d.authRequiredJson);
      } catch {}

      return {
        id: d.id,
        status: d.status,
        overallReadiness: d.overallReadiness,
        coverageScore: d.coverageScore,
        summary: d.summary,
        readinessDetails,
        coverageDetails,
        missingCapabilities,
        blockedCapabilities,
        authRequired,
        matches: d.matches.map((m) => {
          let details = {};
          try {
            if (m.detailsJson) details = JSON.parse(m.detailsJson);
          } catch {}
          return {
            id: m.id,
            requirementId: m.requirementId,
            capabilityId: m.capabilityId,
            agentId: m.agentId,
            toolId: m.toolId,
            integrationId: m.integrationId,
            matchScore: m.matchScore,
            matchReason: m.matchReason,
            coverageStatus: m.coverageStatus,
            permissionStatus: m.permissionStatus,
            riskClassification: m.riskClassification,
            details,
            createdAt: m.createdAt.toISOString(),
          };
        }),
        createdAt: d.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      count: formatted.length,
      latest: formatted[0] || null,
      discoveries: formatted,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve discovery records" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

