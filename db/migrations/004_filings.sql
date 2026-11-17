-- Runtime credentials may not create objects used by SECURITY DEFINER triggers.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE TABLE compliance_filings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), created_by uuid NOT NULL REFERENCES users(id),
 title varchar(255) NOT NULL CHECK(length(btrim(title))>=3), identifier_cr varchar(20) NOT NULL CHECK(identifier_cr ~ '^[0-9]{10}$'), category text NOT NULL CHECK(category IN ('COMMERCIAL','HEALTH','TRANSPORT','ENVIRONMENT')),
 expiration_date date NOT NULL, status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), assigned_reviewer_id uuid REFERENCES users(id), rejection_reason text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status <> 'REJECTED' OR length(btrim(rejection_reason))>0 AND rejection_reason IS NOT NULL), UNIQUE(id,tenant_id));
CREATE INDEX ON compliance_filings(tenant_id, created_at DESC);
CREATE INDEX ON compliance_filings(tenant_id,status);
CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, filing_id uuid NOT NULL, actor_id uuid REFERENCES users(id), actor_name text NOT NULL, action text NOT NULL, previous_state text, new_state text NOT NULL, metadata jsonb NOT NULL, timestamp timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(filing_id,tenant_id) REFERENCES compliance_filings(id,tenant_id));
CREATE INDEX ON audit_logs(tenant_id,filing_id,timestamp);
CREATE FUNCTION tenant_visible(target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT target = nullif(current_setting('app.tenant_id',true),'')::uuid $$;
ALTER TABLE compliance_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_filings FORCE ROW LEVEL SECURITY;
CREATE POLICY filings_read ON compliance_filings FOR SELECT TO qawaed_app USING((tenant_visible(tenant_id) AND (current_setting('app.role',true)='AUDITOR' OR (current_setting('app.role',true)='SUBMITTER' AND created_by=nullif(current_setting('app.actor_id',true),'')::uuid))) OR current_setting('app.role',true)='ADMIN');
CREATE POLICY filings_insert ON compliance_filings FOR INSERT TO qawaed_app WITH CHECK(tenant_visible(tenant_id) AND current_setting('app.role',true)='SUBMITTER' AND created_by=nullif(current_setting('app.actor_id',true),'')::uuid AND status='DRAFT' AND version=1 AND assigned_reviewer_id IS NULL AND rejection_reason IS NULL);
CREATE POLICY filings_update ON compliance_filings FOR UPDATE TO qawaed_app USING(tenant_visible(tenant_id) AND (current_setting('app.role',true)='AUDITOR' OR (current_setting('app.role',true)='SUBMITTER' AND created_by=nullif(current_setting('app.actor_id',true),'')::uuid))) WITH CHECK(tenant_visible(tenant_id));
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audits_read ON audit_logs FOR SELECT TO qawaed_app USING(EXISTS(SELECT 1 FROM compliance_filings f WHERE f.id=filing_id AND f.tenant_id=audit_logs.tenant_id));
CREATE FUNCTION protect_filing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_user='qawaed_app' THEN
  IF current_setting('app.role',true)='SUBMITTER' AND NOT (OLD.status='DRAFT' AND NEW.status IN ('DRAFT','SUBMITTED')) THEN RAISE EXCEPTION 'Submitter cannot review'; END IF;
  IF current_setting('app.role',true)='AUDITOR' AND NOT ((OLD.status='SUBMITTED' AND NEW.status='UNDER_REVIEW') OR (OLD.status='UNDER_REVIEW' AND NEW.status IN ('APPROVED','REJECTED'))) THEN RAISE EXCEPTION 'Auditor cannot edit or submit'; END IF;
 END IF;
 IF OLD.status IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'Terminal filing is immutable'; END IF;
 IF NEW.tenant_id<>OLD.tenant_id OR NEW.created_by<>OLD.created_by OR NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Identity is immutable'; END IF;
 IF OLD.status=NEW.status AND (NEW.assigned_reviewer_id,NEW.rejection_reason) IS DISTINCT FROM (OLD.assigned_reviewer_id,OLD.rejection_reason) THEN RAISE EXCEPTION 'Review fields cannot be edited'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Version must increment once'; END IF;
 IF OLD.status<>'DRAFT' AND (NEW.title,NEW.identifier_cr,NEW.category,NEW.expiration_date) IS DISTINCT FROM (OLD.title,OLD.identifier_cr,OLD.category,OLD.expiration_date) THEN RAISE EXCEPTION 'Only drafts are editable'; END IF;
 IF NEW.status<>OLD.status AND NOT ((OLD.status='DRAFT' AND NEW.status='SUBMITTED') OR (OLD.status='SUBMITTED' AND NEW.status='UNDER_REVIEW') OR (OLD.status='UNDER_REVIEW' AND NEW.status IN ('APPROVED','REJECTED'))) THEN RAISE EXCEPTION 'Illegal transition'; END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;
CREATE TRIGGER filing_guard BEFORE UPDATE ON compliance_filings FOR EACH ROW EXECUTE FUNCTION protect_filing();
CREATE FUNCTION record_filing_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO audit_logs(tenant_id,filing_id,actor_id,actor_name,action,previous_state,new_state,metadata)
 VALUES(NEW.tenant_id,NEW.id,nullif(current_setting('app.actor_id',true),'')::uuid,coalesce(nullif(current_setting('app.actor_name',true),''),'System seed'),CASE WHEN TG_OP='INSERT' THEN 'CREATED' WHEN OLD.status=NEW.status THEN 'UPDATED' ELSE 'TRANSITION' END,CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END,NEW.status,jsonb_build_object('before',CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,'after',to_jsonb(NEW)));
 RETURN NEW;
END $$;
CREATE TRIGGER filing_audit AFTER INSERT OR UPDATE ON compliance_filings FOR EACH ROW EXECUTE FUNCTION record_filing_change();
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit records are append-only'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON FUNCTION record_filing_change() FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON compliance_filings TO qawaed_app;
GRANT SELECT ON audit_logs TO qawaed_app;
