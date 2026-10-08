/**
 * API for the RefVault PC helper (helper/refvault_helper.py). The helper runs on the
 * user's own computer, whose home connection YouTube does not block, and fetches captions
 * and video details for newly saved videos. Authenticated with a connector token in the URL.
 *   GET  /helper/<token>/jobs     → videos that need captions or details
 *   POST /helper/<token>/result   ← what the helper found (or why it couldn't)
 */
import type { TranscriptSegment } from "../shared/types";
import { HttpError } from "./auth";
import { must, ok, type Db } from "./db";
import { applyMetadata, requestReanalysis, storeTranscript, type VideoMetadata } from "./library";
import { safeUrl, text } from "./sanitize";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SEGMENTS = 20_000;

export interface HelperJob {
  item_id: string;
  youtube_id: string;
  need_transcript: boolean;
  need_details: boolean;
}

/** Saved in the last 30 days and still missing captions or the description. */
export async function helperJobs(db: Db, userId: string): Promise<{ jobs: HelperJob[]; poll_seconds: number }> {
  ok(
    await db.from("user_settings").upsert({ user_id: userId, helper_seen_at: new Date().toISOString() }, { onConflict: "user_id" }),
    "note helper",
  );
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const rows = must(
    await db
      .from("video_details")
      .select("item_id, youtube_id, description, transcript, pc_failed, helper_done, items!inner(status, created_at)")
      .eq("user_id", userId)
      .eq("helper_done", false)
      .gte("items.created_at", since)
      .order("item_id")
      .limit(50),
    "load jobs",
  ) as unknown as { item_id: string; youtube_id: string; description: string | null; transcript: string | null; pc_failed: boolean }[];
  const jobs = rows
    .map((r) => ({
      item_id: r.item_id,
      youtube_id: r.youtube_id,
      need_transcript: !r.transcript && !r.pc_failed,
      need_details: !r.description,
    }))
    .filter((j) => j.need_transcript || j.need_details)
    .slice(0, 5);
  return { jobs, poll_seconds: 20 };
}

/** Validate the helper's captions: a list of {start, dur, text}. */
export function cleanSegments(value: unknown): TranscriptSegment[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_SEGMENTS)
    .flatMap((raw) => {
      const r = raw as { start?: unknown; dur?: unknown; duration?: unknown; text?: unknown };
      const t = text(r?.text, 2000);
      const start = Number(r?.start);
      if (!t || !Number.isFinite(start) || start < 0) return [];
      const dur = Number(r?.dur ?? r?.duration);
      return [{ start, dur: Number.isFinite(dur) && dur >= 0 ? dur : 0, text: t.replace(/\s+/g, " ") }];
    })
    .sort((a, b) => a.start - b.start);
}

export function cleanMeta(value: unknown): VideoMetadata | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  const description = text(m.description, 20_000);
  const duration = Number(m.duration_sec);
  const published = typeof m.published_at === "string" && !Number.isNaN(Date.parse(m.published_at)) ? m.published_at : null;
  return {
    description,
    duration_sec: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    published_at: published,
    channel_url: safeUrl(m.channel_url),
  };
}

export async function helperResult(db: Db, userId: string, body: Record<string, unknown>) {
  const itemId = typeof body.item_id === "string" ? body.item_id : "";
  if (!UUID_RE.test(itemId)) throw new HttpError(400, "item_id is required");
  const item = (await db.from("items").select("id, status, analyzed_by").eq("id", itemId).eq("user_id", userId).maybeSingle()).data;
  if (!item) throw new HttpError(404, `No item ${itemId} in your library`);
  const vd = must(
    await db.from("video_details").select("description, transcript, duration_sec").eq("item_id", itemId).single(),
    "load video",
  );

  const meta = cleanMeta(body.meta);
  let detailsAdded = false;
  if (meta?.description && !vd.description) {
    await applyMetadata(db, userId, itemId, meta);
    detailsAdded = true;
  } else if (meta?.duration_sec && !vd.duration_sec) {
    ok(await db.from("video_details").update({ duration_sec: meta.duration_sec }).eq("item_id", itemId), "save duration");
  }

  const segments = cleanSegments(body.segments);
  let transcript: "saved" | "kept" | "missing" = vd.transcript ? "kept" : "missing";
  if (!vd.transcript && segments.length) {
    const saved = await storeTranscript(
      db,
      userId,
      itemId,
      { segments, lang: text(body.lang, 20), source: "youtube (your PC)" },
      { onlyIfEmpty: true },
    );
    transcript = saved ? "saved" : "kept";
  }

  const patch: Record<string, unknown> = { helper_done: true };
  // No captions from the PC either: Gemini takes over right away.
  if (transcript === "missing") Object.assign(patch, { pc_failed: true, auto_next_at: null });
  ok(await db.from("video_details").update(patch).eq("item_id", itemId), "update video");
  if (transcript === "missing" && typeof body.error === "string") {
    console.log(`PC helper could not get captions for ${itemId}: ${body.error.slice(0, 300)}`);
  }
  // The description arrived after the automatic analysis was written: redo it with the full picture.
  if (detailsAdded && transcript !== "saved") await requestReanalysis(db, itemId);
  return { ok: true, transcript, details_added: detailsAdded };
}
