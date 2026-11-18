import { Injectable, NotFoundException } from "@nestjs/common";
import { Database } from "../database/database";
import { Actor } from "../auth/identity";
@Injectable()
export class TenantsService {
  constructor(private readonly db: Database) {}
  list(actor: Actor) {
    return this.db.scoped(
      actor,
      async (client) =>
        (
          await client.query(
            "SELECT id,name,identifier_cr FROM tenants ORDER BY name",
          )
        ).rows,
    );
  }
  async get(actor: Actor, id: string) {
    return this.db.scoped(actor, async (client) => {
      const { rows } = await client.query(
        "SELECT id,name,identifier_cr FROM tenants WHERE id=$1",
        [id],
      );
      if (!rows[0]) throw new NotFoundException("Tenant not found");
      return rows[0];
    });
  }
}
