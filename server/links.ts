import type { DescriptionInfo, ExtractedLink, TranscriptSegment } from "../shared/types";

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`«»]+/gi;
const HAS_URL_RE = /\b(?:https?:\/\/|www\.)\S/i;
// Trailing punctuation (Latin + Arabic) that is almost never part of a URL.
const TRAILING_CHARS = new Set([...".,;:!?'\"»]}>،؛؟…"]);

export const SHORTENER_HOSTS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "buff.ly", "amzn.to", "amzn.eu",
  "rebrand.ly", "cutt.ly", "is.gd", "shorturl.at", "lnkd.in", "geni.us", "tiny.cc", "rb.gy",
]);

function cleanUrl(raw: string): string | null {
  let url = raw;
  for (;;) {
    const last = url.at(-1);
    if (!last) return null;
    if (TRAILING_CHARS.has(last)) {
      url = url.slice(0, -1);
    } else if (last === ")" && (url.match(/\(/g) ?? []).length < (url.match(/\)/g) ?? []).length) {
      // drop ")" only when it closes a paren opened outside the URL, keep wiki-style "Foo_(bar)"
      url = url.slice(0, -1);
    } else {
      break;
    }
  }
  if (/^www\./i.test(url)) url = `https://${url}`;
  try {
    const u = new URL(url);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

const EDGE_PUNCT_RE = /^[\s:\-–—>|•]+|[\s:\-–—>|•]+$/g;

function contextForLine(lines: string[], i: number, rawUrl: string): string {
  const own = lines[i].replace(rawUrl, "").replace(EDGE_PUNCT_RE, "").trim();
  if (own.length >= 3) return own.slice(0, 200);
  // "Tool name:" on the line above, URL alone on its own line
  for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
    const prev = lines[j].trim();
    if (!prev) continue;
    if (HAS_URL_RE.test(prev)) break;
    return prev.replace(EDGE_PUNCT_RE, "").slice(0, 200);
  }
  return "";
}

/** Every URL in the video description, with the text around it as context. */
export function extractDescriptionLinks(description: string): ExtractedLink[] {
  const out: ExtractedLink[] = [];
  const seen = new Set<string>();
  const lines = description.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(URL_RE)) {
      const url = cleanUrl(m[0]);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, domain: domainOf(url), context: contextForLine(lines, i, m[0]), source: "description", timestamp_sec: null });
    }
  });
  return out;
}

/** URLs that appear in caption text (rare but valuable), with their timestamp. */
export function extractTranscriptLinks(segments: TranscriptSegment[]): ExtractedLink[] {
  const out: ExtractedLink[] = [];
  const seen = new Set<string>();
  for (const seg of segments) {
    for (const m of seg.text.matchAll(URL_RE)) {
      const url = cleanUrl(m[0]);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, domain: domainOf(url), context: seg.text.slice(0, 200), source: "transcript", timestamp_sec: Math.floor(seg.start) });
    }
  }
  return out;
}

export function mergeLinks(...lists: ExtractedLink[][]): ExtractedLink[] {
  const seen = new Set<string>();
  const out: ExtractedLink[] = [];
  for (const l of lists.flat()) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    out.push(l);
  }
  return out;
}

const CHAPTER_RE = /^\s*[([]?((?:\d{1,2}:)?\d{1,2}:\d{2})[)\]]?\s*[-–—:|]?\s*(.+?)\s*$/;

export function parseTimestamp(ts: string): number {
  return ts.split(":").map(Number).reduce((acc, n) => acc * 60 + n, 0);
}

/** "00:00 Intro" style chapter lines from a description. */
export function extractChapters(description: string): DescriptionInfo[] {
  const chapters: DescriptionInfo[] = [];
  for (const line of description.split(/\r?\n/)) {
    const m = line.match(CHAPTER_RE);
    if (!m) continue;
    const title = m[2].replace(URL_RE, "").trim();
    if (!title) continue;
    chapters.push({ kind: "chapter", text: title, timestamp_sec: parseTimestamp(m[1]) });
  }
  // A real chapter list starts at 0:00 and has at least 2 entries.
  return chapters.length >= 2 && chapters[0].timestamp_sec === 0 ? chapters : [];
}

/** True for hosts a server-side request must never reach (loopback, private, link-local, metadata). */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (!h.includes(".") && !h.includes(":")) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (h.includes(":")) return h === "::1" || h === "::" || /^(fc|fd|fe8|fe9|fea|feb)/.test(h) || h.startsWith("::ffff:");
  return false;
}

/**
 * Resolve link-shortener URLs to their destination (best effort, bounded time).
 * Redirects are followed by hand, one hop at a time, and never into private networks.
 */
export async function expandShortLinks<T extends { url: string; original_url?: string | null; domain: string }>(
  links: T[],
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<T[]> {
  return Promise.all(
    links.map(async (l) => {
      if (!SHORTENER_HOSTS.has(l.domain)) return l;
      try {
        let current = l.url;
        for (let hop = 0; hop < 5; hop++) {
          const res = await fetchImpl(current, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
          const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
          if (!location) break;
          const next = new URL(location, current);
          if (!/^https?:$/.test(next.protocol) || isPrivateHost(next.hostname)) break;
          current = next.toString();
          if (!SHORTENER_HOSTS.has(domainOf(current))) break; // reached the real site — no need to contact it
        }
        if (current !== l.url) return { ...l, original_url: l.url, url: current, domain: domainOf(current) };
      } catch {
        // keep the short link as-is
      }
      return l;
    }),
  );
}
