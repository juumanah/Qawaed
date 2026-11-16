import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { Actor } from "./identity";
import { AuthService, SESSION_COOKIE } from "./auth.service";
export type AuthRequest = Request & { actor: Actor };
export const Public = () => SetMetadata("qawaed.public", true);
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>("qawaed.public", [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();
    req.actor = await this.auth.authenticate(req.cookies?.[SESSION_COOKIE]);
    return true;
  }
}
