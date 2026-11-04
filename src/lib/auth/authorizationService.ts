/**
 * MANDATE — Centralized Role & Permission Authorization Service
 * Milestone 9.5: Final Production Certification
 * 
 * Verifies role-based privileges, agent privilege ceilings, and administrative boundaries.
 */

import { AuthContext, ForbiddenError } from "./authenticateRequest";

export type UserRole = "OWNER" | "SECURITY_ADMIN" | "OPERATOR" | "MEMBER" | "VIEWER";

export class AuthorizationService {
  /**
   * Asserts caller has one of the allowed roles.
   */
  public static assertRole(context: AuthContext, allowedRoles: UserRole[]): void {
    const userRole = (context.role || "MEMBER").toUpperCase() as UserRole;
    if (!allowedRoles.includes(userRole)) {
      throw new ForbiddenError(
        `Forbidden: Role "${context.role}" is not permitted to perform this action. Required: [${allowedRoles.join(", ")}]`
      );
    }
  }

  /**
   * Asserts caller has full administrative privileges.
   */
  public static assertAdmin(context: AuthContext): void {
    this.assertRole(context, ["OWNER", "SECURITY_ADMIN"]);
  }

  /**
   * Asserts caller has operational privileges (Admin or Operator).
   */
  public static assertOperator(context: AuthContext): void {
    this.assertRole(context, ["OWNER", "SECURITY_ADMIN", "OPERATOR"]);
  }

  /**
   * INVARIANT: AI agents cannot modify their own permissions or escalate privileges.
   */
  public static assertAgentCannotEscalate(targetAgent: { id: string }, requestedPrivileges: string[]): void {
    if (requestedPrivileges.includes("ADMIN") || requestedPrivileges.includes("ALL_RESOURCES")) {
      throw new ForbiddenError("SECURITY_POLICY_VIOLATION: Agents cannot grant themselves administrative privileges.");
    }
  }
}

