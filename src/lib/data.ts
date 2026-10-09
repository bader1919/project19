import type { DescriptionInfo, Mention, TranscriptSegment } from "../../shared/types";
import { supabase } from "./supabase";

export interface SearchRow {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  status: string;
  source_url: string | null;
  thumbnail: string | null;
  channel: string | null;
  created_at: string;
  snippet: string | null;
  rank: number;
  tags: string[];
  /** Filled by searchItems from video_details (seconds). */
  duration_sec?: number | null;
}

export interface LinkRow {
  id: string;
  item_id: string;
  url: string;
  domain: string | null;
  label: string | null;
  context: string | null;
  source: string;
  timestamp_sec: number | null;
  created_at: string;
}

export interface NoteRow {
  id: string;
  item_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface VideoRow {
  youtube_id: string;
  channel: string | null;
  channel_url: string | null;
  thumbnail: string | null;
  published_at: string | null;
  duration_sec: number | null;
  description: string | null;
  transcript: string | null;
  transcript_segments: TranscriptSegment[];
  transcript_lang: string | null;
  transcript_source: string | null;
  description_info: DescriptionInfo[];
  mentions: Mention[];
  /** Background pipeline (migration 004) */
  auto_attempts?: number;
  transcript_cursor?: number;
}

export interface ItemFull {
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
  analysis_attempts?: number;
  analyzed_by?: string | null;
  video: VideoRow | null;
  links: LinkRow[];
  topics: { id: string; name: string }[];
  notes: NoteRow[];
  collections: { id: string; name: string }[];
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function searchItems(p: {
  q?: string;
  type?: string;
  tag?: string;
  collection?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<SearchRow[]> {
  const rows = check(
    await supabase.rpc("search_library", {
      q: p.q || null,
      p_type: p.type || null,
      p_tag: p.tag || null,
      p_collection: p.collection || null,
      p_status: p.status || null,
      p_limit: p.limit ?? 30,
      p_offset: p.offset ?? 0,
    }),
  ) as SearchRow[];
  // Durations are not part of the search RPC; fetch them for the visible rows (best effort).
  const ids = rows.filter((r) => r.type === "video").map((r) => r.id);
  if (ids.length) {
    const { data } = await supabase.from("video_details").select("item_id, duration_sec").in("item_id", ids);
    const dur = new Map((data ?? []).map((d: { item_id: string; duration_sec: number | null }) => [d.item_id, d.duration_sec]));
    for (const r of rows) r.duration_sec = dur.get(r.id) ?? null;
  }
  return rows;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadItem(id: string): Promise<ItemFull | null> {
  if (!UUID_RE.test(id)) return null;
  const item = check(
    await supabase
      .from("items")
      .select("id, type, title, source_url, summary, key_points, status, error, created_at, analyzed_at, analysis_attempts, analyzed_by")
      .eq("id", id)
      .maybeSingle(),
  );
  if (!item) return null;
  const [video, links, tags, notes, cols] = await Promise.all([
    supabase.from("video_details").select("*").eq("item_id", id).maybeSingle(),
    supabase.from("links").select("*").eq("item_id", id).order("timestamp_sec", { nullsFirst: true }).order("created_at"),
    supabase.from("item_tags").select("tags(id, name)").eq("item_id", id),
    supabase.from("notes").select("*").eq("item_id", id).order("created_at"),
    supabase.from("collection_items").select("collections(id, name)").eq("item_id", id),
  ]);
  return {
    ...(item as Omit<ItemFull, "video" | "links" | "topics" | "notes" | "collections">),
    video: (video.data as VideoRow | null) ?? null,
    links: (links.data as LinkRow[]) ?? [],
    topics: ((tags.data ?? []) as unknown as { tags: { id: string; name: string } }[]).map((t) => t.tags),
    notes: (notes.data as NoteRow[]) ?? [],
    collections: ((cols.data ?? []) as unknown as { collections: { id: string; name: string } }[]).map((c) => c.collections),
  };
}

export async function updateItem(id: string, patch: Partial<Pick<ItemFull, "title" | "summary" | "key_points">>) {
  check(await supabase.from("items").update(patch).eq("id", id));
}

export async function deleteItem(id: string) {
  check(await supabase.from("items").delete().eq("id", id));
}

export async function listTopics(): Promise<{ id: string; name: string; item_count: number }[]> {
  return check(await supabase.rpc("topic_counts")) as { id: string; name: string; item_count: number }[];
}

async function ensureTag(name: string): Promise<{ id: string; name: string }> {
  const clean = name.trim();
  const existing = check(await supabase.from("tags").select("id, name").ilike("name", clean.replace(/[%_\\]/g, "\\$&")));
  const match = (existing ?? []).find((t) => t.name.toLowerCase() === clean.toLowerCase());
  if (match) return match;
  return check(await supabase.from("tags").insert({ name: clean }).select("id, name").single()) as { id: string; name: string };
}

export async function addTopic(itemId: string, name: string) {
  const tag = await ensureTag(name);
  check(await supabase.from("item_tags").upsert({ item_id: itemId, tag_id: tag.id }, { onConflict: "item_id,tag_id", ignoreDuplicates: true }));
  return tag;
}

export async function removeTopic(itemId: string, tagId: string) {
  check(await supabase.from("item_tags").delete().eq("item_id", itemId).eq("tag_id", tagId));
}

export async function renameTopic(tagId: string, name: string) {
  check(await supabase.from("tags").update({ name: name.trim() }).eq("id", tagId));
}

export async function deleteTopic(tagId: string) {
  check(await supabase.from("tags").delete().eq("id", tagId));
}

export async function listCollections(): Promise<{ id: string; name: string; description: string | null; count: number }[]> {
  const rows = check(await supabase.from("collections").select("id, name, description, collection_items(count)").order("name"));
  return (rows as unknown as { id: string; name: string; description: string | null; collection_items: { count: number }[] }[]).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    count: c.collection_items[0]?.count ?? 0,
  }));
}

export async function createCollection(name: string, description?: string): Promise<{ id: string; name: string }> {
  return check(await supabase.from("collections").insert({ name: name.trim(), description: description || null }).select("id, name").single()) as { id: string; name: string };
}

export async function deleteCollection(id: string) {
  check(await supabase.from("collections").delete().eq("id", id));
}

export async function setInCollection(itemId: string, collectionId: string, inside: boolean) {
  if (inside) {
    check(
      await supabase
        .from("collection_items")
        .upsert({ item_id: itemId, collection_id: collectionId }, { onConflict: "collection_id,item_id", ignoreDuplicates: true }),
    );
  } else {
    check(await supabase.from("collection_items").delete().eq("item_id", itemId).eq("collection_id", collectionId));
  }
}

export async function addNote(itemId: string, body = ""): Promise<NoteRow> {
  return check(await supabase.from("notes").insert({ item_id: itemId, body }).select("*").single()) as NoteRow;
}

export async function saveNote(id: string, body: string) {
  check(await supabase.from("notes").update({ body }).eq("id", id));
}

export async function deleteNote(id: string) {
  check(await supabase.from("notes").delete().eq("id", id));
}

export async function listNotes(q?: string): Promise<(NoteRow & { items: { title: string } })[]> {
  let query = supabase.from("notes").select("*, items!inner(title)").order("updated_at", { ascending: false }).limit(200);
  if (q) query = query.ilike("body", `%${q}%`);
  return check(await query) as unknown as (NoteRow & { items: { title: string } })[];
}

export async function listLinks(p: { q?: string; domain?: string; limit?: number }): Promise<(LinkRow & { items: { title: string; type: string } })[]> {
  let query = supabase
    .from("links")
    .select("*, items!inner(title, type)")
    .order("created_at", { ascending: false })
    .limit(p.limit ?? 300);
  if (p.domain) query = query.eq("domain", p.domain);
  if (p.q) {
    const s = p.q.replace(/[%,()]/g, " ").trim();
    if (s) query = query.or(`url.ilike.%${s}%,label.ilike.%${s}%,context.ilike.%${s}%,domain.ilike.%${s}%`);
  }
  return check(await query) as unknown as (LinkRow & { items: { title: string; type: string } })[];
}

export async function addLink(itemId: string, url: string, label?: string) {
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
  } catch {
    throw new Error("That doesn't look like a web link");
  }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".")) throw new Error("Only http(s) web links can be saved");
  const normalized = parsed.toString();
  const existing = check(await supabase.from("links").select("id").eq("item_id", itemId).eq("url", normalized).maybeSingle());
  if (existing) {
    // Don't wipe the existing label/source; only set a label if one was typed.
    if (label) check(await supabase.from("links").update({ label }).eq("id", existing.id));
    return;
  }
  check(
    await supabase.from("links").insert({
      item_id: itemId,
      url: normalized,
      domain: parsed.hostname.replace(/^www\./, ""),
      label: label || null,
      source: "manual",
    }),
  );
}

export async function updateLink(id: string, patch: Partial<Pick<LinkRow, "label" | "context">>) {
  check(await supabase.from("links").update(patch).eq("id", id));
}

export async function deleteLink(id: string) {
  check(await supabase.from("links").delete().eq("id", id));
}

export async function libraryStats() {
  const [all, pending, links, notes] = await Promise.all([
    supabase.from("items").select("id", { count: "exact", head: true }),
    supabase.from("items").select("id", { count: "exact", head: true }).eq("status", "fetched"),
    supabase.from("links").select("id", { count: "exact", head: true }),
    supabase.from("notes").select("id", { count: "exact", head: true }),
  ]);
  return { items: all.count ?? 0, pending: pending.count ?? 0, links: links.count ?? 0, notes: notes.count ?? 0 };
}
