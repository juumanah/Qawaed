import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { loginLimits } from "./auth/login-limits";
import { json } from "express";
import { Request, Response, NextFunction } from "express";
export async function createApp() {
  const app = await NestFactory.create(AppModule);
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  if (new URL(origin).origin !== origin)
    throw Error("WEB_ORIGIN must be an exact origin without a path");
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin, credentials: true });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== origin
    ) {
      res.status(403).json({ message: "Untrusted request origin" });
      return;
    }
    next();
  });
  // Parse before the limiter chooses its account key. Keep this global: Nest
  // detects an installed JSON parser and will not register another one.
  app.use(json({ limit: "100kb" }));
  app.use("/auth/login", ...loginLimits());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  return app;
}
