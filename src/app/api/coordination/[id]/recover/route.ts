import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { TaskLeaseManager } from "@/lib/coordination/leaseManager";

export const dynamic = "force-dynamic";

/**
 * POST /api/coordination/[id]/recover
 * Scan and recover abandoned task leases for a coordination run
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const runId = params.id;

    const recoveredCount = await TaskLeaseManager.recoverAbandonedLeases(runId, user.id);

    return NextResponse.json({
      success: true,
      recoveredCount,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to recover leases" }, { status: 400 });
  }
}

