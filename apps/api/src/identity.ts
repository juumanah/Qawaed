export type Role = "SUBMITTER" | "AUDITOR" | "ADMIN";
export type Actor = {
  id: string;
  tenant_id: string | null;
  name: string;
  email: string;
  role: Role;
};
