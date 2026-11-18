import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Database } from "../database/database";
import { Actor } from "./identity";
export const SESSION_COOKIE = "qawaed_session";
export const SESSION_MS = 8 * 60 * 60 * 1000;
export const tokenDigest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const fallbackHash =
  "$2b$12$6UXHXWjGePhA1BI9uMHHUu9NfwAxNlLMNRcOGDEqb7uDDJTuQ19fW";
@Injectable()
export class AuthService {
  constructor(private readonly db: Database) {}
  async login(
    email: string,
    password: string,
  ): Promise<{ actor: Actor; token: string }> {
    // bcrypt truncates after 72 bytes: reject rather than silently accept a prefix.
    if (Buffer.byteLength(password, "utf8") > 72)
      throw new BadRequestException("Password must be at most 72 UTF-8 bytes");
    const { rows } = await this.db.pool.query<
      Actor & { password_hash: string }
    >(
      "SELECT id,tenant_id,name,email,role,password_hash FROM users WHERE email=$1",
      [email.toLowerCase()],
    );
    const user = rows[0];
    const valid = await bcrypt.compare(
      password,
      user?.password_hash ?? fallbackHash,
    );
    if (!user || !valid)
      throw new UnauthorizedException("Invalid email or password");
    const { password_hash, ...actor } = user;
    const token = randomBytes(32).toString("hex");
    await this.db.pool.query("DELETE FROM sessions WHERE expires_at <= now()");
    await this.db.pool.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
      [tokenDigest(token), actor.id],
    );
    return { actor, token };
  }
  async authenticate(token: unknown): Promise<Actor> {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException("Sign in required");
    const { rows } = await this.db.pool.query<Actor>(
      `SELECT u.id,u.tenant_id,u.name,u.email,u.role FROM sessions s
       JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
      [tokenDigest(token)],
    );
    if (!rows[0]) throw new UnauthorizedException("Session expired");
    return rows[0];
  }
  async logout(token: unknown) {
    if (typeof token === "string" && /^[a-f0-9]{64}$/.test(token))
      await this.db.pool.query("DELETE FROM sessions WHERE token_hash=$1", [
        tokenDigest(token),
      ]);
  }
}
