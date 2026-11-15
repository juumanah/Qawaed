import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
const url = process.env.MIGRATION_DATABASE_URL;
const password = process.env.APP_DB_PASSWORD;
if (!url) throw new Error("MIGRATION_DATABASE_URL required");
if (!password || password.length < 16)
  throw new Error("APP_DB_PASSWORD must be at least 16 characters");
const pool = new pg.Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(974321)");
  if (
    !(await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'qawaed_app'"))
      .rowCount
  )
    await client.query(
      "CREATE ROLE qawaed_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE",
    );
  await client.query(
    `ALTER ROLE qawaed_app PASSWORD '${password.replaceAll("'", "''")}'`,
  );
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const dir = new URL("../db/migrations/", import.meta.url);
  for (const name of (await readdir(dir))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (
      (
        await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
          name,
        ])
      ).rowCount
    )
      continue;
    await client.query("BEGIN");
    try {
      await client.query(await readFile(new URL(name, dir), "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
        name,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  if (process.env.SEED_DEMO === "true") {
    await client.query("BEGIN");
    try {
      for (const [id, name, cr] of [
        ["00000000-0000-4000-8000-000000000001", "Aram Organics", "1010123456"],
        [
          "00000000-0000-4000-8000-000000000002",
          "Riyadh Logistics Group",
          "1010654321",
        ],
      ])
        await client.query(
          "INSERT INTO tenants(id,name,identifier_cr) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [id, name, cr],
        );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log("Foundation migrations and requested seed completed.");
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(974321)");
  } finally {
    client.release();
    await pool.end();
  }
}
