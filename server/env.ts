/** Read configuration in Node (Netlify) and Deno (Supabase Edge Functions) alike. */
export function env(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
  if (deno) {
    try {
      const v = deno.env.get(name);
      if (v !== undefined) return v;
    } catch {
      // permission denied — fall through
    }
  }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

/**
 * Keep working after the response is sent (Supabase Edge: EdgeRuntime.waitUntil).
 * Elsewhere the promise just runs as long as the process lives; the cron worker covers the rest.
 */
export function background(p: Promise<unknown>): void {
  const safe = p.catch((e) => console.error("background task failed:", e));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  rt?.waitUntil?.(safe);
}
