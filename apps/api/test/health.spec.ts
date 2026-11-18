import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "../src/health/health.controller";
import { createApp } from "../src/app";
import { Database } from "../src/database/database";
import request from "supertest";
import pg from "pg";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

describe("readiness unit behavior", () => {
  it("reports a successful database probe", async () => {
    const ready = jest.fn().mockResolvedValue(undefined);
    const controller = new HealthController({ ready } as unknown as Database);
    await expect(controller.health()).resolves.toEqual({
      status: "ok",
      database: "up",
    });
    expect(ready).toHaveBeenCalledTimes(1);
  });
  it("converts database failures to 503 without exposing credentials", async () => {
    const controller = new HealthController({
      ready: async () => {
        throw Error("private database credentials");
      },
    } as unknown as Database);
    await expect(controller.health()).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(controller.health()).rejects.toThrow("Database unavailable");
  });
});

describe("foundation integration — disposable PostgreSQL only", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let admin: pg.Pool;
  beforeAll(async () => {
    if (!process.env.MIGRATION_DATABASE_URL || !process.env.DATABASE_URL)
      throw Error("Dedicated test database URLs required");
    admin = new pg.Pool({
      connectionString: process.env.MIGRATION_DATABASE_URL,
    });
    execFileSync(process.execPath, ["scripts/setup-db.mjs"], {
      cwd: resolve(__dirname, "../../.."),
      env: process.env,
    });
    app = await createApp();
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
    if (admin) await admin.end();
  });
  it("serves readiness through HTTP using the restricted runtime role", async () => {
    const result = await request(app.getHttpServer())
      .get("/health")
      .expect(200);
    expect(result.body).toEqual({ status: "ok", database: "up" });
    const db = app.get(Database);
    const { rows } = await db.pool.query(
      "SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user",
    );
    expect(rows[0]).toEqual({
      current_user: "qawaed_app",
      rolsuper: false,
      rolbypassrls: false,
    });
  });
  it("repeated setup preserves existing tenant edits and migration timestamps", async () => {
    const before = (
      await admin.query("SELECT * FROM schema_migrations ORDER BY name")
    ).rows;
    const id = "00000000-0000-4000-8000-000000000001";
    const original = (
      await admin.query("SELECT name FROM tenants WHERE id=$1", [id])
    ).rows[0].name;
    try {
      await admin.query(
        "UPDATE tenants SET name='Preserved test edit' WHERE id=$1",
        [id],
      );
      execFileSync(process.execPath, ["scripts/setup-db.mjs"], {
        cwd: resolve(__dirname, "../../.."),
        env: process.env,
      });
      expect(
        (await admin.query("SELECT name FROM tenants WHERE id=$1", [id]))
          .rows[0].name,
      ).toBe("Preserved test edit");
      expect(
        (await admin.query("SELECT * FROM schema_migrations ORDER BY name"))
          .rows,
      ).toEqual(before);
      expect(
        (await admin.query("SELECT count(*)::int AS count FROM tenants"))
          .rows[0].count,
      ).toBe(2);
    } finally {
      await admin.query("UPDATE tenants SET name=$2 WHERE id=$1", [
        id,
        original,
      ]);
    }
  });
  it("protects filing endpoints before authentication", async () => {
    await request(app.getHttpServer()).get("/filings").expect(401);
  });
});
