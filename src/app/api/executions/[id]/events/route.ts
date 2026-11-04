import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getExecutionEvents } from "@/lib/runtime/events";

export const dynamic = "force-dynamic";

/**
 * GET /api/executions/[id]/events - Retrieve chronological runtime events for an execution
 */

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const events = await getExecutionEvents(params.id, user.id);

    return NextResponse.json({ success: true, events });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

