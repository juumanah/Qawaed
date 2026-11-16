# Qawaed | قواعد

**Every decision. Accounted for.**

Compliance work gets harder when it is unclear who can access a record, who can make a decision, and what changed along the way. Qawaed brings those responsibilities into one workflow, with separate data for each organization.

**Current progress:** sign-in, revocable sessions, role checks and tenant isolation are implemented. Filing reviews, audit history, registry verification and the full dashboard are the next milestones.

## Run

With Docker Desktop running, from the repository root:

```sh
docker compose up --build -d --wait --wait-timeout 300
```

Open http://localhost:3000. The homepage is still the foundation screen; the login/dashboard UI arrives in phase 5. API: http://localhost:4000. The web proxy exposes `/api/*`. Database: localhost:5432. These ports bind to loopback only.

Startup applies numbered SQL migrations and demo seed data without overwriting existing tenants or user credentials. Never edit an applied migration; introduce a new version. `docker compose down` preserves the database volume. Do not use `down -v` on data you want to retain.

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

All POST requests must carry `Origin: http://localhost:3000` (or the configured `WEB_ORIGIN`). Login accepts only `email` and `password`. Tenant ID and role come from the database session identity, never from request headers or the login body. Browser callers use `/api/auth/...` through the web proxy.

PowerShell example, using the web proxy and a cookie jar:

```powershell
$headers = @{ Origin = 'http://localhost:3000' }
$body = @{ email = 'submitter@aram.test'; password = 'QawaedDemo!2026' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/login' -Method Post -Headers $headers -ContentType 'application/json' -Body $body -SessionVariable qawaedSession
Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/me' -WebSession $qawaedSession
Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/logout' -Method Post -Headers $headers -WebSession $qawaedSession
```

## Tests

Use only a disposable demo/test database. The tests create sessions, temporarily edit and restore a tenant name, and run repeatable setup. They expect the supplied two-tenant/five-user seed.

```sh
docker compose run --rm api sh -c "node scripts/setup-db.mjs && npm test"
docker compose exec -T -e SMOKE_BASE_URL=http://web:3000 api node scripts/smoke-identity.mjs
```

The first command runs 26 Jest/Supertest tests: 5 unit tests and 21 integration/HTTP tests against PostgreSQL. The second checks the running production web proxy, API and database together, including login, cross-tenant rejection, ADMIN visibility and logout replay. It is an HTTP smoke check, not a browser UI test.

Host development: Node.js 22+, PostgreSQL 17, `npm ci`. Supply `MIGRATION_DATABASE_URL`, `DATABASE_URL`, `APP_DB_PASSWORD` (16+ characters), `SEED_DEMO=true`, and optionally `DEMO_PASSWORD`/`WEB_ORIGIN` as process environment variables. Scripts do not automatically load `.env`. Then run `npm run db:setup`, `npm test`, `npm run build`; start development with `npm run dev:api` and `npm run dev:web` in separate terminals.

CI defines a PostgreSQL test/build job and a Compose production smoke job. Run the commands above to verify your checkout; check GitHub Actions after pushing to confirm the CI results.

## Architecture and security boundaries

- A modular monolith keeps deployment simple. Controllers handle HTTP; `AuthService` and `TenantsService` handle application operations; `Database` manages connections and scoped transactions.
- Passwords use bcrypt cost 12. Inputs longer than 72 UTF-8 bytes are rejected to avoid bcrypt truncation. Login returns the same error for an unknown account and an incorrect password.
- Sessions use 32 random bytes. Only SHA-256 token digests are stored. Cookies are HttpOnly, SameSite=Strict and expire after eight hours; logout deletes the server-side session. Roles are reread on each authenticated request.
- A global authentication guard protects routes by default. Only health, login and logout are explicitly public. The role guard denies access unless the route explicitly allows the current role.
- Tenant queries use a transaction-scoped server identity and PostgreSQL RLS. `SET LOCAL` clears scope at commit/rollback. The runtime DB role is neither superuser nor BYPASSRLS and does not own tables. ADMIN can read all tenant rows but cannot write them.
- RLS is defense against missing tenant filters in application queries, not against arbitrary SQL execution with the application's DB credential. Authentication tables are trusted server-internal tables; runtime can read users and manage sessions but cannot change users/roles. These tables have no public management endpoints.
- Origin checks, strict DTO validation, Helmet and no-store responses protect the HTTP boundary. Login is limited to 30 requests per 15 minutes per observed source IP on a single API instance. Behind the web proxy this may aggregate clients; do not enable broad `trust proxy` to work around it. A deployment with trusted proxies/multiple replicas needs explicitly scoped proxy trust and a shared limiter.
- `COOKIE_SECURE=false` supports local HTTP. A public deployment requires HTTPS, secure cookies, managed secrets, appropriate network controls and a deployment-specific review. No claim of absolute security is made.

## Remaining milestones

3. Filings, state transitions, optimistic concurrency and immutable audit history. Tenant isolation must then be tested on filings and audit logs too.
4. Registry verification, durable retries and idempotency.
5. shadcn UI, Arabic/English, browser acceptance and final documentation.

The current tenant tests prove isolation of tenant records only; business entities do not exist yet. Submitter/auditor workflow permissions will be enforced when those operations are implemented. Password reset, user administration and MFA are outside this assessment milestone.
