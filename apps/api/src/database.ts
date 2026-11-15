import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { Pool } from "pg";
@Injectable()
export class Database implements OnApplicationShutdown {
  readonly pool: Pool;
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 2000, query_timeout: 2000 });
    this.pool.on("error", (error) => console.error("Idle database connection failed", error.message));
  }
  async ready() { await this.pool.query("SELECT 1"); }
  async onApplicationShutdown() { await this.pool.end(); }
}
