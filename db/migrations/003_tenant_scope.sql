ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_read ON tenants FOR SELECT TO qawaed_app USING (
  current_setting('app.role', true) = 'ADMIN'
  OR id = nullif(current_setting('app.tenant_id', true), '')::uuid
);
GRANT SELECT ON tenants TO qawaed_app;
-- No write grants: even ADMIN has read-only cross-tenant visibility.
