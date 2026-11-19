import express from "express";
import request from "supertest";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { loginLimits } from "../src/auth/login-limits";

function api() {
  const app = express();
  app.use(express.json(), ...loginLimits());
  app.post("/auth/login", (req, res) => {
    // Exercise the limiter independently of database/password hashing cost.
    res.status(req.body.correct ? 200 : 401).json({ ok: !!req.body.correct });
  });
  return app;
}

describe("login limits", () => {
  it("keeps account allowances separate behind the same reverse proxy", async () => {
    const upstream = api().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => upstream.once("listening", resolve));
    const port = (upstream.address() as AddressInfo).port;
    const proxy = createServer((req, res) => {
      const forwarded = httpRequest({ hostname: "127.0.0.1", port,
        path: req.url, method: req.method, headers: req.headers }, (reply) => {
        res.writeHead(reply.statusCode!, reply.headers);
        reply.pipe(res);
      });
      forwarded.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(forwarded);
    });
    try {
      for (let i = 0; i < 30; i++)
        await request(proxy).post("/auth/login")
          .send({ email: "a@example.test" }).expect(401);
      const blocked = await request(proxy).post("/auth/login")
        .send({ email: " A@EXAMPLE.TEST " }).expect(429);
      expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
      expect(blocked.body.message).toContain("Too many");
      await request(proxy).post("/auth/login")
        .send({ email: "b@example.test", correct: true }).expect(200);
      await request(proxy).post("/auth/login").set("X-Forwarded-For", "203.0.113.9")
        .send({ email: "a@example.test" }).expect(429);
    } finally {
      await new Promise<void>((resolve, reject) => upstream.close((e) => e ? reject(e) : resolve()));
    }
  });

  it("does not spend the failure allowance on successful sign-ins", async () => {
    const app = api();
    for (let i = 0; i < 35; i++)
      await request(app).post("/auth/login")
        .send({ email: "a@example.test", correct: true }).expect(200);
    await request(app).post("/auth/login")
      .send({ email: "a@example.test" }).expect(401);
  });

  it("caps failures across many accounts without trusting forwarded IPs", async () => {
    const app = api();
    for (let i = 0; i < 300; i++)
      await request(app).post("/auth/login")
        .send({ email: `user-${i}@example.test` }).expect(401);
    await request(app).post("/auth/login").set("X-Forwarded-For", "203.0.113.10")
      .send({ email: "another@example.test" }).expect(429);
  });
});
