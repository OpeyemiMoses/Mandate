import { NextRequest, NextResponse } from "next/server";
import { RestoreService } from "@/lib/disaster-recovery/restoreService";
import { ControlAuthorizationService } from "@/lib/operations/controlAuthorizationService";
import { authenticateRequest, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  // Pre-check for agent prohibition
  if (body.isAgent === true || body.restoredByRole?.toLowerCase().includes("agent")) {
    return NextResponse.json(
      {
        success: false,
        error: "SECURITY_POLICY_VIOLATION: Autonomous AI agents are strictly prohibited from mutating the operational control plane.",
      },
      { status: 403 }
    );
  }

  try {
    const auth = await authenticateRequest(req, { requireAdmin: true });
    const { backupId, isDrill, targetPath } = body;
    const restoredBy = auth.userId;
    const restoredByRole = auth.role;

    if (!backupId) {
      return NextResponse.json(
        { success: false, error: "Missing required field: backupId" },
        { status: 400 }
      );
    }

    ControlAuthorizationService.assertAuthorized({
      actorId: restoredBy,
      actorRole: restoredByRole,
      isAgent: false,
      actionType: "RESTORE_DATABASE",
    });

    const result = await RestoreService.restoreBackup({
      backupId,
      restoredBy,
      restoredByRole,
      isDrill: Boolean(isDrill),
      targetPath,
    });

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    if (err.name === "AuthenticationError" || err.name === "ForbiddenError") {
      return toAuthErrorResponse(err);
    }
    const status = err.message.includes("SECURITY_POLICY_VIOLATION") || err.message.includes("FORBIDDEN")
      ? 403
      : err.message.includes("PRECONDITION_FAILED")
      ? 412
      : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
