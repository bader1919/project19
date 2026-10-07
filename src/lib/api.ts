import { supabase } from "./supabase";

/** Call one of the Netlify functions with the signed-in user's session. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
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
