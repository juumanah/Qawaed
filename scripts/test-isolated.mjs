import pg from "pg";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

// Create a fresh database; never truncate the developer's demo database.
const source = process.env.MIGRATION_DATABASE_URL;
if (!source || !process.env.DATABASE_URL || !process.env.WORKER_DATABASE_URL)
  throw Error(
    "Run this command inside the API container with its database URLs",
  );
const name = `qawaed_test_${randomUUID().replaceAll("-", "")}`;
const root = new URL(source);
root.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: root.href });
const forTest = (value) => {
  const url = new URL(value);
  url.pathname = `/${name}`;
  return url.href;
};
let created = false;
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  const env = {
    ...process.env,
    MIGRATION_DATABASE_URL: forTest(source),
    DATABASE_URL: forTest(process.env.DATABASE_URL),
    WORKER_DATABASE_URL: forTest(process.env.WORKER_DATABASE_URL),
    WORKER_ENABLED: "false",
    SEED_DEMO: "true",
  };
  const code = await new Promise((resolve, reject) => {
    const child = spawn("npm", ["test"], {
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = code;
} finally {
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
