import type { DescriptionInfo, Mention } from "../shared/types";

/** Only plain web links are stored — never javascript:, data:, file: etc. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  const raw = value.trim();
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

function seconds(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function list(value: unknown, max: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export interface CleanAnalysis {
  summary: string;
  key_points: string[];
  topics?: string[];
  description_info?: DescriptionInfo[];
  mentions?: Mention[];
  link_labels: { url: string; label: string; context: string | null }[];
  extra_links: { url: string; label: string; context: string | null; timestamp_sec: number | null }[];
  title: string | null;
}

/**
 * Normalise save_analysis input from the model: drop malformed entries, cap
 * sizes, and keep only http(s) URLs. Content often originates from a video's
 * own description/transcript, so it is treated as untrusted.
 */
export function cleanAnalysis(a: Record<string, unknown>): CleanAnalysis {
  const summary = text(a.summary, 8000);
  if (!summary) throw new Error('"summary" must be a non-empty string');

  const out: CleanAnalysis = {
    summary,
    key_points: list(a.key_points, 40).map((p) => text(p, 600)).filter((p): p is string => !!p),
    link_labels: [],
    extra_links: [],
    title: text(a.title, 300),
  };
  if (a.topics !== undefined) {
    out.topics = list(a.topics, 12).map((t) => text(t, 60)).filter((t): t is string => !!t);
  }
  if (a.description_info !== undefined) {
    out.description_info = list(a.description_info, 60).flatMap((raw) => {
      const d = obj(raw);
      const t = d && text(d.text, 500);
      if (!d || !t) return [];
      return [{ kind: text(d.kind, 30)?.toLowerCase() ?? "other", text: t, url: safeUrl(d.url), timestamp_sec: seconds(d.timestamp_sec) }];
    });
  }
  if (a.mentions !== undefined) {
    out.mentions = list(a.mentions, 120).flatMap((raw) => {
      const m = obj(raw);
      const name = m && text(m.name, 200);
      if (!m || !name) return [];
      return [{ kind: text(m.kind, 30)?.toLowerCase() ?? "other", name, context: text(m.context, 500), timestamp_sec: seconds(m.timestamp_sec), url: safeUrl(m.url) }];
    });
  }
  out.link_labels = list(a.link_labels, 400).flatMap((raw) => {
    const l = obj(raw);
    const label = l && text(l.label, 200);
    // Labels refer to already-stored links, so match the URL exactly as given.
    const url = l && typeof l.url === "string" ? l.url : null;
    return l && label && url ? [{ url, label, context: text(l.context, 500) }] : [];
  });
  out.extra_links = list(a.extra_links, 40).flatMap((raw) => {
    const l = obj(raw);
    const url = l && safeUrl(l.url);
    const label = l && text(l.label, 200);
    return l && url && label ? [{ url, label, context: text(l.context, 500), timestamp_sec: seconds(l.timestamp_sec) }] : [];
  });
  return out;
}
