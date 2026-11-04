import { NextRequest, NextResponse } from "next/server";
import { EmergencyPauseService } from "@/lib/operations/emergencyPauseService";
import { ControlAuthorizationService } from "@/lib/operations/controlAuthorizationService";
import { OperatorRole } from "@/lib/operations/types";
import { authenticateRequest, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  // Pre-check for agent prohibition
  if (body.isAgent === true || body.actorRole?.toLowerCase().includes("agent")) {
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
    const { target, reason, forceOverrideUnacknowledgedIncidents } = body;
    const actorId = auth.userId;
    const actorRole = auth.role as OperatorRole;

    if (!reason) {
      return NextResponse.json(
        { success: false, error: "Missing required field: reason" },
        { status: 400 }
      );
    }

    ControlAuthorizationService.assertAuthorized({
      actorId,
      actorRole,
      isAgent: false,
      actionType: "RESUME_EXECUTION",
    });

    const result = await EmergencyPauseService.resumeExecution({
      target: target || "FINANCIAL",
      reason,
      actorId,
      actorRole,
      forceOverrideUnacknowledgedIncidents: Boolean(forceOverrideUnacknowledgedIncidents),
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
