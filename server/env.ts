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
