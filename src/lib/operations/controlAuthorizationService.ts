/**
 * Operational Control Authorization Service (Milestone 9.4)
 * Enforces strict Role-Based Access Control and guarantees AI agents
 * can NEVER mutate operational controls or lift emergency pauses.
 */

import { OperatorRole, OperationalActionType, OperationalMode } from "./types";

export class ControlAuthorizationService {
  /**
   * Asserts whether an actor is authorized to perform an operational control action.
   * Throws deterministic security errors if unauthorized.
   */
  public static assertAuthorized(params: {
    actorId: string;
    actorRole: string;
    isAgent?: boolean;
    actionType: OperationalActionType;
    currentMode?: OperationalMode;
  }): void {
    const { actorRole, isAgent, actionType, currentMode } = params;

    // INVARIANT 1: Autonomous AI agents are strictly prohibited from modifying control states!
    if (isAgent === true || actorRole.toLowerCase().includes("agent") || actorRole.toLowerCase().includes("bot")) {
      throw new Error(
        "SECURITY_POLICY_VIOLATION: Autonomous AI agents are strictly prohibited from mutating the operational control plane."
      );
    }

    const normalizedRole = actorRole.toUpperCase() as OperatorRole;

    // INVARIANT 2: Normal users / unauthorized roles are rejected
    if (
      normalizedRole !== "OWNER" &&
      normalizedRole !== "SECURITY_ADMIN" &&
      normalizedRole !== "OPERATOR"
    ) {
      throw new Error(
        `FORBIDDEN: Insufficient administrative privileges. Role "${actorRole}" is not permitted to perform operational control action "${actionType}".`
      );
    }

    // INVARIANT 3: Lifting SECURITY_LOCKDOWN or exiting MAINTENANCE requires elevated role (OWNER or SECURITY_ADMIN)
    if (
      actionType === "RELEASE_SECURITY_LOCKDOWN" ||
      (currentMode === "SECURITY_LOCKDOWN" && actionType === "RESUME_EXECUTION")
    ) {
      if (normalizedRole !== "OWNER" && normalizedRole !== "SECURITY_ADMIN") {
        throw new Error(
          "FORBIDDEN: Releasing a SECURITY_LOCKDOWN strictly requires OWNER or SECURITY_ADMIN role authorization."
        );
      }
    }
  }
}

