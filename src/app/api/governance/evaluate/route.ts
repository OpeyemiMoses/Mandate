import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { PolicyEngine } from "@/lib/governance";

export const dynamic = "force-dynamic";

/**
 * POST /api/governance/evaluate - Real server-side policy evaluation
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    const evaluation = await PolicyEngine.evaluate({
      userId: user.id,
      ...body,
    });

    return NextResponse.json({ success: true, evaluation });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

