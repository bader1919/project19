import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, X } from "lucide-react";
import { listLinks } from "../lib/data";
import { classifyLink, type LinkKind, type PaperMeta } from "../../shared/resources";
import { cachedPaper, fetchPaperMeta } from "../lib/enrich";
import { useAsync } from "../lib/useAsync";
import { useDebounced } from "../lib/useDebounced";
import { EmptyState, ErrorBox, PageHeader } from "../components/ui";
import { SkeletonRows } from "../components/Skeleton";
import { Menu } from "../components/Menu";
import { LinkRow } from "../components/LinkRow";
import { SearchField } from "../components/SearchField";

type Sort = "newest" | "oldest" | "name";
const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name, A to Z" },
];

type Kind = "" | Exclude<LinkKind, "other">;
const KINDS: { value: Kind; label: string }[] = [
  { value: "", label: "All types" },
  { value: "docs", label: "Documentation" },
  { value: "paper", label: "Papers" },
  { value: "repo", label: "Repositories" },
];

/** Title, authors and year from OpenAlex under a paper link. Shows nothing if the paper can't be looked up. */
function PaperLine({ url }: { url: string }) {
  const [meta, setMeta] = useState<PaperMeta | null | undefined>(() => cachedPaper(url));
  useEffect(() => {
    if (meta !== undefined) return;
    let alive = true;
    fetchPaperMeta(url).then((m) => alive && setMeta(m)).catch(() => alive && setMeta(null));
    return () => { alive = false; };
  }, [url, meta]);
  if (!meta) return null;
  const by = [meta.authors, meta.year, meta.venue].filter(Boolean).join(" · ");
  return (
    <p className="mt-0.5 text-meta text-ink-2">
      <span className="font-medium text-ink"><bdi>{meta.title}</bdi></span>
      {by && <span className="ms-3"><bdi>{by}</bdi></span>}
    </p>
  );
}

export function Links() {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const [domain, setDomain] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [kind, setKind] = useState<Kind>("");
  // A type filter works on what the browser can classify, so fetch a wider window than the default 300.
  const links = useAsync(() => listLinks({ q: query, domain, limit: kind ? 2000 : undefined }), [query, domain, kind]);

  // Keep the site list from the unfiltered result so choosing a site doesn't collapse the menu to one entry.
  const [sites, setSites] = useState<[string, number][]>([]);
  const lastKey = useRef("");
  useEffect(() => {
    if (!links.data || domain || kind) return;
    const counts = new Map<string, number>();
    for (const l of links.data) if (l.domain) counts.set(l.domain, (counts.get(l.domain) ?? 0) + 1);
    const next = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30);
    const key = JSON.stringify(next);
    if (key !== lastKey.current) { lastKey.current = key; setSites(next); }
  }, [links.data, domain, kind]);

  const rows = useMemo(() => {
    const data = (links.data ?? []).filter((l) => !kind || classifyLink(l.url) === kind);
    if (sort === "oldest") data.reverse();
    else if (sort === "name") data.sort((a, b) => (a.label || a.domain || a.url).localeCompare(b.label || b.domain || b.url));
    return data;
  }, [links.data, sort, kind]);

  const filtered = Boolean(query || domain || kind);
  const clear = () => { setQ(""); setDomain(""); setKind(""); };

  return (
    <div className="max-w-list">
      <PageHeader title="Links" meta={links.data ? `${rows.length} ${rows.length === 1 ? "link" : "links"}` : undefined} />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SearchField label="Search links" placeholder="Search by name, site or context" value={q} onChange={setQ} className="w-full sm:w-80" />
        <Menu
          label="Site filter"
          triggerClassName="btn-outline btn-sm"
          trigger={<>Site<ChevronDown className="h-4 w-4 text-ink-2" aria-hidden="true" /></>}
          items={[
            { label: "All sites", checked: !domain, onSelect: () => setDomain("") },
            ...sites.map(([d, n]) => ({ label: `${d} (${n})`, checked: d === domain, onSelect: () => setDomain(d) })),
          ]}
        />
        <Menu
          label="Type filter"
          triggerClassName="btn-outline btn-sm"
          trigger={<>Type: {KINDS.find((k) => k.value === kind)!.label}<ChevronDown className="h-4 w-4 text-ink-2" aria-hidden="true" /></>}
          items={KINDS.map((k) => ({ label: k.label, checked: k.value === kind, onSelect: () => setKind(k.value) }))}
        />
        <Menu
          label="Sort links"
          triggerClassName="btn-outline btn-sm"
          trigger={<>Sort: {SORTS.find((s) => s.value === sort)!.label}<ChevronDown className="h-4 w-4 text-ink-2" aria-hidden="true" /></>}
          items={SORTS.map((s) => ({ label: s.label, checked: s.value === sort, onSelect: () => setSort(s.value) }))}
        />
        {domain && (
          <button type="button" className="chip min-h-[32px] gap-1.5 ps-2.5 pe-1.5 hover:bg-line" onClick={() => setDomain("")} aria-label={`Remove site filter ${domain}`}>
            <bdi>Site: {domain}</bdi><X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {links.error && !links.data ? (
        <ErrorBox message="Couldn't load your links. Check your connection and try again." onRetry={links.reload} />
      ) : links.loading && !links.data ? (
        <SkeletonRows thumb={false} />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title={query ? `No links match “${query}”` : domain ? `No links from ${domain}` : `No ${KINDS.find((k) => k.value === kind)!.label.toLowerCase()} links`}
            action={<button type="button" className="btn-outline" onClick={clear}>Clear filters</button>}
          >
            Search covers link names, addresses, sites and the words around each link.
          </EmptyState>
        ) : (
          <EmptyState title="No links yet" action={<Link to="/add" className="btn-primary">Save a video</Link>}>
            Links in video descriptions, and the ones said out loud, are collected here after you save a video.
          </EmptyState>
        )
      ) : (
        <ul>
          {rows.map((l) => <LinkRow key={l.id} link={l} extra={kind === "paper" ? <PaperLine url={l.url} /> : undefined} />)}
        </ul>
      )}
    </div>
  );
}
