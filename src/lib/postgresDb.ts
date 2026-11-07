/**
 * MANDATE — Milestone 13.7 / M14.7-R1: Production PostgreSQL Prisma Client
 * Hardened in M14.7-R1: Central fail-closed database target protection at the
 * connection boundary with zero fallback to production database.
 *
 * Provides an authentic, typed PrismaClient connected to PostgreSQL 16+.
 */

import { PrismaClient as PrismaClientPg } from "../generated/client-pg";
import {
  assertNotProductionDatabase,
  isTestOrHarnessRuntime,
} from "./security/databaseTargetGuard";

const globalForPg = globalThis as unknown as {
  prismaPg: PrismaClientPg | undefined;
  prismaPgUrl: string | undefined;
};

export function getPostgresUrl(): string {
  const rawDbUrl = process.env.DATABASE_URL?.trim();
  const rawPgUrl = process.env.POSTGRES_URL?.trim();
  const rawDirectUrl = process.env.DIRECT_URL?.trim();

  if (!rawDbUrl && !rawPgUrl && !rawDirectUrl) {
    throw new Error(
      "[postgresDb] SAFETY VIOLATION: Missing DATABASE_URL or POSTGRES_URL environment variable. Refusing to connect with implicit or default database."
    );
  }

  // Enforce central fail-closed disposable database protection in all test/harness runtimes
  if (isTestOrHarnessRuntime()) {
    assertNotProductionDatabase(undefined, "postgresDb.getPostgresUrl");
  } else if (rawDbUrl && rawPgUrl && rawDbUrl !== rawPgUrl) {
    // Even in non-test runtime, reject conflicting DATABASE_URL and POSTGRES_URL if both are set
    throw new Error(
      "[postgresDb] SAFETY VIOLATION: Conflicting DATABASE_URL and POSTGRES_URL environment variables configured."
    );
  }

  const resolvedUrl = rawDbUrl || rawPgUrl || rawDirectUrl;
  if (!resolvedUrl || !/^postgres(ql)?:\/\//i.test(resolvedUrl)) {
    throw new Error(
      `[postgresDb] SAFETY VIOLATION: Invalid or non-PostgreSQL connection URL "${resolvedUrl}". Refusing to connect.`
    );
  }

  return resolvedUrl;
}

let _clientInstance: PrismaClientPg | undefined = globalForPg.prismaPg;
let _clientUrl: string | undefined = globalForPg.prismaPgUrl;

function getPrismaPgInstance(): PrismaClientPg {
  // Always validate the resolved URL on every boundary access before returning a client
  const url = getPostgresUrl();

  if (!_clientInstance || _clientUrl !== url) {
    _clientInstance = new PrismaClientPg({
      datasources: {
        db: {
          url,
        },
      },
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
    _clientUrl = url;
    if (process.env.NODE_ENV !== "production") {
      globalForPg.prismaPg = _clientInstance;
      globalForPg.prismaPgUrl = _clientUrl;
    }
  }
  return _clientInstance;
}

export const prismaPg: PrismaClientPg = new Proxy({} as PrismaClientPg, {
  get(_target, prop) {
    const client = getPrismaPgInstance();
    const val = (client as any)[prop];
    if (typeof val === "function") {
      return val.bind(client);
    }
    return val;
  },
});

export { PrismaClientPg };
