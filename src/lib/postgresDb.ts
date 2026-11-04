/**
 * MANDATE — Milestone 13.7: Production PostgreSQL Prisma Client
 * 
 * Provides an authentic, typed PrismaClient connected to PostgreSQL 16+.
 */

import { PrismaClient as PrismaClientPg } from "../generated/client-pg";

const globalForPg = globalThis as unknown as {
  prismaPg: PrismaClientPg | undefined;
};

const POSTGRES_URL =
  process.env.DATABASE_URL?.startsWith("postgres")
    ? process.env.DATABASE_URL
    : process.env.POSTGRES_URL ||
      "postgresql://postgres:postgrespassword@localhost:5432/mandate_prod?schema=public";

export const prismaPg =
  globalForPg.prismaPg ??
  new PrismaClientPg({
    datasources: {
      db: {
        url: POSTGRES_URL,
      },
    },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPg.prismaPg = prismaPg;
export { PrismaClientPg };

