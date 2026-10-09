import { buildCheatsheet, type CheatItem } from "../../shared/resources";
import { supabase } from "./supabase";

const TABLES = ["items", "video_details", "links", "tags", "item_tags", "collections", "collection_items", "notes"] as const;

async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportJson() {
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), app: "RefVault", version: 1 };
  for (const t of TABLES) out[t] = (await fetchAll(t)).map(({ search_doc: _d, search_vector: _v, ...r }) => r);
  download(`refvault-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2), "application/json");
}

/** One Markdown cheatsheet: a section per video with summary, key points and links grouped by kind. */
export async function exportMarkdown() {
  const [items, videos, links, tags, itemTags, notes, collections, collectionItems] = await Promise.all(
    ["items", "video_details", "links", "tags", "item_tags", "notes", "collections", "collection_items"].map(fetchAll),
  );
  const by = (rows: Record<string, unknown>[], key: string) => {
    const m = new Map<string, Record<string, unknown>[]>();
    rows.forEach((r) => m.set(String(r[key]), [...(m.get(String(r[key])) ?? []), r]));
    return m;
  };
  const videoBy = new Map(videos.map((v) => [String(v.item_id), v]));
  const linksBy = by(links, "item_id");
  const notesBy = by(notes, "item_id");
  const tagsBy = by(itemTags, "item_id");
  const colsBy = by(collectionItems, "item_id");
  const tagName = new Map(tags.map((t) => [String(t.id), String(t.name)]));
  const colName = new Map(collections.map((c) => [String(c.id), String(c.name)]));
  const names = (rows: Record<string, unknown>[] | undefined, key: string, lookup: Map<string, string>) =>
    (rows ?? []).map((r) => lookup.get(String(r[key]))).filter((x): x is string => !!x);

  const cheat: CheatItem[] = items.map((it) => {
    const id = String(it.id);
    const v = videoBy.get(id);
    return {
      title: String(it.title ?? ""),
      source_url: (it.source_url as string | null) ?? null,
      summary: (it.summary as string | null) ?? null,
      key_points: (Array.isArray(it.key_points) ? it.key_points : []).filter((k): k is string => typeof k === "string"),
      channel: (v?.channel as string | null) ?? null,
      topics: names(tagsBy.get(id), "tag_id", tagName),
      collections: names(colsBy.get(id), "collection_id", colName),
      links: (linksBy.get(id) ?? []).map((l) => ({
        url: String(l.url), label: (l.label as string | null) ?? null, domain: (l.domain as string | null) ?? null,
        context: (l.context as string | null) ?? null, timestamp_sec: (l.timestamp_sec as number | null) ?? null,
      })),
      mentions: (Array.isArray(v?.mentions) ? (v!.mentions as CheatItem["mentions"]) : []).filter((m) => m && typeof m.name === "string"),
      notes: (notesBy.get(id) ?? []).map((n) => String(n.body)).filter((b) => b.trim()),
    };
  });
  download(`refvault-cheatsheet-${new Date().toISOString().slice(0, 10)}.md`, buildCheatsheet(cheat, new Date().toLocaleString()), "text/markdown");
}
