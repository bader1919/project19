import { supabase } from "./supabase";

/**
 * Where the RefVault API lives: the Supabase Edge Function in production
 * (VITE_API_BASE=https://<project>.supabase.co/functions/v1/refvault) or the
 * Netlify functions under /api during local development.
 */
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || "/api").replace(/\/+$/, "");

/** Call the RefVault API ("/ingest", "/token") with the signed-in user's session. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export interface IngestResult {
  item_id: string;
  already_saved: boolean;
  title: string;
  status: string;
  transcript_source: string | null;
  transcript_errors: { source: string; error: string }[];
  link_count: number;
}
