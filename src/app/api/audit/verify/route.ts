import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { verifyAuditChain } from "@/lib/auditLedger";

/**
 * GET /api/audit/verify - Cryptographically verify the append-only hash chain for the user
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const verification = await verifyAuditChain(user.id);

    return NextResponse.json({
      success: true,
      verification,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

