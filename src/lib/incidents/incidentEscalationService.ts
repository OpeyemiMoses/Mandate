/**
 * Incident Escalation Service (Milestone 9.3)
 * Monitors incident SLAs, triggers auto-escalations, and marks manual intervention flags.
 */

import { prisma } from "@/lib/db";
import { IncidentLifecycleService } from "./incidentLifecycleService";

export interface EscalationPolicy {
  severity: "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4";
  ackSlaMinutes: number;
  resolveSlaMinutes: number;
}

export const DEFAULT_SLA_POLICIES: EscalationPolicy[] = [
  { severity: "SEV-1", ackSlaMinutes: 15, resolveSlaMinutes: 120 },
  { severity: "SEV-2", ackSlaMinutes: 60, resolveSlaMinutes: 480 },
  { severity: "SEV-3", ackSlaMinutes: 240, resolveSlaMinutes: 1440 },
  { severity: "SEV-4", ackSlaMinutes: 720, resolveSlaMinutes: 2880 },
];

export class IncidentEscalationService {
  /**
   * Scans all open incidents and auto-escalates breaches.
   */
  public static async evaluateAndEscalateOpenIncidents(
    policies: EscalationPolicy[] = DEFAULT_SLA_POLICIES
  ) {
    const now = new Date();
    const openIncidents = await prisma.incident.findMany({
      where: {
        status: { in: ["DETECTED", "ACKNOWLEDGED", "INVESTIGATING", "RECOVERY_PENDING"] },
      },
    });

    const escalatedIncidents: string[] = [];

    for (const inc of openIncidents) {
      const policy =
        policies.find((p) => p.severity === inc.severity) ||
        policies[policies.length - 1];

      const ageMinutes = (now.getTime() - inc.detectedAt.getTime()) / 60000;

      // 1. Unacknowledged SLA Breach
      if (inc.status === "DETECTED" && ageMinutes > policy.ackSlaMinutes) {
        await IncidentLifecycleService.transitionStage({
          incidentId: inc.id,
          newStage: "ESCALATED",
          actorId: "SYSTEM_ESCALATION_DAEMON",
          actorType: "SYSTEM",
          notes: `Auto-escalated: Incident remained unacknowledged for ${Math.round(ageMinutes)}m (SLA: ${policy.ackSlaMinutes}m).`,
        });
        escalatedIncidents.push(inc.id);
        continue;
      }

      // 2. Failed recovery attempts threshold check
      const recoveryPlan = await prisma.recoveryPlan.findFirst({
        where: { incidentId: inc.id },
        include: { attempts: true },
      });

      if (recoveryPlan && recoveryPlan.attempts.length >= 3) {
        const hasSuccessfulAttempt = recoveryPlan.attempts.some(
          (a) => a.status === "SUCCESS"
        );
        if (!hasSuccessfulAttempt && inc.status !== "MANUAL_INTERVENTION_REQUIRED") {
          await IncidentLifecycleService.transitionStage({
            incidentId: inc.id,
            newStage: "MANUAL_INTERVENTION_REQUIRED",
            actorId: "SYSTEM_RECOVERY_GOVERNOR",
            actorType: "SYSTEM",
            notes: `Recovery aborted: ${recoveryPlan.attempts.length} consecutive recovery attempts failed. Manual operator intervention required.`,
          });
          escalatedIncidents.push(inc.id);
        }
      }
    }

    return {
      evaluatedCount: openIncidents.length,
      escalatedCount: escalatedIncidents.length,
      escalatedIds: escalatedIncidents,
    };
  }
}

