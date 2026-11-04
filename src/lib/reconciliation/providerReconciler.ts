/**
 * Provider Reconciler (Milestone 9.3)
 * Tests external integration endpoints (NEAR RPC, FastNEAR, OutLayer)
 * and evaluates network availability and latency.
 */

import {
  EvaluatedFinding,
  EvidencePayload,
  ReconciliationClassification,
  ReconciliationSeverity,
} from "./types";

export interface ProviderEndpoint {
  name: string;
  url: string;
  providerType: "near_rpc" | "fastnear" | "outlayer";
}

export class ProviderReconciler {
  public static readonly DEFAULT_ENDPOINTS: ProviderEndpoint[] = [
    {
      name: "NEAR Testnet Primary RPC",
      url: process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com",
      providerType: "near_rpc",
    },
    {
      name: "NEAR Archival RPC",
      url: "https://archival-rpc.testnet.near.org",
      providerType: "near_rpc",
    },
    {
      name: "OutLayer Execution Engine",
      url: process.env.OUTLAYER_API_URL || "https://api.outlayer.fastnear.com",
      providerType: "outlayer",
    },
  ];

  /**
   * Pings a specific provider endpoint to verify network availability and response time.
   */
  public static async reconcileEndpoint(
    endpoint: ProviderEndpoint,
    timeoutMs: number = 5000
  ): Promise<EvaluatedFinding> {
    const startTime = Date.now();
    const evidence: EvidencePayload[] = [];
    let classification: ReconciliationClassification = "MATCHED";
    let severity: ReconciliationSeverity = "INFO";
    let externalState = "HEALTHY";
    let details = `${endpoint.name} is reachable.`;
    let latencyMs = 0;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      // JSON-RPC status check for NEAR or standard ping for OutLayer
      const body = endpoint.providerType === "near_rpc" || endpoint.providerType === "fastnear"
        ? JSON.stringify({
            jsonrpc: "2.0",
            id: `health-${Date.now()}`,
            method: "status",
            params: [],
          })
        : JSON.stringify({ ping: true });

      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body,
      });

      clearTimeout(timer);
      latencyMs = Date.now() - startTime;

      if (!res.ok && res.status >= 500) {
        classification = "UNAVAILABLE";
        severity = "SEV-2";
        externalState = `HTTP_${res.status}`;
        details = `${endpoint.name} returned HTTP ${res.status} in ${latencyMs}ms.`;
      } else {
        classification = "MATCHED";
        externalState = "ONLINE";
        details = `${endpoint.name} responded in ${latencyMs}ms.`;
      }

      evidence.push({
        sourceProvider: endpoint.providerType,
        observedState: externalState,
        confidence: 1.0,
        data: {
          url: endpoint.url,
          status: res.status,
          latencyMs,
        },
        observedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      latencyMs = Date.now() - startTime;
      classification = "UNAVAILABLE";
      severity = "SEV-2";
      externalState = err.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR";
      details = `${endpoint.name} unreachable after ${latencyMs}ms: ${err.message}`;

      evidence.push({
        sourceProvider: endpoint.providerType,
        observedState: externalState,
        confidence: 0.1,
        data: {
          url: endpoint.url,
          error: err.message,
          latencyMs,
        },
        observedAt: new Date().toISOString(),
      });
    }

    return {
      entityType: "PROVIDER",
      entityId: endpoint.url,
      internalState: "CONFIGURED",
      externalState,
      classification,
      severity,
      details,
      recommendedResponse:
        classification === "UNAVAILABLE" ? "RECONNECT_PROVIDER" : "RECONCILE_ONLY",
      evidence,
      metadata: {
        providerName: endpoint.name,
        providerType: endpoint.providerType,
        latencyMs,
      },
    };
  }

  /**
   * Reconciles all configured provider endpoints.
   */
  public static async reconcileAllProviders(
    endpoints?: ProviderEndpoint[]
  ): Promise<EvaluatedFinding[]> {
    const list = endpoints || this.DEFAULT_ENDPOINTS;
    const findings: EvaluatedFinding[] = [];

    for (const ep of list) {
      const finding = await this.reconcileEndpoint(ep);
      findings.push(finding);
    }

    return findings;
  }
}

