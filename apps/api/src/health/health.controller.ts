import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Database } from "../database/database";
import { Public } from "../auth/auth.guard";
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
