import { createApp } from "../src/app";
import { Database } from "../src/database/database";
import { Actor } from "../src/auth/identity";
import request from "supertest";
import pg from "pg";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const payload = {
  title: "Commercial license",
  identifier_cr: "1010123456",
  category: "COMMERCIAL",
  expiration_date: "2099-12-31",
};
describe("filings lifecycle, tenant boundaries and conflicting decisions", () => {
  let app: Awaited<ReturnType<typeof createApp>>, db: Database;
  const cookies: Record<string, string> = {},
    actors: Record<string, Actor> = {};
  beforeAll(async () => {
    if (!process.env.MIGRATION_DATABASE_URL || !process.env.DATABASE_URL)
      throw Error("Disposable database URLs required");
    execFileSync(process.execPath, ["scripts/setup-db.mjs"], {
      cwd: resolve(__dirname, "../../.."),
      env: process.env,
    });
    const setup = new pg.Pool({
      connectionString: process.env.MIGRATION_DATABASE_URL,
    });
    try {
      for (const [email, role] of [
        ["second-auditor@test.local", "AUDITOR"],
        ["second-submitter@test.local", "SUBMITTER"],
      ])
        await setup.query(
          "INSERT INTO users(tenant_id,name,email,password_hash,role) SELECT tenant_id,'Second test user',$1,password_hash,$2 FROM users WHERE email='submitter@aram.test' ON CONFLICT(email) DO NOTHING",
          [email, role],
        );
    } finally {
      await setup.end();
    }
    app = await createApp();
    await app.init();
    db = app.get(Database);
    for (const [key, email] of Object.entries({
      s: "submitter@aram.test",
      a: "auditor@aram.test",
      b: "submitter@riyadh.test",
      ba: "auditor@riyadh.test",
      admin: "admin@qawaed.test",
      a2: "second-auditor@test.local",
      s2: "second-submitter@test.local",
    })) {
      const r = await request(app.getHttpServer())
        .post("/auth/login")
        .set("Origin", origin)
        .send({
          email,
          password: process.env.DEMO_PASSWORD ?? "QawaedDemo!2026",
        })
        .expect(200);
      cookies[key] = (r.headers["set-cookie"] as unknown as string[])[0].split(
        ";",
      )[0];
      actors[key] = r.body;
    }
  });
  afterAll(async () => {
    await app?.close();
  });
  const post = (path: string, body: object, key = "s") =>
    request(app.getHttpServer())
      .post(path)
      .set("Origin", origin)
      .set("Cookie", cookies[key])
      .send(body);
  const get = (path: string, key = "s") =>
    request(app.getHttpServer()).get(path).set("Cookie", cookies[key]);
  const edit = (id: string, version: number, key = "s") =>
    request(app.getHttpServer())
      .patch(`/filings/${id}`)
      .set("Origin", origin)
      .set("Cookie", cookies[key])
      .send({ ...payload, title: "Edited license", version });
  const create = async (key = "s") =>
    (await post("/filings", payload, key).expect(201)).body;
  const transition = (
    id: string,
    version: number,
    status: string,
    key = "a",
    reason?: string,
  ) =>
    post(
      `/filings/${id}/transitions`,
      {
        version,
        status,
        ...(reason === undefined ? {} : { rejection_reason: reason }),
      },
      key,
    );
  const review = async () => {
    let f = await create();
    f = (await transition(f.id, f.version, "SUBMITTED", "s").expect(201)).body;
    return (await transition(f.id, f.version, "UNDER_REVIEW").expect(201)).body;
  };
  it("creates a draft and records the authenticated actor and first snapshot", async () => {
    const f = await create();
    expect(f).toMatchObject({
      tenant_id: actors.s.tenant_id,
      created_by: actors.s.id,
      status: "DRAFT",
      version: 1,
    });
    const r = await get(`/filings/${f.id}`).expect(200);
    expect(r.body.audit).toHaveLength(1);
    expect(r.body.audit[0]).toMatchObject({
      actor_id: actors.s.id,
      actor_name: actors.s.name,
      action: "CREATED",
      previous_state: null,
      new_state: "DRAFT",
    });
  });
  it.each([
    { ...payload, title: "   " },
    { ...payload, expiration_date: "2099-02-30" },
    { ...payload, expiration_date: "2000-01-01" },
    { ...payload, identifier_cr: "12" },
    { ...payload, category: "OTHER" },
    { ...payload, tenant_id: "00000000-0000-4000-8000-000000000002" },
  ])(
    "rejects invalid metadata or client supplied tenancy: %j",
    async (body) => {
      await post("/filings", body).expect(400);
    },
  );
  it("denies unauthenticated writes and non-submitter creation", async () => {
    await request(app.getHttpServer())
      .post("/filings")
      .set("Origin", origin)
      .send(payload)
      .expect(401);
    await post("/filings", payload, "a").expect(403);
    await post("/filings", payload, "admin").expect(403);
  });
  it("isolates detail, edit, transition, list, summary and raw audit reads across tenants", async () => {
    const f = await create("b");
    await get(`/filings/${f.id}`).expect(404);
    await edit(f.id, 1).expect(404);
    await transition(f.id, 1, "UNDER_REVIEW").expect(404);
    const list = await get("/filings").expect(200);
    expect(
      list.body.items.every((x: any) => x.tenant_id === actors.s.tenant_id),
    ).toBe(true);
    const summary = await get("/filings/summary").expect(200);
    expect(Array.isArray(summary.body)).toBe(true);
    const rows = await db.scoped(actors.s, (c) =>
      c.query("SELECT * FROM audit_logs WHERE filing_id=$1", [f.id]),
    );
    expect(rows.rows).toEqual([]);
    expect(
      (await db.pool.query("SELECT * FROM compliance_filings")).rows,
    ).toEqual([]);
    expect((await db.pool.query("SELECT * FROM audit_logs")).rows).toEqual([]);
  });
  it("keeps another submitter’s drafts private inside the same tenant, while auditors can review", async () => {
    const f = await create("s2");
    await get(`/filings/${f.id}`, "s").expect(404);
    await get(`/filings/${f.id}`, "a").expect(200);
    expect(
      (
        await db.scoped(actors.s, (c) =>
          c.query("SELECT * FROM audit_logs WHERE filing_id=$1", [f.id]),
        )
      ).rows,
    ).toEqual([]);
  });
  it("repeated seed preserves edited drafts and does not duplicate audit history", async () => {
    const f = (await get("/filings?status=DRAFT")).body.items.find((x: any) =>
      x.id.startsWith("f0000000"),
    );
    await edit(f.id, f.version).expect(200);
    const before = (await get(`/filings/${f.id}`)).body;
    execFileSync(process.execPath, ["scripts/setup-db.mjs"], {
      cwd: resolve(__dirname, "../../.."),
      env: process.env,
    });
    expect((await get(`/filings/${f.id}`)).body).toEqual(before);
  });
  it("allows admin global read but no filing mutations", async () => {
    const f = await create("b");
    await get(`/filings/${f.id}`, "admin").expect(200);
    await edit(f.id, 1, "admin").expect(403);
    await transition(f.id, 1, "SUBMITTED", "admin").expect(403);
    const r = await db.scoped(actors.admin, (c) =>
      c.query("UPDATE compliance_filings SET version=version+1 WHERE id=$1", [
        f.id,
      ]),
    );
    expect(r.rowCount).toBe(0);
  });
  it("updates drafts with version checks and retains old/new metadata", async () => {
    const f = await create();
    await edit(f.id, 1).expect(200);
    await edit(f.id, 1).expect(409);
    const d = (await get(`/filings/${f.id}`)).body;
    expect(d.version).toBe(2);
    expect(d.audit).toHaveLength(2);
    expect(d.audit[1].metadata.before.title).toBe(payload.title);
    expect(d.audit[1].metadata.after.title).toBe("Edited license");
  });
  it("rejects illegal hops and unauthorized transitions without adding audits", async () => {
    const f = await create();
    await transition(f.id, 1, "APPROVED").expect(422);
    await transition(f.id, 1, "UNDER_REVIEW", "s").expect(403);
    await transition(f.id, 1, "SUBMITTED", "a").expect(403);
    expect((await get(`/filings/${f.id}`)).body.audit).toHaveLength(1);
  });
  it.each(["", "   "])(
    "requires a nonempty rejection reason (%j)",
    async (reason) => {
      const f = await review();
      await transition(f.id, f.version, "REJECTED", "a", reason).expect(400);
      expect((await get(`/filings/${f.id}`)).body.status).toBe("UNDER_REVIEW");
    },
  );
  it.each(["APPROVED", "REJECTED"])(
    "keeps %s filings immutable",
    async (status) => {
      let f = await review();
      f = (
        await transition(
          f.id,
          f.version,
          status,
          "a",
          "Missing evidence",
        ).expect(201)
      ).body;
      await edit(f.id, f.version).expect(422);
      await transition(f.id, f.version, "UNDER_REVIEW").expect(422);
      await expect(
        db.scoped(actors.a, (c) =>
          c.query(
            "UPDATE compliance_filings SET version=version+1 WHERE id=$1",
            [f.id],
          ),
        ),
      ).rejects.toThrow();
      expect((await get(`/filings/${f.id}`)).body.audit).toHaveLength(4);
    },
  );
  it("allows exactly one of twenty simultaneous final decisions and one final audit", async () => {
    const f = await review();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        transition(
          f.id,
          f.version,
          i % 2 ? "APPROVED" : "REJECTED",
          i % 2 ? "a" : "a2",
          "Evidence missing",
        ),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(19);
    const d = (await get(`/filings/${f.id}`)).body;
    expect(d.version).toBe(4);
    expect(d.audit).toHaveLength(4);
    expect(d.audit[3].new_state).toBe(d.status);
  });
  it("rolls back the filing and audit together on transaction failure", async () => {
    let id: string | undefined;
    await expect(
      db.scoped(actors.s, async (c) => {
        const r = await c.query(
          "INSERT INTO compliance_filings(tenant_id,created_by,title,identifier_cr,category,expiration_date) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
          [
            actors.s.tenant_id,
            actors.s.id,
            payload.title,
            payload.identifier_cr,
            payload.category,
            payload.expiration_date,
          ],
        );
        id = r.rows[0].id;
        throw Error("rollback probe");
      }),
    ).rejects.toThrow("rollback probe");
    expect(
      (
        await db.scoped(actors.admin, (c) =>
          c.query("SELECT * FROM compliance_filings WHERE id=$1", [id]),
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await db.scoped(actors.admin, (c) =>
          c.query("SELECT * FROM audit_logs WHERE filing_id=$1", [id]),
        )
      ).rows,
    ).toEqual([]);
  });
  it("runtime role cannot insert, update or delete audit records", async () => {
    const f = await create();
    for (const sql of [
      "DELETE FROM audit_logs WHERE filing_id=$1",
      "UPDATE audit_logs SET action='FORGED' WHERE filing_id=$1",
      "INSERT INTO audit_logs SELECT * FROM audit_logs WHERE filing_id=$1",
    ])
      await expect(
        db.scoped(actors.s, (c) => c.query(sql, [f.id])),
      ).rejects.toMatchObject({ code: "42501" });
  });
  it("validates ids, filters, pagination and version inputs", async () => {
    await get("/filings/nope").expect(400);
    await get("/filings?page=0").expect(400);
    await get("/filings?status=NOPE").expect(400);
    const f = await create();
    await transition(f.id, 0, "SUBMITTED", "s").expect(400);
    const r = await get("/filings?status=DRAFT&page=1").expect(200);
    expect(r.body.items.length).toBeLessThanOrEqual(20);
    expect(r.body.items.every((x: any) => x.status === "DRAFT")).toBe(true);
  });

  it("searches across pages with matching totals and no repeated results", async () => {
    const term = `search-${randomUUID()}`;
    await db.scoped(actors.s, (c) => c.query(
      `INSERT INTO compliance_filings(tenant_id,created_by,title,identifier_cr,category,expiration_date)
       SELECT $1,$2,$3 || ' ' || n,'9090909090','COMMERCIAL','2099-12-31'
       FROM generate_series(1,21) AS n`, [actors.s.tenant_id, actors.s.id, term],
    ));
    const first = (await get(`/filings?search=${term.toUpperCase()}&page=1`).expect(200)).body;
    const second = (await get(`/filings?search=${term}&page=2`).expect(200)).body;
    expect(first.total).toBe(21);
    expect(second.total).toBe(21);
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((f: any) => f.id)).size).toBe(21);
    const approved = (await get(`/filings?search=${term}&status=APPROVED`).expect(200)).body;
    expect(approved).toMatchObject({ total: 0, items: [] });
    const cr = (await get("/filings?search=9090909090").expect(200)).body;
    expect(cr.total).toBe(21);
  });

  it("keeps search totals and results inside tenant and owner boundaries", async () => {
    const term = `isolation-${randomUUID()}`;
    for (const key of ["s", "s2", "b"])
      await post("/filings", { ...payload, title: term }, key).expect(201);
    for (const [key, count] of [["s", 1], ["a", 2], ["b", 1], ["admin", 3]] as const) {
      const result = (await get(`/filings?search=${term}`, key).expect(200)).body;
      expect(result.total).toBe(count);
      expect(result.items).toHaveLength(count);
    }
  });

  it("treats search metacharacters as literal text, not SQL or wildcards", async () => {
    const title = `literal-${randomUUID()} 100%_ready`;
    const f = (await post("/filings", { ...payload, title }).expect(201)).body;
    const result = (await get("/filings?search=" + encodeURIComponent("100%_ready")).expect(200)).body;
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe(f.id);
    const injected = (await get("/filings?search=" + encodeURIComponent("' OR 1=1 --")).expect(200)).body;
    expect(injected).toMatchObject({ total: 0, items: [] });
  });

  it("validates search length and treats whitespace as an empty query", async () => {
    await get("/filings?search=" + "a".repeat(101)).expect(400);
    await get("/filings?search=a&search=b").expect(400);
    const all = (await get("/filings").expect(200)).body;
    const blank = (await get("/filings?search=%20%20").expect(200)).body;
    expect(blank).toEqual(all);
  });
});
