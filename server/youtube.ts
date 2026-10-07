import { youtubeWatchUrl } from "../shared/youtube-url";
import type { TranscriptSegment } from "../shared/types";

type Fetch = typeof fetch;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
  // Skips the EU cookie-consent interstitial.
  Cookie: "CONSENT=YES+cb; SOCS=CAI",
};

// Same client the open-source youtube-transcript-api uses; its caption URLs
// don't require a proof-of-origin token.
const INNERTUBE_CLIENT = { clientName: "ANDROID", clientVersion: "20.10.38" };

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string; // "asr" = auto-generated
  name?: string;
}

export interface VideoMeta {
  youtube_id: string;
  title: string;
  channel: string | null;
  channel_url: string | null;
  description: string;
  thumbnail: string | null;
  published_at: string | null; // YYYY-MM-DD
  duration_sec: number | null;
}

export interface FetchedVideo {
  meta: VideoMeta;
  captionTracks: CaptionTrack[];
  /** Why captions could not be listed, when captionTracks is empty. */
  captionsError?: string;
}

/** Extract the JSON object literal that follows `marker` in an HTML page. */
export function extractJsonAfter(html: string, marker: string): unknown | null {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf("{", at + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function textOf(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v.simpleText === "string") return v.simpleText;
  if (Array.isArray(v.runs)) return v.runs.map((r: any) => r.text ?? "").join("");
  return "";
}

function tracksFrom(player: any): CaptionTrack[] {
  const list = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(list)) return [];
  return list
    .filter((t: any) => typeof t?.baseUrl === "string")
    .map((t: any) => ({
      baseUrl: t.baseUrl as string,
      languageCode: String(t.languageCode ?? ""),
      kind: t.kind,
      name: textOf(t.name),
    }));
}

export function metaFromPlayer(id: string, player: any): VideoMeta {
  const d = player?.videoDetails ?? {};
  const mf = player?.microformat?.playerMicroformatRenderer ?? {};
  const thumbs = d.thumbnail?.thumbnails ?? mf.thumbnail?.thumbnails ?? [];
  const publish = String(mf.publishDate ?? mf.uploadDate ?? "").slice(0, 10);
  const len = Number(d.lengthSeconds ?? mf.lengthSeconds);
  return {
    youtube_id: id,
    title: String(d.title ?? textOf(mf.title) ?? ""),
    channel: d.author ?? mf.ownerChannelName ?? null,
    channel_url: d.channelId ? `https://www.youtube.com/channel/${d.channelId}` : (mf.ownerProfileUrl ?? null),
    description: String(d.shortDescription ?? textOf(mf.description) ?? ""),
    thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    published_at: /^\d{4}-\d{2}-\d{2}$/.test(publish) ? publish : null,
    duration_sec: Number.isFinite(len) && len > 0 ? len : null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function oembedMeta(id: string, fetchImpl: Fetch): Promise<VideoMeta> {
  const res = await fetchImpl(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtubeWatchUrl(id))}`,
    { signal: AbortSignal.timeout(4000) },
  );
  if (!res.ok) throw new Error(`YouTube oEmbed returned ${res.status} (video private or removed?)`);
  const o = (await res.json()) as { title?: string; author_name?: string; author_url?: string; thumbnail_url?: string };
  return {
    youtube_id: id,
    title: o.title ?? "",
    channel: o.author_name ?? null,
    channel_url: o.author_url ?? null,
    description: "",
    thumbnail: o.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    published_at: null,
    duration_sec: null,
  };
}

/** Metadata, full description and caption track list for a video — no API key needed. */
export async function fetchVideo(id: string, fetchImpl: Fetch = fetch): Promise<FetchedVideo> {
  let html = "";
  try {
    const res = await fetchImpl(`${youtubeWatchUrl(id)}&hl=en`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) html = await res.text();
  } catch {
    // fall through to oEmbed
  }

  const pagePlayer = html ? extractJsonAfter(html, "ytInitialPlayerResponse") : null;
  if (!pagePlayer || !(pagePlayer as { videoDetails?: unknown }).videoDetails) {
    const meta = await oembedMeta(id, fetchImpl);
    return { meta, captionTracks: [], captionsError: "YouTube did not serve the video page to the server" };
  }
  const meta = metaFromPlayer(id, pagePlayer);

  // Prefer the InnerTube player endpoint for caption URLs; fall back to the page's own list.
  let captionTracks: CaptionTrack[] = [];
  let captionsError: string | undefined;
  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  if (apiKey) {
    try {
      const res = await fetchImpl(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": BROWSER_HEADERS["Accept-Language"] },
        body: JSON.stringify({ context: { client: INNERTUBE_CLIENT }, videoId: id }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) captionTracks = tracksFrom(await res.json());
      else captionsError = `YouTube player API returned ${res.status}`;
    } catch (e) {
      captionsError = `YouTube player API failed: ${(e as Error).message}`;
    }
  }
  if (!captionTracks.length) captionTracks = tracksFrom(pagePlayer);
  if (!captionTracks.length && !captionsError) captionsError = "This video has no captions";
  return { meta, captionTracks, captionsError: captionTracks.length ? undefined : captionsError };
}

/**
 * Pick the best caption track: a human-made track in the spoken language,
 * otherwise the auto-generated one, otherwise Arabic/English, otherwise anything.
 */
export function pickCaptionTrack(tracks: CaptionTrack[], preferred: string[] = ["ar", "en"]): CaptionTrack | null {
  if (!tracks.length) return null;
  const base = (code: string) => code.toLowerCase().split(/[-_]/)[0];
  const asr = tracks.find((t) => t.kind === "asr");
  const manual = tracks.filter((t) => t.kind !== "asr");
  if (asr) {
    const spoken = base(asr.languageCode);
    return manual.find((t) => base(t.languageCode) === spoken) ?? asr;
  }
  for (const lang of preferred) {
    const t = manual.find((m) => base(m.languageCode) === lang);
    if (t) return t;
  }
  return manual[0] ?? tracks[0];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  // Captions are frequently double-encoded ("&amp;#39;"), so decode twice.
  const once = (t: string) =>
    t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const cp = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
  return once(once(s));
}

function clean(text: string): string {
  return decodeEntities(text.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** Parse YouTube timedtext XML (classic `<text start dur>` or srv3 `<p t d>`). */
export function parseTimedText(xml: string): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

  for (const m of xml.matchAll(/<text\b([^>]*?)(?:\/>|>([\s\S]*?)<\/text>)/g)) {
    const text = clean(m[2] ?? "");
    if (!text) continue;
    out.push({ start: Number(attr(m[1], "start") ?? 0), dur: Number(attr(m[1], "dur") ?? 0), text });
  }
  if (out.length) return out;

  for (const m of xml.matchAll(/<p\b([^>]*?)(?:\/>|>([\s\S]*?)<\/p>)/g)) {
    const text = clean(m[2] ?? "");
    if (!text) continue;
    out.push({ start: Number(attr(m[1], "t") ?? 0) / 1000, dur: Number(attr(m[1], "d") ?? 0) / 1000, text });
  }
  return out;
}

export async function downloadCaptionTrack(track: CaptionTrack, fetchImpl: Fetch = fetch): Promise<TranscriptSegment[]> {
  const url = track.baseUrl.replace(/&fmt=[^&]*/, "");
  const res = await fetchImpl(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Caption download returned ${res.status}`);
  const xml = await res.text();
  if (!xml.trim()) throw new Error("YouTube returned an empty caption file (blocked from this server)");
  return parseTimedText(xml);
}
