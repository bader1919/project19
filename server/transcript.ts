import type { TranscriptSegment } from "../shared/types";
import { youtubeWatchUrl } from "../shared/youtube-url";
import { downloadCaptionTrack, pickCaptionTrack, type CaptionTrack } from "./youtube";

type Fetch = typeof fetch;

export interface TranscriptResult {
  segments: TranscriptSegment[];
  lang: string | null;
  source: string;
}

/** Transcript API keys (Supadata, youtube-transcript.io). */
export interface TranscriptKeys {
  supadata_key?: string | null;
  ytio_key?: string | null;
}

export interface TranscriptAttempt {
  source: string;
  error: string;
}

/** Free: download the caption track YouTube already lists for the video. */
export async function fromYouTube(tracks: CaptionTrack[], fetchImpl: Fetch = fetch): Promise<TranscriptResult> {
  const track = pickCaptionTrack(tracks);
  if (!track) throw new Error("no captions available");
  const segments = await downloadCaptionTrack(track, fetchImpl);
  if (!segments.length) throw new Error("caption track was empty");
  return {
    segments,
    lang: track.languageCode || null,
    source: track.kind === "asr" ? "youtube-auto" : "youtube",
  };
}

interface SupadataChunk {
  text: string;
  offset: number; // ms
  duration: number; // ms
  lang?: string;
}
interface SupadataResponse {
  content?: SupadataChunk[] | string;
  lang?: string;
  jobId?: string;
  status?: string;
  error?: string | { message?: string };
}

function supadataSegments(body: SupadataResponse): TranscriptResult | null {
  if (!Array.isArray(body.content)) return null;
  const segments = body.content
    .filter((c) => c.text?.trim())
    .map((c) => ({
      start: c.offset / 1000,
      dur: c.duration / 1000,
      text: c.text.trim(),
    }));
  return {
    segments,
    lang: body.lang ?? body.content[0]?.lang ?? null,
    source: "supadata",
  };
}

/**
 * Supadata (free tier: 100 transcripts / month). Uses existing captions when
 * present and generates a transcript with speech-to-text when not ("mode=auto").
 */
export async function fromSupadata(
  id: string,
  apiKey: string,
  fetchImpl: Fetch = fetch,
  pollMs = 2000,
  maxPolls = 3,
): Promise<TranscriptResult> {
  const headers = { "x-api-key": apiKey };
  const url = `https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(youtubeWatchUrl(id))}&text=false&mode=auto`;
  const res = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  const body = (await res.json().catch(() => ({}))) as SupadataResponse;
  if (!res.ok && res.status !== 202) {
    const msg = typeof body.error === "string" ? body.error : body.error?.message;
    throw new Error(`Supadata ${res.status}${msg ? `: ${msg}` : ""}`);
  }
  const direct = supadataSegments(body);
  if (direct) return direct;
  if (!body.jobId) throw new Error("Supadata returned no transcript");

  // Long videos / speech-to-text run as an async job.
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollMs));
    const jr = await fetchImpl(`https://api.supadata.ai/v1/transcript/${body.jobId}`, { headers, signal: AbortSignal.timeout(5000) });
    const job = (await jr.json().catch(() => ({}))) as SupadataResponse;
    if (job.status === "failed") throw new Error(`Supadata job failed: ${JSON.stringify(job.error ?? "")}`);
    const done = supadataSegments(job);
    if (done) return done;
  }
  throw new Error("Supadata is still processing this video — press retry in a minute");
}

export interface SupadataMetadata {
  description: string | null;
  duration_sec: number | null;
  published_at: string | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/**
 * Video details through Supadata (the same key as the transcript). YouTube blocks the server from
 * reading the description, and the description is where most of a video's links are.
 * Tries the unified /v1/metadata endpoint, then the older /v1/youtube/video one.
 */
export async function supadataMetadata(id: string, apiKey: string, fetchImpl: Fetch = fetch): Promise<SupadataMetadata> {
  const headers = { "x-api-key": apiKey };
  const urls = [
    `https://api.supadata.ai/v1/metadata?url=${encodeURIComponent(youtubeWatchUrl(id))}`,
    `https://api.supadata.ai/v1/youtube/video?id=${encodeURIComponent(id)}`,
  ];
  let lastError = "Supadata returned no details";
  for (const url of urls) {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(10000) });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      lastError = `Supadata ${res.status}`;
      if (res.status === 401 || res.status === 403) break;
      continue;
    }
    const media = (body.media ?? {}) as Record<string, unknown>;
    const out = {
      description: str(body.description),
      duration_sec: num(media.duration) ?? num(body.duration) ?? num(body.lengthSeconds),
      published_at: str(body.createdAt) ?? str(body.uploadDate) ?? str(body.publishedAt),
    };
    if (out.description || out.duration_sec) return out;
  }
  throw new Error(lastError);
}

interface YtioTrack {
  language?: string;
  transcript?: { text: string; start: string | number; dur: string | number }[];
}

/** youtube-transcript.io (free tier: 25 transcripts / month). */
export async function fromYoutubeTranscriptIo(id: string, apiKey: string, fetchImpl: Fetch = fetch): Promise<TranscriptResult> {
  const res = await fetchImpl("https://www.youtube-transcript.io/api/transcripts", {
    method: "POST",
    headers: {
      Authorization: `Basic ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [id] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`youtube-transcript.io ${res.status}`);
  const data = (await res.json()) as { tracks?: YtioTrack[] }[];
  const tracks = data?.[0]?.tracks ?? [];
  const track =
    tracks.find((t) => /arab|^ar/i.test(t.language ?? "")) ?? tracks.find((t) => /engl|^en/i.test(t.language ?? "")) ?? tracks[0];
  const segments = (track?.transcript ?? [])
    .filter((s) => s.text?.trim())
    .map((s) => ({
      start: Number(s.start),
      dur: Number(s.dur),
      text: s.text.trim(),
    }));
  if (!segments.length) throw new Error("youtube-transcript.io returned no transcript");
  return {
    segments,
    lang: track?.language ?? null,
    source: "youtube-transcript.io",
  };
}

/** Try every configured source, free ones first. Returns null plus the reasons when all fail. */
export async function getTranscript(
  id: string,
  tracks: CaptionTrack[],
  keys: TranscriptKeys,
  fetchImpl: Fetch = fetch,
  /** Stop trying new sources after this time (Netlify functions are limited to 30 s). */
  deadline = Date.now() + 18_000,
): Promise<{ result: TranscriptResult | null; attempts: TranscriptAttempt[] }> {
  const attempts: TranscriptAttempt[] = [];
  const sources: [string, () => Promise<TranscriptResult>][] = [];
  if (tracks.length) sources.push(["youtube", () => fromYouTube(tracks, fetchImpl)]);
  if (keys.supadata_key) sources.push(["supadata", () => fromSupadata(id, keys.supadata_key!, fetchImpl)]);
  if (keys.ytio_key) sources.push(["youtube-transcript.io", () => fromYoutubeTranscriptIo(id, keys.ytio_key!, fetchImpl)]);

  for (const [source, run] of sources) {
    if (Date.now() > deadline) {
      attempts.push({ source, error: "skipped (out of time) — press retry" });
      continue;
    }
    try {
      const result = await run();
      if (result.segments.length) return { result, attempts };
      attempts.push({ source, error: "empty transcript" });
    } catch (e) {
      attempts.push({ source, error: (e as Error).message });
    }
  }
  return { result: null, attempts };
}

export function segmentsToText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
