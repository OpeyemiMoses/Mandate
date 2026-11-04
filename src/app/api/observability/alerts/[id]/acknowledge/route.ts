import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { acknowledgeAlert } from "@/lib/observability";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));
    const notes = body.notes;

    const updated = await acknowledgeAlert(params.id, user.id, notes);

    return NextResponse.json({
      success: true,
      alert: updated,
    });
  } catch (err: any) {
    const status = err.message?.includes("Unauthorized")
      ? 401
      : err.message?.includes("not found")
      ? 404
      : 400;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to acknowledge alert" },
      { status }
    );
  }
}

