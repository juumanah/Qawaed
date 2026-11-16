import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "../src/roles.guard";
import { createApp } from "../src/app";
import request from "supertest";

describe("role policy unit behavior", () => {
  const context = (role: string) =>
    ({
      getHandler: () => () => {},
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ actor: { role } }) }),
    }) as unknown as ExecutionContext;
  it("fails closed without role metadata", () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    expect(() =>
      new RolesGuard(reflector).canActivate(context("ADMIN")),
    ).toThrow("Insufficient permissions");
  });
  it("accepts only roles explicitly allowed by the route", () => {
    const reflector = {
      getAllAndOverride: () => ["ADMIN"],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context("ADMIN"))).toBe(true);
    expect(() => guard.canActivate(context("SUBMITTER"))).toThrow(
      "Insufficient permissions",
    );
  });
});
describe("login abuse protection over HTTP", () => {
  it("rate-limits repeated login requests before credential evaluation", async () => {
    const app = await createApp();
    await app.init();
    try {
      for (let i = 0; i < 30; i++)
        await request(app.getHttpServer())
          .post("/auth/login")
          .set("Origin", process.env.WEB_ORIGIN ?? "http://localhost:3000")
          .send({})
          .expect(400);
      await request(app.getHttpServer())
        .post("/auth/login")
        .set("Origin", process.env.WEB_ORIGIN ?? "http://localhost:3000")
        .send({})
        .expect(429);
    } finally {
      await app.close();
    }
  });
});
