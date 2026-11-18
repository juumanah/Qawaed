import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Database } from "../database/database";
import { Actor } from "../auth/identity";
import { assertTransition, assertTransitionRole } from "./filing.policy";
import { FilingDto, EditDto, TransitionDto, ListDto } from "./filing.dto";
type FilingRow = {
  id: string;
  tenant_id: string;
  created_by: string;
  title: string;
  identifier_cr: string;
  category: string;
  expiration_date: string;
  status: string;
  version: number;
  assigned_reviewer_id: string | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
};
function validateFiling(d: FilingDto) {
  const date = new Date(d.expiration_date + "T00:00:00Z");
  if (
    d.title.trim().length < 3 ||
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== d.expiration_date ||
    d.expiration_date < new Date().toISOString().slice(0, 10)
  )
    throw new BadRequestException(
      "A valid current or future expiration date and title are required",
    );
}
@Injectable()
export class FilingsService {
  constructor(private db: Database) {}
  list(actor: Actor, q: ListDto) {
    return this.db.scoped(actor, async (c) => {
      const params = [
        q.status ?? null,
        actor.role === "SUBMITTER" ? actor.id : null,
      ];
      const where =
        "WHERE ($1::text IS NULL OR f.status=$1) AND ($2::uuid IS NULL OR f.created_by=$2)";
      const total = await c.query(
        `SELECT count(*)::int AS count FROM compliance_filings f ${where}`,
        params,
      );
      const result = await c.query(
        `SELECT f.*,t.name AS tenant_name FROM compliance_filings f JOIN tenants t ON t.id=f.tenant_id ${where} ORDER BY f.created_at DESC,f.id LIMIT 20 OFFSET $3`,
        [...params, (q.page - 1) * 20],
      );
      return {
        items: result.rows,
        total: total.rows[0].count,
        page: q.page,
        pageSize: 20,
      };
    });
  }
  summary(actor: Actor) {
    return this.db.scoped(
      actor,
      async (c) =>
        (
          await c.query(
            "SELECT status,count(*)::int AS count FROM compliance_filings WHERE ($1::uuid IS NULL OR created_by=$1) GROUP BY status",
            [actor.role === "SUBMITTER" ? actor.id : null],
          )
        ).rows,
    );
  }
  detail(actor: Actor, id: string) {
    return this.db.scoped(actor, async (c) => {
      const r = await c.query(
        "SELECT f.*,t.name AS tenant_name FROM compliance_filings f JOIN tenants t ON t.id=f.tenant_id WHERE f.id=$1",
        [id],
      );
      const f = r.rows[0];
      this.visible(actor, f);
      const audit = await c.query(
        "SELECT * FROM audit_logs WHERE filing_id=$1 ORDER BY (metadata->'after'->>'version')::int,id",
        [id],
      );
      const verification = await c.query(
        "SELECT status,attempt,available_at,reference_id,verified_at,last_error FROM verification_jobs WHERE filing_id=$1",
        [id],
      );
      return {
        ...f,
        audit: audit.rows,
        verification: verification.rows[0] ?? null,
      };
    });
  }
  create(actor: Actor, dto: FilingDto) {
    if (actor.role !== "SUBMITTER") throw new ForbiddenException();
    validateFiling(dto);
    return this.db.scoped(
      actor,
      async (c) =>
        (
          await c.query(
            "INSERT INTO compliance_filings(tenant_id,created_by,title,identifier_cr,category,expiration_date) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              actor.tenant_id,
              actor.id,
              dto.title.trim(),
              dto.identifier_cr,
              dto.category,
              dto.expiration_date,
            ],
          )
        ).rows[0],
    );
  }
  edit(actor: Actor, id: string, dto: EditDto) {
    if (actor.role !== "SUBMITTER") throw new ForbiddenException();
    validateFiling(dto);
    return this.db.scoped(actor, async (c) => {
      const f = (
        await c.query("SELECT * FROM compliance_filings WHERE id=$1", [id])
      ).rows[0];
      this.visible(actor, f);
      this.version(f, dto.version);
      if (f.status !== "DRAFT")
        throw new UnprocessableEntityException("Only drafts can be edited");
      const r = await c.query(
        "UPDATE compliance_filings SET title=$1,identifier_cr=$2,category=$3,expiration_date=$4,version=version+1 WHERE id=$5 AND version=$6 RETURNING *",
        [
          dto.title.trim(),
          dto.identifier_cr,
          dto.category,
          dto.expiration_date,
          id,
          dto.version,
        ],
      );
      if (!r.rowCount)
        throw new ConflictException("Filing changed; refresh before retrying");
      return r.rows[0];
    });
  }
  transition(actor: Actor, id: string, dto: TransitionDto) {
    return this.db.scoped(actor, async (c) => {
      const f = (
        await c.query("SELECT * FROM compliance_filings WHERE id=$1", [id])
      ).rows[0];
      this.visible(actor, f);
      assertTransitionRole(actor.role, dto.status);

      // the reviewer maybe acting on an older copy of this filing soo
      // ask them to refresh instead of overwriting a newer decision

      this.version(f, dto.version);
      assertTransition(f.status, dto.status, dto.rejection_reason);

      //check the version again inside the update: another req couldve changed the filing since we read it

      const r = await c.query(
        `UPDATE compliance_filings SET status=$1,version=version+1,rejection_reason=$2,assigned_reviewer_id=CASE WHEN $1='UNDER_REVIEW' THEN $3 ELSE assigned_reviewer_id END WHERE id=$4 AND version=$5 RETURNING *`,
        [
          dto.status,
          dto.status === "REJECTED" ? dto.rejection_reason!.trim() : null,
          actor.id,
          id,
          dto.version,
        ],
      );
      if (!r.rowCount)
        throw new ConflictException(
          "Another reviewer changed this filing; refresh",
        );
      return r.rows[0];
    });
  }
  private visible(
    actor: Actor,
    f: FilingRow | undefined,
  ): asserts f is FilingRow {
    if (!f || (actor.role === "SUBMITTER" && f.created_by !== actor.id))
      throw new NotFoundException("Filing not found");
  }

  private version(f: FilingRow, v: number) {
    if (f.version !== v)
      throw new ConflictException("Filing changed; refresh before retrying");
  }
}
