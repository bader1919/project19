import { formatTimestamp } from "../../shared/youtube-url";
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

/** One Markdown file with a section per item — readable anywhere, Obsidian-friendly. */
export async function exportMarkdown() {
  const [items, videos, links, tags, itemTags, notes] = await Promise.all(
    ["items", "video_details", "links", "tags", "item_tags", "notes"].map(fetchAll),
  );
  const by = <T extends Record<string, unknown>>(rows: T[], key: string) => {
    const m = new Map<string, T[]>();
    rows.forEach((r) => m.set(String(r[key]), [...(m.get(String(r[key])) ?? []), r]));
    return m;
  };
  const videoBy = new Map(videos.map((v) => [String(v.item_id), v]));
  const linksBy = by(links, "item_id");
  const notesBy = by(notes, "item_id");
  const tagName = new Map(tags.map((t) => [String(t.id), String(t.name)]));
  const tagsBy = by(itemTags, "item_id");

  const parts = ["# RefVault export", "", `Exported ${new Date().toLocaleString()}`, ""];
  for (const it of items) {
    const id = String(it.id);
    const v = videoBy.get(id);
    parts.push(`## ${it.title}`, "");
    parts.push(`- Source: ${it.source_url ?? ""}`);
    if (v?.channel) parts.push(`- Channel: ${v.channel}`);
    const t = (tagsBy.get(id) ?? []).map((x) => tagName.get(String(x.tag_id))).filter(Boolean);
    if (t.length) parts.push(`- Topics: ${t.map((x) => `#${String(x).replace(/\s+/g, "-")}`).join(" ")}`);
    parts.push("");
    if (it.summary) parts.push("### Summary", "", String(it.summary), "");
    const kp = (it.key_points as string[]) ?? [];
    if (kp.length) parts.push("### Key points", "", ...kp.map((k) => `- ${k}`), "");
    const ls = linksBy.get(id) ?? [];
    if (ls.length) {
      parts.push("### Links", "");
      for (const l of ls) {
        const ts = l.timestamp_sec !== null && l.timestamp_sec !== undefined ? ` (${formatTimestamp(Number(l.timestamp_sec))})` : "";
        parts.push(`- [${l.label || l.domain || l.url}](${l.url})${ts}${l.context ? ` — ${l.context}` : ""}`);
      }
      parts.push("");
    }
    const ms = (v?.mentions as { kind: string; name: string; context?: string }[]) ?? [];
    if (ms.length) parts.push("### Mentioned", "", ...ms.map((m) => `- **${m.name}** (${m.kind})${m.context ? ` — ${m.context}` : ""}`), "");
    const ns = (notesBy.get(id) ?? []).filter((n) => String(n.body).trim());
    if (ns.length) parts.push("### My notes", "", ...ns.map((n) => `${n.body}\n`), "");
    parts.push("---", "");
  }
  download(`refvault-${new Date().toISOString().slice(0, 10)}.md`, parts.join("\n"), "text/markdown");
}
