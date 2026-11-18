import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { Pool } from "pg";

// Only registry infrastructure receives this role. Tenant requests keep using Database.
@Injectable()
export class RegistryDatabase implements OnApplicationShutdown {
  readonly pool: Pool;
  constructor() {
    if (!process.env.WORKER_DATABASE_URL)
      throw new Error("WORKER_DATABASE_URL required");
    if (!process.env.REGISTRY_SECRET || process.env.REGISTRY_SECRET.length < 32)
      throw new Error("REGISTRY_SECRET must be at least 32 characters");
    this.pool = new Pool({
      connectionString: process.env.WORKER_DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 2000,
      query_timeout: 2000,
    });
    this.pool.on("error", () =>
      console.error("Idle registry connection failed"),
    );
  }
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
