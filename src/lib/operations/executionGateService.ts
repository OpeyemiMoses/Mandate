/**
 * Execution Gate Service (Milestone 9.4)
 * High-performance gatekeeper that halts execution at all entry points
 * when emergency operational controls are active.
 */

import { OperationalControlService } from "./operationalControlService";
import { ControlCheckResult, OperationalMode } from "./types";

export class ExecutionGateService {
  /**
   * Asserts whether financial executions (transfers, budget allocations) are currently allowed.
   * Throws deterministic operational errors if blocked.
   */
  public static async assertFinancialExecutionAllowed(context?: string): Promise<void> {
    const check = await this.checkFinancialExecutionAllowed();
    if (!check.allowed) {
      throw new Error(
        `OPERATIONAL_CONTROL_BLOCKED: Financial execution halted (${check.mode}). ${check.reason || "Operational pause active."} ${context ? `[Context: ${context}]` : ""}`
      );
    }
  }

  /**
   * Asserts whether agent workflow execution and tool invocations are currently allowed.
   */
  public static async assertAgentExecutionAllowed(context?: string): Promise<void> {
    const check = await this.checkAgentExecutionAllowed();
    if (!check.allowed) {
      throw new Error(
        `OPERATIONAL_CONTROL_BLOCKED: Agent execution halted (${check.mode}). ${check.reason || "Operational pause active."} ${context ? `[Context: ${context}]` : ""}`
      );
    }
  }

  /**
   * Checks financial execution permission without throwing.
   */
  public static async checkFinancialExecutionAllowed(): Promise<ControlCheckResult> {
    const mode = await OperationalControlService.getCurrentMode();
    const now = new Date().toISOString();

    if (mode === "FINANCIAL_EXECUTION_PAUSED") {
      return {
        allowed: false,
        mode,
        reason: "New financial executions are paused by emergency operational command.",
        blockedAt: now,
      };
    }

    if (mode === "MAINTENANCE_MODE") {
      return {
        allowed: false,
        mode,
        reason: "Platform is currently under maintenance mode. Financial transactions disabled.",
        blockedAt: now,
      };
    }

    if (mode === "SECURITY_LOCKDOWN") {
      return {
        allowed: false,
        mode,
        reason: "CRITICAL: Security lockdown active. All financial transactions are strictly blocked.",
        blockedAt: now,
      };
    }

    return { allowed: true, mode };
  }

  /**
   * Checks agent workflow execution permission without throwing.
   */
  public static async checkAgentExecutionAllowed(): Promise<ControlCheckResult> {
    const mode = await OperationalControlService.getCurrentMode();
    const now = new Date().toISOString();

    if (mode === "ALL_AGENT_EXECUTION_PAUSED") {
      return {
        allowed: false,
        mode,
        reason: "Autonomous agent execution is temporarily paused by operator command.",
        blockedAt: now,
      };
    }

    if (mode === "MAINTENANCE_MODE") {
      return {
        allowed: false,
        mode,
        reason: "Platform is currently under maintenance mode. Agent execution disabled.",
        blockedAt: now,
      };
    }

    if (mode === "SECURITY_LOCKDOWN") {
      return {
        allowed: false,
        mode,
        reason: "CRITICAL: Security lockdown active. All agent executions are terminated.",
        blockedAt: now,
      };
    }

    return { allowed: true, mode };
  }
}

