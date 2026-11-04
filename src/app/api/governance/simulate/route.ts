import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { PolicySimulationService } from "@/lib/governance";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();

    const report = await PolicySimulationService.simulate({
      userId: user.id,
      ...body,
    });

    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

