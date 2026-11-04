import { NextResponse } from "next/server";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";
import { prisma } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAdmin(req);
    const { id } = params;

    const where: any = { id };
    if (user.role !== "OWNER" && user.role !== "ADMIN") {
      where.tenantId = user.userId;
    }

    const record = await prisma.deadLetterRecord.findFirst({
      where,
      include: {
        job: {
          include: {
            attemptsList: { orderBy: { attemptNumber: "asc" } },
            eventsList: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    if (!record) {
      return NextResponse.json(
        { success: false, error: `Dead letter record not found: ${id}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      record,
    });
  } catch (err: any) {
    return toAuthErrorResponse(err);
  }
}
