# Qawaed | قواعد

**Every decision. Accounted for.**

Compliance work gets harder when it is unclear who can access a record, who can make a decision, and what changed along the way. Qawaed brings those responsibilities into one workflow, with separate data for each organization.

Qawaed includes an Arabic/English workspace for submitting and reviewing filings, revocable sessions, tenant isolation, version-checked decisions, append-only audit history and background registry verification.

## Run

With Docker Desktop running, from the repository root:

```sh
docker compose up --build -d --wait --wait-timeout 300
```

Open http://localhost:3000 and sign in with one of the demo identities below. API: http://localhost:4000. The web proxy exposes `/api/*`. Database: localhost:5432. These ports bind to loopback only. If port 5432 is already occupied by a local PostgreSQL service, resolve that conflict before starting Compose.

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

## Using the workspace

- **Submitter:** create a draft in the validated two-step form, review its metadata, save it, then submit it for review. Drafts remain editable until submitted.
- **Auditor:** start with filings under review, or select submitted filings to begin a review. Approval and rejection require an explicit decision; rejection also requires a reason.
- **Admin:** browse filings across organizations with read-only access.
- Use the header language toggle for Arabic/RTL or English/LTR. The language preference is stored locally; authentication stays in an HttpOnly cookie.
- The primary review card and smaller status cards filter the list. The status menu also includes drafts and all filings. Desktop uses a table; narrow screens use filing cards.
- Search matches the title or registry number **within the currently loaded page**, not the entire database. Lists contain up to 20 filings per page; pagination appears when needed.
- Details show filing metadata, workflow progress, a separate registry result and an expandable audit timeline. A stale decision loads the latest filing and asks the reviewer to reconsider instead of retrying the old verdict.

## Code map

| Location | Responsibility |
| --- | --- |
| `apps/web/app/page.tsx` | Composes the workspace and dialogs |
| `apps/web/hooks/use-workspace.ts` | Session state, requests, stale-response guards, polling and decisions |
| `apps/web/components/workspace/` | Status summary, filing list and navigation |
| `apps/web/components/` | Login, filing wizard and filing details |
| `apps/web/components/ui/` | Shared shadcn/ui primitives |
| `apps/web/lib/` | API client, types and Arabic/English text |
| `apps/web/styles/` | Shared, workspace, dialog and login CSS; imported by `app/globals.css` |
| `apps/api/src/app.ts`, `app.module.ts` | HTTP configuration and Nest dependency registration |
| `apps/api/src/auth/` | Sessions, authentication and role guards |
| `apps/api/src/filings/`, `tenants/` | Controllers, services and filing policy/DTOs |
| `apps/api/src/registry/` | Mock endpoint, durable worker and restricted worker pool |
| `apps/api/src/database/`, `health/` | Scoped transactions and readiness |
| `apps/api/test/` | Unit and PostgreSQL/HTTP integration tests |
| `db/migrations/`, `scripts/` | Versioned database setup, demo seed and verification scripts |

Feature folders share one Nest application module and one deployment. The worker runs inside the API process; separate folders do not imply separate services.

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
| GET | /filings/:id | Filing plus ordered audit history and a separate verification result; invisible records return 404 |
| POST | /filings | SUBMITTER creates DRAFT; tenant and owner come from session |
| PATCH | /filings/:id | Owner replaces draft metadata; current version required |
| POST | /filings/:id/transitions | Role-controlled next state; current version required |
| POST | /mock-registry/verify | Service-secret authenticated mock; validated idempotency header required |

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

The isolated test runner creates a uniquely named temporary database and removes it after the run. It does not test against or clear your demo database. Run one test process at a time per local PostgreSQL instance; setup uses shared application/worker roles with the configured passwords.

```sh
docker compose run --rm api npm run test:isolated
docker compose exec -T -e SMOKE_BASE_URL=http://web:3000 api node scripts/smoke-identity.mjs
docker compose exec -T -e SMOKE_BASE_URL=http://web:3000 -e SMOKE_REGISTRY=true api node scripts/smoke-filings.mjs
```

Jest runs 95 tests: 32 unit tests and 63 PostgreSQL/HTTP integration tests. The 20 registry tests cover durable deduplication, backoff, competing workers, stale leases, crash reconciliation, terminal immutability and access boundaries. This includes all 25 state pairs and 20 concurrent final decisions across two auditor accounts: one succeeds and 19 receive 409, with one final audit entry. The smoke scripts exercise the production web proxy, API and database together. The filings script leaves one clearly named demo filing per run for inspection. With `SMOKE_REGISTRY=true`, it also waits for the asynchronous result. The 30% failure simulation remains enabled: VERIFIED and a bounded FAILED after four attempts are both valid terminal outcomes, and the script prints which occurred. Deterministic tests force both success and failure. These are HTTP smoke checks, not browser UI tests.

Host development: Node.js 22+, PostgreSQL 17, `npm ci`. Supply `MIGRATION_DATABASE_URL`, `DATABASE_URL`, `APP_DB_PASSWORD` (16+ characters), `SEED_DEMO=true`, `WORKER_DATABASE_URL`, `WORKER_DB_PASSWORD` (16+ characters), `REGISTRY_SECRET` (32+ characters), and optionally `DEMO_PASSWORD`/`WEB_ORIGIN` as process environment variables. Scripts do not automatically load `.env`. Set `WORKER_ENABLED=false` for direct tests, or use `npm run test:isolated`. Set `WORKER_ENABLED=true` to run the background worker during development (Compose already does this). Then run `npm run db:setup`, `npm run test:isolated`, `npm run build`; start development with `npm run dev:api` and `npm run dev:web` in separate terminals.

CI defines a PostgreSQL test/build job and a Compose production smoke job. Run the commands above to verify your checkout; check GitHub Actions after pushing to confirm the CI results.

## Architecture and security boundaries

- A modular monolith keeps deployment simple. Controllers handle HTTP; `AuthService`, `TenantsService` and `FilingsService` handle application operations; `Database` manages connections and scoped transactions.
- Passwords use bcrypt cost 12. Inputs longer than 72 UTF-8 bytes are rejected to avoid bcrypt truncation. Login returns the same error for an unknown account and an incorrect password.
- Sessions use 32 random bytes. Only SHA-256 token digests are stored. Cookies are HttpOnly, SameSite=Strict and expire after eight hours; logout deletes the server-side session. Roles are reread on each authenticated request.
- A global authentication guard protects routes by default. Health, login and logout bypass session authentication. The mock registry also bypasses sessions but requires a separate service secret; it is not an anonymously usable endpoint. The role guard denies access unless the route explicitly allows the current role.
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

## Registry verification and retry decisions

Approval enqueues a unique verification job in the same database transaction as the verdict and audit. A new migration also queues already-approved filings without editing their metadata or history. Re-running setup does not reset existing jobs.

A lightweight worker in the API process polls PostgreSQL every 500 ms. It claims one job using `FOR UPDATE SKIP LOCKED`, with a 30-second lease and a unique lease token. No Redis service is needed for this assessment. A worker with an expired token cannot overwrite a newer worker's result. At higher throughput, the same worker can move to a separate process; worker capacity and database load must then be measured.

The worker calls `POST /mock-registry/verify` with a five-second timeout, `X-Registry-Secret`, the configured Origin and `Idempotency-Key: filing-<uuid>-<attempt>`. The mock rejects unapproved/unknown filings and mismatched CRs. First-time validation returns 503 when `Math.random() < 0.3`. Already-recorded validations return their existing result, even during a simulated outage.

Failed calls are scheduled after 1, 2 and 4 seconds: four logical attempts in total, then FAILED. A crashed delivery is recovered after lease expiry with the **same** attempt number, including attempt four. This makes delivery at-least-once; it does not claim exactly-once HTTP delivery. Repeated process crashes can cause additional deliveries of a logical attempt. The database's unique filing ID ensures one validation record across different attempt keys and restarts. Invalid responses and transport failures are retried too; stored errors contain no raw connection details.

The worker's DB role can read/update job processing fields and read/insert mock results. It cannot read sessions, users or filings, change job identity fields, delete jobs or modify registry records. The normal API role can only read verification jobs through filing RLS, including submitter ownership. Both roles are non-superuser/non-BYPASSRLS. Credentials are separate but share one API process; process isolation is a possible later hardening step.

`GET /filings/:id` includes `verification: null` before approval, or a job summary with status, attempt, next available time, reference, timestamp and sanitized error. APPROVED remains the internal review verdict even if external verification ultimately fails. The result never rewrites a terminal filing or adds fictitious reviewer decisions to its audit. FAILED jobs need operator investigation; automatic infinite retry and a manual retry endpoint are deliberately not included.

## Scope and limitations

Password reset, user administration, MFA, file attachments and a live government registry connection are outside this implementation. The submission wizard collects metadata. Registry verification uses the simulated Nest endpoint. Search is page-local; no server-wide search endpoint is implemented.

Automated API checks do not replace browser acceptance. Before delivery, check both languages, narrow and wide layouts, keyboard navigation, account switching, form errors and conflicting decisions in two tabs. See `docs/UI_ATTRIBUTION.md` for interface references and attribution.
