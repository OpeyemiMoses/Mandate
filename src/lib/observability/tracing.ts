/**
 * Mandate Universal Distributed Tracing & W3C Trace Context Engine
 * Milestone 9.2 - OpenTelemetry Distributed Tracing & Context Propagation
 */

import crypto from "crypto";
import {
  trace,
  context,
  Span as OtelSpan,
  SpanStatusCode as OtelSpanStatusCode,
  SpanKind as OtelSpanKind,
} from "@opentelemetry/api";
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  ReadableSpan,
  SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  W3CTraceContext,
  SpanRecord,
  TraceDetail,
  ExporterStatus,
} from "./types";

// Denied attribute keys to ensure sensitive material is NEVER leaked into traces
const SENSITIVE_KEY_PATTERNS = [
  /key/i,
  /secret/i,
  /token/i,
  /auth/i,
  /password/i,
  /seed/i,
  /envelope/i,
  /signature/i,
  /credential/i,
  /private/i,
  /cookie/i,
];

/**
 * Custom In-Memory Ring Buffer Exporter for Local Investigation & Dashboard
 */
class MandateInMemorySpanExporter implements SpanExporter {
  private spans: SpanRecord[] = [];
  private readonly maxSpans: number;

  constructor(maxSpans: number = 500) {
    this.maxSpans = maxSpans;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: { code: number; error?: Error }) => void
  ): void {
    for (const span of spans) {
      const spanContext = span.spanContext();
      const parentSpanId = (span as any).parentSpanId || (span as any).parentSpanContext?.spanId;

      const record: SpanRecord = {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        parentSpanId,
        name: span.name,
        kind: "INTERNAL",
        startTimeUnixNano: span.startTime[0] * 1e9 + span.startTime[1],
        endTimeUnixNano: span.endTime[0] * 1e9 + span.endTime[1],
        durationMs: Math.max(
          0,
          Math.round(
            (span.duration[0] * 1e9 + span.duration[1]) / 1e6
          )
        ),
        statusCode:
          span.status.code === OtelSpanStatusCode.ERROR
            ? "ERROR"
            : span.status.code === OtelSpanStatusCode.OK
            ? "OK"
            : "UNSET",
        statusMessage: span.status.message,
        attributes: sanitizeAttributes(span.attributes as Record<string, any>),
        events: span.events.map((e) => ({
          name: e.name,
          timeUnixNano: e.time[0] * 1e9 + e.time[1],
          attributes: sanitizeAttributes(e.attributes as Record<string, any>),
        })),
      };

      this.spans.unshift(record);
      if (this.spans.length > this.maxSpans) {
        this.spans.length = this.maxSpans;
      }

      // If remote OTLP endpoint configured, dispatch asynchronously without blocking
      dispatchRemoteOtlpSpan(record).catch(() => {
        // Telemetry dispatch failure cannot disrupt worker or application
      });
    }

    resultCallback({ code: 0 }); // 0 = SUCCESS
  }

  shutdown(): Promise<void> {
    this.spans = [];
    return Promise.resolve();
  }

  getSpans(): SpanRecord[] {
    return [...this.spans];
  }

  getSpansByTraceId(traceId: string): SpanRecord[] {
    return this.spans.filter((s) => s.traceId === traceId);
  }

  clear(): void {
    this.spans = [];
  }
}

// Global In-Memory buffer instance
const inMemoryExporter = new MandateInMemorySpanExporter(500);

let tracerProviderInitialized = false;
let exporterState: ExporterStatus = {
  serviceName: process.env.OTEL_SERVICE_NAME || "mandate-runtime",
  configured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
  endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  status: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? "ACTIVE" : "NOT_CONFIGURED",
};

/**
 * Initialize OpenTelemetry Tracer Provider
 */
export function initializeTracing(): void {
  if (tracerProviderInitialized) return;

  try {
    const serviceName = process.env.OTEL_SERVICE_NAME || "mandate-runtime";
    const resource = resourceFromAttributes({
      "service.name": serviceName,
      "service.version": "1.0.0",
      "deployment.environment": process.env.NODE_ENV || "development",
    });

    const provider = new BasicTracerProvider({
      resource,
      spanProcessors: [new SimpleSpanProcessor(inMemoryExporter)],
    });

    trace.setGlobalTracerProvider(provider);
    tracerProviderInitialized = true;
  } catch (err: any) {
    // Fail-open: tracing initialization failure cannot prevent server startup
    console.warn("OpenTelemetry initialization warning:", err?.message);
  }
}

// Ensure tracer initialized on import
initializeTracing();

/**
 * Sanitize span attributes to prevent leaking credentials, keys, or private financial envelopes
 */
export function sanitizeAttributes(
  raw: Record<string, any> = {}
): Record<string, string | number | boolean> {
  const sanitized: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(raw)) {
    // Check if key matches sensitive patterns
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitive) {
      sanitized[key] = "[REDACTED_BY_POLICY]";
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      sanitized[key] = value;
    } else if (value !== null && value !== undefined) {
      // Stringify object attributes safely
      const str = String(value);
      sanitized[key] = str.length > 500 ? str.slice(0, 500) + "..." : str;
    }
  }

  return sanitized;
}

/**
 * Generate W3C Traceparent Header String
 * Format: 00-{traceId:32hex}-{spanId:16hex}-{flags:2hex}
 */
export function generateW3CTraceParent(existingTraceId?: string): string {
  const traceId =
    existingTraceId && /^[0-9a-f]{32}$/i.test(existingTraceId)
      ? existingTraceId.toLowerCase()
      : crypto.randomBytes(16).toString("hex");
  const spanId = crypto.randomBytes(8).toString("hex");
  return `00-${traceId}-${spanId}-01`;
}

/**
 * Parse W3C Traceparent Header
 */
export function parseW3CTraceParent(
  traceParent?: string | null
): W3CTraceContext | null {
  if (!traceParent) return null;
  const match = traceParent.trim().match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i);
  if (!match) return null;

  return {
    version: "00",
    traceId: match[1].toLowerCase(),
    spanId: match[2].toLowerCase(),
    traceFlags: match[3],
  };
}

/**
 * Asynchronously dispatch span to remote OTLP endpoint if configured
 */
async function dispatchRemoteOtlpSpan(span: SpanRecord): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  try {
    const url = endpoint.endsWith("/")
      ? `${endpoint}v1/traces`
      : `${endpoint}/v1/traces`;

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: {
                  stringValue: process.env.OTEL_SERVICE_NAME || "mandate-runtime",
                },
              },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "mandate-tracer" },
              spans: [
                {
                  traceId: span.traceId,
                  spanId: span.spanId,
                  parentSpanId: span.parentSpanId,
                  name: span.name,
                  startTimeUnixNano: span.startTimeUnixNano,
                  endTimeUnixNano: span.endTimeUnixNano,
                  status: { code: span.statusCode === "ERROR" ? 2 : 1 },
                  attributes: Object.entries(span.attributes).map(([k, v]) => ({
                    key: k,
                    value:
                      typeof v === "number"
                        ? { doubleValue: v }
                        : typeof v === "boolean"
                        ? { boolValue: v }
                        : { stringValue: String(v) },
                  })),
                },
              ],
            },
          ],
        },
      ],
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
      for (const pair of process.env.OTEL_EXPORTER_OTLP_HEADERS.split(",")) {
        const [k, v] = pair.split("=");
        if (k && v) headers[k.trim()] = v.trim();
      }
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000), // 3-second hard timeout
    });

    if (res.ok) {
      exporterState.status = "ACTIVE";
      exporterState.lastExportAt = new Date().toISOString();
      exporterState.lastError = undefined;
    } else {
      exporterState.status = "ERROR";
      exporterState.lastError = `HTTP ${res.status}: ${res.statusText}`;
    }
  } catch (err: any) {
    exporterState.status = "ERROR";
    exporterState.lastError = err?.message || "Connection refused";
  }
}

/**
 * Get current Telemetry Exporter status
 */
export function getExporterStatus(): ExporterStatus {
  return { ...exporterState };
}

/**
 * Execute an async function wrapped in an OpenTelemetry span
 */
export async function withSpan<T>(
  name: string,
  fn: (span: OtelSpan, traceContext: W3CTraceContext) => Promise<T>,
  options: {
    parentTraceParent?: string | null;
    attributes?: Record<string, any>;
  } = {}
): Promise<T> {
  initializeTracing();
  const tracer = trace.getTracer("mandate-tracer", "1.0.0");

  let activeContext = context.active();
  let parsedContext = parseW3CTraceParent(options.parentTraceParent);
  let activeTraceParent = options.parentTraceParent;

  if (parsedContext) {
    activeContext = trace.setSpanContext(activeContext, {
      traceId: parsedContext.traceId,
      spanId: parsedContext.spanId,
      traceFlags: parseInt(parsedContext.traceFlags, 16) || 1,
      isRemote: true,
    });
  } else {
    activeTraceParent = generateW3CTraceParent();
    parsedContext = parseW3CTraceParent(activeTraceParent)!;
    activeContext = trace.setSpanContext(activeContext, {
      traceId: parsedContext.traceId,
      spanId: parsedContext.spanId,
      traceFlags: 1,
      isRemote: false,
    });
  }

  // Create span with attributes linked to parent trace context
  const span = tracer.startSpan(
    name,
    {
      attributes: sanitizeAttributes({
        ...options.attributes,
        "mandate.trace_parent": activeTraceParent,
        "mandate.correlation_id":
          options.attributes?.correlationId || options.attributes?.jobId,
      }),
    },
    activeContext
  );

  try {
    const result = await fn(span, parsedContext);
    span.setStatus({ code: OtelSpanStatusCode.OK });
    return result;
  } catch (err: any) {
    span.setStatus({
      code: OtelSpanStatusCode.ERROR,
      message: err?.message || "Execution failed",
    });
    span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}

/**
 * Retrieve trace details and span hierarchy by traceId
 */
export function getTraceDetail(traceId: string): TraceDetail | null {
  const spans = inMemoryExporter.getSpansByTraceId(traceId);
  if (!spans || spans.length === 0) return null;

  // Sort chronologically
  spans.sort((a, b) => a.startTimeUnixNano - b.startTimeUnixNano);

  const rootSpan = spans.find((s) => !s.parentSpanId) || spans[0];
  const totalDurationMs = spans.reduce((max, s) => Math.max(max, s.durationMs), 0);
  const hasErrors = spans.some((s) => s.statusCode === "ERROR");

  // Extract correlation metadata from span attributes
  let correlationId: string | undefined;
  let jobId: string | undefined;
  let workerId: string | undefined;
  let executionId: string | undefined;

  for (const s of spans) {
    if (s.attributes["mandate.correlation_id"])
      correlationId = String(s.attributes["mandate.correlation_id"]);
    if (s.attributes["mandate.job_id"])
      jobId = String(s.attributes["mandate.job_id"]);
    if (s.attributes["mandate.worker_id"])
      workerId = String(s.attributes["mandate.worker_id"]);
    if (s.attributes["mandate.execution_id"])
      executionId = String(s.attributes["mandate.execution_id"]);
  }

  return {
    traceId,
    rootSpan,
    spans,
    totalDurationMs,
    hasErrors,
    correlationId,
    jobId,
    workerId,
    executionId,
  };
}

/**
 * Get all recent spans
 */
export function getRecentSpans(limit: number = 100): SpanRecord[] {
  return inMemoryExporter.getSpans().slice(0, limit);
}

/**
 * Clear in-memory span exporter (useful for clean test environments)
 */
export function clearTraceBuffer(): void {
  inMemoryExporter.clear();
}
