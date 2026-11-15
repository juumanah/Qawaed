import "reflect-metadata";
import { Controller, Get, Module, ServiceUnavailableException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Database } from "./database";
@Controller()
export class HealthController {
  constructor(private readonly database: Database) {}
  @Get("health") async health() {
    try { await this.database.ready(); }
    catch { throw new ServiceUnavailableException("Database unavailable"); }
    return { status: "ok", database: "up" };
  }
}
@Module({ controllers: [HealthController], providers: [Database] })
class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  return app;
}
