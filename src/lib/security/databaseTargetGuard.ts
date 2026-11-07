/**
 * MANDATE — M14.7-R1: Central Fail-Closed Database & HTTP Target Protection Guard
 *
 * Enforces test database safety at the actual database connection boundary
 * (before any PrismaClient or pg.Client can connect) and prevents HTTP-based
 * test suites from reaching production-connected servers.
 *
 * Security Invariants:
 * 1. Validates the exact resolved connection URL and all environment variables
 *    (DATABASE_URL, POSTGRES_URL, DIRECT_URL, PG_DATABASE, TEST_DATABASE_URL).
 * 2. Rejects conflicting environment variables (e.g., DATABASE_URL vs POSTGRES_URL).
 * 3. Uses strict URL parsing (`new URL()`) and recursive `decodeURIComponent()`
 *    to defeat percent-encoded aliases (e.g., `%70rod`, `%6dandate_prod`).
 * 4. Rejects non-PostgreSQL schemes (`file:`, `http:`, malformed strings) and
 *    multi-segment path injections in test/disposable validation.
 * 5. Enforces strict local hostname allowlist (`localhost`, `127.0.0.1`, `::1`)
 *    and blocks any production/cloud hostnames.
 * 6. Requires explicit approved disposable database naming pattern; does NOT
 *    accept a database merely because its name contains `test` (rejects
 *    `mandate_testnet`, `prod_mandate_test`, `test_mandate_prod`, etc.).
 * 7. Zero production-write override or bypass flags.
 */

export interface DatabaseTargetClassification {
  rawUrl: string;
  scheme: string;
  hostname: string;
  port: string;
  databaseName: string;
  classification: "DISPOSABLE_TEST" | "PRODUCTION" | "UNAPPROVED";
  isApprovedDisposable: boolean;
  rejectionReason?: string;
}

const FORBIDDEN_DB_NAMES = new Set([
  "mandate_prod",
  "mandate-prod",
  "mandate_production",
  "mandate-production",
  "prod",
  "production",
  "main",
  "master",
  "defaultdb",
  "postgres",
  "template0",
  "template1",
  "neondb",
  "railway",
  "mandate",
  "mandate_main",
  "mandate_live",
  "mandate_staging",
  "mandate_testnet",
  "mandate_mainnet",
  "dev",
  "dev.db",
  "test.db",
]);

const FORBIDDEN_DB_SUBSTRINGS = [
  "prod",
  "production",
  "mainnet",
  "testnet",
  "live",
  "staging",
  "replica",
  "primary",
  "master",
];

const ALLOWED_LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

const FORBIDDEN_HOST_SUBSTRINGS = [
  "prod",
  "production",
  "aws",
  "amazonaws",
  "rds",
  "neon",
  "railway",
  "supabase",
  "render",
  "fly",
  "heroku",
  "digitalocean",
  "azure",
  "gcp",
  "cloud",
  "internal",
];

/**
 * Explicit approved disposable database naming pattern.
 * Does NOT accept arbitrary substrings containing "test" (such as mandate_testnet or prod_mandate_test).
 */
const APPROVED_DISPOSABLE_DB_REGEX =
  /^(mandate_(disposable|test|restore_test|restore_drill)(_[a-z0-9]+)*|(disposable|test)_(db|worker)(_[a-z0-9]+)*)$/i;

/**
 * Detects whether the current Node.js process is executing a test suite,
 * audit harness, seed script, or child test worker.
 */
export function isTestOrHarnessRuntime(): boolean {
  if (
    process.env.NODE_ENV === "test" ||
    process.env.MANDATE_TEST_MODE === "true" ||
    process.env.MANDATE_RUNTIME_MODE === "test" ||
    Boolean(process.env.TEST_SCENARIO)
  ) {
    return true;
  }

  const argv = process.argv || [];
  for (const arg of argv) {
    const normalized = String(arg).replace(/\\/g, "/");
    if (
      /(^|\/)(tests|__tests__)(\/|$)/i.test(normalized) ||
      /\.(test|spec)\.[cm]?[tj]sx?$/i.test(normalized) ||
      /(^|\/)(test-|audit-|verify-|evidence-|milestone-|multi-process-|e2e-|beta-ceiling-)[^/]*\.[cm]?[tj]sx?$/i.test(
        normalized
      ) ||
      /(^|\/)seed\.ts$/i.test(normalized) ||
      /(^|\/)worker-process\.ts$/i.test(normalized) ||
      normalized.startsWith("--test-scenario")
    ) {
      return true;
    }
  }

  return false;
}

function strictDecodeUriComponent(value: string, label: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error(
      `SAFETY VIOLATION: Malformed percent-encoding in database ${label} ("${value}").`
    );
  }

  // Reject double/nested percent-encoding tricks (e.g. %2570rod)
  try {
    const secondDecode = decodeURIComponent(decoded);
    if (secondDecode !== decoded || decoded.includes("%")) {
      throw new Error(
        `SAFETY VIOLATION: Nested or residual percent-encoding rejected in database ${label} ("${value}").`
      );
    }
  } catch (err: any) {
    if (err.message?.includes("SAFETY VIOLATION")) throw err;
    throw new Error(
      `SAFETY VIOLATION: Invalid nested percent-encoding in database ${label} ("${value}").`
    );
  }

  return decoded;
}

/**
 * Parses and classifies a connection URL or database name without throwing,
 * returning structured classification metadata.
 */
export function classifyDatabaseTarget(rawInput: string | undefined | null): DatabaseTargetClassification {
  if (rawInput === undefined || rawInput === null || String(rawInput).trim() === "") {
    return {
      rawUrl: String(rawInput ?? ""),
      scheme: "missing",
      hostname: "",
      port: "",
      databaseName: "",
      classification: "UNAPPROVED",
      isApprovedDisposable: false,
      rejectionReason: "Missing or empty database connection URL/name.",
    };
  }

  const trimmed = String(rawInput).trim();
  const looksLikeUrl =
    trimmed.includes(":") ||
    trimmed.includes("/") ||
    trimmed.includes("@") ||
    trimmed.includes("?");

  let scheme = "bare";
  let decodedHost = "localhost";
  let port = "5432";
  let decodedDbName = "";

  if (looksLikeUrl) {
    if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
      return {
        rawUrl: trimmed,
        scheme: trimmed.split(":")[0] || "invalid",
        hostname: "",
        port: "",
        databaseName: "",
        classification: "UNAPPROVED",
        isApprovedDisposable: false,
        rejectionReason: `Invalid or non-PostgreSQL database URL scheme in "${trimmed}". Only postgresql:// or postgres:// URLs are permitted.`,
      };
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return {
        rawUrl: trimmed,
        scheme: "malformed",
        hostname: "",
        port: "",
        databaseName: "",
        classification: "UNAPPROVED",
        isApprovedDisposable: false,
        rejectionReason: `Malformed PostgreSQL URL "${trimmed}".`,
      };
    }

    scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
    port = parsed.port || "5432";

    try {
      decodedHost = strictDecodeUriComponent(parsed.hostname || "", "hostname")
        .trim()
        .toLowerCase();
    } catch (err: any) {
      return {
        rawUrl: trimmed,
        scheme,
        hostname: parsed.hostname || "",
        port,
        databaseName: "",
        classification: "UNAPPROVED",
        isApprovedDisposable: false,
        rejectionReason: err.message,
      };
    }

    if (!decodedHost) {
      return {
        rawUrl: trimmed,
        scheme,
        hostname: "",
        port,
        databaseName: "",
        classification: "UNAPPROVED",
        isApprovedDisposable: false,
        rejectionReason: `Missing hostname in PostgreSQL URL "${trimmed}".`,
      };
    }

    // Extract pathname and reject empty or multi-segment paths
    const rawPathname = parsed.pathname || "";
    if (!rawPathname.startsWith("/")) {
      return {
        rawUrl: trimmed,
        scheme,
        hostname: decodedHost,
        port,
        databaseName: "",
        classification: "UNAPPROVED",
        isApprovedDisposable: false,
        rejectionReason: `Missing database path in PostgreSQL URL "${trimmed}".`,
      };
    }

    const rawDbSegment = rawPathname.slice(1);
    if (!rawDbSegment || rawDbSegment.includes("/")) {
      return {
        rawUrl: trimmed,
        scheme,
        hostname: decodedHost,
        port,
        databaseName: rawDbSegment,
        classification: "UNAPPROVED",
        isApprovedDisposable: false,
        rejectionReason: `Invalid or multi-segment database path "${rawPathname}" in URL "${trimmed}".`,
      };
    }

    try {
      decodedDbName = strictDecodeUriComponent(rawDbSegment, "databaseName")
        .trim()
        .toLowerCase();
    } catch (err: any) {
      return {
        rawUrl: trimmed,
        scheme,
        hostname: decodedHost,
        port,
        databaseName: rawDbSegment,
        classification: "UNAPPROVED",
        isApprovedDisposable: false,
        rejectionReason: err.message,
      };
    }
  } else {
    // Bare database name
    try {
      decodedDbName = strictDecodeUriComponent(trimmed, "databaseName")
        .trim()
        .toLowerCase();
    } catch (err: any) {
      return {
        rawUrl: trimmed,
        scheme: "bare",
        hostname: "localhost",
        port: "5432",
        databaseName: trimmed,
        classification: "UNAPPROVED",
        isApprovedDisposable: false,
        rejectionReason: err.message,
      };
    }
  }

  // 1. Check host restrictions
  for (const hostToken of FORBIDDEN_HOST_SUBSTRINGS) {
    if (decodedHost.includes(hostToken)) {
      return {
        rawUrl: trimmed,
        scheme,
        hostname: decodedHost,
        port,
        databaseName: decodedDbName,
        classification: "PRODUCTION",
        isApprovedDisposable: false,
        rejectionReason: `Database hostname "${decodedHost}" contains forbidden production/remote token "${hostToken}".`,
      };
    }
  }

  if (!ALLOWED_LOCAL_HOSTS.has(decodedHost)) {
    return {
      rawUrl: trimmed,
      scheme,
      hostname: decodedHost,
      port,
      databaseName: decodedDbName,
      classification: "PRODUCTION",
      isApprovedDisposable: false,
      rejectionReason: `Database hostname "${decodedHost}" is not in the approved local test host allowlist (localhost, 127.0.0.1, ::1).`,
    };
  }

  // 2. Check database name against exact blacklist
  if (!decodedDbName || FORBIDDEN_DB_NAMES.has(decodedDbName)) {
    return {
      rawUrl: trimmed,
      scheme,
      hostname: decodedHost,
      port,
      databaseName: decodedDbName,
      classification: "PRODUCTION",
      isApprovedDisposable: false,
      rejectionReason: `Database "${decodedDbName}" is an explicit protected production/system database.`,
    };
  }

  // 3. Check database name against forbidden tokens/substrings (catches prod_mandate_test, mandate_testnet, etc.)
  for (const token of FORBIDDEN_DB_SUBSTRINGS) {
    if (decodedDbName.includes(token)) {
      return {
        rawUrl: trimmed,
        scheme,
        hostname: decodedHost,
        port,
        databaseName: decodedDbName,
        classification: "PRODUCTION",
        isApprovedDisposable: false,
        rejectionReason: `Database "${decodedDbName}" contains forbidden environment token "${token}".`,
      };
    }
  }

  // 4. Verify explicit approved disposable database naming pattern
  if (!APPROVED_DISPOSABLE_DB_REGEX.test(decodedDbName)) {
    return {
      rawUrl: trimmed,
      scheme,
      hostname: decodedHost,
      port,
      databaseName: decodedDbName,
      classification: "UNAPPROVED",
      isApprovedDisposable: false,
      rejectionReason: `Database "${decodedDbName}" does not match the approved disposable database naming pattern (${APPROVED_DISPOSABLE_DB_REGEX.source}).`,
    };
  }

  return {
    rawUrl: trimmed,
    scheme,
    hostname: decodedHost,
    port,
    databaseName: decodedDbName,
    classification: "DISPOSABLE_TEST",
    isApprovedDisposable: true,
  };
}

/**
 * Validates all database-related environment variables for conflicts or
 * hidden production targets when resolving environment configuration.
 */
export function validateDatabaseEnvironmentConsistency(): void {
  const envCandidates: Array<{ key: string; value: string }> = [];
  const keys = [
    "DATABASE_URL",
    "POSTGRES_URL",
    "DIRECT_URL",
    "TEST_DATABASE_URL",
    "PG_DATABASE",
  ] as const;

  for (const key of keys) {
    const val = process.env[key];
    if (val !== undefined && val.trim() !== "") {
      envCandidates.push({ key, value: val.trim() });
    }
  }

  if (envCandidates.length === 0) {
    throw new Error(
      "SAFETY VIOLATION: Missing DATABASE_URL or POSTGRES_URL environment variable. Refusing to connect with implicit or default database."
    );
  }

  let canonicalDbName: string | null = null;
  let canonicalHost: string | null = null;

  for (const candidate of envCandidates) {
    const info = classifyDatabaseTarget(candidate.value);
    if (!info.isApprovedDisposable) {
      throw new Error(
        `SAFETY VIOLATION: Environment variable ${candidate.key} ("${candidate.value}") failed disposable database validation: ${info.rejectionReason}`
      );
    }

    if (canonicalDbName === null) {
      canonicalDbName = info.databaseName;
      canonicalHost = info.hostname;
    } else if (
      info.databaseName !== canonicalDbName ||
      (candidate.key !== "PG_DATABASE" && info.hostname !== canonicalHost)
    ) {
      throw new Error(
        `SAFETY VIOLATION: Conflicting database environment variables detected! ${candidate.key} resolves to "${info.hostname}/${info.databaseName}", which conflicts with "${canonicalHost}/${canonicalDbName}".`
      );
    }
  }
}

/**
 * Asserts that the target database URL/name (and active environment when validating
 * process configuration) is an approved disposable test database.
 *
 * Returns the validated decoded lowercase database name.
 */
export function assertNotProductionDatabase(
  connectionUrl?: string,
  callerContext?: string
): string {
  const prefix = callerContext ? `[${callerContext}] ` : "";

  // If connectionUrl is explicitly passed as empty string, fail closed immediately
  if (connectionUrl !== undefined && connectionUrl.trim() === "") {
    throw new Error(
      `${prefix}SAFETY VIOLATION: Empty database connection string provided.`
    );
  }

  const isCheckingEnvConfig =
    connectionUrl === undefined ||
    connectionUrl === process.env.DATABASE_URL ||
    connectionUrl === process.env.POSTGRES_URL ||
    connectionUrl === process.env.DIRECT_URL;

  if (isCheckingEnvConfig) {
    try {
      validateDatabaseEnvironmentConsistency();
    } catch (err: any) {
      throw new Error(`${prefix}${err.message}`);
    }
  }

  const targetToValidate =
    connectionUrl !== undefined
      ? connectionUrl
      : process.env.DATABASE_URL ||
        process.env.POSTGRES_URL ||
        process.env.DIRECT_URL;

  const classification = classifyDatabaseTarget(targetToValidate);
  if (!classification.isApprovedDisposable) {
    throw new Error(
      `${prefix}SAFETY VIOLATION: Refusing to execute against non-disposable database "${classification.databaseName || targetToValidate}". Reason: ${classification.rejectionReason}`
    );
  }

  return classification.databaseName;
}

// ============================================================================
// HTTP SERVER ISOLATION GUARD FOR INTEGRATION TESTS
// ============================================================================

const nativeFetch: typeof globalThis.fetch | undefined =
  typeof globalThis.fetch === "function"
    ? globalThis.fetch.bind(globalThis)
    : undefined;

const verifiedDisposableOrigins = new Map<
  string,
  { verifiedAt: number; databaseName: string }
>();
const ORIGIN_CACHE_TTL_MS = 5000;

/**
 * Queries the target HTTP server's `/api/health/ready` endpoint to establish
 * server-authoritative proof that the server is connected to an approved
 * disposable test database before any mutating HTTP test request is sent.
 */
export async function assertDisposableHttpServer(
  baseUrl: string
): Promise<{ databaseName: string; classification: string }> {
  if (!nativeFetch) {
    throw new Error(
      "SAFETY VIOLATION: global fetch is unavailable to verify HTTP server database target."
    );
  }

  let parsedOrigin: string;
  try {
    const u = new URL(baseUrl);
    parsedOrigin = u.origin;
  } catch {
    throw new Error(
      `SAFETY VIOLATION: Invalid HTTP base URL "${baseUrl}" for disposable server verification.`
    );
  }

  const cached = verifiedDisposableOrigins.get(parsedOrigin);
  if (cached && Date.now() - cached.verifiedAt < ORIGIN_CACHE_TTL_MS) {
    return {
      databaseName: cached.databaseName,
      classification: "DISPOSABLE_TEST",
    };
  }

  let readyRes: Response;
  try {
    readyRes = await nativeFetch(`${parsedOrigin}/api/health/ready`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (err: any) {
    throw new Error(
      `SAFETY VIOLATION: Unable to verify database target of HTTP server at "${parsedOrigin}/api/health/ready": ${err.message}`
    );
  }

  let payload: any;
  try {
    payload = await readyRes.json();
  } catch {
    throw new Error(
      `SAFETY VIOLATION: HTTP server at "${parsedOrigin}/api/health/ready" returned non-JSON response (status ${readyRes.status}). Cannot verify disposable database target.`
    );
  }

  const dbTarget = payload?.databaseTarget;
  if (!dbTarget || typeof dbTarget.databaseName !== "string") {
    throw new Error(
      `SAFETY VIOLATION: HTTP server at "${parsedOrigin}" did not report authoritative databaseTarget metadata in /api/health/ready. Refusing to send test HTTP requests.`
    );
  }

  const classification = classifyDatabaseTarget(dbTarget.databaseName);
  if (
    dbTarget.isDisposableTestDatabase !== true ||
    dbTarget.classification !== "DISPOSABLE_TEST" ||
    !classification.isApprovedDisposable
  ) {
    throw new Error(
      `SAFETY VIOLATION: HTTP server at "${parsedOrigin}" is connected to non-disposable database "${dbTarget.databaseName}" (classification: ${dbTarget.classification || classification.classification}). Test HTTP requests against production-connected servers are strictly prohibited.`
    );
  }

  verifiedDisposableOrigins.set(parsedOrigin, {
    verifiedAt: Date.now(),
    databaseName: classification.databaseName,
  });

  return {
    databaseName: classification.databaseName,
    classification: "DISPOSABLE_TEST",
  };
}

let httpGuardInstalled = false;

/**
 * Installs a process-wide fetch interceptor in test runtimes so that any HTTP
 * request targeting a local Mandate `/api/*` endpoint automatically verifies
 * that the target HTTP server is connected to an approved disposable database.
 */
export function installTestHttpIsolationGuard(): void {
  if (httpGuardInstalled || !isTestOrHarnessRuntime() || !nativeFetch) {
    return;
  }
  httpGuardInstalled = true;

  const currentFetch = globalThis.fetch;
  const guardedFetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    let urlStr = "";
    if (typeof input === "string") {
      urlStr = input;
    } else if (input instanceof URL) {
      urlStr = input.toString();
    } else if (input && typeof (input as any).url === "string") {
      urlStr = (input as any).url;
    }

    if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
      try {
        const parsed = new URL(urlStr);
        const host = parsed.hostname.toLowerCase();
        const isLocalServer = ALLOWED_LOCAL_HOSTS.has(host);
        const isApiRoute =
          parsed.pathname.startsWith("/api/") &&
          parsed.pathname !== "/api/health/ready" &&
          parsed.pathname !== "/api/health/live";

        if (isLocalServer && isApiRoute) {
          await assertDisposableHttpServer(parsed.origin);
        }
      } catch (err: any) {
        if (err.message?.includes("SAFETY VIOLATION")) {
          throw err;
        }
      }
    }

    return currentFetch(input, init);
  };

  globalThis.fetch = guardedFetch as typeof globalThis.fetch;
}

if (isTestOrHarnessRuntime()) {
  installTestHttpIsolationGuard();
}

