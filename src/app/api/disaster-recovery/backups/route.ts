import { NextRequest, NextResponse } from "next/server";
import { BackupService } from "@/lib/disaster-recovery/backupService";
import { BackupManifestService } from "@/lib/disaster-recovery/backupManifestService";
import { RecoveryPointService } from "@/lib/disaster-recovery/recoveryPointService";
import { authenticateRequest, toAuthErrorResponse } from "@/lib/auth/authenticateRequest";

export async function GET(req: NextRequest) {
  try {
    await authenticateRequest(req, { requireAdmin: true });
    const manifests = await BackupManifestService.listManifests();
    const metrics = await RecoveryPointService.getMetrics();
    return NextResponse.json({ success: true, manifests, metrics });
  } catch (err: any) {
    if (err.name === "AuthenticationError" || err.name === "ForbiddenError") {
      return toAuthErrorResponse(err);
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, { requireAdmin: true });
    const body = await req.json().catch(() => ({}));
    const { backupType, trigger, isEncrypted, metadata } = body;

    const result = await BackupService.createBackup({
      backupType,
      createdBy: auth.userId || body.createdBy || "OPERATOR",
      trigger: trigger || "MANUAL",
      isEncrypted,
      metadata,
    });

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    if (err.name === "AuthenticationError" || err.name === "ForbiddenError") {
      return toAuthErrorResponse(err);
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
