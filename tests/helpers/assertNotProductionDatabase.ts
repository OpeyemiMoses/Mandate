/**
 * MANDATE — Fail-Closed Test Database Safety Guard
 * 
 * Strictly prevents mutating test suites from connecting to or executing against
 * production databases (e.g. mandate_prod, mandate_production, prod).
 */

export function parseDatabaseName(connectionUrl?: string): string | null {
  if (!connectionUrl) return null;
  try {
    // Handle standard URL formats postgresql://...
    if (connectionUrl.startsWith("postgres://") || connectionUrl.startsWith("postgresql://")) {
      const url = new URL(connectionUrl);
      const pathname = url.pathname.replace(/^\//, "");
      return pathname.split("?")[0] || null;
    }
    // Handle raw db name string
    return connectionUrl.split("?")[0].trim() || null;
  } catch {
    // Fallback regex matching
    const match = connectionUrl.match(/\/([^/?#]+)(\?.*)?$/);
    return match ? match[1].trim() : null;
  }
}

export function isProductionDatabaseName(dbName: string): boolean {
  const normalized = dbName.trim().toLowerCase();
  const prohibitedExact = [
    "mandate_prod",
    "mandate-prod",
    "mandate_production",
    "mandate-production",
    "prod",
    "production",
  ];
  if (prohibitedExact.includes(normalized)) return true;
  if (
    normalized.endsWith("_prod") ||
    normalized.endsWith("-prod") ||
    normalized.endsWith("_production") ||
    normalized.endsWith("-production")
  ) {
    return true;
  }
  return false;
}

export function isAllowedTestDatabaseName(dbName: string): boolean {
  const normalized = dbName.trim().toLowerCase();
  if (isProductionDatabaseName(normalized)) return false;
  // Must contain test, disposable, tmp, scratch, or fixture
  return (
    normalized.includes("test") ||
    normalized.includes("disposable") ||
    normalized.includes("tmp") ||
    normalized.includes("fixture") ||
    normalized.includes("scratch")
  );
}

export function assertNotProductionDatabase(connectionUrl?: string): string {
  const url = connectionUrl || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "[assertNotProductionDatabase] SAFETY VIOLATION: No database connection URL provided. Mutating tests cannot run without an explicit test database."
    );
  }

  const dbName = parseDatabaseName(url);
  if (!dbName) {
    throw new Error(
      `[assertNotProductionDatabase] SAFETY VIOLATION: Could not parse database name from connection URL "${url}". Execution aborted.`
    );
  }

  if (isProductionDatabaseName(dbName)) {
    throw new Error(
      `[assertNotProductionDatabase] SAFETY VIOLATION: Mutating test harness attempted to run against production database "${dbName}". Tests must run against a disposable/test database.`
    );
  }

  if (!isAllowedTestDatabaseName(dbName)) {
    throw new Error(
      `[assertNotProductionDatabase] SAFETY VIOLATION: Database "${dbName}" is not recognized as an allowed test or disposable database. Target database name must contain 'test', 'disposable', 'tmp', or 'fixture'.`
    );
  }

  return dbName;
}
