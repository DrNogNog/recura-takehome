import pg from "pg";
import { config } from "../config.js";

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is not set");
  pool ??= new pg.Pool({ connectionString: config.databaseUrl });
  return pool;
}

export async function closePool() {
  await pool?.end();
}
