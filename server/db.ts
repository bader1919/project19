import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

export type Db = SupabaseClient;

let admin: Db | null = null;

/** Service-role client. Bypasses RLS, so every query must filter by user_id. */
export function adminDb(): Db {
  if (admin) return admin;
  const url = env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** Throw on Supabase errors so callers can use plain values. */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what}: no data returned`);
  return res.data;
}

/** Throw on Supabase errors for writes that return no rows. */
export function ok(res: { error: { message: string } | null }, what: string): void {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
}
