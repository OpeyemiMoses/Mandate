/**
 * Failure Injection Simulator (Milestone 9.4)
 * Allows automated resilience tests to inject controlled faults into test scenarios.
 */

import { ProviderResilienceService } from "../providerResilienceService";

export class FailureInjectionService {
  private static simulatedFaults = new Set<string>();

  public static enableFault(faultKey: string): void {
    this.simulatedFaults.add(faultKey);
  }

  public static disableFault(faultKey: string): void {
    this.simulatedFaults.delete(faultKey);
  }

  public static isFaultEnabled(faultKey: string): boolean {
    return this.simulatedFaults.has(faultKey);
  }

  public static clearAllFaults(): void {
    this.simulatedFaults.clear();
  }

  /**
   * Simulates an ambiguous timeout for a NEAR RPC broadcast call.
   */
  public static async simulateNearRpcTimeout(): Promise<never> {
    throw new Error(
      "PROVIDER_TIMEOUT: Simulated timeout on NEAR RPC broadcast. Status: AMBIGUOUS (Preserve reservation)."
    );
  }

  /**
   * Simulates an OutLayer signing session timeout.
   */
  public static async simulateOutLayerSigningTimeout(): Promise<never> {
    throw new Error(
      "OUTLAYER_SESSION_TIMEOUT: Simulated session expiration on OutLayer enclave. Status: AMBIGUOUS."
    );
  }
}

