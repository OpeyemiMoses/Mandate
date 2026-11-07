/**
 * MANDATE — M14.7 / M14.7-R1: Fail-Closed Test & Script Database Safety Guard
 *
 * Re-exports the central connection-boundary database and HTTP target guards
 * from `src/lib/security/databaseTargetGuard.ts` and provides an ephemeral
 * in-process disposable HTTP server helper for integration tests.
 */

import http from "http";
import { NextRequest } from "next/server";
import {
  assertNotProductionDatabase,
  assertDisposableHttpServer,
  classifyDatabaseTarget,
  validateDatabaseEnvironmentConsistency,
  isTestOrHarnessRuntime,
  installTestHttpIsolationGuard,
  DatabaseTargetClassification,
} from "../../src/lib/security/databaseTargetGuard";

export {
  assertNotProductionDatabase,
  assertDisposableHttpServer,
  classifyDatabaseTarget,
  validateDatabaseEnvironmentConsistency,
  isTestOrHarnessRuntime,
  installTestHttpIsolationGuard,
  type DatabaseTargetClassification,
};

/**
 * Starts an ephemeral, in-process HTTP server bound to `127.0.0.1:0` that
 * serves Mandate API routes strictly against the verified disposable database.
 * Prevents HTTP-based integration tests from ever touching a production-connected
 * server on port 3001.
 */
export async function startDisposableTestHttpServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const verifiedDb = assertNotProductionDatabase(
    undefined,
    "startDisposableTestHttpServer"
  );

  const liveRoute = await import("../../src/app/api/health/live/route");
  const readyRoute = await import("../../src/app/api/health/ready/route");
  const authRoute = await import("../../src/app/api/auth/route");
  const walletsRoute = await import("../../src/app/api/wallets/route");
  const walletsFundRoute = await import("../../src/app/api/wallets/fund/route");
  const agentsRoute = await import("../../src/app/api/agents/route");

  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || "127.0.0.1";
      const fullUrl = `http://${host}${req.url || "/"}`;
      const parsedUrl = new URL(fullUrl);
      const pathname = parsedUrl.pathname;
      const method = (req.method || "GET").toUpperCase();

      const bodyChunks: Buffer[] = [];
      for await (const chunk of req) {
        bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(bodyChunks);

      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) {
          for (const item of v) headers.append(k, item);
        } else if (typeof v === "string") {
          headers.set(k, v);
        }
      }

      const nextReq = new NextRequest(fullUrl, {
        method,
        headers,
        body:
          method !== "GET" && method !== "HEAD" && rawBody.length > 0
            ? rawBody
            : undefined,
      });

      let response: Response | null = null;

      if (pathname === "/api/health/live" && method === "GET") {
        response = await liveRoute.GET();
      } else if (pathname === "/api/health/ready" && method === "GET") {
        response = await readyRoute.GET();
      } else if (pathname === "/api/auth") {
        if (method === "GET") response = await authRoute.GET(nextReq);
        else if (method === "POST") response = await authRoute.POST(nextReq);
        else if (method === "DELETE") response = await authRoute.DELETE(nextReq);
      } else if (pathname === "/api/wallets") {
        if (method === "GET") response = await walletsRoute.GET(nextReq);
        else if (method === "POST") response = await walletsRoute.POST(nextReq);
      } else if (pathname === "/api/wallets/fund") {
        if (method === "POST") response = await walletsFundRoute.POST(nextReq);
      } else if (pathname === "/api/agents") {
        if (method === "GET") response = await agentsRoute.GET(nextReq);
        else if (method === "POST") response = await agentsRoute.POST(nextReq);
      }

      if (!response) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: `Route ${method} ${pathname} not mounted in disposable test HTTP server (${verifiedDb})`,
          })
        );
        return;
      }

      const outHeaders: Record<string, string | string[]> = {};
      response.headers.forEach((val, key) => {
        outHeaders[key] = val;
      });
      const setCookie = (response.headers as any).getSetCookie?.();
      if (Array.isArray(setCookie) && setCookie.length > 0) {
        outHeaders["set-cookie"] = setCookie;
      }

      const textBody = await response.text();
      res.writeHead(response.status, outHeaders);
      res.end(textBody);
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || "Internal Server Error" }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Verify the server reports disposable database target before returning
  await assertDisposableHttpServer(baseUrl);

  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
