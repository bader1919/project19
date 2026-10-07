import type { DescriptionInfo, Mention, TranscriptSegment } from "../shared/types";
import { parseYouTubeId, youtubeWatchUrl } from "../shared/youtube-url";
import { must, ok, type Db } from "./db";
import { HttpError } from "./auth";
import { domainOf, expandShortLinks, extractChapters, extractDescriptionLinks, extractTranscriptLinks, mergeLinks } from "./links";
import { getTranscript, segmentsToText, type TranscriptAttempt } from "./transcript";
import { fetchVideo } from "./youtube";

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
  links: { url: string; domain: string; context: string; source: string; timestamp_sec: number | null; original_url?: string | null }[],
) {
  if (!links.length) return;
  const rows = links.map((l) => ({
    user_id: userId,
    item_id: itemId,
    url: l.url,
    original_url: l.original_url ?? null,
    domain: l.domain,
    context: l.context || null,
    source: l.source,
    timestamp_sec: l.timestamp_sec,
  }));
  ok(await db.from("links").upsert(rows, { onConflict: "item_id,url", ignoreDuplicates: true }), "save links");
}

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

  let segments: TranscriptSegment[] = [];
  let transcriptText: string | null = null;
  let transcriptLang: string | null = null;
  let transcriptSource: string | null = null;
  let attempts: TranscriptAttempt[] = [];

  if (opts.manualTranscript?.trim()) {
    transcriptText = opts.manualTranscript.trim();
    transcriptSource = "manual";
  } else {
    const t = await getTranscript(youtubeId, video.captionTracks, await userKeys(db, userId), fetchImpl);
    attempts = t.attempts;
    if (video.captionsError) attempts.unshift({ source: "youtube", error: video.captionsError });
    if (t.result) {
      segments = t.result.segments;
      transcriptText = segmentsToText(segments);
      transcriptLang = t.result.lang;
      transcriptSource = t.result.source;
    }
  }

  const links = await expandShortLinks(
    mergeLinks(extractDescriptionLinks(meta.description), extractTranscriptLinks(segments)),
    fetchImpl,
  );
  const chapters = extractChapters(meta.description);

  const item = must(
    await db
      .from("items")
      .insert({
        user_id: userId,
        type: "video",
        title: meta.title || `YouTube video ${youtubeId}`,
        source_url: youtubeWatchUrl(youtubeId),
        status: transcriptText ? "fetched" : "transcript_pending",
        error: transcriptText ? null : attempts.map((a) => `${a.source}: ${a.error}`).join(" · ") || "No transcript source available",
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
        transcript: transcriptText,
        transcript_segments: segments,
        transcript_lang: transcriptLang,
        transcript_source: transcriptSource,
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
    transcript_source: transcriptSource,
    transcript_errors: transcriptText ? [] : attempts,
    link_count: links.length,
  };
}

async function ownedItem(db: Db, userId: string, itemId: string) {
  const { data } = await db.from("items").select("id, type, status").eq("id", itemId).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(404, `No item ${itemId} in your library`);
  return data;
}

/** Re-try fetching a transcript (or store one pasted by the user). */
export async function retryTranscript(db: Db, userId: string, itemId: string, manualTranscript?: string, fetchImpl: Fetch = fetch) {
  await ownedItem(db, userId, itemId);
  const vd = must(
    await db.from("video_details").select("youtube_id").eq("item_id", itemId).single(),
    "load video",
  );

  let segments: TranscriptSegment[] = [];
  let text: string | null = null;
  let lang: string | null = null;
  let source: string | null = null;
  let attempts: TranscriptAttempt[] = [];

  if (manualTranscript?.trim()) {
    text = manualTranscript.trim();
    source = "manual";
  } else {
    const video = await fetchVideo(vd.youtube_id, fetchImpl);
    const t = await getTranscript(vd.youtube_id, video.captionTracks, await userKeys(db, userId), fetchImpl);
    attempts = t.attempts;
    if (video.captionsError) attempts.unshift({ source: "youtube", error: video.captionsError });
    if (t.result) {
      segments = t.result.segments;
      text = segmentsToText(segments);
      lang = t.result.lang;
      source = t.result.source;
    }
  }

  if (!text) {
    const error = attempts.map((a) => `${a.source}: ${a.error}`).join(" · ") || "No transcript source available";
    ok(await db.from("items").update({ status: "transcript_pending", error }).eq("id", itemId), "update item");
    return { ok: false, error, attempts };
  }

  ok(
    await db
      .from("video_details")
      .update({ transcript: text, transcript_segments: segments, transcript_lang: lang, transcript_source: source })
      .eq("item_id", itemId),
    "save transcript",
  );
  await insertLinks(db, userId, itemId, extractTranscriptLinks(segments));
  ok(await db.from("items").update({ status: "fetched", error: null }).eq("id", itemId).eq("status", "transcript_pending"), "update item");
  return { ok: true, source, length: text.length };
}

export interface AnalysisInput {
  item_id: string;
  summary: string;
  key_points?: string[];
  topics?: string[];
  description_info?: DescriptionInfo[];
  mentions?: Mention[];
  link_labels?: { url: string; label: string; context?: string }[];
  extra_links?: { url: string; label: string; context?: string; timestamp_sec?: number }[];
  title?: string;
}

/** Store the AI's analysis of an item (called by Claude through MCP). */
export async function saveAnalysis(db: Db, userId: string, a: AnalysisInput) {
  const item = await ownedItem(db, userId, a.item_id);

  const patch: Record<string, unknown> = {
    summary: a.summary,
    key_points: a.key_points ?? [],
    analyzed_at: new Date().toISOString(),
    error: null,
  };
  if (item.status !== "transcript_pending") patch.status = "analyzed";
  if (a.title?.trim()) patch.title = a.title.trim();
  ok(await db.from("items").update(patch).eq("id", a.item_id), "save summary");

  if (item.type === "video" && (a.description_info || a.mentions)) {
    const vd = must(
      await db.from("video_details").select("description_info").eq("item_id", a.item_id).single(),
      "load video",
    );
    const chapters = ((vd.description_info ?? []) as DescriptionInfo[]).filter((d) => d.kind === "chapter");
    const update: Record<string, unknown> = {};
    if (a.description_info) update.description_info = [...chapters, ...a.description_info.filter((d) => d.kind !== "chapter")];
    if (a.mentions) update.mentions = a.mentions;
    ok(await db.from("video_details").update(update).eq("item_id", a.item_id), "save details");
  }

  for (const l of a.link_labels ?? []) {
    const patchLink: Record<string, unknown> = { label: l.label };
    if (l.context) patchLink.context = l.context;
    await db.from("links").update(patchLink).eq("item_id", a.item_id).eq("url", l.url);
  }
  if (a.extra_links?.length) {
    await insertLinks(
      db,
      userId,
      a.item_id,
      a.extra_links.map((l) => ({
        url: l.url,
        domain: domainOf(l.url),
        context: l.context ?? "",
        source: "ai",
        timestamp_sec: l.timestamp_sec ?? null,
      })),
    );
    for (const l of a.extra_links) await db.from("links").update({ label: l.label }).eq("item_id", a.item_id).eq("url", l.url);
  }

  if (a.topics) await setTopics(db, userId, a.item_id, a.topics, { replace: true });
  return { ok: true, item_id: a.item_id };
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
    db.from("links").select("url, domain, label, context, source, timestamp_sec").eq("item_id", itemId).order("created_at"),
    db.from("item_tags").select("tags(name)").eq("item_id", itemId),
    db.from("notes").select("id, body, updated_at").eq("item_id", itemId).order("created_at"),
    db.from("collection_items").select("collections(name)").eq("item_id", itemId),
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
  const p = Math.min(Math.max(1, page), pages);
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
      p_limit: args.limit ?? 20,
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
    .limit(Math.min(args.limit ?? 50, 200));
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
  const normalized = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).toString();
  ok(
    await db.from("links").upsert(
      { user_id: userId, item_id: itemId, url: normalized, domain: domainOf(normalized), label: label ?? null, context: context ?? null, source: "manual" },
      { onConflict: "item_id,url" },
    ),
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
      .limit(limit),
    "list pending",
  );
}
