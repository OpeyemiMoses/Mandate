import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getTraceDetail } from "@/lib/observability";

export async function GET(
  req: Request,
  { params }: { params: { traceId: string } }
) {
  try {
    const user = await getAuthenticatedUser(req);
    const traceId = params.traceId;

    if (!traceId || !/^[0-9a-f]{32}$/i.test(traceId)) {
      return NextResponse.json(
        { success: false, error: "Invalid traceId format (expected 32 hex characters)" },
        { status: 400 }
      );
    }

    const traceDetail = getTraceDetail(traceId);

    if (!traceDetail) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Trace not found in local in-memory trace buffer. (Note: If an external OTLP backend is not configured, traces only persist in local memory buffer until rotated).",
        },
        { status: 404 }
      );
    }

    // Tenant Isolation Check
    for (const span of traceDetail.spans) {
      const spanTenantId = span.attributes["mandate.tenant_id"];
      if (spanTenantId && spanTenantId !== user.id) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Access to cross-tenant trace is denied" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      trace: traceDetail,
    });
  } catch (err: any) {
    const status = err.message?.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to inspect trace" },
      { status }
    );
  }
}

