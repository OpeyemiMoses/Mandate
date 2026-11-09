/**
 * MANDATE — NEAR Intents Feature Gate & Kill Switch
 * Milestone 15.3b: Provider Integration & Two-Phase Execution Pipeline
 *
 * Enforces fail-closed feature gating for all NEAR Intents operations.
 * Defaults strictly to DISABLED (false).
 */

export class NearIntentsFeatureGate {
  /**
   * Returns whether NEAR Intents execution is enabled.
   * Defaults strictly to false unless explicitly configured as "true".
   */
  public static isEnabled(): boolean {
    const flag = process.env.MANDATE_ENABLE_NEAR_INTENTS;
    return flag === "true" || flag === "1";
  }

  /**
   * Asserts that NEAR Intents execution is enabled.
   * Throws deterministic fail-closed error if disabled.
   */
  public static assertEnabled(context: string = "NEAR Intents Operation"): void {
    if (!this.isEnabled()) {
      throw new Error(
        `NEAR_INTENTS_DISABLED: NEAR Intents execution is currently disabled in this environment. [Context: ${context}]`
      );
    }
  }
}

export function isNearIntentsEnabled(): boolean {
  return NearIntentsFeatureGate.isEnabled();
}

export function assertNearIntentsEnabled(context?: string): void {
  NearIntentsFeatureGate.assertEnabled(context);
}

