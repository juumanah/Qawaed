import {
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Database } from "./database";
import { Actor } from "./identity";
import { AuthRequest } from "./auth.guard";
import { Roles, RolesGuard } from "./roles.guard";
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
@Controller("tenants")
@UseGuards(RolesGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}
  @Get() @Roles("ADMIN") list(@Req() req: AuthRequest) {
    return this.tenants.list(req.actor);
  }
  @Get(":id")
  @Roles("SUBMITTER", "AUDITOR", "ADMIN")
  get(@Req() req: AuthRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.tenants.get(req.actor, id);
  }
}
