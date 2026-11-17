import "reflect-metadata";
import {
  Controller,
  Get,
  Module,
  ServiceUnavailableException,
  ValidationPipe,
} from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { FilingsController } from "./filings";
import { FilingsService } from "./filings.service";
import { Database } from "./database";
import { TenantsController, TenantsService } from "./tenants";
import { RolesGuard } from "./roles.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthGuard, Public } from "./auth.guard";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
@Controller()
export class HealthController {
  constructor(private readonly database: Database) {}
  @Public() @Get("health") async health() {
    try {
      await this.database.ready();
    } catch {
      throw new ServiceUnavailableException("Database unavailable");
    }
    return { status: "ok", database: "up" };
  }
}
@Module({
  controllers: [
    HealthController,
    AuthController,
    TenantsController,
    FilingsController,
  ],
  providers: [
    Database,
    AuthService,
    RolesGuard,
    TenantsService,
    FilingsService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
class AppModule {}
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
  // Per-instance protection for this single-API deployment. Shared rate limiting
  // is required before scaling to multiple API replicas.
  app.use(
    "/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
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
