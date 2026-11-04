import { ToolDefinition, ToolOperation } from "../types";
import { ToolAdapter, AdapterContext } from "./types";
import { validateSafeUrlAsync, safeFetch } from "../security";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

export class RestApiToolAdapter implements ToolAdapter {
  public async execute(
    tool: ToolDefinition,
    operation: ToolOperation,
    params: Record<string, unknown>,
    context: AdapterContext
  ): Promise<any> {
    const config = context.connectionConfig || (tool.metadata as any)?.restConfig || {};
    const baseUrl = config.baseUrl;

    if (!baseUrl) {
      throw new Error(`REST tool "${tool.id}" requires a configured baseUrl`);
    }

    const path = config.operationPaths?.[operation.id] || `/${operation.id}`;
    const fullUrl = new URL(path, baseUrl).toString();

    // 1. SSRF & DNS Rebinding Validation
    const urlValidation = await validateSafeUrlAsync(fullUrl);
    if (!urlValidation.valid) {
      throw new Error(`SSRF Blocked: ${urlValidation.error}`);
    }

    const method = (config.operationMethods?.[operation.id] || "POST").toUpperCase();

    // 2. Prepare Headers & Authentication
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mandate-Universal-Agent-Runtime/1.0",
      ...(config.defaultHeaders || {}),
    };

    if (context.credentials) {
      if (context.credentials.apiKey) {
        const headerName = config.apiKeyHeaderName || "x-api-key";
        headers[headerName] = context.credentials.apiKey;
      } else if (context.credentials.bearerToken) {
        headers["Authorization"] = `Bearer ${context.credentials.bearerToken}`;
      } else if (context.credentials.username && context.credentials.password) {
        const encoded = Buffer.from(
          `${context.credentials.username}:${context.credentials.password}`
        ).toString("base64");
        headers["Authorization"] = `Basic ${encoded}`;
      }
    }

    // 3. Setup Timeout & Signal
    const timeoutMs = tool.timeoutMs || 10000;
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

    if (context.signal) {
      context.signal.addEventListener("abort", () => timeoutController.abort());
    }

    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: timeoutController.signal,
      };

      if (method === "GET") {
        const urlObj = new URL(fullUrl);
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null) {
            urlObj.searchParams.set(k, String(v));
          }
        }
        const res = await safeFetch(urlObj.toString(), fetchOptions);
        return await this.parseResponse(res);
      } else {
        fetchOptions.body = JSON.stringify(params);
        const res = await safeFetch(fullUrl, fetchOptions);
        return await this.parseResponse(res);
      }
    } catch (err: any) {
      if (err.name === "AbortError" || timeoutController.signal.aborted) {
        throw new Error(`REST tool "${tool.id}" timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseResponse(res: Response): Promise<any> {
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
      throw new Error(
        `Response exceeds maximum allowed size of ${MAX_RESPONSE_BYTES} bytes`
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200)}`
      );
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await res.json();
    }

    return await res.text();
  }
}

export const restAdapter = new RestApiToolAdapter();

