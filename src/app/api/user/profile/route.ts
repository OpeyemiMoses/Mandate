import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser, toAuthErrorResponse } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/auditLedger";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/profile - Fetch connected user profile
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        _count: {
          select: {
            agents: true,
            mandates: true,
            approvals: true,
          },
        },
      },
    });

    if (!dbUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: dbUser.id,
        nearAccountId: dbUser.nearAccountId,
        displayName: dbUser.displayName || "",
        email: dbUser.email || "",
        bio: dbUser.bio || "",
        role: dbUser.role,
        twoFactorEnabled: dbUser.twoFactorEnabled,
        emailAlerts: dbUser.emailAlerts,
        agentsCount: dbUser._count.agents,
        mandatesCount: dbUser._count.mandates,
        createdAt: dbUser.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

/**
 * PATCH /api/user/profile - Update user profile settings
 */
export async function PATCH(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { displayName, email, bio, twoFactorEnabled, emailAlerts } = body;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(displayName !== undefined && { displayName: String(displayName).trim() }),
        ...(email !== undefined && { email: String(email).trim() }),
        ...(bio !== undefined && { bio: String(bio).trim() }),
        ...(twoFactorEnabled !== undefined && { twoFactorEnabled: Boolean(twoFactorEnabled) }),
        ...(emailAlerts !== undefined && { emailAlerts: Boolean(emailAlerts) }),
      },
    });

    await recordAuditEvent({
      userId: user.id,
      eventType: "SECURITY_EVENT",
      verdict: "SUCCESS",
      description: `Updated profile settings for ${user.nearAccountId}`,
      details: {
        updatedFields: Object.keys(body),
        displayName: updated.displayName,
      },
    });

    return NextResponse.json({
      success: true,
      profile: {
        id: updated.id,
        nearAccountId: updated.nearAccountId,
        displayName: updated.displayName || "",
        email: updated.email || "",
        bio: updated.bio || "",
        role: updated.role,
        twoFactorEnabled: updated.twoFactorEnabled,
        emailAlerts: updated.emailAlerts,
      },
    });
  } catch (error: any) {
    return toAuthErrorResponse(error);
  }
}

