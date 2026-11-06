/**
 * MANDATE — Milestone 13.7: Production PostgreSQL Prisma Client
 * Hardened in M14.7: Fail-closed initialization with ZERO fallback to production database.
 * 
 * Provides an authentic, typed PrismaClient connected to PostgreSQL 16+.
 */

import { PrismaClient as PrismaClientPg } from "../generated/client-pg";

const globalForPg = globalThis as unknown as {
  prismaPg: PrismaClientPg | undefined;
};

export function getPostgresUrl(): string {
  const url =
    process.env.DATABASE_URL?.startsWith("postgres")
      ? process.env.DATABASE_URL
      : process.env.POSTGRES_URL;

  if (!url) {
    throw new Error(
      "[postgresDb] Missing DATABASE_URL or POSTGRES_URL environment variable. Refusing to connect with implicit or default database."
    );
  }
  return url;
}

let _clientInstance: PrismaClientPg | undefined = globalForPg.prismaPg;

function getPrismaPgInstance(): PrismaClientPg {
  if (!_clientInstance) {
    const url = getPostgresUrl();
    _clientInstance = new PrismaClientPg({
      datasources: {
        db: {
          url,
        },
      },
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
    if (process.env.NODE_ENV !== "production") {
      globalForPg.prismaPg = _clientInstance;
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
