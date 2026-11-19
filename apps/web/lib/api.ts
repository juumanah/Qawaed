import { retryAfterSeconds } from "./retry-after";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch("/api" + path, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(
      res.status,
      Array.isArray(data.message)
        ? data.message.join(", ")
        : (data.message ?? "Request failed"),
      res.status === 429 ? retryAfterSeconds(res.headers.get("Retry-After")) : undefined,
    );
  return data;
}
export type Actor = {
  id: string;
  name: string;
  role: "SUBMITTER" | "AUDITOR" | "ADMIN";
  tenant_id: string | null;
  email: string;
};
export type Filing = {
  id: string;
  title: string;
  tenant_name: string;
  identifier_cr: string;
  category: string;
  expiration_date: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  rejection_reason: string | null;
  verification_status?: string;
  verification?: {
    status: string;
    attempt: number;
    reference_id: string | null;
    last_error: string | null;
    verified_at?: string | null;
  } | null;
  audit?: {
    id: string;
    actor_name: string;
    action: string;
    previous_state: string | null;
    new_state: string;
    timestamp: string;
    metadata: {
      before: Record<string, unknown> | null;
      after: Record<string, unknown>;
    };
  }[];
};
