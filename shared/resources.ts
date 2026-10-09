/**
 * Pure helpers that sort saved links into GitHub repositories, papers and documentation, and build the
 * Markdown cheatsheet. No network and no DOM, so they are shared by the app and the tests.
 */

export type LinkKind = "repo" | "paper" | "docs" | "other";

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
/** First path segments on github.com that are site pages, not account names. */
const GITHUB_RESERVED = new Set([
  "about", "apps", "collections", "customer-stories", "enterprise", "events", "explore", "features", "issues",
  "join", "login", "marketplace", "new", "notifications", "orgs", "pricing", "pulls", "readme", "search",
  "security", "settings", "site", "sponsors", "topics", "trending", "users", "tos", "privacy", "contact",
]);

function parse(url: string): URL | null {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

const host = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, "");

/** "https://github.com/Owner/Repo/blob/main/x.py" -> "Owner/Repo" (null when it is not a repository link). */
export function githubRepo(url: string): string | null {
  const u = parse(url);
  if (!u || !GITHUB_HOSTS.has(u.hostname.toLowerCase())) return null;
  const [owner, rawRepo] = u.pathname.split("/").filter(Boolean);
  if (!owner || !rawRepo) return null;
  const repo = rawRepo.replace(/\.git$/i, "").replace(/[.,;:)>\]]+$/, "");
  if (GITHUB_RESERVED.has(owner.toLowerCase())) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || !repo) return null;
  return `${owner}/${repo}`;
}

const DOI_RE = /10\.\d{4,9}\/[^\s?#"<>]+/i;
const ARXIV_RE = /^\/(?:abs|pdf|html)\/([a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?$/i;

/** DOI from a doi.org link or any link that carries one (publisher /doi/ paths). Lower-cased, no trailing dot. */
export function paperDoi(url: string): string | null {
  const u = parse(url);
  if (!u) return null;
  let path = "";
  try { path = decodeURIComponent(u.pathname); } catch { path = u.pathname; }
  const m = DOI_RE.exec(path.slice(1));
  if (m && (host(u).endsWith("doi.org") || /\/doi\//i.test(path))) return m[0].replace(/[.,;)]+$/, "").toLowerCase();
  return null;
}

export function arxivId(url: string): string | null {
  const u = parse(url);
  if (!u || host(u) !== "arxiv.org") return null;
  return ARXIV_RE.exec(u.pathname)?.[1] ?? null;
}

export function pubmedId(url: string): string | null {
  const u = parse(url);
  if (!u || host(u) !== "pubmed.ncbi.nlm.nih.gov") return null;
  return /^\/(\d+)/.exec(u.pathname)?.[1] ?? null;
}

/** Key OpenAlex understands (`doi:`, `pmid:`), or null when this paper cannot be looked up. arXiv has DOIs of its own. */
export function openAlexKey(url: string): string | null {
  const doi = paperDoi(url);
  if (doi) return `doi:${doi}`;
  const ax = arxivId(url);
  if (ax) return `doi:10.48550/arxiv.${ax.toLowerCase()}`;
  const pm = pubmedId(url);
  return pm ? `pmid:${pm}` : null;
}

const PAPER_HOSTS = [
  "arxiv.org", "doi.org", "dx.doi.org", "pubmed.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov", "openreview.net",
  "biorxiv.org", "medrxiv.org", "chemrxiv.org", "ssrn.com", "semanticscholar.org", "aclanthology.org", "aclweb.org",
  "ieeexplore.ieee.org", "dl.acm.org", "jmlr.org", "proceedings.mlr.press", "papers.nips.cc", "proceedings.neurips.cc",
  "openaccess.thecvf.com", "link.springer.com", "sciencedirect.com", "onlinelibrary.wiley.com", "plos.org", "elifesciences.org",
  "paperswithcode.com", "scholar.google.com",
];
const PAPER_PATHS: [string, RegExp][] = [
  ["nature.com", /^\/articles\//], ["science.org", /^\/doi\//], ["ncbi.nlm.nih.gov", /^\/(pmc|pubmed)\//],
  ["cell.com", /^\/[^/]+\/fulltext\//], ["pnas.org", /^\/doi\//],
];
const DOCS_HOST_PREFIX = /^(docs?|documentation|developer|developers|devdocs|learn|help|manual|man|wiki|api)\./;
const DOCS_HOST_SUFFIX = [".readthedocs.io", ".readthedocs.org", ".rtfd.io", ".gitbook.io", ".docsrs.com"];
const DOCS_HOSTS = new Set(["developer.mozilla.org", "devdocs.io", "docs.rs", "pkg.go.dev", "man7.org", "cppreference.com", "en.cppreference.com", "learn.microsoft.com", "readthedocs.org"]);
const DOCS_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:docs?|documentation|reference|guides?|manual|handbook|api-reference|api|tutorial)(?:\/|$)/i;

const hostIn = (h: string, list: string[]) => list.some((p) => h === p || h.endsWith(`.${p}`));

export function classifyLink(url: string): LinkKind {
  const u = parse(url);
  if (!u) return "other";
  if (githubRepo(url)) return "repo";
  const h = host(u);
  if (paperDoi(url) || hostIn(h, PAPER_HOSTS) || PAPER_PATHS.some(([ph, re]) => hostIn(h, [ph]) && re.test(u.pathname))) return "paper";
  if (h === "github.com") return "other";
  if (DOCS_HOSTS.has(h) || DOCS_HOST_PREFIX.test(h) || DOCS_HOST_SUFFIX.some((s) => h.endsWith(s)) || DOCS_PATH.test(u.pathname)) return "docs";
  return "other";
}

export interface RepoMention { item_id: string; title: string; timestamp_sec: number | null }
export interface RepoGroup { name: string; url: string; mentions: RepoMention[] }

interface LinkLike { url: string; item_id: string; timestamp_sec: number | null; items?: { title: string } }

/** One entry per repository (case-insensitive), listing each video once, earliest moment first. Most-mentioned first. */
export function groupRepos(links: LinkLike[]): RepoGroup[] {
  const map = new Map<string, RepoGroup>();
  for (const l of links) {
    const name = githubRepo(l.url);
    if (!name) continue;
    const key = name.toLowerCase();
    const g = map.get(key) ?? { name, url: `https://github.com/${name}`, mentions: [] };
    const seen = g.mentions.find((m) => m.item_id === l.item_id);
    if (!seen) g.mentions.push({ item_id: l.item_id, title: l.items?.title ?? "Untitled", timestamp_sec: l.timestamp_sec });
    else if (l.timestamp_sec !== null && (seen.timestamp_sec === null || l.timestamp_sec < seen.timestamp_sec)) seen.timestamp_sec = l.timestamp_sec;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.mentions.length - a.mentions.length || a.name.localeCompare(b.name));
}

export interface PaperMeta { title: string; authors: string; year: number | null; venue: string | null }

/** "Vaswani, Shazeer et al." style: first two authors, then et al. */
export function formatAuthors(names: string[]): string {
  const last = (n: string) => (n.trim().split(/\s+/).pop() ?? n);
  const short = names.filter(Boolean).map(last);
  if (short.length <= 2) return short.join(" and ");
  return `${short.slice(0, 2).join(", ")} et al.`;
}

/** Reads the parts of an OpenAlex work we show. Returns null if there is no title. */
export function parseOpenAlexWork(w: unknown): PaperMeta | null {
  const o = w as {
    title?: string; display_name?: string; publication_year?: number;
    authorships?: { author?: { display_name?: string } }[];
    primary_location?: { source?: { display_name?: string } | null } | null;
  } | null;
  const title = o?.title || o?.display_name;
  if (!title) return null;
  return {
    title,
    authors: formatAuthors((o?.authorships ?? []).map((a) => a.author?.display_name ?? "")),
    year: typeof o?.publication_year === "number" ? o.publication_year : null,
    venue: o?.primary_location?.source?.display_name ?? null,
  };
}

// ---- Markdown cheatsheet -------------------------------------------------------------------------------------

export interface CheatLink { url: string; label: string | null; domain: string | null; context: string | null; timestamp_sec: number | null }
export interface CheatItem {
  title: string;
  source_url: string | null;
  summary: string | null;
  key_points: string[];
  channel: string | null;
  topics: string[];
  collections: string[];
  links: CheatLink[];
  mentions: { kind: string; name: string; context?: string }[];
  notes: string[];
}

const mmss = (s: number) => {
  const t = Math.floor(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`;
};
const esc = (s: string) => s.replace(/[[\]]/g, "\\$&").replace(/\s+/g, " ").trim();

/** One section per video: summary, key points, then its links grouped as repositories, papers, docs and other. */
export function buildCheatsheet(items: CheatItem[], exportedAt: string): string {
  const out = ["# RefVault cheatsheet", "", `Exported ${exportedAt} · ${items.length} ${items.length === 1 ? "video" : "videos"}`, ""];
  const GROUPS: [LinkKind, string][] = [["repo", "Repositories"], ["paper", "Papers"], ["docs", "Documentation"], ["other", "Other links"]];
  for (const it of items) {
    out.push(`## ${esc(it.title) || "Untitled"}`, "");
    if (it.source_url) out.push(`- Video: ${it.source_url}`);
    if (it.channel) out.push(`- Channel: ${it.channel}`);
    if (it.topics.length) out.push(`- Topics: ${it.topics.map((t) => `#${t.replace(/\s+/g, "-")}`).join(" ")}`);
    if (it.collections.length) out.push(`- Collections: ${it.collections.join(", ")}`);
    out.push("");
    if (it.summary) out.push("### Summary", "", it.summary, "");
    if (it.key_points.length) out.push("### Key points", "", ...it.key_points.map((k) => `- ${k}`), "");
    for (const [kind, heading] of GROUPS) {
      const ls = it.links.filter((l) => classifyLink(l.url) === kind);
      if (!ls.length) continue;
      out.push(`### ${heading}`, "");
      for (const l of ls) {
        const name = kind === "repo" ? githubRepo(l.url) ?? l.url : l.label || l.domain || l.url;
        const at = l.timestamp_sec !== null && l.timestamp_sec !== undefined ? ` (${mmss(l.timestamp_sec)})` : "";
        out.push(`- [${esc(name)}](${l.url})${at}${l.context ? ` — ${esc(l.context)}` : ""}`);
      }
      out.push("");
    }
    if (it.mentions.length) out.push("### Mentioned", "", ...it.mentions.map((m) => `- **${m.name}** (${m.kind})${m.context ? ` — ${m.context}` : ""}`), "");
    if (it.notes.length) out.push("### My notes", "", ...it.notes.map((n) => `${n}\n`));
    out.push("---", "");
  }
  return out.join("\n");
}
