import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { RecoveryVerificationService } from "@/lib/recovery/recoveryVerificationService";
import { VerificationStrategy } from "@/lib/recovery/types";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    await getAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));

    const strategy: VerificationStrategy =
      body.strategy || "DATABASE_CONSISTENCY_CHECK";

    const verification = await RecoveryVerificationService.verifyOutcome({
      planId: params.id,
      attemptId: body.attemptId,
      verificationStrategy: strategy,
    });

    return NextResponse.json({ success: true, verification });
  } catch (err: any) {
    const status = err.message?.includes("Unauthorized") ? 401 : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

