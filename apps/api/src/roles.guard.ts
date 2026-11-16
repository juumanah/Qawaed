import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "./identity";
import { AuthRequest } from "./auth.guard";
export const Roles = (...roles: Role[]) => SetMetadata("qawaed.roles", roles);
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const allowed = this.reflector.getAllAndOverride<Role[]>("qawaed.roles", [
      context.getHandler(),
      context.getClass(),
    ]);
    const actor = context.switchToHttp().getRequest<AuthRequest>().actor;
    if (!actor || !allowed?.includes(actor.role))
      throw new ForbiddenException("Insufficient permissions");
    return true;
  }
}
