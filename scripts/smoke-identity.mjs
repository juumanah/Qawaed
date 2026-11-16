import assert from "node:assert/strict";
// Explicit demo credentials only. No tokens or credentials are logged.
const base = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const password = process.env.DEMO_PASSWORD ?? "QawaedDemo!2026";
const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
async function call(path, expected, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: expected ${expected}, received ${response.status}`,
  );
  return response;
}
async function login(email) {
  const response = await call("/auth/login", 200, {
    method: "POST",
    body: { email, password },
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(
    cookie?.startsWith("qawaed_session="),
    "Missing session cookie through web proxy",
  );
  assert.equal("password_hash" in (await response.json()), false);
  return cookie;
}
await call("/health", 200);
await call("/auth/me", 401);
const active = [];
try {
  const submitter = await login("submitter@aram.test");
  active.push(submitter);
  assert.equal(
    (await (await call("/auth/me", 200, { cookie: submitter })).json()).role,
    "SUBMITTER",
  );
  assert.equal(
    (await (await call(`/tenants/${a}`, 200, { cookie: submitter })).json()).id,
    a,
  );
  await call(`/tenants/${b}`, 404, { cookie: submitter });
  await call("/tenants", 403, { cookie: submitter });
  const admin = await login("admin@qawaed.test");
  active.push(admin);
  const tenants = await (await call("/tenants", 200, { cookie: admin })).json();
  assert.deepEqual(tenants.map((t) => t.id).sort(), [a, b]);
  await call("/auth/logout", 200, { method: "POST", cookie: submitter });
  await call("/auth/me", 401, { cookie: submitter });
  console.log(
    "PASS: web proxy -> API -> PostgreSQL; session, roles, tenant isolation, logout replay",
  );
} finally {
  for (const cookie of active)
    await call("/auth/logout", 200, { method: "POST", cookie });
}
