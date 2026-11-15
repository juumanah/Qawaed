CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  identifier_cr varchar(20) UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- No business endpoints yet. Later milestones introduce scoped permissions and RLS.
REVOKE ALL ON tenants FROM PUBLIC;
