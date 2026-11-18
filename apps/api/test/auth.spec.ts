import { createApp } from "../src/app";
import { AuthService, tokenDigest } from "../src/auth/auth.service";
import { Database } from "../src/database/database";
import request from "supertest";
import pg from "pg";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const password = process.env.DEMO_PASSWORD ?? "QawaedDemo!2026";
export function cookieFrom(response: request.Response): string {
  const headers = response.headers["set-cookie"] as unknown as string[];
  return headers[0].split(";")[0];
}
describe("identity — real PostgreSQL and HTTP", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let admin: pg.Pool;
  beforeAll(async () => {
    if (!process.env.MIGRATION_DATABASE_URL || !process.env.DATABASE_URL)
      throw Error("Disposable database URLs required");
    execFileSync(process.execPath, ["scripts/setup-db.mjs"], {
      cwd: resolve(__dirname, "../../.."),
      env: process.env,
    });
    admin = new pg.Pool({
      connectionString: process.env.MIGRATION_DATABASE_URL,
    });
    app = await createApp();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await admin?.end();
  });
  const login = (email = "submitter@aram.test", secret = password) =>
    request(app.getHttpServer())
      .post("/auth/login")
      .set("Origin", origin)
      .send({ email, password: secret });
  it("authenticates, uses a protected cookie and stores only a digest", async () => {
    const result = await login("SUBMITTER@ARAM.TEST").expect(200);
    expect(result.body).toMatchObject({
      email: "submitter@aram.test",
      role: "SUBMITTER",
    });
    expect(result.body).not.toHaveProperty("password_hash");
    expect(result.body).not.toHaveProperty("token");
    const raw = result.headers["set-cookie"] as unknown as string[];
    expect(raw[0]).toContain("HttpOnly");
    expect(raw[0]).toContain("SameSite=Strict");
    const cookie = cookieFrom(result);
    const token = cookie.split("=")[1];
    const { rows } = await admin.query(
      "SELECT token_hash FROM sessions WHERE token_hash=$1",
      [tokenDigest(token)],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", cookie)
      .expect(200);
    expect(me.body).toEqual(result.body);
  });
  it("uses the same failure message for unknown users and wrong passwords", async () => {
    const a = await login("missing@example.test").expect(401);
    const b = await login("submitter@aram.test", "wrong-password").expect(401);
    expect(a.body.message).toBe(b.body.message);
  });
  it("rejects unknown fields, malformed credentials and bcrypt truncation", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .set("Origin", origin)
      .send({ email: "submitter@aram.test", password, role: "ADMIN" })
      .expect(400);
    await login("invalid-email").expect(400);
    await login("submitter@aram.test", "ع".repeat(40)).expect(400);
  });
  it("requires a trusted Origin for login and logout", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "submitter@aram.test", password })
      .expect(403);
    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Origin", "https://evil.example")
      .expect(403);
  });
  it("rejects absent, forged, malformed and expired sessions", async () => {
    for (const cookie of [
      "",
      "qawaed_session=" + "a".repeat(64),
      "qawaed_session=bad",
    ]) {
      await request(app.getHttpServer())
        .get("/auth/me")
        .set("Cookie", cookie)
        .expect(401);
    }
    const cookie = cookieFrom(await login().expect(200));
    await admin.query(
      "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [tokenDigest(cookie.split("=")[1])],
    );
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", cookie)
      .expect(401);
  });
  it("logout revokes the session even when the old cookie is replayed", async () => {
    const cookie = cookieFrom(await login().expect(200));
    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", cookie)
      .expect(401);
    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Origin", origin)
      .expect(200);
  });
  it("repeated seed preserves existing password hashes and user roles", async () => {
    const before = (
      await admin.query(
        "SELECT id,email,password_hash,role FROM users ORDER BY email",
      )
    ).rows;
    execFileSync(process.execPath, ["scripts/setup-db.mjs"], {
      cwd: resolve(__dirname, "../../.."),
      env: process.env,
    });
    expect(
      (
        await admin.query(
          "SELECT id,email,password_hash,role FROM users ORDER BY email",
        )
      ).rows,
    ).toEqual(before);
    expect(before.map((user: { email: string }) => user.email)).toEqual(
      expect.arrayContaining([
        "submitter@aram.test",
        "auditor@aram.test",
        "submitter@riyadh.test",
        "auditor@riyadh.test",
        "admin@qawaed.test",
      ]),
    );
  });
});
describe("authentication unit behavior", () => {
  it("rejects malformed tokens before querying the database", async () => {
    const query = jest.fn();
    const service = new AuthService({ pool: { query } } as unknown as Database);
    await expect(service.authenticate("invalid")).rejects.toThrow(
      "Sign in required",
    );
    expect(query).not.toHaveBeenCalled();
  });
});
