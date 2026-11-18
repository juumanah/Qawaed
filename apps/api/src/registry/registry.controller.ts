import {
  Body,
  Controller,
  Headers,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { RegistryDatabase } from "./registry.database";
import { Public } from "../auth/auth.guard";
import { VerifyDto } from "./verify.dto";
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
