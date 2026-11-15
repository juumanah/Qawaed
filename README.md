# Qawaed — Phase 1: foundation

**Every decision. Accounted for.**

This repository reconstructs an existing AI-assisted prototype as reviewable milestones. It does not imply that the prototype was originally authored in this commit order. Each milestone is independently reviewed and verified. The full prototype is retained separately.

## Run

With Docker Desktop running, from this directory:

```sh
docker compose up --build
```

Open http://localhost:3000. Select **Check API readiness** to call the backend through the web proxy. Expected result: `{"status":"ok","database":"up"}`. Direct API: http://localhost:4000/health. PostgreSQL: localhost:5432.

Compose waits for PostgreSQL, runs versioned migrations and optional seed data, starts the API, then the web app. Ports bind only to loopback. Database credentials in Compose are public local-demo defaults. Do not deploy this configuration publicly. URL-encode any custom password used in database URLs.

Only the two tenant organizations are seeded in this milestone. Users, sample filings, authentication, RLS, workflow, registry verification and the finished shadcn interface are **not implemented in this branch yet**. Users and filings will be added in phases 2 and 3. This is not a complete assessment submission.

`docker compose down` preserves data. `docker compose down -v` deletes demo data: use only for an intentional disposable reset.

## Test

On a **dedicated disposable Compose stack**, run:

```sh
docker compose run --rm api sh -c "node scripts/setup-db.mjs && npm test"
```

The suite includes unit tests for readiness behavior and integration tests against PostgreSQL. Tests temporarily edit a seeded tenant and restore its name. Never point them at production.

For host development, use Node.js 22+ and PostgreSQL 17. In PowerShell:

```powershell
$env:MIGRATION_DATABASE_URL = "postgres://postgres:YOUR_PASSWORD@localhost:5432/qawaed_test"
$env:DATABASE_URL = "postgres://qawaed_app:local-application-password@localhost:5432/qawaed_test"
$env:APP_DB_PASSWORD = "local-application-password"
$env:SEED_DEMO = "true"
npm ci
npm run db:setup
npm test
npm run build
```

Create the disposable database `qawaed_test` beforehand. The scripts read process environment variables, not an implicit `.env`. Run `npm run dev:api` and `npm run dev:web` in separate terminals with the same environment for host development.

## Engineering choices

- Next.js App Router and NestJS, as required. The same locked dependency set is retained from the prototype, including packages used by later milestones.
- Separate migration and runtime database accounts: the API cannot alter tables or read tenant data at this stage. The migration credential is removed from the API process environment after startup in Docker.
- SQL migrations have a version ledger, transaction boundaries and a PostgreSQL advisory lock. Repeated setup does not reapply an existing migration or overwrite tenant edits.
- `/health` tests a real database connection and returns HTTP 503 on failure without returning internal database details.
- No filing endpoints are exposed before authentication and tenant isolation exist.

## Delivery milestones

1. Foundation and database bootstrap (current).
2. Sessions, roles and tenant isolation.
3. Filing lifecycle, concurrency protection and audit trail.
4. Registry integration, retry and deduplication.
5. Full UI, Arabic/English, browser acceptance and final documentation.

See `docs/PHASE_1_REVIEW.md` for requirement mapping and actual verification. CI configuration is provided but has not run on GitHub. Docker Compose execution remains a local/CI release gate.
