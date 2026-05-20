// @ts-ignore pg is installed at the workspace root without bundled types in this environment.
import pg from "pg";

import { config } from "../config.js";

const { Pool } = pg as any;

export const pool = new Pool({
  connectionString: config.DATABASE_URL
});

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  return pool.query(text, params) as Promise<{ rows: T[] }>;
}
