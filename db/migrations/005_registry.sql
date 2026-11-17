-- Approval and enqueue commit together; final filings and their audit never change.
CREATE TABLE verification_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 filing_id uuid UNIQUE NOT NULL,
 identifier_cr text NOT NULL CHECK(identifier_cr ~ '^[0-9]{10}$'),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','VERIFIED','FAILED')),
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 4),
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 lease_token uuid,
 reference_id text,
 last_error text,
 verified_at timestamptz,
 FOREIGN KEY(filing_id,tenant_id) REFERENCES compliance_filings(id,tenant_id),
 CHECK((status='PROCESSING') = (lease_until IS NOT NULL AND lease_token IS NOT NULL)),
 CHECK(status<>'VERIFIED' OR (reference_id IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX verification_due ON verification_jobs(status,available_at);
CREATE TABLE registry_records (
 filing_id uuid PRIMARY KEY REFERENCES verification_jobs(filing_id),
 identifier_cr text NOT NULL,
 idempotency_key text NOT NULL UNIQUE,
 reference_id text UNIQUE NOT NULL DEFAULT ('REG-'||gen_random_uuid()::text),
 verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE verification_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_jobs FORCE ROW LEVEL SECURITY;
-- Reuse filing visibility, including submitter ownership within the same tenant.
CREATE POLICY jobs_read ON verification_jobs FOR SELECT TO qawaed_app USING (
 EXISTS(SELECT 1 FROM compliance_filings f WHERE f.id=filing_id AND f.tenant_id=verification_jobs.tenant_id)
);
CREATE POLICY jobs_worker ON verification_jobs TO qawaed_worker USING(true) WITH CHECK(true);
CREATE FUNCTION enqueue_verification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='APPROVED' THEN
   INSERT INTO verification_jobs(tenant_id,filing_id,identifier_cr)
   VALUES(NEW.tenant_id,NEW.id,NEW.identifier_cr) ON CONFLICT(filing_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION enqueue_verification() FROM PUBLIC;
CREATE TRIGGER filing_verification AFTER INSERT OR UPDATE ON compliance_filings
 FOR EACH ROW EXECUTE FUNCTION enqueue_verification();
-- Upgrades also schedule already-approved filings, without rewriting their history.
INSERT INTO verification_jobs(tenant_id,filing_id,identifier_cr)
 SELECT tenant_id,id,identifier_cr FROM compliance_filings WHERE status='APPROVED'
 ON CONFLICT(filing_id) DO NOTHING;
REVOKE ALL ON verification_jobs,registry_records FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO qawaed_worker;
GRANT SELECT ON verification_jobs TO qawaed_app,qawaed_worker;
GRANT UPDATE(status,attempt,available_at,lease_until,lease_token,reference_id,last_error,verified_at)
 ON verification_jobs TO qawaed_worker;
GRANT SELECT,INSERT ON registry_records TO qawaed_worker;
