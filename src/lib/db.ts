import { PrismaClient } from "@prisma/client";
import { prismaPg } from "./postgresDb";

const globalForPrisma = globalThis as unknown as {
  sqlitePrisma: PrismaClient | undefined;
};

function getClient(): PrismaClient {
  const isPostgres =
    process.env.DATABASE_URL?.startsWith("postgres") ||
    process.env.DATABASE_URL?.startsWith("postgresql") ||
    process.env.MANDATE_DATABASE_TYPE === "postgres";

  if (isPostgres) {
    return prismaPg as unknown as PrismaClient;
  }

  if (!globalForPrisma.sqlitePrisma) {
    globalForPrisma.sqlitePrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return globalForPrisma.sqlitePrisma;
}

export const prisma: PrismaClient = new Proxy(
  {} as PrismaClient,
  {
    get(_target, prop) {
      const client = getClient();
      const val = (client as any)[prop];
      if (typeof val === "function") {
        return val.bind(client);
      }
      return val;
    },
  }
);
