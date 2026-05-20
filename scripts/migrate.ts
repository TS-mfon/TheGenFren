import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://genfren:genfren@localhost:5432/genfren";
const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  const schemaPath = path.resolve(process.cwd(), "database/schema.sql");
  const sql = readFileSync(schemaPath, "utf8");
  await pool.query(sql);
  await pool.end();
  console.log("Schema applied");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
