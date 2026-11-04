import { NextRequest, NextResponse } from "next/server";
import { BackupManifestService } from "@/lib/disaster-recovery/backupManifestService";
import { BackupService } from "@/lib/disaster-recovery/backupService";
import { requireAdmin, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const manifest = await BackupManifestService.getManifest(id);
    if (!manifest) {
      return NextResponse.json({ success: false, error: "Backup not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, manifest });
  } catch (err: any) {
    if (err.name === "AuthenticationError" || err.name === "ForbiddenError") {
      return toAuthErrorResponse(err);
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const deleted = await BackupService.deleteBackup(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Backup not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: `Backup ${id} deleted` });
  } catch (err: any) {
    if (err.name === "AuthenticationError" || err.name === "ForbiddenError") {
      return toAuthErrorResponse(err);
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
