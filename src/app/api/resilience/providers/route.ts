import { NextRequest, NextResponse } from "next/server";
import { ProviderResilienceService } from "@/lib/resilience/providerResilienceService";
import { ControlAuthorizationService } from "@/lib/operations/controlAuthorizationService";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const breakers = await ProviderResilienceService.listBreakers();
    return NextResponse.json({ success: true, breakers });
  } catch (err: any) {
    return toAuthErrorResponse(err);
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
    const { action, providerId, reason } = body;
    const actorId = auth.userId;
    const actorRole = auth.role;

    if (!action || !providerId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: action, providerId" },
        { status: 400 }
      );
    }

    ControlAuthorizationService.assertAuthorized({
      actorId,
      actorRole,
      isAgent: false,
      actionType: action === "TRIP" ? "EMERGENCY_PAUSE" : "RESUME_EXECUTION",
    });

    let result;
    if (action === "TRIP") {
      result = await ProviderResilienceService.tripBreaker(
        providerId,
        reason || "Operator manual trip",
        actorId,
        actorRole
      );
    } else {
      result = await ProviderResilienceService.resetBreaker(providerId, actorId, actorRole);
    }

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    if (err.name === "AuthenticationError" || err.name === "ForbiddenError") {
      return toAuthErrorResponse(err);
    }
    const status = err.message.includes("SECURITY_POLICY_VIOLATION") || err.message.includes("FORBIDDEN") ? 403 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
