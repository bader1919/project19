import type { DescriptionInfo, TranscriptSegment } from "../shared/types";
import { parseYouTubeId, youtubeWatchUrl } from "../shared/youtube-url";
import { must, ok, type Db } from "./db";
import { HttpError } from "./auth";
import { domainOf, expandShortLinks, extractChapters, extractDescriptionLinks, extractTranscriptLinks, mergeLinks } from "./links";
import { getTranscript, segmentsToText, type TranscriptAttempt } from "./transcript";
import { cleanAnalysis, safeUrl } from "./sanitize";
import { fetchVideo, type FetchedVideo } from "./youtube";

type Fetch = typeof fetch;

export interface ItemRow {
  id: string;
  type: string;
  title: string;
  source_url: string | null;
  summary: string | null;
  key_points: string[];
  status: string;
  error: string | null;
  created_at: string;
  analyzed_at: string | null;
}

export interface IngestResult {
  item_id: string;
  already_saved: boolean;
  title: string;
  status: string;
  transcript_source: string | null;
  transcript_errors: TranscriptAttempt[];
  link_count: number;
}

async function userKeys(db: Db, userId: string) {
  const { data } = await db.from("user_settings").select("supadata_key, ytio_key").eq("user_id", userId).maybeSingle();
  return { supadata_key: data?.supadata_key ?? null, ytio_key: data?.ytio_key ?? null };
}

async function insertLinks(
  db: Db,
  userId: string,
  itemId: string,
  links: { url: string; domain: string; context: string; source: string; timestamp_sec: number | null; original_url?: string | null; label?: string | null }[],
) {
  if (!links.length) return;
  const rows = links.map((l) => ({
    user_id: userId,
    item_id: itemId,
    url: l.url,
    original_url: l.original_url ?? null,
    label: l.label ?? null,
    domain: l.domain,
    context: l.context || null,
    source: l.source,
    timestamp_sec: l.timestamp_sec,
  }));
  ok(await db.from("links").upsert(rows, { onConflict: "item_id,url", ignoreDuplicates: true }), "save links");
}

/** Save a YouTube video: metadata, description, transcript, links, chapters. */
/** Longest transcript we store (a ~10 hour talk); keeps rows and the search index bounded. */
export const MAX_TRANSCRIPT_CHARS = 400_000;

interface TranscriptOutcome {
  segments: TranscriptSegment[];
  text: string | null;
  lang: string | null;
  source: string | null;
  attempts: TranscriptAttempt[];
}

/** Manual text if given, otherwise the free → paid provider chain. */
async function resolveTranscript(
  db: Db,
  userId: string,
  youtubeId: string,
  video: FetchedVideo,
  manualTranscript: string | undefined,
  fetchImpl: Fetch,
): Promise<TranscriptOutcome> {
  if (manualTranscript?.trim()) {
    return { segments: [], text: manualTranscript.trim().slice(0, MAX_TRANSCRIPT_CHARS), lang: null, source: "manual", attempts: [] };
  }
  const t = await getTranscript(youtubeId, video.captionTracks, await userKeys(db, userId), fetchImpl);
  const attempts = video.captionsError ? [{ source: "youtube", error: video.captionsError }, ...t.attempts] : t.attempts;
  if (!t.result) return { segments: [], text: null, lang: null, source: null, attempts };
  const text = segmentsToText(t.result.segments).slice(0, MAX_TRANSCRIPT_CHARS);
  return { segments: t.result.segments, text, lang: t.result.lang, source: t.result.source, attempts };
}

const describeAttempts = (attempts: TranscriptAttempt[]) =>
  attempts.map((a) => `${a.source}: ${a.error}`).join(" · ") || "No transcript source available";

/** Save a YouTube video: metadata, description, transcript, links, chapters. */
export async function ingestVideo(
  db: Db,
  userId: string,
  url: string,
  opts: { manualTranscript?: string } = {},
  fetchImpl: Fetch = fetch,
): Promise<IngestResult> {
  const youtubeId = parseYouTubeId(url);
  if (!youtubeId) throw new HttpError(400, "That doesn't look like a YouTube video link");
  const sourceUrl = youtubeWatchUrl(youtubeId);

  const existing = await db
    .from("video_details")
    .select("item_id, transcript_source, items!inner(title, status)")
    .eq("user_id", userId)
    .eq("youtube_id", youtubeId)
    .maybeSingle();
  if (existing.data) {
    const it = existing.data.items as unknown as { title: string; status: string };
    const { count } = await db.from("links").select("id", { count: "exact", head: true }).eq("item_id", existing.data.item_id);
    return {
      item_id: existing.data.item_id,
      already_saved: true,
      title: it.title,
      status: it.status,
      transcript_source: existing.data.transcript_source,
      transcript_errors: [],
      link_count: count ?? 0,
    };
  }

  const video = await fetchVideo(youtubeId, fetchImpl);
  const { meta } = video;
  const t = await resolveTranscript(db, userId, youtubeId, video, opts.manualTranscript, fetchImpl);

  const links = dedupeByUrl(
    await expandShortLinks(mergeLinks(extractDescriptionLinks(meta.description), extractTranscriptLinks(t.segments)), fetchImpl),
  );
  const chapters = extractChapters(meta.description);

  // A previous attempt killed between the two inserts (e.g. function timeout) leaves an
  // item without details; remove it so the video can be saved again.
  const { data: stale } = await db.from("items").select("id, video_details(item_id)").eq("user_id", userId).eq("source_url", sourceUrl);
  const orphans = (stale ?? []).filter((r) => !(r.video_details as unknown as { item_id: string } | null)?.item_id).map((r) => r.id);
  if (orphans.length) await db.from("items").delete().in("id", orphans).eq("user_id", userId);

  const item = must(
    await db
      .from("items")
      .insert({
        user_id: userId,
        type: "video",
        title: meta.title || `YouTube video ${youtubeId}`,
        source_url: sourceUrl,
        status: t.text ? "fetched" : "transcript_pending",
        error: t.text ? null : describeAttempts(t.attempts),
      })
      .select("id, title, status")
      .single(),
    "save item",
  );

  try {
    ok(
      await db.from("video_details").insert({
        item_id: item.id,
        user_id: userId,
        youtube_id: youtubeId,
        channel: meta.channel,
        channel_url: meta.channel_url,
        thumbnail: meta.thumbnail,
        published_at: meta.published_at,
        duration_sec: meta.duration_sec,
        description: meta.description,
        transcript: t.text,
        transcript_segments: t.segments,
        transcript_lang: t.lang,
        transcript_source: t.source,
        description_info: chapters,
      }),
      "save video details",
    );
    await insertLinks(db, userId, item.id, links);
  } catch (e) {
    // Don't leave a half-saved item behind (it would block re-saving the video).
    await db.from("items").delete().eq("id", item.id);
    throw e;
  }

  return {
    item_id: item.id,
    already_saved: false,
    title: item.title,
    status: item.status,
    transcript_source: t.source,
    transcript_errors: t.text ? [] : t.attempts,
    link_count: links.length,
  };
}

function dedupeByUrl<T extends { url: string }>(links: T[]): T[] {
  const seen = new Set<string>();
  return links.filter((l) => !seen.has(l.url) && (seen.add(l.url), true));
}

async function ownedItem(db: Db, userId: string, itemId: string) {
  const { data } = await db.from("items").select("id, type, status").eq("id", itemId).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(404, `No item ${itemId} in your library`);
  return data;
}

/**
 * Re-try fetching a transcript (or store one pasted by the user). Also fills in
 * description, links and chapters when the first save only got basic metadata.
 */
export async function retryTranscript(db: Db, userId: string, itemId: string, manualTranscript?: string, fetchImpl: Fetch = fetch) {
  const item = await ownedItem(db, userId, itemId);
  const vd = must(
    await db.from("video_details").select("youtube_id, transcript, description").eq("item_id", itemId).single(),
    "load video",
  );
  if (vd.transcript && !manualTranscript?.trim()) {
    return { ok: true, source: "existing", length: vd.transcript.length, note: "This item already has a transcript." };
  }

  const video = manualTranscript?.trim() && vd.description ? null : await fetchVideo(vd.youtube_id, fetchImpl);

  // Repair metadata that the oEmbed fallback could not provide on the first save.
  if (video && !vd.description && video.meta.description) {
    const m = video.meta;
    ok(
      await db
        .from("video_details")
        .update({
          description: m.description,
          duration_sec: m.duration_sec,
          published_at: m.published_at,
          channel_url: m.channel_url,
          description_info: extractChapters(m.description),
        })
        .eq("item_id", itemId),
      "update video details",
    );
    await insertLinks(db, userId, itemId, dedupeByUrl(await expandShortLinks(extractDescriptionLinks(m.description), fetchImpl)));
  }

  const t = video
    ? await resolveTranscript(db, userId, vd.youtube_id, video, manualTranscript, fetchImpl)
    : await resolveTranscript(db, userId, vd.youtube_id, { meta: {} as FetchedVideo["meta"], captionTracks: [] }, manualTranscript, fetchImpl);

  if (!t.text) {
    const error = describeAttempts(t.attempts);
    if (item.status !== "analyzed") {
      ok(await db.from("items").update({ status: "transcript_pending", error }).eq("id", itemId), "update item");
    }
    return { ok: false, error, attempts: t.attempts };
  }

  ok(
    await db
      .from("video_details")
      .update({ transcript: t.text, transcript_segments: t.segments, transcript_lang: t.lang, transcript_source: t.source })
      .eq("item_id", itemId),
    "save transcript",
  );
  await insertLinks(db, userId, itemId, extractTranscriptLinks(t.segments));
  ok(await db.from("items").update({ status: "fetched", error: null }).eq("id", itemId).eq("status", "transcript_pending"), "update item");
  return { ok: true, source: t.source, length: t.text.length };
}

export type AnalysisInput = { item_id: string } & Record<string, unknown>;

/** Store the AI's analysis of an item (called by Claude through MCP). */
export async function saveAnalysis(db: Db, userId: string, input: AnalysisInput) {
  const item = await ownedItem(db, userId, input.item_id);
  const a = cleanAnalysis(input);

  const patch: Record<string, unknown> = {
    summary: a.summary,
    key_points: a.key_points,
    analyzed_at: new Date().toISOString(),
  };
  // Keep the "why is the transcript missing" message until a transcript arrives.
  if (item.status !== "transcript_pending") {
    patch.status = "analyzed";
    patch.error = null;
  }
  if (a.title) patch.title = a.title;
  ok(await db.from("items").update(patch).eq("id", item.id), "save summary");

  if (item.type === "video" && (a.description_info || a.mentions)) {
    const vd = must(
      await db.from("video_details").select("description_info").eq("item_id", item.id).single(),
      "load video",
    );
    const chapters = ((vd.description_info ?? []) as DescriptionInfo[]).filter((d) => d.kind === "chapter");
    const update: Record<string, unknown> = {};
    if (a.description_info) update.description_info = [...chapters, ...a.description_info.filter((d) => d.kind !== "chapter")];
    if (a.mentions) update.mentions = a.mentions;
    ok(await db.from("video_details").update(update).eq("item_id", item.id), "save details");
  }

  for (const l of a.link_labels) {
    const patchLink: Record<string, unknown> = { label: l.label };
    if (l.context) patchLink.context = l.context;
    await db.from("links").update(patchLink).eq("item_id", item.id).eq("user_id", userId).eq("url", l.url);
  }
  if (a.extra_links.length) {
    await insertLinks(
      db,
      userId,
      item.id,
      a.extra_links.map((l) => ({
        url: l.url,
        domain: domainOf(l.url),
        label: l.label,
        context: l.context ?? "",
        source: "ai",
        timestamp_sec: l.timestamp_sec,
      })),
    );
  }

  if (a.topics) await setTopics(db, userId, item.id, a.topics, { replace: true });
  return { ok: true, item_id: item.id, topics: a.topics, links_labelled: a.link_labels.length, links_added: a.extra_links.length };
}

async function ensureTags(db: Db, userId: string, names: string[]): Promise<{ id: string; name: string }[]> {
  const wanted = [...new Map(names.map((n) => n.trim()).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()];
  if (!wanted.length) return [];
  const existing = must(await db.from("tags").select("id, name").eq("user_id", userId), "load topics") as { id: string; name: string }[];
  const byLower = new Map(existing.map((t) => [t.name.toLowerCase(), t]));
  const missing = wanted.filter((n) => !byLower.has(n.toLowerCase()));
  if (missing.length) {
    const created = must(
      await db.from("tags").insert(missing.map((name) => ({ user_id: userId, name }))).select("id, name"),
      "create topics",
    ) as { id: string; name: string }[];
    created.forEach((t) => byLower.set(t.name.toLowerCase(), t));
  }
  return wanted.map((n) => byLower.get(n.toLowerCase())!).filter(Boolean);
}

export async function setTopics(db: Db, userId: string, itemId: string, topics: string[], opts: { replace?: boolean } = {}) {
  await ownedItem(db, userId, itemId);
  const tags = await ensureTags(db, userId, topics);
  if (opts.replace) {
    const keep = tags.map((t) => t.id);
    let del = db.from("item_tags").delete().eq("item_id", itemId);
    if (keep.length) del = del.not("tag_id", "in", `(${keep.join(",")})`);
    ok(await del, "update topics");
  }
  if (tags.length) {
    ok(
      await db
        .from("item_tags")
        .upsert(tags.map((t) => ({ item_id: itemId, tag_id: t.id, user_id: userId })), { onConflict: "item_id,tag_id", ignoreDuplicates: true }),
      "tag item",
    );
  }
  return { ok: true, topics: tags.map((t) => t.name) };
}

export async function getItem(db: Db, userId: string, itemId: string, opts: { includeTranscript?: boolean } = {}) {
  const { data: item, error } = await db
    .from("items")
    .select("id, type, title, source_url, summary, key_points, status, error, created_at, analyzed_at")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`load item: ${error.message}`);
  if (!item) throw new HttpError(404, `No item ${itemId} in your library`);

  const cols = `youtube_id, channel, thumbnail, published_at, duration_sec, description, description_info, mentions, transcript_lang, transcript_source${opts.includeTranscript ? ", transcript" : ""}`;
  const [video, links, tags, notes, collections] = await Promise.all([
    db.from("video_details").select(cols).eq("item_id", itemId).maybeSingle(),
    db.from("links").select("url, domain, label, context, source, timestamp_sec").eq("item_id", itemId).eq("user_id", userId).order("created_at"),
    db.from("item_tags").select("tags(name)").eq("item_id", itemId).eq("user_id", userId),
    db.from("notes").select("id, body, updated_at").eq("item_id", itemId).eq("user_id", userId).order("created_at"),
    db.from("collection_items").select("collections(name)").eq("item_id", itemId).eq("user_id", userId),
  ]);
  return {
    ...item,
    video: video.data ?? null,
    links: links.data ?? [],
    topics: (tags.data ?? []).map((t) => (t.tags as unknown as { name: string }).name),
    notes: notes.data ?? [],
    collections: (collections.data ?? []).map((c) => (c.collections as unknown as { name: string }).name),
  };
}

const TRANSCRIPT_PAGE = 40_000;

function clampInt(v: number | undefined, min: number, max: number, fallback: number): number {
  return v === undefined || !Number.isFinite(v) ? fallback : Math.min(max, Math.max(min, Math.floor(v)));
}

/** Transcript text in pages, so very long videos fit in a tool result. */
export async function getTranscriptPage(db: Db, userId: string, itemId: string, page = 1) {
  await ownedItem(db, userId, itemId);
  const vd = must(
    await db.from("video_details").select("transcript, transcript_segments, transcript_lang").eq("item_id", itemId).single(),
    "load transcript",
  );
  const segs = (vd.transcript_segments ?? []) as TranscriptSegment[];
  // With timestamps when we have them, so Claude can point at moments in the video.
  const full = segs.length
    ? segs.map((s) => `[${Math.floor(s.start)}s] ${s.text}`).join("\n")
    : (vd.transcript ?? "");
  const pages = Math.max(1, Math.ceil(full.length / TRANSCRIPT_PAGE));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return {
    item_id: itemId,
    language: vd.transcript_lang,
    page: p,
    pages,
    text: full.slice((p - 1) * TRANSCRIPT_PAGE, p * TRANSCRIPT_PAGE) || "(no transcript yet)",
  };
}

export async function searchLibrary(
  db: Db,
  userId: string,
  args: { query?: string; type?: string; topic?: string; status?: string; limit?: number },
) {
  return must(
    await db.rpc("search_library", {
      q: args.query ?? null,
      p_type: args.type ?? null,
      p_tag: args.topic ?? null,
      p_status: args.status ?? null,
      p_limit: clampInt(args.limit, 1, 100, 20),
      p_user: userId,
    }),
    "search",
  );
}

export async function listLinks(db: Db, userId: string, args: { query?: string; domain?: string; limit?: number }) {
  let q = db
    .from("links")
    .select("url, domain, label, context, source, timestamp_sec, item_id, items!inner(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(clampInt(args.limit, 1, 200, 50));
  if (args.domain) q = q.ilike("domain", `%${args.domain}%`);
  if (args.query) {
    const s = args.query.replace(/[%,()]/g, " ");
    q = q.or(`url.ilike.%${s}%,label.ilike.%${s}%,context.ilike.%${s}%`);
  }
  const rows = must(await q, "list links") as unknown as { items: { title: string } }[];
  return rows.map(({ items, ...l }) => ({ ...l, item_title: items.title }));
}

export async function listTopics(db: Db, userId: string) {
  return must(await db.rpc("topic_counts", { p_user: userId }), "list topics");
}

export async function addNote(db: Db, userId: string, itemId: string, body: string) {
  await ownedItem(db, userId, itemId);
  return must(await db.from("notes").insert({ user_id: userId, item_id: itemId, body }).select("id").single(), "add note");
}

export async function addLink(db: Db, userId: string, itemId: string, url: string, label?: string, context?: string) {
  await ownedItem(db, userId, itemId);
  const normalized = safeUrl(url);
  if (!normalized) throw new HttpError(400, "Only http(s) web links can be saved");
  const { data: existing } = await db.from("links").select("id").eq("item_id", itemId).eq("url", normalized).maybeSingle();
  if (existing) {
    // Keep the original source and any label already there unless a new one is given.
    const patch: Record<string, unknown> = {};
    if (label) patch.label = label;
    if (context) patch.context = context;
    if (Object.keys(patch).length) ok(await db.from("links").update(patch).eq("id", existing.id), "update link");
    return { ok: true, url: normalized, already_saved: true };
  }
  ok(
    await db.from("links").insert({
      user_id: userId, item_id: itemId, url: normalized, domain: domainOf(normalized),
      label: label ?? null, context: context ?? null, source: "manual",
    }),
    "add link",
  );
  return { ok: true, url: normalized };
}

export async function addToCollection(db: Db, userId: string, itemId: string, collection: string) {
  await ownedItem(db, userId, itemId);
  const name = collection.trim();
  if (!name) throw new HttpError(400, "Collection name is required");
  const all = must(await db.from("collections").select("id, name").eq("user_id", userId), "load collections") as { id: string; name: string }[];
  let col = all.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!col) col = must(await db.from("collections").insert({ user_id: userId, name }).select("id, name").single(), "create collection");
  ok(
    await db
      .from("collection_items")
      .upsert({ collection_id: col!.id, item_id: itemId, user_id: userId }, { onConflict: "collection_id,item_id", ignoreDuplicates: true }),
    "add to collection",
  );
  return { ok: true, collection: col!.name };
}

/** Items saved but not analyzed yet — the "to do" list for Claude. */
export async function listPending(db: Db, userId: string, limit = 20) {
  return must(
    await db
      .from("items")
      .select("id, type, title, source_url, status, error, created_at")
      .eq("user_id", userId)
      .in("status", ["fetched", "transcript_pending"])
      .is("analyzed_at", null)
      .order("created_at", { ascending: true })
      .limit(clampInt(limit, 1, 100, 20)),
    "list pending",
  );
}
