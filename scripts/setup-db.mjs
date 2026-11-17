import pg from "pg";
import bcrypt from "bcryptjs";
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
      const demoPassword = process.env.DEMO_PASSWORD ?? "QawaedDemo!2026";
      if (
        demoPassword.length < 12 ||
        Buffer.byteLength(demoPassword, "utf8") > 72
      )
        throw Error(
          "Demo password must be 12+ characters and at most 72 UTF-8 bytes",
        );
      const hash = await bcrypt.hash(demoPassword, 12);
      for (const [email, name, role, tenantId] of [
        [
          "submitter@aram.test",
          "Aram Submitter",
          "SUBMITTER",
          "00000000-0000-4000-8000-000000000001",
        ],
        [
          "auditor@aram.test",
          "Aram Auditor",
          "AUDITOR",
          "00000000-0000-4000-8000-000000000001",
        ],
        [
          "submitter@riyadh.test",
          "Riyadh Submitter",
          "SUBMITTER",
          "00000000-0000-4000-8000-000000000002",
        ],
        [
          "auditor@riyadh.test",
          "Riyadh Auditor",
          "AUDITOR",
          "00000000-0000-4000-8000-000000000002",
        ],
        ["admin@qawaed.test", "System Admin", "ADMIN", null],
      ]) {
        await client.query(
          "INSERT INTO users(email,name,role,tenant_id,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT (email) DO NOTHING",
          [email, name, role, tenantId, hash],
        );
      }
      //fixed IDs make demo filings repeatable without resetting user edits
      //demo filings start at different workflow stages for exploration
      //their initial audit entry is a seed snapshot, not a simulated review history
      for (const [tenantId, email, cr, tenantNumber] of [
        [
          "00000000-0000-4000-8000-000000000001",
          "submitter@aram.test",
          "1010123456",
          1,
        ],
        [
          "00000000-0000-4000-8000-000000000002",
          "submitter@riyadh.test",
          "1010654321",
          2,
        ],
      ]) {
        const owner = (
          await client.query(
            "SELECT id FROM users WHERE email=$1 AND tenant_id=$2 AND role='SUBMITTER'",
            [email, tenantId],
          )
        ).rows[0];
        if (!owner) continue;
        const states = [
          "DRAFT",
          "SUBMITTED",
          "UNDER_REVIEW",
          "APPROVED",
          "REJECTED",
        ];
        for (const [index, status] of states.entries()) {
          const id = `f0000000-0000-4000-8000-${String(Number(tenantNumber) * 100 + index).padStart(12, "0")}`;
          await client.query(
            "INSERT INTO compliance_filings(id,tenant_id,created_by,title,identifier_cr,category,expiration_date,status,rejection_reason) VALUES($1,$2,$3,$4,$5,'COMMERCIAL','2099-12-31',$6,$7) ON CONFLICT(id) DO NOTHING",
            [
              id,
              tenantId,
              owner.id,
              `Demo commercial license — ${status}`,
              cr,
              status,
              status === "REJECTED"
                ? "Demo: supporting evidence is incomplete"
                : null,
            ],
          );
        }
      }
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
