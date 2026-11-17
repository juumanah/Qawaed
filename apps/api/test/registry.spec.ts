import { createApp } from "../src/app";
import { RegistryController, RegistryWorker } from "../src/registry";
import { RegistryDatabase } from "../src/registry.database";
import { Database } from "../src/database";
import { Actor } from "../src/identity";
import pg from "pg";
import request from "supertest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
describe("durable registry verification", () => {
  let app: Awaited<ReturnType<typeof createApp>>, owner: pg.Pool;
  let worker: RegistryWorker, db: RegistryDatabase, runtime: Database;
  let actor: Actor;
  let filing: string;
  let previousUrl: string | undefined;
  const body = () => ({ filingId: filing, identifierCr: "1010123456" });
  const verify = (attempt = 1, secret = process.env.REGISTRY_SECRET!) =>
    request(app.getHttpServer())
      .post("/mock-registry/verify")
      .set("Origin", origin)
      .set("X-Registry-Secret", secret)
      .set("Idempotency-Key", `filing-${filing}-${attempt}`)
      .send(body());
  const job = async () =>
    (
      await owner.query("SELECT * FROM verification_jobs WHERE filing_id=$1", [
        filing,
      ])
    ).rows[0];
  const due = () =>
    owner.query(
      "UPDATE verification_jobs SET available_at=now()-interval '1 second' WHERE filing_id=$1",
      [filing],
    );
  beforeAll(async () => {
    if (process.env.WORKER_ENABLED === "true")
      throw Error("Disable automatic worker in tests");
    execFileSync(process.execPath, ["scripts/setup-db.mjs"], {
      cwd: resolve(__dirname, "../../.."),
      env: process.env,
    });
    owner = new pg.Pool({
      connectionString: process.env.MIGRATION_DATABASE_URL,
    });
    actor = (
      await owner.query(
        "SELECT id,tenant_id,name,role FROM users WHERE email='submitter@aram.test'",
      )
    ).rows[0];
    app = await createApp();
    await app.listen(0, "127.0.0.1");
    previousUrl = process.env.REGISTRY_URL;
    process.env.REGISTRY_URL = `${await app.getUrl()}/mock-registry/verify`;
    worker = app.get(RegistryWorker);
    db = app.get(RegistryDatabase);
    runtime = app.get(Database);
  });
  beforeEach(async () => {
    // Only this test's job is eligible. Other suites' filings remain untouched.
    await owner.query(
      "UPDATE verification_jobs SET available_at=now()+interval '1 day' WHERE status='PENDING'",
    );
    filing = randomUUID();
    await owner.query(
      "INSERT INTO compliance_filings(id,tenant_id,created_by,title,identifier_cr,category,expiration_date,status) VALUES($1,$2,$3,'Registry test','1010123456','COMMERCIAL','2099-12-31','APPROVED')",
      [filing, actor.tenant_id, actor.id],
    );
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (previousUrl === undefined) delete process.env.REGISTRY_URL;
    else process.env.REGISTRY_URL = previousUrl;
    await app?.close();
    await owner?.end();
  });
  it("enqueues approval exactly once and repeated setup preserves jobs", async () => {
    const before = await job();
    execFileSync(process.execPath, ["scripts/setup-db.mjs"], {
      cwd: resolve(__dirname, "../../.."),
      env: process.env,
    });
    expect(await job()).toEqual(before);
    expect(before).toMatchObject({ status: "PENDING", attempt: 0 });
  });
  it("rolls back approval, audit and queue together", async () => {
    const client = await owner.connect();
    const id = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO compliance_filings(id,tenant_id,created_by,title,identifier_cr,category,expiration_date,status) VALUES($1,$2,$3,'Rollback test','1010123456','COMMERCIAL','2099-12-31','UNDER_REVIEW')",
        [id, actor.tenant_id, actor.id],
      );
      await client.query(
        "UPDATE compliance_filings SET status='APPROVED',version=version+1 WHERE id=$1",
        [id],
      );
      expect(
        (
          await client.query(
            "SELECT * FROM verification_jobs WHERE filing_id=$1",
            [id],
          )
        ).rowCount,
      ).toBe(1);
      await client.query("ROLLBACK");
      for (const table of ["verification_jobs", "audit_logs"])
        expect(
          (await owner.query(`SELECT * FROM ${table} WHERE filing_id=$1`, [id]))
            .rowCount,
        ).toBe(0);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
  it("does not enqueue rejected or draft filings", async () => {
    const rows = await owner.query(
      "SELECT j.id FROM verification_jobs j JOIN compliance_filings f ON f.id=j.filing_id WHERE f.status<>'APPROVED'",
    );
    expect(rows.rowCount).toBe(0);
  });
  it("requires the service secret even when the endpoint bypasses session auth", async () => {
    await verify(1, "wrong-secret").expect(401);
    expect(
      (
        await owner.query("SELECT * FROM registry_records WHERE filing_id=$1", [
          filing,
        ])
      ).rowCount,
    ).toBe(0);
  });
  it.each([0, 5])("rejects invalid attempt %s", async (attempt) => {
    await verify(attempt).expect(400);
  });
  it("rejects a filing without an approved job", async () => {
    filing = randomUUID();
    await verify().expect(400);
  });
  it("simulates 503 below the 30 percent threshold without a record", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.29);
    await verify().expect(503);
    expect(
      (
        await owner.query("SELECT * FROM registry_records WHERE filing_id=$1", [
          filing,
        ])
      ).rowCount,
    ).toBe(0);
  });
  it("deduplicates parallel deliveries and later attempt keys durably", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.3);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => verify((i % 4) + 1).expect(201)),
    );
    expect(new Set(results.map((r) => r.body.referenceId)).size).toBe(1);
    expect(
      (
        await owner.query("SELECT * FROM registry_records WHERE filing_id=$1", [
          filing,
        ])
      ).rowCount,
    ).toBe(1);
    jest.spyOn(Math, "random").mockReturnValue(0);
    const restarted = new RegistryController(db);
    expect(
      await restarted.verify(
        body(),
        `filing-${filing}-4`,
        process.env.REGISTRY_SECRET!,
      ),
    ).toEqual(
      expect.objectContaining({ referenceId: results[0].body.referenceId }),
    );
  });
  it("rejects a changed payload for the same filing", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.9);
    await verify().expect(201);
    await expect(
      new RegistryController(db).verify(
        { ...body(), identifierCr: "1010654321" },
        `filing-${filing}-2`,
        process.env.REGISTRY_SECRET!,
      ),
    ).rejects.toThrow("No matching approved filing");
  });
  it("verifies asynchronously without changing terminal data or audit", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.9);
    const before = await owner.query(
      "SELECT * FROM compliance_filings WHERE id=$1",
      [filing],
    );
    const audit = await owner.query(
      "SELECT * FROM audit_logs WHERE filing_id=$1",
      [filing],
    );
    await worker.tick();
    expect(await job()).toMatchObject({
      status: "VERIFIED",
      attempt: 1,
      lease_token: null,
    });
    expect(
      (
        await owner.query("SELECT * FROM compliance_filings WHERE id=$1", [
          filing,
        ])
      ).rows,
    ).toEqual(before.rows);
    expect(
      (
        await owner.query("SELECT * FROM audit_logs WHERE filing_id=$1", [
          filing,
        ])
      ).rows,
    ).toEqual(audit.rows);
  });
  it("waits 1, 2 and 4 seconds and stops after four failed attempts", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await due();
      const start = Date.now();
      await worker.tick();
      const j = await job();
      expect(j.attempt).toBe(attempt);
      expect(j.status).toBe(attempt === 4 ? "FAILED" : "PENDING");
      expect(j.last_error).toBe("Registry HTTP 503");
      if (attempt < 4) {
        expect(j.available_at.getTime() - start).toBeGreaterThanOrEqual(
          2 ** (attempt - 1) * 1000 - 100,
        );
        expect(j.available_at.getTime() - start).toBeLessThan(
          2 ** (attempt - 1) * 1000 + 2000,
        );
        await worker.tick();
        expect((await job()).attempt).toBe(attempt);
      }
    }
    await worker.tick();
    expect((await job()).attempt).toBe(4);
  });
  it("succeeds on a later attempt and clears the last error", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    await worker.tick();
    await due();
    jest.spyOn(Math, "random").mockReturnValue(0.9);
    await worker.tick();
    expect(await job()).toMatchObject({
      status: "VERIFIED",
      attempt: 2,
      last_error: null,
    });
  });
  it("allows only one of competing workers to claim an available job", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.9);
    await Promise.all(
      Array.from({ length: 8 }, () => new RegistryWorker(db).tick()),
    );
    expect(await job()).toMatchObject({ status: "VERIFIED", attempt: 1 });
  });
  it("reconciles a crashed fourth delivery using the same key and existing record", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.9);
    const result = await verify(4).expect(201);
    await owner.query(
      "UPDATE verification_jobs SET status='PROCESSING',attempt=4,lease_token=$2,lease_until=now()-interval '1 second' WHERE filing_id=$1",
      [filing, randomUUID()],
    );
    jest.spyOn(Math, "random").mockReturnValue(0);
    await new RegistryWorker(db).tick();
    expect(await job()).toMatchObject({
      status: "VERIFIED",
      attempt: 4,
      reference_id: result.body.referenceId,
    });
  });
  it("does not let an expired worker overwrite a newer lease", async () => {
    jest.spyOn(globalThis, "fetch").mockImplementationOnce(async () => {
      await owner.query(
        "UPDATE verification_jobs SET lease_token=$2 WHERE filing_id=$1",
        [filing, randomUUID()],
      );
      return new Response(
        JSON.stringify({
          status: "VERIFIED",
          referenceId: `REG-${randomUUID()}`,
          verifiedAt: new Date().toISOString(),
        }),
      );
    });
    await worker.tick();
    expect((await job()).status).toBe("PROCESSING");
    await owner.query(
      "UPDATE verification_jobs SET status='FAILED',lease_token=NULL,lease_until=NULL WHERE filing_id=$1",
      [filing],
    );
  });
  it.each(["network", "invalid response"])(
    "retries %s failures without leaking their details",
    async (kind) => {
      jest.spyOn(globalThis, "fetch").mockImplementationOnce(async () => {
        if (kind === "network")
          throw Error("private credentials or service details");
        return new Response(
          JSON.stringify({
            status: "VERIFIED",
            referenceId: `REG-${randomUUID()}`,
            verifiedAt: "not a date",
          }),
        );
      });
      await worker.tick();
      expect(await job()).toMatchObject({
        status: "PENDING",
        last_error: "Registry unavailable or invalid response",
      });
    },
  );
  it("restricts worker privileges and denies runtime queue mutations", async () => {
    expect(
      (
        await db.pool.query(
          "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
        )
      ).rows[0],
    ).toEqual({ rolsuper: false, rolbypassrls: false });
    for (const sql of [
      "SELECT * FROM sessions",
      "SELECT * FROM users",
      "SELECT * FROM compliance_filings",
      "DELETE FROM verification_jobs",
      "UPDATE verification_jobs SET tenant_id=tenant_id",
      "DELETE FROM registry_records",
    ])
      await expect(db.pool.query(sql)).rejects.toMatchObject({ code: "42501" });
    for (const sql of [
      "UPDATE verification_jobs SET status='VERIFIED'",
      "DELETE FROM verification_jobs",
      "SELECT * FROM registry_records",
    ])
      await expect(runtime.pool.query(sql)).rejects.toMatchObject({
        code: "42501",
      });
  });
  it("keeps verification visibility aligned with tenant and owner access", async () => {
    expect(
      (await runtime.pool.query("SELECT * FROM verification_jobs")).rowCount,
    ).toBe(0);
    expect(
      (
        await runtime.scoped(actor, (c) =>
          c.query("SELECT * FROM verification_jobs WHERE filing_id=$1", [
            filing,
          ]),
        )
      ).rowCount,
    ).toBe(1);
    const other: Actor = (
      await owner.query(
        "SELECT id,tenant_id,name,role FROM users WHERE email='submitter@riyadh.test'",
      )
    ).rows[0];
    expect(
      (
        await runtime.scoped(other, (c) =>
          c.query("SELECT * FROM verification_jobs WHERE filing_id=$1", [
            filing,
          ]),
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await runtime.scoped({ ...actor, id: randomUUID() }, (c) =>
          c.query("SELECT * FROM verification_jobs WHERE filing_id=$1", [
            filing,
          ]),
        )
      ).rowCount,
    ).toBe(0);
    const admin: Actor = (
      await owner.query(
        "SELECT id,tenant_id,name,role FROM users WHERE role='ADMIN' LIMIT 1",
      )
    ).rows[0];
    expect(
      (
        await runtime.scoped(admin, (c) =>
          c.query("SELECT * FROM verification_jobs WHERE filing_id=$1", [
            filing,
          ]),
        )
      ).rowCount,
    ).toBe(1);
  });
});
