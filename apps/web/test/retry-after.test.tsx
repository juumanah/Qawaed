import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../lib/api";
import { retryAfterSeconds, remainingSeconds } from "../lib/retry-after";

test("Retry-After supports seconds and HTTP dates", () => {
  assert.equal(retryAfterSeconds("900"), 900);
  assert.equal(retryAfterSeconds("Wed, 18 Nov 2026 12:15:00 GMT", Date.parse("2026-11-18T12:00:00Z")), 900);
  assert.equal(retryAfterSeconds("invalid"), undefined);
  assert.equal(retryAfterSeconds(null), undefined);
});

test("countdown uses elapsed time, including time spent in a background tab", () => {
  assert.equal(remainingSeconds(10000, 1000), 9);
  assert.equal(remainingSeconds(10000, 9999), 1);
  assert.equal(remainingSeconds(10000, 15000), 0);
});

test("the API client exposes the server's wait time on a 429 response", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ message: "Too many attempts" }), {
    status: 429, headers: { "Retry-After": "42" },
  }));
  await assert.rejects(api("/auth/login", { method: "POST" }), (error: unknown) =>
    error instanceof ApiError && error.status === 429 && error.retryAfterSeconds === 42);
});

test("wrong credentials do not start a rate-limit countdown", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ message: "Invalid credentials" }), { status: 401 }));
  await assert.rejects(api("/auth/login", { method: "POST" }), (error: unknown) =>
    error instanceof ApiError && error.status === 401 && error.retryAfterSeconds === undefined);
});
