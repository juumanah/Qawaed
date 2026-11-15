import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
@Controller()
class HealthController {
  @Get("health") health() { return { status: "ok", service: "qawaed-api" }; }
}
@Module({ controllers: [HealthController] })
class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  return app;
}
