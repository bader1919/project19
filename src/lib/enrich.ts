import { openAlexKey, parseOpenAlexWork, type PaperMeta } from "../../shared/resources";

/**
 * Optional details for repositories (GitHub) and papers (OpenAlex), fetched in the browser from their
 * public APIs. No keys. Results are cached in memory and localStorage; every failure is quiet.
 */

export interface RepoMeta { description: string | null; stars: number; language: string | null; archived: boolean; pushed_at: string | null }

const DAY = 24 * 3600 * 1000;
const memory = new Map<string, unknown>();

function readCache<T>(store: string, key: string, ttl: number): T | undefined {
  const k = `${store}:${key}`;
  if (memory.has(k)) return memory.get(k) as T;
  try {
    const raw = JSON.parse(localStorage.getItem(`refvault.${k}`) ?? "null") as { at: number; v: T } | null;
    if (raw && Date.now() - raw.at < ttl) { memory.set(k, raw.v); return raw.v; }
  } catch { /* storage blocked or corrupt: just fetch again */ }
  return undefined;
}
function writeCache(store: string, key: string, v: unknown) {
  const k = `${store}:${key}`;
  memory.set(k, v);
  try { localStorage.setItem(`refvault.${k}`, JSON.stringify({ at: Date.now(), v })); } catch { /* full or blocked */ }
}

export const cachedRepo = (name: string) => readCache<RepoMeta | null>("gh", name.toLowerCase(), DAY);

export class RateLimited extends Error {}

/** Returns null when the repository is gone or private; throws RateLimited when GitHub's hourly allowance is used up. */
export async function fetchRepoMeta(name: string): Promise<RepoMeta | null> {
  const hit = cachedRepo(name);
  if (hit !== undefined) return hit;
  const res = await fetch(`https://api.github.com/repos/${name}`, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 403 || res.status === 429) throw new RateLimited("GitHub is limiting requests");
  if (res.status === 404) { writeCache("gh", name.toLowerCase(), null); return null; }
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const j = await res.json() as { description?: string | null; stargazers_count?: number; language?: string | null; archived?: boolean; pushed_at?: string | null };
  const meta: RepoMeta = { description: j.description ?? null, stars: j.stargazers_count ?? 0, language: j.language ?? null, archived: !!j.archived, pushed_at: j.pushed_at ?? null };
  writeCache("gh", name.toLowerCase(), meta);
  return meta;
}

export const cachedPaper = (url: string) => {
  const key = openAlexKey(url);
  return key ? readCache<PaperMeta | null>("oa", key, 30 * DAY) : undefined;
};

/** Title, authors and year from OpenAlex, or null when the link has no identifier or OpenAlex doesn't know it. */
export async function fetchPaperMeta(url: string): Promise<PaperMeta | null> {
  const key = openAlexKey(url);
  if (!key) return null;
  const hit = readCache<PaperMeta | null>("oa", key, 30 * DAY);
  if (hit !== undefined) return hit;
  const res = await fetch(`https://api.openalex.org/works/${key}?select=title,display_name,publication_year,authorships,primary_location`);
  if (res.status === 404) { writeCache("oa", key, null); return null; }
  if (!res.ok) throw new Error(`OpenAlex answered ${res.status}`);
  const meta = parseOpenAlexWork(await res.json());
  writeCache("oa", key, meta);
  return meta;
}

/** Runs `fn` over `items` with at most `limit` in flight; stops early when `signal` aborts. */
export async function pool<T>(items: T[], limit: number, fn: (x: T) => Promise<void>, signal: { aborted: boolean }) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length && !signal.aborted) await fn(items[i++]);
  }));
}
