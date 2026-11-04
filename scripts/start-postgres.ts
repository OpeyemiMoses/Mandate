/**
 * MANDATE — Milestone 13.7: Production PostgreSQL Cluster Manager
 * 
 * Spawns, initializes, and manages an authentic PostgreSQL cluster on localhost:5432.
 * Uses native PostgreSQL binaries with disk persistence in `./data/postgres`.
 */

import path from "path";
import fs from "fs";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";

const PG_DATA_DIR = path.resolve(process.cwd(), "data/postgres");
const PG_PORT = parseInt(process.env.PG_PORT || "5432", 10);
const PG_USER = process.env.PG_USER || "postgres";
const PG_PASSWORD = process.env.PG_PASSWORD || "postgrespassword";
const PG_DATABASE = process.env.PG_DATABASE || "mandate_prod";

export class PostgresClusterManager {
  private static instance: EmbeddedPostgres | null = null;

  public static async start(): Promise<{ port: number; databaseUrl: string }> {
    if (this.instance) {
      return {
        port: PG_PORT,
        databaseUrl: `postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DATABASE}?schema=public`,
      };
    }

    if (!fs.existsSync(PG_DATA_DIR)) {
      fs.mkdirSync(PG_DATA_DIR, { recursive: true });
    }

    console.log(`[PG_CLUSTER] Initializing PostgreSQL cluster at ${PG_DATA_DIR}...`);
    const pg = new EmbeddedPostgres({
      databaseDir: PG_DATA_DIR,
      port: PG_PORT,
      user: PG_USER,
      password: PG_PASSWORD,
      persistent: true,
      autoRehydrateSymlinks: true,
    });

    try {
      await pg.initialise();
      console.log(`[PG_CLUSTER] PostgreSQL cluster initialized.`);
    } catch {
      // Cluster may already be initialized, continue
      console.log(`[PG_CLUSTER] Cluster already initialized or existing data detected.`);
    }

    console.log(`[PG_CLUSTER] Starting PostgreSQL server on port ${PG_PORT}...`);
    await pg.start();
    this.instance = pg;
    console.log(`[PG_CLUSTER] PostgreSQL server running on 127.0.0.1:${PG_PORT}.`);

    // Ensure database exists
    const defaultClient = new Client({
      host: "localhost",
      port: PG_PORT,
      user: PG_USER,
      password: PG_PASSWORD,
      database: "postgres",
    });

    await defaultClient.connect();
    const checkDb = await defaultClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [PG_DATABASE]
    );

    if (checkDb.rowCount === 0) {
      console.log(`[PG_CLUSTER] Creating database "${PG_DATABASE}"...`);
      await defaultClient.query(`CREATE DATABASE "${PG_DATABASE}"`);
      console.log(`[PG_CLUSTER] Database "${PG_DATABASE}" created.`);
    }
    await defaultClient.end();

    const databaseUrl = `postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DATABASE}?schema=public`;
    console.log(`[PG_CLUSTER] Connection string: ${databaseUrl}`);

    return { port: PG_PORT, databaseUrl };
  }

  public static async stop(): Promise<void> {
    if (this.instance) {
      console.log(`[PG_CLUSTER] Stopping PostgreSQL cluster...`);
      await this.instance.stop();
      this.instance = null;
      console.log(`[PG_CLUSTER] PostgreSQL cluster stopped.`);
    }
  }
}

// Allow direct CLI execution
if (require.main === module || process.argv[1]?.endsWith("start-postgres.ts")) {
  PostgresClusterManager.start()
    .then(({ databaseUrl }) => {
      console.log(`[PG_CLUSTER_READY] PostgreSQL listening at ${databaseUrl}`);
    })
    .catch((err) => {
      console.error(`[PG_CLUSTER_ERROR] ${err.message}`);
      process.exit(1);
    });
}

