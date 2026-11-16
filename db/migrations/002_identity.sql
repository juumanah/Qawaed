CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  name varchar(120) NOT NULL,
  email varchar(254) UNIQUE NOT NULL CHECK (email = lower(email)),
  password_hash text NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('SUBMITTER','AUDITOR','ADMIN')),
  CHECK ((role = 'ADMIN' AND tenant_id IS NULL) OR
         (role <> 'ADMIN' AND tenant_id IS NOT NULL))
);
CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX sessions_user_idx ON sessions(user_id);
REVOKE ALL ON users, sessions FROM PUBLIC;
-- Identity tables are server-internal; no user-management endpoints exist.
GRANT SELECT ON users TO qawaed_app;
GRANT SELECT, INSERT, DELETE ON sessions TO qawaed_app;
