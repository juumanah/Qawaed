import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { Actor } from "../auth/identity";
@Injectable()
export class Database implements OnApplicationShutdown {
  readonly pool: Pool;
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 2000,
      query_timeout: 2000,
    });
    this.pool.on("error", (error) =>
      console.error("Idle database connection failed", error.message),
    );
  }
  // Every tenant query must use this client, inside this transaction. SET LOCAL
  // scope expires on both commit and rollback before the pooled client is reused.
  async scoped<T>(
    actor: Actor,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      //use the authenticated user's identity for every query in this transaction
      //local settings expire on commit or rollback, preventing pool context leaks
      await client.query(
        "SELECT set_config('app.tenant_id',$1,true),set_config('app.role',$2,true),set_config('app.actor_id',$3,true),set_config('app.actor_name',$4,true)",
        [actor.tenant_id ?? "", actor.role, actor.id, actor.name],
      );
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async ready() {
    await this.pool.query("SELECT 1");
  }
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
