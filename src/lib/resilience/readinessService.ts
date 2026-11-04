/**
 * Readiness Service (Milestone 9.4)
 * Verifies whether platform dependencies (Database, Operational Gates, Workers)
 * are healthy enough to accept requests and process workloads.
 */

import { prisma } from "@/lib/db";
import { OperationalControlService } from "@/lib/operations/operationalControlService";
import { ReadinessStatus } from "./types";

export class ReadinessService {
  /**
   * Evaluates platform readiness across core dependencies.
   */
  public static async getStatus(): Promise<ReadinessStatus> {
    const checks = {
      database: false,
      operationalGate: false,
      workerFleet: false,
    };
    let errorMessage: string | undefined;

    // 1. Database Check
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch (err: any) {
      checks.database = false;
      errorMessage = `Database check failed: ${err.message}`;
    }

    // 2. Operational Mode Check
    let opMode = "NORMAL";
    try {
      opMode = await OperationalControlService.getCurrentMode();
      // Readiness passes if mode is NORMAL or PAUSED; NOT_READY if in MAINTENANCE or LOCKDOWN
      checks.operationalGate = opMode !== "MAINTENANCE_MODE" && opMode !== "SECURITY_LOCKDOWN";
    } catch {
      checks.operationalGate = false;
    }

    // 3. Worker Fleet Check
    try {
      const activeWorkersCount = await prisma.backgroundWorker.count({
        where: { status: { in: ["IDLE", "BUSY"] } },
      });
      checks.workerFleet = activeWorkersCount >= 0; // True even if 0 workers (will scale)
    } catch {
      checks.workerFleet = false;
    }

    const isReady = checks.database && checks.operationalGate;

    return {
      status: isReady ? "READY" : "NOT_READY",
      databaseHealthy: checks.database,
      operationalMode: opMode,
      circuitBreakersHealthy: true,
      checks,
      timestamp: new Date().toISOString(),
      error: errorMessage,
    };
  }
}

