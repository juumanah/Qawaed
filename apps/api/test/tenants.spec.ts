import { createApp } from "../src/app";
import { Database } from "../src/database/database";
import { Actor } from "../src/auth/identity";
import request from "supertest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
describe("tenant isolation and roles — real PostgreSQL and HTTP", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let db: Database;
  const cookies: Record<string, string> = {};
  const actors: Record<string, Actor> = {};
  beforeAll(async () => {
    if (!process.env.MIGRATION_DATABASE_URL || !process.env.DATABASE_URL)
      throw Error("Disposable database URLs required");
    execFileSync(process.execPath, ["scripts/setup-db.mjs"], {
      cwd: resolve(__dirname, "../../.."),
      env: process.env,
    });
    app = await createApp();
    await app.init();
    db = app.get(Database);
    for (const email of [
      "submitter@aram.test",
      "auditor@aram.test",
      "submitter@riyadh.test",
      "auditor@riyadh.test",
      "admin@qawaed.test",
    ]) {
      const result = await request(app.getHttpServer())
        .post("/auth/login")
        .set("Origin", origin)
        .send({
          email,
          password: process.env.DEMO_PASSWORD ?? "QawaedDemo!2026",
        })
        .expect(200);
      cookies[email] = (
        result.headers["set-cookie"] as unknown as string[]
      )[0].split(";")[0];
      actors[email] = result.body;
    }
  });
  afterAll(async () => {
    await app?.close();
  });
  const get = (path: string, email: string) =>
    request(app.getHttpServer()).get(path).set("Cookie", cookies[email]);
  it("requires authentication on tenant endpoints", async () => {
    await request(app.getHttpServer()).get("/tenants").expect(401);
    await request(app.getHttpServer()).get(`/tenants/${a}`).expect(401);
  });
  it.each([
    "submitter@aram.test",
    "auditor@aram.test",
    "submitter@riyadh.test",
    "auditor@riyadh.test",
  ])("%s can read only its own tenant", async (email) => {
    const own = email.includes("aram") ? a : b;
    const other = own === a ? b : a;
    const response = await get(`/tenants/${own}`, email).expect(200);
    expect(response.body.id).toBe(own);
    await get(`/tenants/${other}`, email).expect(404);
    await get("/tenants", email).expect(403);
  });
  it("ignores forged tenant headers and query parameters", async () => {
    await get(`/tenants/${b}?tenant_id=${b}&role=ADMIN`, "submitter@aram.test")
      .set("X-Tenant-Id", b)
      .set("X-Role", "ADMIN")
      .expect(404);
    await get("/tenants/not-a-uuid", "submitter@aram.test").expect(400);
  });
  it("allows ADMIN global read visibility but grants no tenant writes", async () => {
    const result = await get("/tenants", "admin@qawaed.test").expect(200);
    expect(result.body.map((x: { id: string }) => x.id).sort()).toEqual([a, b]);
    await get(`/tenants/${b}`, "admin@qawaed.test").expect(200);
    await expect(
      db.scoped(actors["admin@qawaed.test"], (c) =>
        c.query("UPDATE tenants SET name='forbidden' WHERE id=$1", [a]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("RLS filters even a query without WHERE; absent context fails closed", async () => {
    const unscoped = await db.pool.query("SELECT id FROM tenants");
    expect(unscoped.rows).toEqual([]);
    const scoped = await db.scoped(actors["submitter@aram.test"], (c) =>
      c.query("SELECT id FROM tenants"),
    );
    expect(scoped.rows).toEqual([{ id: a }]);
  });
  it("context is cleared on the same pooled connection after success and rollback", async () => {
    // A dedicated size-one pool forces reuse, so this cannot pass accidentally
    // because a fresh connection happened to be chosen.
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
    });
    const scopedDb = Object.create(Database.prototype) as Database;
    Object.defineProperty(scopedDb, "pool", { value: pool });
    try {
      await scopedDb.scoped(actors["admin@qawaed.test"], (c) =>
        c.query("SELECT id FROM tenants"),
      );
      expect((await pool.query("SELECT id FROM tenants")).rows).toEqual([]);
      await expect(
        scopedDb.scoped(actors["admin@qawaed.test"], async () => {
          throw Error("rollback probe");
        }),
      ).rejects.toThrow("rollback probe");
      expect((await pool.query("SELECT id FROM tenants")).rows).toEqual([]);
      expect(
        (
          await scopedDb.scoped(actors["submitter@riyadh.test"], (c) =>
            c.query("SELECT id FROM tenants"),
          )
        ).rows,
      ).toEqual([{ id: b }]);
    } finally {
      await pool.end();
    }
  });
  it("parallel requests preserve the tenant boundary", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const email = i % 2 ? "submitter@aram.test" : "submitter@riyadh.test";
        return get(`/tenants/${i % 2 ? a : b}`, email).expect(200);
      }),
    );
    results.forEach((result, i) => expect(result.body.id).toBe(i % 2 ? a : b));
  });
});
