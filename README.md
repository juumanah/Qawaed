# Qawaed | قواعد

**Every decision. Accounted for.**

Compliance work gets harder when it is unclear who can access a record, who can make a decision, and what changed along the way. Qawaed brings those responsibilities into one workflow, with separate data for each organization.

**Current progress:** sign-in, revocable sessions, tenant-scoped filings, controlled reviews, optimistic concurrency and append-only audit history are implemented. Registry verification and the full dashboard are next.

## Run

With Docker Desktop running, from the repository root:

```sh
docker compose up --build -d --wait --wait-timeout 300
```

Open http://localhost:3000. The homepage is still the foundation screen; the login/dashboard UI arrives in phase 5. API: http://localhost:4000. The web proxy exposes `/api/*`. Database: localhost:5432. These ports bind to loopback only.

Startup applies numbered SQL migrations and demo seed data without overwriting existing tenants, user credentials or filings. Ten fixed demo filings cover all five statuses across the two organizations. Their first audit event is an imported seed snapshot, not a fabricated review history. Never edit an applied migration; introduce a new version. `docker compose down` preserves the database volume. Do not use `down -v` on data you want to retain.

## Demo identities

Local-demo password: `QawaedDemo!2026` (override `DEMO_PASSWORD` **before the first seed**). Changing it later does not reset existing passwords.

| Email | Role | Tenant |
| --- | --- | --- |
| submitter@aram.test | SUBMITTER | Aram Organics |
| auditor@aram.test | AUDITOR | Aram Organics |
| submitter@riyadh.test | SUBMITTER | Riyadh Logistics Group |
| auditor@riyadh.test | AUDITOR | Riyadh Logistics Group |
| admin@qawaed.test | ADMIN | Global read visibility |

Demo credentials and Compose database passwords are public development defaults. This Compose configuration is not a public production deployment.

## API contract

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /health | Public readiness probe; 503 when the DB probe fails |
| POST | /auth/login | Email/password; 200 plus HttpOnly session cookie |
| GET | /auth/me | Current server-verified identity; 401 without a valid session |
| POST | /auth/logout | Revoke session and clear cookie; safe to repeat |
| GET | /tenants | ADMIN only; 403 for tenant roles |
| GET | /tenants/:id | Own tenant or ADMIN; 404 for invisible/unknown tenant |
| GET | /filings | Scoped, newest-first list; optional status and page (20 rows/page) |
| GET | /filings/summary | Scoped counts grouped by state |
| GET | /filings/:id | Filing plus ordered audit history; invisible records return 404 |
| POST | /filings | SUBMITTER creates DRAFT; tenant and owner come from session |
| PATCH | /filings/:id | Owner replaces draft metadata; current version required |
| POST | /filings/:id/transitions | Role-controlled next state; current version required |

All POST and PATCH requests must carry `Origin: http://localhost:3000` (or the configured `WEB_ORIGIN`). Login accepts only `email` and `password`. Tenant ID and role come from the database session identity, never from request headers or the login body. Browser callers use `/api/auth/...` through the web proxy.

PowerShell example, using the web proxy and a cookie jar:

```powershell
$headers = @{ Origin = 'http://localhost:3000' }
$body = @{ email = 'submitter@aram.test'; password = 'QawaedDemo!2026' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/login' -Method Post -Headers $headers -ContentType 'application/json' -Body $body -SessionVariable qawaedSession
Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/me' -WebSession $qawaedSession
Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/logout' -Method Post -Headers $headers -WebSession $qawaedSession
```

## Tests

Use only a disposable demo/test database. The tests create sessions, test users and filings, temporarily edit and restore a tenant name, and run repeatable setup. They expect the supplied two-tenant/five-user seed; additional test users stay in the disposable test database.

```sh
docker compose run --rm api sh -c "node scripts/setup-db.mjs && npm test"
docker compose exec -T -e SMOKE_BASE_URL=http://web:3000 api node scripts/smoke-identity.mjs
docker compose exec -T -e SMOKE_BASE_URL=http://web:3000 api node scripts/smoke-filings.mjs
```

Jest runs 75 tests: 32 unit tests and 43 PostgreSQL/HTTP integration tests. This includes all 25 state pairs and 20 concurrent final decisions across two auditor accounts: one succeeds and 19 receive 409, with one final audit entry. The smoke scripts exercise the production web proxy, API and database together. The filings script leaves one clearly named demo filing per run for inspection. These are HTTP smoke checks, not browser UI tests.

Host development: Node.js 22+, PostgreSQL 17, `npm ci`. Supply `MIGRATION_DATABASE_URL`, `DATABASE_URL`, `APP_DB_PASSWORD` (16+ characters), `SEED_DEMO=true`, and optionally `DEMO_PASSWORD`/`WEB_ORIGIN` as process environment variables. Scripts do not automatically load `.env`. Then run `npm run db:setup`, `npm test`, `npm run build`; start development with `npm run dev:api` and `npm run dev:web` in separate terminals.

CI defines a PostgreSQL test/build job and a Compose production smoke job. Run the commands above to verify your checkout; check GitHub Actions after pushing to confirm the CI results.

## Architecture and security boundaries

- A modular monolith keeps deployment simple. Controllers handle HTTP; `AuthService`, `TenantsService` and `FilingsService` handle application operations; `Database` manages connections and scoped transactions.
- Passwords use bcrypt cost 12. Inputs longer than 72 UTF-8 bytes are rejected to avoid bcrypt truncation. Login returns the same error for an unknown account and an incorrect password.
- Sessions use 32 random bytes. Only SHA-256 token digests are stored. Cookies are HttpOnly, SameSite=Strict and expire after eight hours; logout deletes the server-side session. Roles are reread on each authenticated request.
- A global authentication guard protects routes by default. Only health, login and logout are explicitly public. The role guard denies access unless the route explicitly allows the current role.
- Tenant queries use a transaction-scoped server identity and PostgreSQL RLS. `SET LOCAL` clears scope at commit/rollback. The runtime DB role is neither superuser nor BYPASSRLS and does not own tables. ADMIN can read all tenant rows but cannot write them.
- RLS is defense against missing tenant filters in application queries, not against arbitrary SQL execution with the application's DB credential. Authentication tables are trusted server-internal tables; runtime can read users and manage sessions but cannot change users/roles. These tables have no public management endpoints.
- Origin checks, strict DTO validation, Helmet and no-store responses protect the HTTP boundary. Login is limited to 30 requests per 15 minutes per observed source IP on a single API instance. Behind the web proxy this may aggregate clients; do not enable broad `trust proxy` to work around it. A deployment with trusted proxies/multiple replicas needs explicitly scoped proxy trust and a shared limiter.
- `COOKIE_SECURE=false` supports local HTTP. A public deployment requires HTTPS, secure cookies, managed secrets, appropriate network controls and a deployment-specific review. No claim of absolute security is made.

## Filing decisions and audit integrity

A submitter can create and edit their own drafts and submit them. Auditors can see and review filings in their organization. ADMIN has global read access, without review/write permission. Keeping drafts private to their owner is a deliberate additional restriction within a tenant.

`DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED`

The transition body is `{ "version": 3, "status": "REJECTED", "rejection_reason": "Supporting evidence missing" }`. Rejections require a nonblank reason. Illegal transitions return 422, invalid payloads 400, role violations 403, invisible records 404, and stale versions 409. Authorization is checked before version/state validation. A stale terminal request returns 409; an illegal transition with the current version returns 422.

Create/edit metadata contains `title`, a ten-digit `identifier_cr`, `category` (`COMMERCIAL`, `HEALTH`, `TRANSPORT`, `ENVIRONMENT`) and `expiration_date` (`YYYY-MM-DD`, today or later in UTC). PATCH requires the complete metadata plus `version`. The category list is a demo vocabulary, not an assertion about a government registry. The CR belongs to the filing and is format-validated; no unrequested equality rule with the organization's CR is imposed.

Updates use `WHERE id = $id AND version = $expected` and increment the version once. PostgreSQL rechecks this predicate when simultaneous writes contend: a loser changes zero rows and gets 409. The client must refresh and let the reviewer reconsider; it must not silently retry a stale verdict.

A database trigger writes each creation, edit and transition audit in the same transaction, capturing actor identity and before/after snapshots. Rollback removes both changes. Audit ordering follows the filing version. RLS protects filings and their audit history, even when a query omits its tenant filter. Runtime credentials cannot insert, update or delete audit rows directly; database guards also reject terminal mutations and illegal lifecycle changes. A database owner remains a trusted operator, so this is not a cryptographic tamper-proof ledger.

Approval currently finishes the internal review only. Phase 4 will add verification in a separate job/result record so that retries cannot mutate a terminal filing. Existing approved demo filings will need job backfill in that migration.

## Remaining milestones

4. Registry verification, durable retries and idempotency.
5. shadcn UI, Arabic/English, browser acceptance and final documentation.

Password reset, user administration and MFA are outside this assessment milestone.
