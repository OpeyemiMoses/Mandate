import { NextRequest, NextResponse } from "next/server";
import { DrillRunner } from "@/lib/resilience/testing/drillRunner";
import { ControlAuthorizationService } from "@/lib/operations/controlAuthorizationService";
import { DrillType } from "@/lib/resilience/testing/types";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const drills = await DrillRunner.listDrills();
    return NextResponse.json({ success: true, drills });
  } catch (err: any) {
    if (err.name === "AuthenticationError" || err.name === "ForbiddenError") {
      return toAuthErrorResponse(err);
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

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
    const auth = await requireAdmin(req);
    const { drillType } = body;
    const actorId = auth.userId;
    const actorRole = auth.role;

    if (!drillType) {
      return NextResponse.json({ success: false, error: "Missing drillType" }, { status: 400 });
    }

    ControlAuthorizationService.assertAuthorized({
      actorId,
      actorRole,
      isAgent: false,
      actionType: "DRILL_RUN",
    });

    const result = await DrillRunner.runDrill(drillType as DrillType, actorId);
    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    if (err.name === "AuthenticationError" || err.name === "ForbiddenError") {
      return toAuthErrorResponse(err);
    }
    const status = err.message.includes("SECURITY_POLICY_VIOLATION") || err.message.includes("FORBIDDEN") ? 403 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
