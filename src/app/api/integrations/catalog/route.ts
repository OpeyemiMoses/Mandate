import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { integrationRegistry } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/catalog
 * Returns the catalog of supported integration adapters, their auth capabilities, and schemas.
 */
export async function GET(req: Request) {
  try {
    await getAuthenticatedUser(req);
    const catalog = integrationRegistry.listCatalog();

    // Enrich with operation summaries
    const enriched = await Promise.all(
      catalog.map(async (meta) => {
        const adapter = integrationRegistry.getAdapter(meta.providerId);
        const operations = adapter ? await adapter.getSupportedOperations() : [];
        return {
          ...meta,
          operationsCount: operations.length,
          operations: operations.map((op) => ({
            id: op.id,
            name: op.name,
            description: op.description,
            category: op.category,
            defaultPermissionLevel: op.defaultPermissionLevel,
            riskClassification: op.riskClassification,
          })),
        };
      })
    );

    return NextResponse.json({
      success: true,
      count: enriched.length,
      catalog: enriched,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch integrations catalog" },
      { status: error.message?.includes("authenticated") ? 401 : 500 }
    );
  }
}

