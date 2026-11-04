import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { ProviderVerificationService } from "@/lib/providers/providerVerificationService";

export const dynamic = "force-dynamic";

/**
 * GET /api/providers/verify
 * Returns the live verification matrix and inventory of external providers.
 */
export async function GET(req: Request) {
  try {
    await getAuthenticatedUser(req);

    const report = await ProviderVerificationService.verifyAllProviders();
    const inventory = ProviderVerificationService.getProviderInventory();

    return NextResponse.json({
      success: true,
      report,
      inventory,
    });
  } catch (error: any) {
    const status = error.statusCode || (error.name === "AuthenticationError" ? 401 : 500);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status }
    );
  }
}

