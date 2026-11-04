/**
 * Mandate Universal Job Retry Service
 * Milestone 9.1 - Persistent Retry Scheduling, Exponential Backoff & Classification
 */

import { RetryPolicy, DEFAULT_RETRY_POLICY, JobDefinition } from "./types";

export class JobRetryService {
  /**
   * Calculate deterministic exponential backoff with jitter
   * Defaults: Attempt 1: 0s, Attempt 2: 10s, Attempt 3: 30s, Attempt 4: 2m, Attempt 5: 10m
   */
  public static calculateBackoff(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
    if (attempt <= 1) {
      return 0;
    }

    let baseMs: number;
    switch (attempt) {
      case 2:
        baseMs = policy.initialBackoffMs; // 10,000ms (10s)
        break;
      case 3:
        baseMs = policy.initialBackoffMs * policy.backoffMultiplier; // 30,000ms (30s)
        break;
      case 4:
        baseMs = 120000; // 2 minutes (120,000ms)
        break;
      case 5:
      default:
        baseMs = Math.min(policy.maxBackoffMs, 600000); // 10 minutes (600,000ms)
        break;
    }

    if (policy.jitter) {
      // 0% to 15% random jitter to avoid thundering herd on recovery
      const jitterFactor = 1 + Math.random() * 0.15;
      return Math.round(baseMs * jitterFactor);
    }

    return baseMs;
  }

  /**
   * Classify an execution failure into retryable vs non-retryable fatal errors
   */
  public static classifyFailure(
    error: any,
    jobDef?: JobDefinition
  ): { isRetryable: boolean; errorCode: string; errorMessage: string } {
    const rawMessage = String(error?.message || error || "Unknown error");
    const lowerMsg = rawMessage.toLowerCase();

    // 1. Explicit Non-Retryable Governance, Security & Validation Failures
    const nonRetryablePatterns = [
      "invalid recipient",
      "invalid amount",
      "invalid near recipient",
      "unauthorized",
      "tenant not found",
      "not permitted",
      "policy denied",
      "governance policy denied",
      "governance policy blocked",
      "approval required",
      "approval payload hash mismatch",
      "approval verification failed",
      "exceeds per-transaction limit",
      "exceeds mandate",
      "unrecognized job type",
      "parameter drift",
      "schema validation failed",
      "payload validation failed",
      "insufficient funds",
      "cannot cancel",
    ];

    for (const pattern of nonRetryablePatterns) {
      if (lowerMsg.includes(pattern)) {
        return {
          isRetryable: false,
          errorCode: "FATAL_SECURITY_OR_VALIDATION_ERROR",
          errorMessage: rawMessage,
        };
      }
    }

    // 2. Retryable Network, Rate Limit, or Transient Infrastructure Failures
    const retryablePatterns = [
      "network",
      "timeout",
      "econnreset",
      "econnrefused",
      "fetch failed",
      "sqlite_busy",
      "database locked",
      "rate limit",
      "temporarily unavailable",
      "gateway",
      "503",
      "504",
      "transient",
    ];

    for (const pattern of retryablePatterns) {
      if (lowerMsg.includes(pattern)) {
        return {
          isRetryable: true,
          errorCode: "TRANSIENT_INFRASTRUCTURE_FAILURE",
          errorMessage: rawMessage,
        };
      }
    }

    // If job definition explicitly designates non-retryable
    if (jobDef && !jobDef.retryPolicy) {
      return {
        isRetryable: false,
        errorCode: "NO_RETRY_POLICY",
        errorMessage: rawMessage,
      };
    }

    // Default: allow retry if within max attempts unless flagged
    return {
      isRetryable: true,
      errorCode: "UNCLASSIFIED_ERROR",
      errorMessage: rawMessage,
    };
  }
}

