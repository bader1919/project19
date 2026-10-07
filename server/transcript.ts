import type { TranscriptSegment } from "../shared/types";
import { youtubeWatchUrl } from "../shared/youtube-url";
import {
  downloadCaptionTrack,
  pickCaptionTrack,
  type CaptionTrack,
} from "./youtube";

type Fetch = typeof fetch;

export interface TranscriptResult {
  segments: TranscriptSegment[];
  lang: string | null;
  source: string;
}

export interface TranscriptKeys {
  supadata_key?: string | null;
  ytio_key?: string | null;
  gemini_key?: string | null;
  gemini_model?: string | null;
}

// Flash-Lite is the fastest and least overloaded free model for transcription.
export const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";
// Gemma models cannot take video input, so they are not used here.
export const GEMINI_FALLBACK_MODELS = [
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
];

export interface TranscriptAttempt {
  source: string;
  error: string;
}

/** Free: download the caption track YouTube already lists for the video. */
export async function fromYouTube(
  tracks: CaptionTrack[],
  fetchImpl: Fetch = fetch,
): Promise<TranscriptResult> {
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
    const msg =
      typeof body.error === "string" ? body.error : body.error?.message;
    throw new Error(`Supadata ${res.status}${msg ? `: ${msg}` : ""}`);
  }
  const direct = supadataSegments(body);
  if (direct) return direct;
  if (!body.jobId) throw new Error("Supadata returned no transcript");

  // Long videos / speech-to-text run as an async job.
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollMs));
    const jr = await fetchImpl(
      `https://api.supadata.ai/v1/transcript/${body.jobId}`,
      { headers, signal: AbortSignal.timeout(5000) },
    );
    const job = (await jr.json().catch(() => ({}))) as SupadataResponse;
    if (job.status === "failed")
      throw new Error(
        `Supadata job failed: ${JSON.stringify(job.error ?? "")}`,
      );
    const done = supadataSegments(job);
    if (done) return done;
  }
  throw new Error(
    "Supadata is still processing this video — press retry in a minute",
  );
}

interface YtioTrack {
  language?: string;
  transcript?: { text: string; start: string | number; dur: string | number }[];
}

/** youtube-transcript.io (free tier: 25 transcripts / month). */
export async function fromYoutubeTranscriptIo(
  id: string,
  apiKey: string,
  fetchImpl: Fetch = fetch,
): Promise<TranscriptResult> {
  const res = await fetchImpl(
    "https://www.youtube-transcript.io/api/transcripts",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: [id] }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!res.ok) throw new Error(`youtube-transcript.io ${res.status}`);
  const data = (await res.json()) as { tracks?: YtioTrack[] }[];
  const tracks = data?.[0]?.tracks ?? [];
  const track =
    tracks.find((t) => /arab|^ar/i.test(t.language ?? "")) ??
    tracks.find((t) => /engl|^en/i.test(t.language ?? "")) ??
    tracks[0];
  const segments = (track?.transcript ?? [])
    .filter((s) => s.text?.trim())
    .map((s) => ({
      start: Number(s.start),
      dur: Number(s.dur),
      text: s.text.trim(),
    }));
  if (!segments.length)
    throw new Error("youtube-transcript.io returned no transcript");
  return {
    segments,
    lang: track?.language ?? null,
    source: "youtube-transcript.io",
  };
}

const GEMINI_PROMPT = `Transcribe the speech in this video verbatim, in the language actually spoken (do not translate; keep Arabic in Arabic script).
Return ONLY a JSON array of segments in time order, one per sentence or short phrase:
[{"t": <start time in whole seconds>, "text": "<what was said>"}]
Also transcribe any URLs that are spoken or shown on screen exactly as they appear.`;

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
  error?: { message?: string };
}

/**
 * Google Gemini (free tier: up to 8 hours of YouTube video per day). Gemini watches the
 * YouTube URL itself, so this works even when YouTube blocks caption downloads or the
 * video has no captions at all.
 */
export async function fromGemini(
  id: string,
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  fetchImpl: Fetch = fetch,
  timeoutMs = 110_000,
  perModelMs = 40_000,
): Promise<TranscriptResult> {
  const stopAt = Date.now() + timeoutMs;
  const first = /^[a-z0-9.\-]+$/i.test(model) ? model : DEFAULT_GEMINI_MODEL;
  // Free-tier models are sometimes overloaded (503) or rate-limited (429): try siblings.
  const models = [...new Set([first, ...GEMINI_FALLBACK_MODELS])];
  let lastError = "";
  for (const m of models) {
    const left = stopAt - Date.now();
    if (left < 5_000) break;
    let res: Response;
    try {
      res = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { file_data: { file_uri: youtubeWatchUrl(id) } },
                  { text: GEMINI_PROMPT },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(Math.min(perModelMs, left)),
        },
      );
    } catch (e) {
      // A hung model must not use up the whole budget: move on to the next one.
      lastError = `${m}: ${(e as Error).message}`;
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      lastError = `Gemini ${res.status}${body.error?.message ? `: ${body.error.message}` : ""}`;
      // Overloaded, rate-limited, or retired for this key: try the next model.
      if (res.status === 429 || res.status === 404 || res.status >= 500)
        continue;
      throw new Error(lastError);
    }
    try {
      return parseGeminiTranscript(body);
    } catch (e) {
      lastError = `${m}: ${(e as Error).message}`; // try the next model
    }
  }
  throw new Error(lastError || "Gemini is unavailable");
}

/** Pull the transcript array out of a Gemini reply, however it is wrapped. */
export function parseGeminiTranscript(body: GeminiResponse): TranscriptResult {
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  // Thinking models may return "thought" parts before the answer.
  const raw = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  let parsed: unknown = undefined;
  const shapes = [
    raw,
    raw.replace(/^```(?:json)?\s*|\s*```$/g, ""),
    raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1),
  ];
  for (const candidate of shapes) {
    if (!candidate) continue;
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      // try the next shape
    }
  }
  if (parsed === undefined || parsed === null)
    throw new Error("Gemini returned an unreadable transcript");
  // Accept a bare array or an object wrapping one ({"segments": [...]}).
  const rows = Array.isArray(parsed)
    ? parsed
    : ((Object.values(parsed as Record<string, unknown>).find(Array.isArray) as
        | unknown[]
        | undefined) ?? []);
  const segments = rows
    .map((r) => r as { t?: unknown; start?: unknown; text?: unknown })
    .filter((r) => typeof r.text === "string" && r.text.trim())
    .map((r) => ({
      start: Math.max(0, Number(r.t ?? r.start) || 0),
      dur: 0,
      text: String(r.text).trim(),
    }))
    .sort((a, b) => a.start - b.start);
  if (!segments.length) throw new Error("Gemini returned an empty transcript");
  const sample = segments
    .slice(0, 20)
    .map((s) => s.text)
    .join(" ");
  const lang =
    (sample.match(/[\u0600-\u06FF]/g) ?? []).length >
    (sample.match(/[A-Za-z]/g) ?? []).length
      ? "ar"
      : "en";
  return { segments, lang, source: "gemini" };
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
  if (tracks.length)
    sources.push(["youtube", () => fromYouTube(tracks, fetchImpl)]);
  if (keys.gemini_key) {
    sources.push([
      "gemini",
      () =>
        fromGemini(
          id,
          keys.gemini_key!,
          keys.gemini_model || DEFAULT_GEMINI_MODEL,
          fetchImpl,
        ),
    ]);
  }
  if (keys.supadata_key)
    sources.push([
      "supadata",
      () => fromSupadata(id, keys.supadata_key!, fetchImpl),
    ]);
  if (keys.ytio_key)
    sources.push([
      "youtube-transcript.io",
      () => fromYoutubeTranscriptIo(id, keys.ytio_key!, fetchImpl),
    ]);

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
