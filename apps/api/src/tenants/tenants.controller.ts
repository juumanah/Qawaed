import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthRequest } from "../auth/auth.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { TenantsService } from "./tenants.service";
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
