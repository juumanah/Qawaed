import {
  Body,
  Controller,
  Headers,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { IsUUID, Matches } from "class-validator";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { RegistryDatabase } from "./registry.database";
import { Public } from "./auth.guard";
export class VerifyDto {
  @IsUUID() filingId!: string;
  @Matches(/^\d{10}$/) identifierCr!: string;
}
@Controller("mock-registry")
export class RegistryController {
  constructor(private db: RegistryDatabase) {}
  @Public() @Post("verify") async verify(
    @Body() dto: VerifyDto,
    @Headers("idempotency-key") key: string,
    @Headers("x-registry-secret") secret: string,
  ) {
    const expected = process.env.REGISTRY_SECRET ?? "";
    if (
      !secret ||
      !expected ||
      Buffer.byteLength(secret) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    )
      throw new UnauthorizedException();
    if (!key || !new RegExp(`^filing-${dto.filingId}-[1-4]$`).test(key))
      throw new BadRequestException("Invalid idempotency key");
    const approved = await this.db.pool.query(
      "SELECT 1 FROM verification_jobs WHERE filing_id=$1 AND identifier_cr=$2",
      [dto.filingId, dto.identifierCr],
    );
    if (!approved.rowCount)
      throw new BadRequestException("No matching approved filing");
    // The filing is the stable operation ID, even when retries use a new header key.
    const previous = await this.db.pool.query(
      "SELECT * FROM registry_records WHERE filing_id=$1",
      [dto.filingId],
    );
    if (previous.rowCount) {
      if (previous.rows[0].identifier_cr !== dto.identifierCr)
        throw new BadRequestException("Idempotency payload mismatch");
      return this.result(previous.rows[0]);
    }
    if (Math.random() < 0.3)
      throw new ServiceUnavailableException("Registry gateway unavailable");
    await this.db.pool.query(
      "INSERT INTO registry_records(filing_id,identifier_cr,idempotency_key) VALUES($1,$2,$3) ON CONFLICT(filing_id) DO NOTHING",
      [dto.filingId, dto.identifierCr, key],
    );
    const row = (
      await this.db.pool.query(
        "SELECT * FROM registry_records WHERE filing_id=$1",
        [dto.filingId],
      )
    ).rows[0];
    if (row.identifier_cr !== dto.identifierCr)
      throw new BadRequestException("Idempotency payload mismatch");
    return this.result(row);
  }
  private result(row: { reference_id: string; verified_at: Date }) {
    return {
      status: "VERIFIED",
      referenceId: row.reference_id,
      verifiedAt: row.verified_at,
    };
  }
}
@Injectable()
export class RegistryWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  constructor(private db: RegistryDatabase) {}
  onModuleInit() {
    if (process.env.WORKER_ENABLED !== "true") return;
    this.timer = setInterval(() => {
      if (!this.running)
        this.running = this.tick()
          .catch((e) =>
            console.error(
              "Registry worker cycle failed",
              e instanceof Error ? e.message : "unknown",
            ),
          )
          .finally(() => {
            this.running = undefined;
          });
    }, 500);
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  async tick() {
    // A crashed fourth delivery is reconciled with the same attempt key after its lease expires.
    // SKIP LOCKED gives each job one active claimant; the token fences late responses.
    const token = randomUUID();
    const r = await this.db.pool.query(
      `UPDATE verification_jobs SET status='PROCESSING',attempt=CASE WHEN status='PROCESSING' THEN attempt ELSE attempt+1 END,lease_until=now()+interval '30 seconds',lease_token=$1 WHERE id=(SELECT id FROM verification_jobs WHERE (status='PENDING' AND available_at<=now() AND attempt<4) OR (status='PROCESSING' AND lease_until<now()) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      [token],
    );
    if (!r.rowCount) return;
    const job = r.rows[0];
    try {
      const response = await fetch(
        process.env.REGISTRY_URL ??
          "http://127.0.0.1:4000/mock-registry/verify",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
            "idempotency-key": `filing-${job.filing_id}-${job.attempt}`,
            "x-registry-secret": process.env.REGISTRY_SECRET!,
          },
          body: JSON.stringify({
            filingId: job.filing_id,
            identifierCr: job.identifier_cr,
          }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) throw new Error(`Registry HTTP ${response.status}`);
      const data = (await response.json()) as {
        status: string;
        referenceId: string;
        verifiedAt: string;
      };
      if (
        data.status !== "VERIFIED" ||
        typeof data.referenceId !== "string" ||
        !/^REG-[0-9a-f-]{36}$/i.test(data.referenceId) ||
        typeof data.verifiedAt !== "string" ||
        !Number.isFinite(Date.parse(data.verifiedAt))
      )
        throw new Error("Invalid registry response");
      await this.db.pool.query(
        "UPDATE verification_jobs SET status='VERIFIED',reference_id=$1,verified_at=$2,last_error=NULL,lease_until=NULL,lease_token=NULL WHERE id=$3 AND lease_token=$4",
        [data.referenceId, data.verifiedAt, job.id, token],
      );
    } catch (e) {
      await this.db.pool.query(
        `UPDATE verification_jobs SET status=$1,last_error=$2,available_at=now()+($3*interval '1 second'),lease_until=NULL,lease_token=NULL WHERE id=$4 AND lease_token=$5`,
        [
          job.attempt >= 4 ? "FAILED" : "PENDING",
          e instanceof Error && /^Registry HTTP [0-9]{3}$/.test(e.message)
            ? e.message
            : "Registry unavailable or invalid response",
          2 ** (job.attempt - 1),
          job.id,
          token,
        ],
      );
    }
  }
}
