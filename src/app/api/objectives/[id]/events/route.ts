import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/objectives/[id]/events
 * Retrieves chronological lifecycle events for an objective.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id: objectiveId } = params;

    const objective = await prisma.objective.findFirst({
      where: { id: objectiveId, userId: user.id },
      select: { id: true },
    });

    if (!objective) {
      return NextResponse.json(
        { success: false, error: "Objective not found or unauthorized" },
        { status: 404 }
      );
    }

    const events = await prisma.objectiveEvent.findMany({
      where: { objectiveId },
      orderBy: { timestamp: "asc" },
    });

    const formatted = events.map((e) => {
      let metadata = {};
      try {
        if (e.metadataJson) metadata = JSON.parse(e.metadataJson);
      } catch {}

      return {
        id: e.id,
        eventType: e.eventType,
        actorId: e.actorId,
        actorRole: e.actorRole,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        reason: e.reason,
        version: e.version,
        metadata,
        auditLogId: e.auditLogId,
        timestamp: e.timestamp.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      count: formatted.length,
      events: formatted,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve objective events" },
      { status: 500 }
    );
  }
}

