import assert from "node:assert/strict";
// Explicit demo credentials only. No tokens or credentials are logged.
const base = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const password = process.env.DEMO_PASSWORD ?? "QawaedDemo!2026";
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
  const auditor = await login("auditor@aram.test");
  active.push(auditor);
  const other = await login("auditor@riyadh.test");
  active.push(other);
  let filing = await (
    await call("/filings", 201, {
      method: "POST",
      cookie: submitter,
      body: {
        title: "Smoke-test compliance filing",
        identifier_cr: "1010123456",
        category: "COMMERCIAL",
        expiration_date: "2099-12-31",
      },
    })
  ).json();
  await call(`/filings/${filing.id}`, 404, { cookie: other });
  await call(`/filings/${filing.id}/transitions`, 422, {
    method: "POST",
    cookie: auditor,
    body: { version: filing.version, status: "APPROVED" },
  });
  for (const status of ["SUBMITTED", "UNDER_REVIEW"]) {
    filing = await (
      await call(`/filings/${filing.id}/transitions`, 201, {
        method: "POST",
        cookie: status === "SUBMITTED" ? submitter : auditor,
        body: { version: filing.version, status },
      })
    ).json();
  }
  const version = filing.version;
  filing = await (
    await call(`/filings/${filing.id}/transitions`, 201, {
      method: "POST",
      cookie: auditor,
      body: { version, status: "APPROVED" },
    })
  ).json();
  await call(`/filings/${filing.id}/transitions`, 409, {
    method: "POST",
    cookie: auditor,
    body: { version, status: "REJECTED", rejection_reason: "Stale decision" },
  });
  const detail = await (
    await call(`/filings/${filing.id}`, 200, { cookie: submitter })
  ).json();
  assert.equal(detail.status, "APPROVED");
  assert.equal(detail.audit.length, 4);
  console.log(
    "PASS: filing creation -> submission -> review -> approval; cross-tenant 404, illegal hop 422, stale decision 409, four audit events",
  );
  if (process.env.SMOKE_REGISTRY === "true") {
    const deadline = Date.now() + 90000;
    let result;
    do {
      result = await (
        await call(`/filings/${filing.id}`, 200, { cookie: submitter })
      ).json();
      if (["VERIFIED", "FAILED"].includes(result.verification?.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    assert.equal(result.status, "APPROVED");
    assert.equal(result.version, filing.version);
    assert.equal(result.audit.length, 4);
    const verification = result.verification;
    assert.ok(
      verification && ["VERIFIED", "FAILED"].includes(verification.status),
      "Registry worker did not finish within 90 seconds",
    );
    assert.ok(verification.attempt >= 1 && verification.attempt <= 4);
    if (verification.status === "VERIFIED") {
      assert.match(verification.reference_id, /^REG-[0-9a-f-]{36}$/i);
      assert.ok(Number.isFinite(Date.parse(verification.verified_at)));
    } else {
      assert.equal(verification.attempt, 4);
      assert.ok(verification.last_error);
    }
    console.log(
      `PASS: async registry reached ${verification.status} after ${verification.attempt} attempt(s); approved filing and audit unchanged`,
    );
  }
  console.log(`Demo filing retained for inspection: ${filing.id}`);
} finally {
  for (const cookie of active)
    await call("/auth/logout", 200, { method: "POST", cookie });
}
